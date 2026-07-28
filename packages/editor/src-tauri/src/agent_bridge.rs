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

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::Message;

const MAX_QUEUED_BRIDGE_REQUESTS: usize = 256;

#[derive(Default)]
struct BridgeTransportState {
    ready_session: Option<String>,
    queued_requests: VecDeque<BridgeRequestPayload>,
}

enum BridgeRequestRoute {
    Dispatch(BridgeRequestPayload),
    Queued,
    Rejected(BridgeRequestPayload),
}

impl BridgeTransportState {
    fn route(&mut self, payload: BridgeRequestPayload) -> BridgeRequestRoute {
        if self.ready_session.is_some() {
            return BridgeRequestRoute::Dispatch(payload);
        }
        if self.queued_requests.len() >= MAX_QUEUED_BRIDGE_REQUESTS {
            return BridgeRequestRoute::Rejected(payload);
        }
        self.queued_requests.push_back(payload);
        BridgeRequestRoute::Queued
    }

    fn activate(&mut self, session_id: String) -> VecDeque<BridgeRequestPayload> {
        self.ready_session = Some(session_id);
        std::mem::take(&mut self.queued_requests)
    }

    fn deactivate(&mut self, session_id: &str) -> bool {
        if self.ready_session.as_deref() != Some(session_id) {
            return false;
        }
        self.ready_session = None;
        true
    }

    fn reset_for_page_load(&mut self) {
        self.ready_session = None;
    }

    fn remove_client(&mut self, client_id: &str) {
        self.queued_requests
            .retain(|request| request.client_id != client_id);
    }
}

/// Routes messages between the webview and connected WebSocket clients.
pub struct BridgeHub {
    /// client id -> channel feeding that client's WS write loop.
    clients: Mutex<HashMap<String, mpsc::UnboundedSender<Message>>>,
    /// Main-webview readiness and requests received while it is loading.
    transport: Mutex<BridgeTransportState>,
    /// Token a client must present (in the WS URL query) to connect.
    token: String,
}

impl BridgeHub {
    pub fn new(token: String) -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
            transport: Mutex::new(BridgeTransportState::default()),
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
        self.transport.lock().remove_client(id);
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

    /// Queue a client request until the main webview listener is ready, or
    /// synchronously emit it while holding the readiness lock. Holding the lock
    /// closes the gap between a readiness check and a page-load reset.
    fn forward_request(&self, app: &AppHandle, payload: BridgeRequestPayload) {
        let mut transport = self.transport.lock();
        match transport.route(payload) {
            BridgeRequestRoute::Dispatch(payload) => emit_bridge_request(app, payload),
            BridgeRequestRoute::Queued => {}
            BridgeRequestRoute::Rejected(payload) => {
                drop(transport);
                let response = bridge_not_ready_response(&payload.message);
                let _ = self.send_to(&payload.client_id, response);
            }
        }
    }

    /// Activate one JS transport session and return all requests that arrived
    /// during startup or navigation. Returning the batch through the readiness
    /// invoke avoids emitting events back into a webview while that same
    /// webview's IPC call is still in progress.
    pub fn set_transport_ready(
        &self,
        session_id: String,
        ready: bool,
    ) -> BridgeTransportReadyResult {
        let mut transport = self.transport.lock();
        if !ready {
            return BridgeTransportReadyResult {
                accepted: transport.deactivate(&session_id),
                queued_requests: Vec::new(),
            };
        }
        BridgeTransportReadyResult {
            accepted: true,
            queued_requests: transport.activate(session_id).into(),
        }
    }

    /// Called by Tauri's page-load hook before the old document is discarded.
    pub fn mark_transport_loading(&self) {
        self.transport.lock().reset_for_page_load();
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeRequestPayload {
    client_id: String,
    message: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeTransportReadyResult {
    accepted: bool,
    queued_requests: Vec<BridgeRequestPayload>,
}

fn emit_bridge_request(app: &AppHandle, payload: BridgeRequestPayload) {
    if let Err(error) = app.emit("agent-bridge:request", payload) {
        log::warn!("AgentBridge could not forward a request to the main webview: {error}");
    }
}

fn bridge_not_ready_response(message: &str) -> String {
    let id = serde_json::from_str::<serde_json::Value>(message)
        .ok()
        .and_then(|request| request.get("id").cloned())
        .unwrap_or(serde_json::Value::Null);
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": "NOT_READY",
            "message": "Editor webview transport is still loading; retry the request",
        },
    })
    .to_string()
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
                hub.forward_request(
                    &app,
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

fn discovery_file_path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("MENGINE_AGENT_BRIDGE_FILE") {
        return Some(PathBuf::from(path));
    }
    if let Some(directory) = std::env::var_os("MENGINE_EDITOR_CONFIG_DIR") {
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            log::warn!("MENGINE_EDITOR_CONFIG_DIR must be an absolute path");
            return None;
        }
        return Some(directory.join("agent-bridge.json"));
    }
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("agent-bridge.json"))
}

/// Write `{ port, token, pid }` so adapters can discover and authenticate.
/// Location: `$MENGINE_AGENT_BRIDGE_FILE` if set, then
/// `$MENGINE_EDITOR_CONFIG_DIR/agent-bridge.json`, else the native app config dir.
fn write_discovery_file(app: &AppHandle, port: u16, token: &str) {
    let path = discovery_file_path(app);
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

fn discovery_file_is_owned(content: &str, token: &str, pid: u32) -> bool {
    serde_json::from_str::<serde_json::Value>(content)
        .ok()
        .is_some_and(|value| {
            value.get("token").and_then(serde_json::Value::as_str) == Some(token)
                && value.get("pid").and_then(serde_json::Value::as_u64) == Some(u64::from(pid))
        })
}

fn remove_discovery_file_if_owned(
    path: &std::path::Path,
    token: &str,
    pid: u32,
) -> std::io::Result<bool> {
    let content = match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    if !discovery_file_is_owned(&content, token, pid) {
        return Ok(false);
    }
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

/// Remove this process's discovery record on final application exit.
///
/// The content is revalidated before deletion so an older editor process
/// cannot remove a record that a newer process has already published.
pub fn cleanup_bridge_discovery(app: &AppHandle, token: &str) {
    let Some(path) = discovery_file_path(app) else {
        return;
    };
    match remove_discovery_file_if_owned(&path, token, std::process::id()) {
        Ok(true) => log::info!("AgentBridge removed discovery file: {}", path.display()),
        Ok(false) => {}
        Err(error) => {
            log::warn!(
                "AgentBridge could not remove discovery file {}: {error}",
                path.display()
            );
        }
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

/// Main webview -> Rust: begin or end one request-listener session.
#[tauri::command]
pub fn agent_bridge_set_transport_ready(
    session_id: String,
    ready: bool,
    hub: State<'_, Arc<BridgeHub>>,
) -> BridgeTransportReadyResult {
    hub.set_transport_ready(session_id, ready)
}

#[cfg(test)]
mod transport_tests {
    use super::*;

    fn request(client_id: &str, id: usize) -> BridgeRequestPayload {
        BridgeRequestPayload {
            client_id: client_id.to_string(),
            message: format!(r#"{{"jsonrpc":"2.0","id":{id},"method":"query"}}"#),
        }
    }

    #[test]
    fn startup_requests_wait_for_the_first_transport_session() {
        let mut state = BridgeTransportState::default();
        assert!(matches!(
            state.route(request("client-a", 1)),
            BridgeRequestRoute::Queued
        ));
        assert!(matches!(
            state.route(request("client-a", 2)),
            BridgeRequestRoute::Queued
        ));

        let queued = state.activate("session-a".to_string());
        assert_eq!(
            queued.into_iter().collect::<Vec<_>>(),
            vec![request("client-a", 1), request("client-a", 2)]
        );
        assert!(matches!(
            state.route(request("client-a", 3)),
            BridgeRequestRoute::Dispatch(_)
        ));
    }

    #[test]
    fn stale_cleanup_cannot_disable_a_newer_transport_session() {
        let mut state = BridgeTransportState::default();
        state.activate("session-old".to_string());
        state.activate("session-new".to_string());

        assert!(!state.deactivate("session-old"));
        assert!(matches!(
            state.route(request("client-a", 1)),
            BridgeRequestRoute::Dispatch(_)
        ));
        assert!(state.deactivate("session-new"));
        assert!(matches!(
            state.route(request("client-a", 2)),
            BridgeRequestRoute::Queued
        ));
    }

    #[test]
    fn page_load_and_disconnect_preserve_only_live_pending_requests() {
        let mut state = BridgeTransportState::default();
        state.activate("session-a".to_string());
        state.reset_for_page_load();
        state.route(request("client-a", 1));
        state.route(request("client-b", 2));
        state.remove_client("client-a");

        assert_eq!(
            state
                .activate("session-b".to_string())
                .into_iter()
                .collect::<Vec<_>>(),
            vec![request("client-b", 2)]
        );
    }

    #[test]
    fn pending_queue_is_bounded_and_returns_the_original_rpc_id() {
        let mut state = BridgeTransportState::default();
        for id in 0..MAX_QUEUED_BRIDGE_REQUESTS {
            assert!(matches!(
                state.route(request("client-a", id)),
                BridgeRequestRoute::Queued
            ));
        }
        let rejected = match state.route(request("client-a", 777)) {
            BridgeRequestRoute::Rejected(payload) => payload,
            _ => panic!("request after the queue limit should be rejected"),
        };
        let response: serde_json::Value =
            serde_json::from_str(&bridge_not_ready_response(&rejected.message)).unwrap();
        assert_eq!(response["id"], 777);
        assert_eq!(response["error"]["code"], "NOT_READY");
    }

    #[test]
    fn discovery_cleanup_removes_only_the_publishing_process_record() {
        let path = std::env::temp_dir().join(format!(
            "mengine-agent-bridge-cleanup-{}.json",
            uuid::Uuid::new_v4()
        ));
        let old_token = "old-editor-token";
        let new_token = "new-editor-token";
        let old_pid = 41;
        let new_pid = 42;

        std::fs::write(
            &path,
            serde_json::json!({
                "port": 4707,
                "token": new_token,
                "pid": new_pid,
                "version": 1,
            })
            .to_string(),
        )
        .unwrap();

        assert!(!remove_discovery_file_if_owned(&path, old_token, old_pid).unwrap());
        assert!(
            path.exists(),
            "an older editor must leave the newer record intact"
        );
        assert!(!remove_discovery_file_if_owned(&path, new_token, old_pid).unwrap());
        assert!(
            path.exists(),
            "token alone must not grant cleanup ownership"
        );
        assert!(remove_discovery_file_if_owned(&path, new_token, new_pid).unwrap());
        assert!(!path.exists());
    }

    #[test]
    fn semantic_ui_revisions_are_strictly_validated() {
        assert!(valid_ui_snapshot_revision("ui-v2-42-0123456789abcdef"));
        for invalid in [
            "",
            "ui-v2-42",
            "ui-vx-42-0123456789abcdef",
            "ui-v2--0123456789abcdef",
            "ui-v2-42-0123456789abcde",
            "ui-v2-42-0123456789ABCDEf",
            "content-v2-42-0123456789abcdef",
        ] {
            assert!(!valid_ui_snapshot_revision(invalid), "{invalid}");
        }
    }
}

// ── Background-safe editor-window observation ───────────────────────────────
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

/// Return a bounded semantic snapshot of one editor webview. Unlike a bitmap,
/// this exposes readable text, roles, values, states, bounds, actions and CSS
/// selectors so an agent can understand the UI without OCR or foreground input.
#[tauri::command]
pub async fn inspect_editor_window(
    app: AppHandle,
    window_label: Option<String>,
    max_elements: Option<usize>,
    offset: Option<usize>,
) -> Result<serde_json::Value, String> {
    let window_label = window_label.unwrap_or_else(|| "main".to_string());
    let max_elements = max_elements.unwrap_or(2_000).clamp(50, 5_000);
    let offset = offset.unwrap_or(0).min(1_000_000);
    inspect_editor_window_impl(app, window_label, max_elements, offset).await
}

/// Read an exact page of one element's text or value without normalizing it.
#[tauri::command]
pub async fn read_editor_ui_content(
    app: AppHandle,
    window_label: Option<String>,
    selector: String,
    field: String,
    offset: Option<usize>,
    max_chars: Option<usize>,
    expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    let window_label = window_label.unwrap_or_else(|| "main".to_string());
    let selector = selector.trim().to_string();
    if selector.is_empty() || selector.len() > 1_000 {
        return Err("selector must contain 1 to 1000 characters".to_string());
    }
    if !matches!(field.as_str(), "text" | "value") {
        return Err("field must be text or value".to_string());
    }
    let offset = offset.unwrap_or(0).min(10_000_000);
    let max_chars = max_chars.unwrap_or(10_000).clamp(1, 100_000);
    let expected_snapshot_revision = expected_snapshot_revision.trim().to_string();
    if !valid_ui_snapshot_revision(&expected_snapshot_revision) {
        return Err(
            "expectedSnapshotRevision must be a snapshotRevision returned by inspect_editor_window"
                .to_string(),
        );
    }
    let current_snapshot =
        inspect_editor_window_impl(app.clone(), window_label.clone(), 50, 0).await?;
    let actual_snapshot_revision = current_snapshot
        .get("snapshotRevision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "editor UI snapshot did not contain a revision".to_string())?;
    if actual_snapshot_revision != expected_snapshot_revision {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "Editor window semantic content changed; get a fresh UI snapshot before reading exact content",
            "staleSnapshot": true,
            "expectedSnapshotRevision": expected_snapshot_revision,
            "actualSnapshotRevision": actual_snapshot_revision,
            "restartOffset": 0,
        }));
    }
    read_editor_ui_content_impl(
        app,
        window_label,
        selector,
        field,
        offset,
        max_chars,
        expected_snapshot_revision,
    )
    .await
}

/// Execute one allow-listed DOM interaction in a target editor webview.
///
/// This is a fallback for UI surfaces that do not yet have a domain command.
/// It deliberately accepts no JavaScript from the caller.
#[tauri::command]
pub async fn interact_editor_window(
    app: AppHandle,
    window_label: Option<String>,
    selector: String,
    action: String,
    target_selector: Option<String>,
    value: Option<String>,
    delta_x: Option<f64>,
    delta_y: Option<f64>,
    key: Option<String>,
    expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    let window_label = window_label.unwrap_or_else(|| "main".to_string());
    let selector = selector.trim().to_string();
    if selector.is_empty() || selector.len() > 1_000 {
        return Err("selector must contain 1 to 1000 characters".to_string());
    }
    if !matches!(
        action.as_str(),
        "click"
            | "doubleClick"
            | "contextClick"
            | "setValue"
            | "scroll"
            | "keyPress"
            | "dragTo"
            | "dragBy"
            | "hover"
    ) {
        return Err(format!("unsupported editor UI action \"{action}\""));
    }
    let target_selector = target_selector
        .map(|selector| selector.trim().to_string())
        .filter(|selector| !selector.is_empty());
    if action == "dragTo" {
        let target_selector = target_selector
            .as_ref()
            .ok_or_else(|| "dragTo requires targetSelector".to_string())?;
        if target_selector.len() > 1_000 {
            return Err("targetSelector must contain 1 to 1000 characters".to_string());
        }
    } else if target_selector.is_some() {
        return Err("targetSelector is only valid for dragTo".to_string());
    }
    if value.as_ref().is_some_and(|value| value.len() > 100_000) {
        return Err("UI value exceeds the 100000-character limit".to_string());
    }
    for (name, delta) in [("deltaX", delta_x), ("deltaY", delta_y)] {
        if delta.is_some_and(|delta| !delta.is_finite() || delta.abs() > 1_000_000.0) {
            return Err(format!("{name} must be from -1000000 to 1000000"));
        }
    }
    if action == "scroll" && delta_y.is_none() {
        return Err("scroll requires deltaY".to_string());
    }
    if action == "dragBy"
        && (delta_x.is_none() || delta_y.is_none() || delta_x == Some(0.0) && delta_y == Some(0.0))
    {
        return Err("dragBy requires non-zero deltaX or deltaY and both fields".to_string());
    }
    if action == "keyPress" {
        let key = key
            .as_deref()
            .ok_or_else(|| "keyPress requires key".to_string())?;
        if !matches!(
            key,
            "Enter"
                | "Escape"
                | "Tab"
                | "Space"
                | "ArrowUp"
                | "ArrowDown"
                | "ArrowLeft"
                | "ArrowRight"
                | "Home"
                | "End"
                | "PageUp"
                | "PageDown"
                | "Backspace"
                | "Delete"
        ) {
            return Err(format!("unsupported editor UI key \"{key}\""));
        }
    } else if key.is_some() {
        return Err("key is only valid for keyPress".to_string());
    }
    let expected_snapshot_revision = expected_snapshot_revision.trim().to_string();
    if !valid_ui_snapshot_revision(&expected_snapshot_revision) {
        return Err(
            "expectedSnapshotRevision must be a snapshotRevision returned by inspect_editor_window"
                .to_string(),
        );
    }
    let current_snapshot =
        inspect_editor_window_impl(app.clone(), window_label.clone(), 50, 0).await?;
    let actual_snapshot_revision = current_snapshot
        .get("snapshotRevision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "editor UI snapshot did not contain a revision".to_string())?;
    if actual_snapshot_revision != expected_snapshot_revision {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "Editor window semantic content changed; get a fresh UI snapshot before interacting",
            "staleSnapshot": true,
            "expectedSnapshotRevision": expected_snapshot_revision,
            "actualSnapshotRevision": actual_snapshot_revision,
            "restartOffset": 0,
        }));
    }
    let mut result = interact_editor_window_impl(
        app.clone(),
        window_label.clone(),
        selector,
        action,
        target_selector,
        value,
        delta_x,
        delta_y,
        key,
        expected_snapshot_revision.clone(),
    )
    .await?;
    if result.get("ok").and_then(serde_json::Value::as_bool) == Some(true) {
        let post_snapshot = inspect_editor_window_impl(app, window_label, 50, 0).await;
        let object = result
            .as_object_mut()
            .ok_or_else(|| "WebView2 UI interaction returned a non-object value".to_string())?;
        match post_snapshot {
            Ok(snapshot) => {
                let post_revision = snapshot
                    .get("snapshotRevision")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string);
                if let Some(post_revision) = post_revision {
                    let post_semantic_elements = snapshot
                        .get("totalSemanticElements")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(0);
                    object.insert(
                        "postObservationConfirmed".to_string(),
                        serde_json::Value::Bool(true),
                    );
                    object.insert(
                        "postSnapshotRevision".to_string(),
                        serde_json::Value::String(post_revision.clone()),
                    );
                    object.insert(
                        "postSemanticElementCount".to_string(),
                        serde_json::Value::from(post_semantic_elements),
                    );
                    object.insert(
                        "snapshotChanged".to_string(),
                        serde_json::Value::Bool(post_revision != expected_snapshot_revision),
                    );
                } else {
                    object.insert(
                        "postObservationConfirmed".to_string(),
                        serde_json::Value::Bool(false),
                    );
                    object.insert(
                        "postObservationError".to_string(),
                        serde_json::Value::String(
                            "post-interaction UI snapshot did not contain a revision".to_string(),
                        ),
                    );
                }
            }
            Err(error) => {
                object.insert(
                    "postObservationConfirmed".to_string(),
                    serde_json::Value::Bool(false),
                );
                object.insert(
                    "postObservationError".to_string(),
                    serde_json::Value::String(error),
                );
            }
        }
    }
    Ok(result)
}

fn valid_ui_snapshot_revision(value: &str) -> bool {
    let mut parts = value.split('-');
    let prefix = parts.next();
    let version = parts.next();
    let count = parts.next();
    let hash = parts.next();
    prefix == Some("ui")
        && version.is_some_and(|part| {
            part.strip_prefix('v').is_some_and(|digits| {
                !digits.is_empty() && digits.chars().all(|ch| ch.is_ascii_digit())
            })
        })
        && count.is_some_and(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
        && hash.is_some_and(|part| {
            part.len() == 16
                && part
                    .chars()
                    .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase())
        })
        && parts.next().is_none()
}

#[cfg(windows)]
async fn capture_editor_window_impl(
    app: AppHandle,
    window_label: String,
) -> Result<WindowCapture, String> {
    use base64::Engine as _;
    let response = call_webview_devtools(
        &app,
        &window_label,
        "Page.captureScreenshot",
        serde_json::json!({
            "format": "png",
            "fromSurface": true,
            "captureBeyondViewport": false,
        }),
    )
    .await?;
    let data = response
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

#[cfg(windows)]
async fn inspect_editor_window_impl(
    app: AppHandle,
    window_label: String,
    max_elements: usize,
    offset: usize,
) -> Result<serde_json::Value, String> {
    let expression = WINDOW_UI_SNAPSHOT_SCRIPT
        .replace("__MENGINE_MAX_ELEMENTS__", &max_elements.to_string())
        .replace("__MENGINE_OFFSET__", &offset.to_string());
    let mut snapshot = evaluate_webview_script(&app, &window_label, expression).await?;
    let object = snapshot
        .as_object_mut()
        .ok_or_else(|| "WebView2 UI inspection returned a non-object value".to_string())?;
    object.insert(
        "windowLabel".to_string(),
        serde_json::Value::String(window_label),
    );
    object.insert(
        "captureMethod".to_string(),
        serde_json::Value::String("webview2-devtools".to_string()),
    );
    object.insert("backgroundSafe".to_string(), serde_json::Value::Bool(true));
    Ok(snapshot)
}

#[cfg(windows)]
async fn read_editor_ui_content_impl(
    app: AppHandle,
    window_label: String,
    selector: String,
    field: String,
    offset: usize,
    max_chars: usize,
    expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    use base64::Engine as _;
    let payload = serde_json::json!({
        "selector": selector,
        "field": field,
        "offset": offset,
        "maxChars": max_chars,
        "expectedSnapshotRevision": expected_snapshot_revision,
    })
    .to_string();
    let payload = base64::engine::general_purpose::STANDARD.encode(payload);
    let expression = WINDOW_UI_CONTENT_SCRIPT.replace(
        "__MENGINE_PAYLOAD_BASE64__",
        &serde_json::to_string(&payload).map_err(|error| error.to_string())?,
    );
    let mut page = evaluate_webview_script(&app, &window_label, expression).await?;
    let object = page
        .as_object_mut()
        .ok_or_else(|| "WebView2 UI content read returned a non-object value".to_string())?;
    object.insert(
        "windowLabel".to_string(),
        serde_json::Value::String(window_label),
    );
    object.insert(
        "captureMethod".to_string(),
        serde_json::Value::String("webview2-devtools".to_string()),
    );
    object.insert("backgroundSafe".to_string(), serde_json::Value::Bool(true));
    Ok(page)
}

#[cfg(windows)]
async fn interact_editor_window_impl(
    app: AppHandle,
    window_label: String,
    selector: String,
    action: String,
    target_selector: Option<String>,
    value: Option<String>,
    delta_x: Option<f64>,
    delta_y: Option<f64>,
    key: Option<String>,
    expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    use base64::Engine as _;
    let payload = serde_json::json!({
        "selector": selector,
        "action": action,
        "targetSelector": target_selector,
        "value": value,
        "deltaX": delta_x,
        "deltaY": delta_y,
        "key": key,
        "expectedSnapshotRevision": expected_snapshot_revision,
    })
    .to_string();
    let payload = base64::engine::general_purpose::STANDARD.encode(payload);
    let expression = WINDOW_UI_INTERACTION_SCRIPT.replace(
        "__MENGINE_PAYLOAD_BASE64__",
        &serde_json::to_string(&payload).map_err(|error| error.to_string())?,
    );
    evaluate_webview_script_with_await(&app, &window_label, expression, true).await
}

#[cfg(windows)]
async fn evaluate_webview_script(
    app: &AppHandle,
    window_label: &str,
    expression: String,
) -> Result<serde_json::Value, String> {
    evaluate_webview_script_with_await(app, window_label, expression, false).await
}

#[cfg(windows)]
async fn evaluate_webview_script_with_await(
    app: &AppHandle,
    window_label: &str,
    expression: String,
    await_promise: bool,
) -> Result<serde_json::Value, String> {
    let response = call_webview_devtools(
        app,
        window_label,
        "Runtime.evaluate",
        serde_json::json!({
            "expression": expression,
            "returnByValue": true,
            "awaitPromise": await_promise,
            "userGesture": false,
        }),
    )
    .await?;
    if let Some(exception) = response.get("exceptionDetails") {
        return Err(format!("editor UI evaluation failed: {exception}"));
    }
    response
        .pointer("/result/value")
        .cloned()
        .ok_or_else(|| "WebView2 UI evaluation returned no serializable value".to_string())
}

#[cfg(windows)]
async fn call_webview_devtools(
    app: &AppHandle,
    window_label: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::sync::{Arc, Mutex as StdMutex};
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    let window = app
        .get_webview_window(window_label)
        .ok_or_else(|| format!("editor window \"{window_label}\" was not found"))?;
    let method_name = method.to_string();
    let params_json = params.to_string();
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
            let completion_method = method_name.clone();
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |status, payload| {
                    let result = status
                        .map_err(|error| format!("WebView2 {completion_method} failed: {error}"))
                        .map(|_| payload);
                    if let Some(sender) =
                        completion_tx.lock().ok().and_then(|mut guard| guard.take())
                    {
                        let _ = sender.send(result);
                    }
                    Ok(())
                },
            ));
            let method = HSTRING::from(method_name);
            let params = HSTRING::from(params_json);
            if let Err(error) =
                unsafe { webview.CallDevToolsProtocolMethod(&method, &params, &handler) }
            {
                send(Err(format!(
                    "could not start WebView2 DevTools call: {error}"
                )));
            }
        })
        .map_err(|error| format!("could not access editor webview: {error}"))?;

    let payload = tokio::time::timeout(std::time::Duration::from_secs(10), rx)
        .await
        .map_err(|_| format!("WebView2 {method} timed out after 10 seconds"))?
        .map_err(|_| format!("WebView2 {method} callback was cancelled"))??;
    serde_json::from_str(&payload)
        .map_err(|error| format!("invalid WebView2 {method} response: {error}"))
}

#[cfg(not(windows))]
async fn capture_editor_window_impl(
    _app: AppHandle,
    _window_label: String,
) -> Result<WindowCapture, String> {
    Err("background editor-window capture is currently only supported on Windows".to_string())
}

#[cfg(not(windows))]
async fn inspect_editor_window_impl(
    _app: AppHandle,
    _window_label: String,
    _max_elements: usize,
    _offset: usize,
) -> Result<serde_json::Value, String> {
    Err("background editor-window inspection is currently only supported on Windows".to_string())
}

#[cfg(not(windows))]
async fn read_editor_ui_content_impl(
    _app: AppHandle,
    _window_label: String,
    _selector: String,
    _field: String,
    _offset: usize,
    _max_chars: usize,
    _expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    Err(
        "background editor-window content reads are currently only supported on Windows"
            .to_string(),
    )
}

#[cfg(not(windows))]
async fn interact_editor_window_impl(
    _app: AppHandle,
    _window_label: String,
    _selector: String,
    _action: String,
    _target_selector: Option<String>,
    _value: Option<String>,
    _delta_x: Option<f64>,
    _delta_y: Option<f64>,
    _key: Option<String>,
    _expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    Err("background editor-window interaction is currently only supported on Windows".to_string())
}

/// Runs inside the target WebView2 renderer through `Runtime.evaluate`.
///
/// The result is deliberately bounded and flat. `parentId` preserves semantic
/// hierarchy while a flat array stays cheap for agents to search. Password
/// values are always redacted. Selectors are deterministic for the current DOM
/// and are the stable addressing seam for the background interaction layer.
#[cfg(windows)]
const WINDOW_UI_SNAPSHOT_SCRIPT: &str = r#"
(() => {
  const limit = __MENGINE_MAX_ELEMENTS__;
  const offset = __MENGINE_OFFSET__;
  const revisionGuardKey = Symbol.for('mengine.agent.uiRevisionGuard');
  let revisionGuard = window[revisionGuardKey];
  if (!revisionGuard) {
    revisionGuard = { epoch: 0, revisions: new Map() };
    const observer = new MutationObserver(() => {
      revisionGuard.epoch += 1;
      revisionGuard.revisions.clear();
    });
    observer.observe(document, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    revisionGuard.observer = observer;
    window[revisionGuardKey] = revisionGuard;
  }
  const normalize = (value, max = 400) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  const agentActionNames = [
    'click',
    'doubleClick',
    'contextClick',
    'setValue',
    'scroll',
    'keyPress',
    'dragTo',
    'dragBy',
    'hover',
  ];
  const agentPolicyFor = (element) => {
    const blockedActions = new Set();
    let alternative = null;
    let current = element;
    while (current instanceof Element) {
      const blocksAll = current.getAttribute('data-agent-interaction') === 'blocked';
      const localBlockedActions = String(
        current.getAttribute('data-agent-blocked-actions') || '',
      ).split(/\s+/).filter((candidate) => agentActionNames.includes(candidate));
      if (blocksAll || localBlockedActions.length > 0) {
        alternative ||= normalize(current.getAttribute('data-agent-alternative'), 160) || null;
        if (blocksAll) {
          return { blocked: true, blockedActions: null, alternative };
        }
        for (const blockedAction of localBlockedActions) {
          blockedActions.add(blockedAction);
        }
      }
      current = current.parentElement;
    }
    return blockedActions.size > 0
      ? {
          blocked: true,
          blockedActions: agentActionNames.filter((name) => blockedActions.has(name)),
          alternative,
        }
      : null;
  };
  const implicitRole = (element) => {
    const tag = element.localName;
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'button') return 'button';
    if (tag === 'a' && element.hasAttribute('href')) return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return element.multiple ? 'listbox' : 'combobox';
    if (tag === 'option') return 'option';
    if (tag === 'main') return 'main';
    if (tag === 'nav') return 'navigation';
    if (tag === 'form') return 'form';
    if (tag === 'progress') return 'progressbar';
    if (tag !== 'input') return '';
    const type = String(element.type || 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    return 'textbox';
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden'
      || Number(style.opacity) === 0 || element.hidden) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const labelledText = (element) => {
    const labelledBy = normalize(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const text = labelledBy.split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => normalize(node.innerText || node.textContent))
        .filter(Boolean)
        .join(' ');
      if (text) return normalize(text);
    }
    if (element.labels?.length) {
      const text = Array.from(element.labels)
        .map((label) => normalize(label.innerText || label.textContent))
        .filter(Boolean)
        .join(' ');
      if (text) return normalize(text);
    }
    return '';
  };
  const nameFromContent = (role) => [
    'button', 'link', 'heading', 'menuitem', 'option', 'tab',
  ].includes(role);
  const meaningfulContentName = (element, role) => {
    if (!nameFromContent(role)) return '';
    const content = normalize(element.innerText || element.textContent);
    return /[\p{L}\p{N}]/u.test(content) ? content : '';
  };
  const accessibleName = (element, role) => normalize(
    element.getAttribute('aria-label')
      || labelledText(element)
      || element.getAttribute('alt')
      || meaningfulContentName(element, role)
      || element.getAttribute('placeholder')
      || element.getAttribute('title')
      || (nameFromContent(role) ? element.innerText || element.textContent : ''),
  );
  const ownText = (element, role) => {
    if (nameFromContent(role) || element.children.length === 0) {
      return normalize(element.innerText || element.textContent);
    }
    return normalize(Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' '));
  };
  const selectorFor = (element) => {
    const escape = (value) => CSS.escape(String(value));
    if (element.id) {
      const selector = `#${escape(element.id)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const parts = [];
    let current = element;
    while (current && current !== document.documentElement) {
      let part = current.localName;
      const parent = current.parentElement;
      if (current.id) {
        const selector = `#${escape(current.id)}`;
        if (document.querySelectorAll(selector).length === 1) {
          parts.unshift(selector);
          break;
        }
      }
      if (parent) {
        const sameTag = Array.from(parent.children)
          .filter((child) => child.localName === current.localName);
        if (sameTag.length > 1) {
          part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(' > ');
  };
  const valueFor = (element) => {
    if (element instanceof HTMLInputElement) {
      if (String(element.type).toLowerCase() === 'password') return '<redacted>';
      return normalize(element.value);
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return normalize(element.value);
    }
    if (element.isContentEditable) return normalize(element.textContent);
    return '';
  };
  const reactProps = (element) => {
    for (const key of Object.keys(element)) {
      if (key.startsWith('__reactProps$')) return element[key] || {};
    }
    return {};
  };
  const actionList = (element, role) => {
    const actions = [];
    const props = reactProps(element);
    if (role === 'button' || role === 'link' || role === 'menuitem'
      || role === 'tab' || role === 'option' || role === 'checkbox'
      || role === 'radio' || role === 'switch'
      || typeof props.onClick === 'function') {
      actions.push('click');
    }
    if (typeof props.onDoubleClick === 'function') actions.push('doubleClick');
    if (typeof props.onContextMenu === 'function') actions.push('contextClick');
    const inputType = element instanceof HTMLInputElement
      ? String(element.type || 'text').toLowerCase()
      : '';
    const writableInput = element instanceof HTMLInputElement
      && !['button', 'submit', 'reset', 'file', 'image'].includes(inputType);
    if ((writableInput && !element.readOnly)
      || (element instanceof HTMLTextAreaElement && !element.readOnly)
      || element instanceof HTMLSelectElement
      || element.isContentEditable) {
      actions.push('setValue');
    }
    const style = element instanceof HTMLElement ? getComputedStyle(element) : null;
    const scrollableOverflow = (value) => ['auto', 'scroll', 'overlay'].includes(value);
    const scrollsVertically = style
      && scrollableOverflow(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1;
    const scrollsHorizontally = style
      && scrollableOverflow(style.overflowX)
      && element.scrollWidth > element.clientWidth + 1;
    if (scrollsVertically || scrollsHorizontally) {
      actions.push('scroll');
    }
    const keyboardTarget = element instanceof HTMLElement && (
      element.tabIndex >= 0
      || writableInput
      || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
      || element.isContentEditable
    );
    if (
      keyboardTarget
      || typeof props.onKeyDown === 'function'
      || typeof props.onKeyUp === 'function'
      || typeof props.onKeyPress === 'function'
    ) {
      actions.push('keyPress');
    }
    if (element.draggable || typeof props.onDragStart === 'function') {
      actions.push('dragTo');
    }
    const gestureHint = normalize(
      `${element.getAttribute('aria-label') || ''} `
        + `${element.getAttribute('title') || ''} ${element.className || ''}`,
      240,
    ).toLocaleLowerCase();
    const pointerGesture = typeof props.onPointerDown === 'function' && (
      typeof props.onPointerMove === 'function'
      || typeof props.onPointerUp === 'function'
      || typeof props.onPointerCancel === 'function'
      || /drag|scrub|resize|拖|调整|调节/.test(gestureHint)
    );
    const mouseGesture = typeof props.onMouseDown === 'function'
      && typeof props.onClick !== 'function';
    if ((pointerGesture || mouseGesture) && typeof props.onClick !== 'function') {
      actions.push('dragBy');
    }
    if (
      typeof props.onPointerEnter === 'function'
      || typeof props.onPointerOver === 'function'
      || typeof props.onMouseEnter === 'function'
      || typeof props.onMouseOver === 'function'
    ) {
      actions.push('hover');
    }
    return actions;
  };
  const scrollContextName = (element) => {
    let current = element;
    while (current instanceof Element) {
      const label = normalize(current.getAttribute('aria-label'), 160)
        || labelledText(current);
      if (label) return `${label} scroll area`;
      current = current.parentElement;
    }
    return 'Scrollable content';
  };
  const stateFor = (element) => {
    const state = {
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
      readOnly: Boolean(element.readOnly || element.getAttribute('aria-readonly') === 'true'),
      focused: document.activeElement === element,
    };
    for (const key of [
      'checked',
      'selected',
      'expanded',
      'pressed',
      'current',
      'level',
      'haspopup',
    ]) {
      const value = element.getAttribute(`aria-${key}`);
      if (value !== null) state[key] = value;
    }
    if (
      element instanceof HTMLInputElement
      && ['checkbox', 'radio'].includes(element.type)
    ) {
      state.checked = element.indeterminate ? 'mixed' : element.checked;
    }
    if ('selected' in element && typeof element.selected === 'boolean') {
      state.selected = element.selected;
    }
    return state;
  };
  const descriptionFor = (element, name) => normalize(
    element.getAttribute('aria-description')
      || (
        normalize(element.getAttribute('title')) !== name
          ? element.getAttribute('title')
          : ''
      ),
    300,
  ) || null;
  const scrollFor = (element, actions) => (
    actions.includes('scroll') && element instanceof HTMLElement
      ? {
          left: element.scrollLeft,
          top: element.scrollTop,
          width: element.scrollWidth,
          height: element.scrollHeight,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
        }
      : null
  );
  const rectFor = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
  };
  const all = [document.documentElement, ...document.querySelectorAll('*')];
  const candidates = [];
  for (const element of all) {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)
      || !visible(element)) continue;
    const role = normalize(element.getAttribute('role') || implicitRole(element), 80);
    const directName = accessibleName(element, role);
    const text = ownText(element, role);
    const tag = element.localName;
    const actions = actionList(element, role);
    const name = directName || (actions.includes('scroll') ? scrollContextName(element) : '');
    const structural = /^h[1-6]$/.test(tag)
      || ['p', 'label', 'summary', 'legend', 'caption'].includes(tag);
    if (!role && !name && !text && !structural && actions.length === 0) continue;
    candidates.push({ element, role, name, text, actions });
  }
  const ids = new Map(candidates.map((entry, index) => [entry.element, `ui-${index + 1}`]));
  const semanticElementFor = (entry) => {
    const { element, role, name, text, actions } = entry;
    let parent = element.parentElement;
    while (parent && !ids.has(parent)) parent = parent.parentElement;
    return {
      id: ids.get(element),
      parentId: parent ? ids.get(parent) || null : null,
      selector: selectorFor(element),
      tag: element.localName,
      role: role || null,
      name: name || null,
      text: text && text !== name ? text : null,
      value: valueFor(element) || null,
      description: descriptionFor(element, name),
      state: stateFor(element),
      agentInteraction: agentPolicyFor(element),
      actions,
      scroll: scrollFor(element, actions),
      rect: rectFor(element),
    };
  };
  const semanticElements = candidates.map(semanticElementFor);
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
  const activeElementSelector =
    document.activeElement instanceof Element ? selectorFor(document.activeElement) : null;
  const revisionSource = JSON.stringify({
    version: 2,
    title: document.title,
    url: location.href,
    viewport,
    activeElementSelector,
    totalDomElements: all.length,
    totalSemanticElements: semanticElements.length,
    elements: semanticElements,
  });
  let revisionHash = 0xcbf29ce484222325n;
  for (let index = 0; index < revisionSource.length; index += 1) {
    revisionHash ^= BigInt(revisionSource.charCodeAt(index));
    revisionHash = BigInt.asUintN(64, revisionHash * 0x100000001b3n);
  }
  const snapshotRevision = `ui-v1-${candidates.length}-${
    revisionHash.toString(16).padStart(16, '0')
  }`;
  revisionGuard.revisions.set(snapshotRevision, revisionGuard.epoch);
  const elements = semanticElements.slice(offset, offset + limit);
  return {
    version: 2,
    snapshotRevision,
    title: document.title,
    url: location.href,
    capturedAt: Date.now(),
    viewport,
    activeElementSelector,
    totalDomElements: all.length,
    totalSemanticElements: semanticElements.length,
    offset,
    count: elements.length,
    nextOffset: offset + elements.length < semanticElements.length
      ? offset + elements.length
      : null,
    hasMore: offset + elements.length < semanticElements.length,
    truncated: offset > 0 || offset + elements.length < semanticElements.length,
    elements,
  };
})()
"#;

/// Exact, paged element content read. Password values remain inaccessible.
#[cfg(windows)]
const WINDOW_UI_CONTENT_SCRIPT: &str = r#"
(() => {
  const payload = JSON.parse(atob(__MENGINE_PAYLOAD_BASE64__));
  const { selector, field, offset, maxChars, expectedSnapshotRevision } = payload;
  const revisionGuard = window[Symbol.for('mengine.agent.uiRevisionGuard')];
  const guardedEpoch = revisionGuard?.revisions?.get(expectedSnapshotRevision);
  if (!revisionGuard || guardedEpoch !== revisionGuard.epoch) {
    return {
      ok: false,
      error: 'Editor window semantic content changed; get a fresh UI snapshot before reading exact content',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  let element;
  try {
    element = document.querySelector(selector);
  } catch (error) {
    return { ok: false, error: `Invalid selector: ${String(error)}` };
  }
  if (!element) return { ok: false, error: `No element matches ${selector}` };
  let content;
  if (field === 'value') {
    if (element instanceof HTMLInputElement) {
      if (String(element.type).toLowerCase() === 'password') {
        return { ok: false, error: 'Password values cannot be read' };
      }
      content = String(element.value);
    } else if (element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement) {
      content = String(element.value);
    } else if (element instanceof HTMLElement && element.isContentEditable) {
      content = String(element.textContent ?? '');
    } else {
      return { ok: false, error: `Element ${selector} has no readable value` };
    }
  } else {
    content = String(element.innerText ?? element.textContent ?? '');
  }
  const revisionSource = JSON.stringify([selector, field, content]);
  let revisionHashA = 0x811c9dc5;
  let revisionHashB = 0x9e3779b9;
  for (let index = 0; index < revisionSource.length; index += 1) {
    const code = revisionSource.charCodeAt(index);
    revisionHashA = Math.imul(revisionHashA ^ code, 0x01000193);
    revisionHashB = Math.imul(revisionHashB ^ (code + index), 0x85ebca6b);
  }
  const contentRevision = `content-v1-${content.length}-${
    (revisionHashA >>> 0).toString(16).padStart(8, '0')
  }${(revisionHashB >>> 0).toString(16).padStart(8, '0')}`;
  const start = Math.min(Number(offset), content.length);
  const page = content.slice(start, start + Number(maxChars));
  const nextOffset = start + page.length < content.length ? start + page.length : null;
  return {
    ok: true,
    version: 1,
    contentRevision,
    selector,
    field,
    offset: start,
    count: page.length,
    totalLength: content.length,
    nextOffset,
    content: page,
  };
})()
"#;

/// Allow-listed DOM interaction executed inside the target WebView2 renderer.
/// Caller-controlled strings are inserted only as JSON string literals.
#[cfg(windows)]
const WINDOW_UI_INTERACTION_SCRIPT: &str = r#"
(async () => {
  const payload = JSON.parse(atob(__MENGINE_PAYLOAD_BASE64__));
  const {
    selector,
    action,
    targetSelector,
    value: requestedValue,
    deltaX: requestedDeltaX,
    deltaY: requestedDeltaY,
    key: requestedKey,
    expectedSnapshotRevision,
  } = payload;
  const revisionGuard = window[Symbol.for('mengine.agent.uiRevisionGuard')];
  const guardedEpoch = revisionGuard?.revisions?.get(expectedSnapshotRevision);
  if (!revisionGuard || guardedEpoch !== revisionGuard.epoch) {
    return {
      ok: false,
      error: 'Editor window semantic content changed; get a fresh UI snapshot before interacting',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  const agentActionNames = [
    'click',
    'doubleClick',
    'contextClick',
    'setValue',
    'scroll',
    'keyPress',
    'dragTo',
    'dragBy',
    'hover',
  ];
  const agentPolicyFor = (target) => {
    const blockedActions = new Set();
    let alternative = null;
    let current = target;
    while (current instanceof Element) {
      const blocksAll = current.getAttribute('data-agent-interaction') === 'blocked';
      const localBlockedActions = String(
        current.getAttribute('data-agent-blocked-actions') || '',
      ).split(/\s+/).filter((candidate) => agentActionNames.includes(candidate));
      if (blocksAll || localBlockedActions.length > 0) {
        alternative ||= String(
          current.getAttribute('data-agent-alternative') || '',
        ).trim() || null;
        if (blocksAll) {
          return { blockedActions: null, alternative };
        }
        for (const blockedAction of localBlockedActions) {
          blockedActions.add(blockedAction);
        }
      }
      current = current.parentElement;
    }
    return blockedActions.size > 0
      ? {
          blockedActions: agentActionNames.filter((name) => blockedActions.has(name)),
          alternative,
        }
      : null;
  };
  let element;
  try {
    element = document.querySelector(selector);
  } catch (error) {
    return { ok: false, error: `Invalid selector: ${String(error)}` };
  }
  if (!element) return { ok: false, error: `No element matches ${selector}` };
  let targetElement = null;
  if (action === 'dragTo') {
    try {
      targetElement = document.querySelector(targetSelector);
    } catch (error) {
      return { ok: false, error: `Invalid target selector: ${String(error)}` };
    }
    if (!targetElement) {
      return { ok: false, error: `No element matches target ${targetSelector}` };
    }
  }
  const normalizeName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const labelledText = (target) => {
    const ids = String(target.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const referenced = normalizeName(
      ids.map((id) => document.getElementById(id)?.textContent || '').join(' '),
    );
    if (referenced) return referenced;
    return normalizeName(
      Array.from(target.labels || [])
        .map((label) => label.innerText || label.textContent || '')
        .join(' '),
    );
  };
  const roleForName = (target) => {
    const explicit = normalizeName(target.getAttribute('role'));
    if (explicit) return explicit;
    if (/^h[1-6]$/.test(target.localName)) return 'heading';
    if (target.localName === 'button') return 'button';
    if (target.localName === 'a' && target.hasAttribute('href')) return 'link';
    if (target.localName === 'textarea') return 'textbox';
    if (target.localName === 'select') return target.multiple ? 'listbox' : 'combobox';
    if (target.localName === 'option') return 'option';
    if (target.localName === 'input') {
      const type = String(target.type || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (['button', 'submit', 'reset'].includes(type)) return 'button';
      return 'textbox';
    }
    return '';
  };
  const directName = (target) => {
    const role = roleForName(target);
    const content = ['button', 'link', 'heading', 'menuitem', 'option', 'tab'].includes(role)
      ? normalizeName(target.innerText || target.textContent)
      : '';
    const meaningfulContent = /[\p{L}\p{N}]/u.test(content) ? content : '';
    return normalizeName(target.getAttribute('aria-label'))
      || labelledText(target)
      || normalizeName(target.getAttribute('alt'))
      || meaningfulContent
      || normalizeName(target.getAttribute('placeholder'))
      || normalizeName(target.getAttribute('title'))
      || content;
  };
  const interactionName = (target, includeScrollContext = false) => {
    const direct = directName(target);
    if (direct) return direct;
    if (includeScrollContext) {
      let current = target.parentElement;
      while (current instanceof Element) {
        const context = directName(current);
        if (context) return `${context} scroll area`;
        current = current.parentElement;
      }
    }
    return normalizeName(target.innerText || target.textContent);
  };
  const agentPolicy = agentPolicyFor(element);
  if (agentPolicy && (
    agentPolicy.blockedActions === null
    || agentPolicy.blockedActions.includes(action)
  )) {
    const alternative = agentPolicy.alternative;
    return {
      ok: false,
      error: `Element ${selector} requires foreground-only user input for ${action}${
        alternative ? `; use ${alternative} instead` : ''
      }`,
      agentBlocked: true,
      agentAlternative: alternative,
    };
  }
  const targetAgentPolicy = targetElement ? agentPolicyFor(targetElement) : null;
  if (targetAgentPolicy && (
    targetAgentPolicy.blockedActions === null
    || targetAgentPolicy.blockedActions.includes(action)
  )) {
    const alternative = targetAgentPolicy.alternative;
    return {
      ok: false,
      error: `Target element ${targetSelector} requires foreground-only user input for ${action}${
        alternative ? `; use ${alternative} instead` : ''
      }`,
      agentBlocked: true,
      agentAlternative: alternative,
    };
  }
  const disabled = Boolean(
    element.disabled || element.getAttribute('aria-disabled') === 'true',
  );
  if (disabled) {
    return { ok: false, error: `Element ${selector} is disabled` };
  }
  if (targetElement && Boolean(
    targetElement.disabled || targetElement.getAttribute('aria-disabled') === 'true',
  )) {
    return { ok: false, error: `Target element ${targetSelector} is disabled` };
  }
  const eventCoordinates = (target = element) => {
    const rect = target.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  };
  const dispatchPointerAt = (
    target,
    type,
    button,
    buttons,
    detail = 0,
    coordinates = eventCoordinates(target),
  ) => {
    const EventType = typeof PointerEvent === 'function' && type.startsWith('pointer')
      ? PointerEvent
      : MouseEvent;
    target.dispatchEvent(new EventType(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button,
      buttons,
      detail,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      ...coordinates,
    }));
  };
  const dispatchPointer = (type, button, buttons, detail = 0) => {
    dispatchPointerAt(element, type, button, buttons, detail);
  };
  const reactHoverEvent = (target, type, relatedTarget) => {
    const coordinates = eventCoordinates(target);
    return {
      type,
      target,
      currentTarget: target,
      nativeEvent: null,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      relatedTarget,
      ...coordinates,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      isDefaultPrevented() { return this.defaultPrevented; },
      isPropagationStopped() { return false; },
      persist() {},
    };
  };
  const reactPropsFor = (target) => {
    for (const key of Object.keys(target)) {
      if (key.startsWith('__reactProps$')) return target[key] || {};
    }
    return {};
  };
  const setCheckableInput = (checked, includeClick = false) => {
    if (
      !(element instanceof HTMLInputElement)
      || !['checkbox', 'radio'].includes(element.type)
    ) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'checked',
    )?.set;
    if (!setter) return false;
    setter.call(element, Boolean(checked));
    element.indeterminate = false;
    const reactProps = reactPropsFor(element);
    const syntheticEvent = (type) => ({
      type,
      target: element,
      currentTarget: element,
      nativeEvent: null,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      isDefaultPrevented() { return this.defaultPrevented; },
      isPropagationStopped() { return false; },
      persist() {},
    });
    let handledByReact = false;
    if (includeClick && typeof reactProps.onClick === 'function') {
      reactProps.onClick(syntheticEvent('click'));
      handledByReact = true;
    }
    if (typeof reactProps.onChange === 'function') {
      reactProps.onChange(syntheticEvent('change'));
      handledByReact = true;
    }
    if (!handledByReact) {
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    return true;
  };
  const dispatchClick = (detail) => {
    dispatchPointer('pointerdown', 0, 1, detail);
    dispatchPointer('mousedown', 0, 1, detail);
    dispatchPointer('pointerup', 0, 0, detail);
    dispatchPointer('mouseup', 0, 0, detail);
    if (
      element instanceof HTMLInputElement
      && ['checkbox', 'radio'].includes(element.type)
    ) {
      setCheckableInput(
        element.type === 'radio'
          ? true
          : (element.indeterminate ? true : !element.checked),
        true,
      );
    } else if (typeof element.click === 'function') element.click();
    else dispatchPointer('click', 0, 0, detail);
  };
  if (action === 'click') {
    dispatchClick(1);
  } else if (action === 'doubleClick') {
    dispatchClick(1);
    dispatchClick(2);
    dispatchPointer('dblclick', 0, 0, 2);
  } else if (action === 'contextClick') {
    dispatchPointer('pointerdown', 2, 2, 1);
    dispatchPointer('mousedown', 2, 2, 1);
    dispatchPointer('contextmenu', 2, 2, 1);
    dispatchPointer('pointerup', 2, 0, 1);
    dispatchPointer('mouseup', 2, 0, 1);
  } else if (action === 'dragTo') {
    const reactProps = reactPropsFor(element);
    if (!element.draggable && typeof reactProps.onDragStart !== 'function') {
      return { ok: false, error: `Element ${selector} is not a draggable semantic source` };
    }
    if (
      !(targetElement instanceof Element)
      || typeof DataTransfer !== 'function'
      || typeof DragEvent !== 'function'
    ) {
      return { ok: false, error: 'This WebView does not support semantic drag events' };
    }
    const dataTransfer = new DataTransfer();
    dataTransfer.effectAllowed = 'all';
    const dispatchDrag = (target, type) => target.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer,
      ...eventCoordinates(target),
    }));
    dispatchPointer('pointerdown', 0, 1, 1);
    dispatchPointer('mousedown', 0, 1, 1);
    if (!dispatchDrag(element, 'dragstart')) {
      dispatchPointer('pointerup', 0, 0, 1);
      dispatchPointer('mouseup', 0, 0, 1);
      return { ok: false, error: `Element ${selector} cancelled dragstart` };
    }
    dispatchPointerAt(targetElement, 'pointermove', 0, 1, 1);
    dispatchPointerAt(targetElement, 'mousemove', 0, 1, 1);
    dispatchDrag(targetElement, 'dragenter');
    dispatchDrag(targetElement, 'dragover');
    dispatchDrag(targetElement, 'drop');
    dispatchDrag(element, 'dragend');
    dispatchPointerAt(targetElement, 'pointerup', 0, 0, 1);
    dispatchPointerAt(targetElement, 'mouseup', 0, 0, 1);
  } else if (action === 'dragBy') {
    const deltaX = Number(requestedDeltaX);
    const deltaY = Number(requestedDeltaY);
    if (
      !Number.isFinite(deltaX)
      || !Number.isFinite(deltaY)
      || (deltaX === 0 && deltaY === 0)
    ) {
      return { ok: false, error: 'dragBy requires finite non-zero CSS-pixel deltas' };
    }
    const start = eventCoordinates(element);
    const end = {
      clientX: start.clientX + deltaX,
      clientY: start.clientY + deltaY,
    };
    if (
      end.clientX < 0
      || end.clientY < 0
      || end.clientX >= document.documentElement.clientWidth
      || end.clientY >= document.documentElement.clientHeight
    ) {
      return {
        ok: false,
        error: 'dragBy must end inside the target WebView viewport',
      };
    }
    const reactProps = reactPropsFor(element);
    const gestureHint = String(
      `${element.getAttribute('aria-label') || ''} `
        + `${element.getAttribute('title') || ''} ${element.className || ''}`,
    ).toLocaleLowerCase();
    const pointerGesture = typeof reactProps.onPointerDown === 'function' && (
      typeof reactProps.onPointerMove === 'function'
      || typeof reactProps.onPointerUp === 'function'
      || typeof reactProps.onPointerCancel === 'function'
      || /drag|scrub|resize|拖|调整|调节/.test(gestureHint)
    );
    const mouseGesture = typeof reactProps.onMouseDown === 'function'
      && typeof reactProps.onClick !== 'function';
    if (
      (!pointerGesture && !mouseGesture)
      || typeof reactProps.onClick === 'function'
    ) {
      return { ok: false, error: `Element ${selector} is not a draggable pointer gesture` };
    }
    let syntheticCapture = false;
    const captureMethods = [
      ['setPointerCapture', (pointerId) => {
        if (pointerId === 1) syntheticCapture = true;
      }],
      ['releasePointerCapture', (pointerId) => {
        if (pointerId === 1) syntheticCapture = false;
      }],
      ['hasPointerCapture', (pointerId) => pointerId === 1 && syntheticCapture],
    ];
    const captureDescriptors = captureMethods.map(([name]) => (
      Object.getOwnPropertyDescriptor(element, name)
    ));
    try {
      captureMethods.forEach(([name, implementation]) => {
        Object.defineProperty(element, name, {
          configurable: true,
          value: implementation,
        });
      });
      dispatchPointerAt(element, 'pointerdown', 0, 1, 1, start);
      dispatchPointerAt(element, 'mousedown', 0, 1, 1, start);
      const distance = Math.hypot(deltaX, deltaY);
      const steps = Math.max(2, Math.min(16, Math.ceil(distance / 20)));
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        const coordinates = {
          clientX: start.clientX + deltaX * progress,
          clientY: start.clientY + deltaY * progress,
        };
        dispatchPointerAt(element, 'pointermove', 0, 1, 1, coordinates);
        dispatchPointerAt(element, 'mousemove', 0, 1, 1, coordinates);
      }
      dispatchPointerAt(element, 'pointerup', 0, 0, 1, end);
      dispatchPointerAt(element, 'mouseup', 0, 0, 1, end);
    } finally {
      captureMethods.forEach(([name], index) => {
        const descriptor = captureDescriptors[index];
        if (descriptor) Object.defineProperty(element, name, descriptor);
        else delete element[name];
      });
    }
  } else if (action === 'hover') {
    const reactProps = reactPropsFor(element);
    if (
      typeof reactProps.onPointerEnter !== 'function'
      && typeof reactProps.onPointerOver !== 'function'
      && typeof reactProps.onMouseEnter !== 'function'
      && typeof reactProps.onMouseOver !== 'function'
    ) {
      return { ok: false, error: `Element ${selector} has no semantic hover interaction` };
    }
    const hoverState = Symbol.for('mengine.agent.hoveredElement');
    const storedHover = window[hoverState];
    const previous = storedHover instanceof Element && storedHover.isConnected
      ? storedHover
      : null;
    if (
      previous
      && previous !== element
      && !previous.contains(element)
    ) {
      const previousProps = reactPropsFor(previous);
      if (typeof previousProps.onPointerOut === 'function') {
        previousProps.onPointerOut(reactHoverEvent(previous, 'pointerout', element));
      }
      if (typeof previousProps.onPointerLeave === 'function') {
        previousProps.onPointerLeave(reactHoverEvent(previous, 'pointerleave', element));
      }
      if (typeof previousProps.onMouseOut === 'function') {
        previousProps.onMouseOut(reactHoverEvent(previous, 'mouseout', element));
      }
      if (typeof previousProps.onMouseLeave === 'function') {
        previousProps.onMouseLeave(reactHoverEvent(previous, 'mouseleave', element));
      }
    }
    if (typeof reactProps.onPointerOver === 'function') {
      reactProps.onPointerOver(reactHoverEvent(element, 'pointerover', previous));
    }
    if (typeof reactProps.onPointerEnter === 'function') {
      reactProps.onPointerEnter(reactHoverEvent(element, 'pointerenter', previous));
    }
    if (typeof reactProps.onMouseOver === 'function') {
      reactProps.onMouseOver(reactHoverEvent(element, 'mouseover', previous));
    }
    if (typeof reactProps.onMouseEnter === 'function') {
      reactProps.onMouseEnter(reactHoverEvent(element, 'mouseenter', previous));
    }
    window[hoverState] = element;
  } else if (action === 'setValue') {
    if (element.readOnly || element.getAttribute('aria-readonly') === 'true') {
      return { ok: false, error: `Element ${selector} is read-only` };
    }
    const value = requestedValue == null ? '' : String(requestedValue);
    if (
      element instanceof HTMLInputElement
      && ['checkbox', 'radio'].includes(element.type)
    ) {
      if (!['true', 'false'].includes(value.toLowerCase())) {
        return { ok: false, error: `Element ${selector} accepts only true or false` };
      }
      if (!setCheckableInput(value.toLowerCase() === 'true')) {
        return { ok: false, error: `Element ${selector} has no checked setter` };
      }
    } else {
      let prototype;
      if (element instanceof HTMLInputElement) prototype = HTMLInputElement.prototype;
      else if (element instanceof HTMLTextAreaElement) prototype = HTMLTextAreaElement.prototype;
      else if (element instanceof HTMLSelectElement) prototype = HTMLSelectElement.prototype;
      if (prototype) {
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!setter) return { ok: false, error: `Element ${selector} has no value setter` };
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.isContentEditable) {
        element.textContent = value;
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value,
        }));
      } else {
        return { ok: false, error: `Element ${selector} does not accept a value` };
      }
    }
  } else if (action === 'keyPress') {
    const key = requestedKey === 'Space' ? ' ' : String(requestedKey || '');
    const code = requestedKey === 'Space' ? 'Space' : String(requestedKey || '');
    if (typeof element.focus === 'function') {
      element.focus({ preventScroll: true });
    }
    const dispatchKeyboard = (type) => element.dispatchEvent(new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    const acceptsDefault = dispatchKeyboard('keydown');
    if (requestedKey === 'Enter' || requestedKey === 'Space') {
      dispatchKeyboard('keypress');
    }
    if (acceptsDefault && (requestedKey === 'Enter' || requestedKey === 'Space')) {
      const role = roleForName(element);
      const activates = (
        element instanceof HTMLButtonElement
        || (element instanceof HTMLInputElement
          && ['button', 'submit', 'reset'].includes(element.type))
        || role === 'button'
        || role === 'link'
        || role === 'menuitem'
        || role === 'tab'
      );
      if (activates) {
        dispatchClick(1);
      } else if (
        requestedKey === 'Enter'
        && (
          element instanceof HTMLInputElement
          || element instanceof HTMLTextAreaElement
          || element instanceof HTMLSelectElement
        )
      ) {
        const form = element.form || element.closest('form');
        if (form instanceof HTMLFormElement && typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        }
      }
    }
    if (acceptsDefault && requestedKey === 'Tab') {
      const focusable = Array.from(document.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
          + 'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((candidate) => (
        candidate instanceof HTMLElement
        && getComputedStyle(candidate).display !== 'none'
        && getComputedStyle(candidate).visibility !== 'hidden'
        && candidate.getClientRects().length > 0
      ));
      const index = focusable.indexOf(element);
      const next = focusable[index >= 0 ? (index + 1) % focusable.length : 0];
      if (next instanceof HTMLElement) next.focus({ preventScroll: true });
    }
    dispatchKeyboard('keyup');
  } else if (action === 'scroll') {
    if (!(element instanceof HTMLElement) || typeof element.scrollBy !== 'function') {
      return { ok: false, error: `Element ${selector} is not scrollable` };
    }
    const deltaX = Number(requestedDeltaX ?? 0);
    const deltaY = Number(requestedDeltaY);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return { ok: false, error: 'Scroll deltas must be finite numbers' };
    }
    element.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' });
  }
  const waitForRender = () => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 50);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
  });
  await waitForRender();
  await waitForRender();
  return {
    ok: true,
    settledFrames: 2,
    elementConnected: element.isConnected,
    action,
    key: action === 'keyPress' ? requestedKey : null,
    deltaX: action === 'dragBy' ? requestedDeltaX : null,
    deltaY: action === 'dragBy' ? requestedDeltaY : null,
    selector,
    targetSelector: action === 'dragTo' ? targetSelector : null,
    targetName: targetElement ? interactionName(targetElement) : null,
    tag: element.localName,
    role: roleForName(element) || null,
    name: interactionName(element, action === 'scroll'),
    value: element instanceof HTMLInputElement && element.type === 'password'
      ? '<redacted>'
      : ('value' in element ? String(element.value) : null),
    checked: element instanceof HTMLInputElement
      && ['checkbox', 'radio'].includes(element.type)
      ? element.checked
      : null,
    scrollLeft: element instanceof HTMLElement ? element.scrollLeft : null,
    scrollTop: element instanceof HTMLElement ? element.scrollTop : null,
    scrollWidth: element instanceof HTMLElement ? element.scrollWidth : null,
    scrollHeight: element instanceof HTMLElement ? element.scrollHeight : null,
    clientWidth: element instanceof HTMLElement ? element.clientWidth : null,
    clientHeight: element instanceof HTMLElement ? element.clientHeight : null,
  };
})()
"#;
