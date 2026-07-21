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
    clients: Mutex<HashMap<String, mpsc::UnboundedSender<String>>>,
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

    fn register(&self, id: String, tx: mpsc::UnboundedSender<String>) {
        self.clients.lock().insert(id, tx);
    }

    fn unregister(&self, id: &str) {
        self.clients.lock().remove(id);
    }

    /// Send a reply to a single client. Returns false if the client is gone.
    pub fn send_to(&self, id: &str, msg: String) -> bool {
        match self.clients.lock().get(id) {
            Some(tx) => tx.send(msg).is_ok(),
            None => false,
        }
    }

    /// Broadcast an event to every connected client.
    #[allow(dead_code)]
    pub fn broadcast(&self, msg: String) {
        let clients = self.clients.lock();
        for tx in clients.values() {
            let _ = tx.send(msg.clone());
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
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    hub.register(client_id.clone(), tx);

    // Write loop: forward queued replies/events to this client's socket.
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
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
    write_task.abort();
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
