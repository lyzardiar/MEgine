//! AgentBridge transport — a localhost-only WebSocket server that lets external
//! AI agents (via the MCP adapter, or any WS/HTTP client) drive and observe the
//! editor.
//!
//! Architecture:
//! - Rust binds `127.0.0.1:0` (auto port) and writes `{ port, token }` to a
//!   discovery file so adapters can find and authenticate to the editor.
//! - Each WS client gets a unique id. Incoming text frames are forwarded to the
//!   webview as a Tauri event (`agent-bridge:request`).
//! - The webview's `AgentBridge` handles the request and replies via the
//!   `agent_bridge_respond` command; Rust routes the reply back to the right
//!   client through a per-client channel.
//!
//! Only the main editor window answers requests (detached panels ignore the
//! event), so each request gets exactly one response.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::Message;

/// Routes messages between the webview and connected WebSocket clients.
pub struct BridgeHub {
    /// client id -> channel feeding that client's WS write loop.
    clients: Mutex<HashMap<String, mpsc::UnboundedSender<Message>>>,
    /// Token a client must present (in the WS URL query) to connect.
    token: String,
}

impl BridgeHub {
    pub fn new(token: String) -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
            token,
        }
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    fn register(&self, id: String, tx: mpsc::UnboundedSender<Message>) {
        self.clients.lock().insert(id, tx);
    }

    fn unregister(&self, id: &str) {
        self.clients.lock().remove(id);
    }

    /// Send a reply to a single client. Returns false if the client is gone.
    pub fn send_to(&self, id: &str, msg: String) -> bool {
        match self.clients.lock().get(id) {
            Some(tx) => tx.send(Message::Text(msg.into())).is_ok(),
            None => false,
        }
    }

    /// Broadcast an event to every connected client.
    #[allow(dead_code)]
    pub fn broadcast(&self, msg: String) {
        let clients = self.clients.lock();
        for tx in clients.values() {
            let _ = tx.send(Message::Text(msg.clone().into()));
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeRequestPayload {
    client_id: String,
    message: String,
}

/// Start the WebSocket server on the Tauri async runtime.
pub fn spawn_bridge_server(app: AppHandle, hub: Arc<BridgeHub>) {
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) => {
                log::error!("AgentBridge failed to bind localhost socket: {error}");
                return;
            }
        };
        let port = match listener.local_addr() {
            Ok(addr) => addr.port(),
            Err(error) => {
                log::error!("AgentBridge could not determine local port: {error}");
                return;
            }
        };
        write_discovery_file(&app, port, hub.token());
        log::info!("AgentBridge listening on 127.0.0.1:{port}");

        loop {
            match listener.accept().await {
                Ok((stream, _peer)) => {
                    let app = app.clone();
                    let hub = hub.clone();
                    tokio::spawn(async move {
                        if let Err(error) = handle_connection(app, hub, stream).await {
                            log::warn!("AgentBridge connection closed: {error}");
                        }
                    });
                }
                Err(error) => {
                    log::warn!("AgentBridge accept error: {error}");
                }
            }
        }
    });
}

async fn handle_connection(
    app: AppHandle,
    hub: Arc<BridgeHub>,
    stream: TcpStream,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let expected = hub.token().to_string();
    let ws = tokio_tungstenite::accept_hdr_async(
        stream,
        move |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
            let token_ok = req
                .uri()
                .query()
                .and_then(extract_token)
                .is_some_and(|token| token == expected);
            if token_ok {
                Ok(resp)
            } else {
                Err(ErrorResponse::new(Some(
                    "invalid agent bridge token".to_string(),
                )))
            }
        },
    )
    .await?;

    let (mut sink, mut stream) = ws.split();
    let client_id = uuid::Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    hub.register(client_id.clone(), tx.clone());

    // Write loop: forward queued replies/events to this client's socket.
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
        // `Stream` queues the protocol close response when it receives the
        // peer's close frame. Closing the sink flushes that queued response.
        let _ = sink.close().await;
    });

    // Read loop: forward incoming requests to the webview.
    while let Some(msg) = stream.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let _ = app.emit(
                    "agent-bridge:request",
                    BridgeRequestPayload {
                        client_id: client_id.clone(),
                        message: text.to_string(),
                    },
                );
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(error) => {
                log::warn!("AgentBridge read error: {error}");
                break;
            }
        }
    }

    hub.unregister(&client_id);
    // Complete the WebSocket close handshake instead of aborting the TCP
    // writer. Abrupt shutdown makes standards-compliant MCP clients report a
    // spurious connection error after an otherwise successful session.
    drop(tx);
    if tokio::time::timeout(std::time::Duration::from_secs(1), write_task)
        .await
        .is_err()
    {
        log::debug!("AgentBridge close handshake timed out for client {client_id}");
    }
    Ok(())
}

/// Parse `token=<value>` out of a URL query string.
fn extract_token(query: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        if key == "token" {
            Some(value.to_string())
        } else {
            None
        }
    })
}

/// Write `{ port, token, pid }` so adapters can discover and authenticate.
/// Location: `$MENGINE_AGENT_BRIDGE_FILE` if set, else `<app_config_dir>/agent-bridge.json`.
fn write_discovery_file(app: &AppHandle, port: u16, token: &str) {
    let path = std::env::var("MENGINE_AGENT_BRIDGE_FILE")
        .map(PathBuf::from)
        .ok()
        .or_else(|| {
            app.path()
                .app_config_dir()
                .ok()
                .map(|dir| dir.join("agent-bridge.json"))
        });
    let Some(path) = path else {
        log::warn!("AgentBridge discovery file location unavailable");
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let content = serde_json::json!({
        "port": port,
        "token": token,
        "pid": std::process::id(),
        "version": 1,
    });
    if let Err(error) = std::fs::write(&path, content.to_string()) {
        log::warn!("AgentBridge could not write discovery file: {error}");
    } else {
        log::info!("AgentBridge discovery file: {}", path.display());
    }
}

/// Webview → Rust: deliver a JSON response to the client that sent the request.
#[tauri::command]
pub fn agent_bridge_respond(
    client_id: String,
    payload: String,
    hub: State<'_, Arc<BridgeHub>>,
) -> bool {
    hub.send_to(&client_id, payload)
}

/// Webview → Rust: push an event payload to every connected client.
#[tauri::command]
pub fn agent_bridge_broadcast(payload: String, hub: State<'_, Arc<BridgeHub>>) {
    hub.broadcast(payload);
}

// ── Background-safe editor-window screenshot ────────────────────────────────
//
// The viewport screenshot (canvas.toDataURL) only shows the rendered scene; it
// says nothing about the editor's own UI. WebView2's DevTools screenshot path
// renders the webview surface directly, so it remains correct while another
// application covers the editor and never activates or raises the editor
// window. Screen BitBlt/SetForegroundWindow must not be used here: besides
// stealing focus, that path captures whichever application happens to be on
// top instead of the editor.

/// A full-window screenshot, returned as a PNG data URL.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowCapture {
    data_url: String,
    width: u32,
    height: u32,
    mime: String,
    window_label: String,
    capture_method: String,
    background_safe: bool,
}

/// Webview -> Rust: capture one editor webview (menus, panels and rendered
/// content). The target defaults to the main window, but detached panel/editor
/// windows can be addressed by label as returned by `list_editor_windows`.
#[tauri::command]
pub async fn capture_editor_window(
    app: AppHandle,
    window_label: Option<String>,
) -> Result<WindowCapture, String> {
    let window_label = window_label.unwrap_or_else(|| "main".to_string());
    capture_editor_window_impl(app, window_label).await
}

#[cfg(windows)]
async fn capture_editor_window_impl(
    app: AppHandle,
    window_label: String,
) -> Result<WindowCapture, String> {
    use base64::Engine as _;
    use std::sync::{Arc, Mutex as StdMutex};
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    let window = app
        .get_webview_window(&window_label)
        .ok_or_else(|| format!("editor window \"{window_label}\" was not found"))?;
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(StdMutex::new(Some(tx)));
    let setup_tx = tx.clone();

    window
        .with_webview(move |platform_webview| {
            let send = |result: Result<String, String>| {
                if let Some(sender) = setup_tx.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = sender.send(result);
                }
            };
            let controller = platform_webview.controller();
            let webview = match unsafe { controller.CoreWebView2() } {
                Ok(webview) => webview,
                Err(error) => {
                    send(Err(format!("WebView2 controller is unavailable: {error}")));
                    return;
                }
            };
            let completion_tx = setup_tx.clone();
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |status, payload| {
                    let result = status
                        .map_err(|error| format!("WebView2 screenshot failed: {error}"))
                        .map(|_| payload);
                    if let Some(sender) =
                        completion_tx.lock().ok().and_then(|mut guard| guard.take())
                    {
                        let _ = sender.send(result);
                    }
                    Ok(())
                },
            ));
            let method = HSTRING::from("Page.captureScreenshot");
            let params = HSTRING::from(
                r#"{"format":"png","fromSurface":true,"captureBeyondViewport":false}"#,
            );
            if let Err(error) =
                unsafe { webview.CallDevToolsProtocolMethod(&method, &params, &handler) }
            {
                send(Err(format!(
                    "could not start WebView2 screenshot capture: {error}"
                )));
            }
        })
        .map_err(|error| format!("could not access editor webview: {error}"))?;

    let payload = tokio::time::timeout(std::time::Duration::from_secs(10), rx)
        .await
        .map_err(|_| "WebView2 screenshot timed out after 10 seconds".to_string())?
        .map_err(|_| "WebView2 screenshot callback was cancelled".to_string())??;
    let data = serde_json::from_str::<serde_json::Value>(&payload)
        .map_err(|error| format!("invalid WebView2 screenshot response: {error}"))?
        .get("data")
        .and_then(serde_json::Value::as_str)
        .filter(|data| !data.is_empty())
        .ok_or_else(|| "WebView2 screenshot response did not contain image data".to_string())?
        .to_string();
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|error| format!("invalid WebView2 screenshot base64: {error}"))?;
    let decoder = png::Decoder::new(std::io::Cursor::new(&png_bytes));
    let reader = decoder
        .read_info()
        .map_err(|error| format!("invalid WebView2 screenshot PNG: {error}"))?;
    let info = reader.info();

    Ok(WindowCapture {
        data_url: format!("data:image/png;base64,{data}"),
        width: info.width,
        height: info.height,
        mime: "image/png".to_string(),
        window_label,
        capture_method: "webview2-devtools".to_string(),
        background_safe: true,
    })
}

#[cfg(not(windows))]
async fn capture_editor_window_impl(
    _app: AppHandle,
    _window_label: String,
) -> Result<WindowCapture, String> {
    Err("background editor-window capture is currently only supported on Windows".to_string())
}
