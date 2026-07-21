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

// ── Full-window screenshot (Windows GDI) ─────────────────────────────────
//
// The viewport screenshot (canvas.toDataURL) only shows the rendered scene —
// it says nothing about the editor's own UI. To let an AI agent actually see
// the interface (menus, panels, chrome) we capture the whole main window from
// the OS via GDI and hand back a PNG data URL.

/// A full-window screenshot, returned as a PNG data URL.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowCapture {
    data_url: String,
    width: u32,
    height: u32,
    mime: String,
}

/// Webview → Rust: capture the entire main editor window (not just the WebGL
/// viewport). Windows-only; other platforms return an error.
#[tauri::command]
pub fn capture_editor_window(app: AppHandle) -> Result<WindowCapture, String> {
    capture_editor_window_impl(app)
}

#[cfg(windows)]
fn capture_editor_window_impl(app: AppHandle) -> Result<WindowCapture, String> {
    use base64::Engine as _;
    let _ = app; // the window is located by process id, see gdi_capture_main_window

    let (rgba, width, height) = gdi_capture_main_window()?;
    let png_bytes = encode_png(&rgba, width, height)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    Ok(WindowCapture {
        data_url: format!("data:image/png;base64,{}", b64),
        width,
        height,
        mime: "image/png".to_string(),
    })
}

#[cfg(not(windows))]
fn capture_editor_window_impl(_app: AppHandle) -> Result<WindowCapture, String> {
    Err("full-window capture is only supported on Windows".to_string())
}

/// Context for [`enum_windows_cb`]: find the largest visible top-level window
/// belonging to this process (the main editor window).
#[cfg(windows)]
struct EnumWindowCtx {
    pid: u32,
    best: windows_sys::Win32::Foundation::HWND,
    best_area: i64,
}

#[cfg(windows)]
unsafe extern "system" fn enum_windows_cb(
    hwnd: windows_sys::Win32::Foundation::HWND,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::core::BOOL {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowRect, GetWindowThreadProcessId, IsWindowVisible};

    let ctx = &mut *(lparam as *mut EnumWindowCtx);
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == ctx.pid && IsWindowVisible(hwnd) != 0 {
        let mut r: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut r) != 0 {
            let area = (r.right - r.left) as i64 * (r.bottom - r.top) as i64;
            if area > ctx.best_area {
                ctx.best_area = area;
                ctx.best = hwnd;
            }
        }
    }
    1 // keep enumerating
}

/// Find the main editor window, bring it to the front, and capture its full
/// rect from the screen via GDI. Returns RGBA pixels plus width/height.
///
/// Bringing the window forward first is essential: a screen blit captures
/// whatever is topmost at those coordinates, so an overlapping window would
/// otherwise occlude the editor.
#[cfg(windows)]
fn gdi_capture_main_window() -> Result<(Vec<u8>, u32, u32), String> {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowRect, SetForegroundWindow};

    unsafe {
        let mut ctx = EnumWindowCtx {
            pid: std::process::id(),
            best: std::ptr::null_mut(),
            best_area: 0,
        };
        EnumWindows(Some(enum_windows_cb), &mut ctx as *mut EnumWindowCtx as _);
        if ctx.best.is_null() {
            return Err("editor window not found".to_string());
        }

        SetForegroundWindow(ctx.best);
        std::thread::sleep(std::time::Duration::from_millis(350));

        let mut rect: RECT = std::mem::zeroed();
        if GetWindowRect(ctx.best, &mut rect) == 0 {
            return Err("GetWindowRect failed".to_string());
        }
        let x = rect.left;
        let y = rect.top;
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w <= 0 || h <= 0 {
            return Err(format!("invalid window rect {}x{}", w, h));
        }

        let hdc_screen = GetDC(std::ptr::null_mut());
        if hdc_screen.is_null() {
            return Err("GetDC(screen) failed".to_string());
        }
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_null() {
            ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Err("CreateCompatibleDC failed".to_string());
        }
        let hbm = CreateCompatibleBitmap(hdc_screen, w, h);
        if hbm.is_null() {
            DeleteDC(hdc_mem);
            ReleaseDC(std::ptr::null_mut(), hdc_screen);
            return Err("CreateCompatibleBitmap failed".to_string());
        }
        let old_obj = SelectObject(hdc_mem, hbm as _);
        let blit_ok = BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, x, y, SRCCOPY);

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = w;
        bmi.bmiHeader.biHeight = -h; // negative → top-down rows
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut pixels: Vec<u8> = vec![0u8; (w as usize) * (h as usize) * 4];
        let lines = GetDIBits(
            hdc_mem,
            hbm,
            0,
            h as u32,
            pixels.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Release GDI objects regardless of the capture result.
        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbm as _);
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if blit_ok == 0 || lines == 0 {
            return Err(format!(
                "GDI capture failed (BitBlt={}, GetDIBits={})",
                blit_ok, lines
            ));
        }

        // 32bpp BI_RGB pixels are BGRX; convert to RGBA with opaque alpha.
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        Ok((pixels, w as u32, h as u32))
    }
}

#[cfg(windows)]
fn encode_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
    }
    Ok(out)
}
