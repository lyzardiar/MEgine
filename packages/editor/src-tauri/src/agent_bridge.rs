//! AgentBridge transport — a localhost-only WebSocket server that lets external
//! AI agents (via the MCP adapter, CLI, or a direct authenticated WS client)
//! drive and observe the editor.
//!
//! Architecture:
//! - Rust binds `127.0.0.1:0` (auto port) and writes `{ port, token, pid }` to a
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
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, watch, Semaphore};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, WebSocketConfig};
use tokio_tungstenite::tungstenite::Message;

const MAX_QUEUED_BRIDGE_REQUESTS: usize = 256;
const MAX_BRIDGE_CLIENTS: usize = 32;
const MAX_PENDING_REQUESTS_PER_CLIENT: usize = 64;
const MAX_PENDING_BRIDGE_REQUESTS: usize = 256;
const MAX_BRIDGE_INBOUND_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
const MAX_BRIDGE_OUTBOUND_MESSAGES: usize = 64;
const MAX_BRIDGE_OUTBOUND_QUEUED_BYTES: usize = 128 * 1024 * 1024;
const BRIDGE_RATE_LIMIT_RETRY_AFTER_MS: usize = 250;
const DANGEROUS_AGENT_COMMANDS: &[&str] = &[
    "scene.delete",
    "asset.trash",
    "build.start",
    "build.run",
    "build.history.create_patch",
    "build.history.restore",
];

#[derive(Clone, Debug, PartialEq)]
enum DangerousOperationPolicy {
    Allow,
    Deny,
    Token(String),
}

impl DangerousOperationPolicy {
    fn from_config(policy: Option<&str>, token: Option<&str>) -> Result<Self, String> {
        match policy
            .unwrap_or("allow")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "" | "allow" => Ok(Self::Allow),
            "deny" => Ok(Self::Deny),
            "token" => {
                let token = token.unwrap_or("");
                if !(16..=256).contains(&token.len())
                    || !token.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
                {
                    return Err(
                        "MENGINE_AGENT_APPROVAL_TOKEN must contain 16-256 visible ASCII characters"
                            .to_string(),
                    );
                }
                Ok(Self::Token(token.to_string()))
            }
            value => Err(format!(
                "MENGINE_AGENT_DANGEROUS_POLICY must be allow, deny, or token (got {value:?})"
            )),
        }
    }

    fn from_environment() -> Self {
        match Self::from_config(
            std::env::var("MENGINE_AGENT_DANGEROUS_POLICY")
                .ok()
                .as_deref(),
            std::env::var("MENGINE_AGENT_APPROVAL_TOKEN")
                .ok()
                .as_deref(),
        ) {
            Ok(policy) => policy,
            Err(error) => {
                log::warn!("{error}; dangerous AgentBridge commands will be denied");
                Self::Deny
            }
        }
    }

    fn mode(&self) -> &'static str {
        match self {
            Self::Allow => "allow",
            Self::Deny => "deny",
            Self::Token(_) => "token",
        }
    }
}

enum DangerousOperationAuthorization {
    Allowed,
    Denied(Option<String>),
}

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

    fn remove_request(&mut self, client_id: &str, request_key: &str) {
        let mut removed = false;
        self.queued_requests.retain(|request| {
            if !removed
                && request.client_id == client_id
                && request_slot_key(&request.message) == request_key
            {
                removed = true;
                return false;
            }
            true
        });
    }
}

struct OutboundMessage {
    message: Option<Message>,
    byte_len: usize,
    queued_bytes: Arc<AtomicUsize>,
}

impl OutboundMessage {
    fn try_new(text: String, queued_bytes: Arc<AtomicUsize>) -> Option<Self> {
        let byte_len = text.len();
        if !try_reserve_queued_bytes(
            queued_bytes.as_ref(),
            byte_len,
            MAX_BRIDGE_OUTBOUND_QUEUED_BYTES,
        ) {
            return None;
        }
        Some(Self {
            message: Some(Message::Text(text.into())),
            byte_len,
            queued_bytes,
        })
    }

    fn take(&mut self) -> Message {
        self.message
            .take()
            .expect("outbound message must be consumed exactly once")
    }
}

impl Drop for OutboundMessage {
    fn drop(&mut self) {
        self.queued_bytes.fetch_sub(self.byte_len, Ordering::AcqRel);
    }
}

fn try_reserve_queued_bytes(counter: &AtomicUsize, byte_len: usize, limit: usize) -> bool {
    if byte_len > limit {
        return false;
    }
    counter
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            current.checked_add(byte_len).filter(|next| *next <= limit)
        })
        .is_ok()
}

struct BridgeClient {
    outbound: mpsc::Sender<OutboundMessage>,
    disconnect: watch::Sender<bool>,
    queued_bytes: Arc<AtomicUsize>,
    in_flight_requests: usize,
    in_flight_request_ids: HashMap<String, usize>,
}

#[derive(Default)]
struct BridgeClients {
    entries: HashMap<String, BridgeClient>,
    in_flight_requests: usize,
}

#[derive(Debug, PartialEq)]
struct BridgeRequestCapacity {
    pending_requests: usize,
    pending_bridge_requests: usize,
}

enum BridgeRequestAdmission {
    Accepted,
    MissingClient,
    RateLimited(BridgeRequestCapacity),
}

/// Routes messages between the webview and connected WebSocket clients.
pub struct BridgeHub {
    /// client id -> channel feeding that client's WS write loop.
    clients: Mutex<BridgeClients>,
    /// Main-webview readiness and requests received while it is loading.
    transport: Mutex<BridgeTransportState>,
    /// Token a client must present (in the WS URL query) to connect.
    token: String,
    /// Process-level policy enforced before dangerous writes reach the WebView.
    dangerous_policy: DangerousOperationPolicy,
}

impl BridgeHub {
    #[cfg(test)]
    pub fn new(token: String) -> Self {
        Self::with_dangerous_policy(token, DangerousOperationPolicy::Allow)
    }

    pub fn from_environment(token: String) -> Self {
        Self::with_dangerous_policy(token, DangerousOperationPolicy::from_environment())
    }

    fn with_dangerous_policy(token: String, dangerous_policy: DangerousOperationPolicy) -> Self {
        Self {
            clients: Mutex::new(BridgeClients::default()),
            transport: Mutex::new(BridgeTransportState::default()),
            token,
            dangerous_policy,
        }
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    fn authorize_request(&self, message: &str) -> DangerousOperationAuthorization {
        let Some((request_id, command, approval_token)) =
            dangerous_execute_request_from_message(message)
        else {
            return DangerousOperationAuthorization::Allowed;
        };
        let allowed = match &self.dangerous_policy {
            DangerousOperationPolicy::Allow => true,
            DangerousOperationPolicy::Deny => false,
            DangerousOperationPolicy::Token(expected) => approval_token
                .as_deref()
                .is_some_and(|supplied| constant_time_equal(supplied, expected)),
        };
        if allowed {
            return DangerousOperationAuthorization::Allowed;
        }
        DangerousOperationAuthorization::Denied(request_id.map(|request_id| {
            bridge_permission_denied_response(request_id, &command, self.dangerous_policy.mode())
        }))
    }

    fn register(&self, id: String, client: BridgeClient) -> bool {
        let mut clients = self.clients.lock();
        if clients.entries.len() >= MAX_BRIDGE_CLIENTS || clients.entries.contains_key(&id) {
            return false;
        }
        clients.entries.insert(id, client);
        true
    }

    fn unregister(&self, id: &str) {
        self.remove_client(id, false);
    }

    fn disconnect(&self, id: &str) {
        self.remove_client(id, true);
    }

    fn remove_client(&self, id: &str, signal_disconnect: bool) {
        let removed = {
            let mut clients = self.clients.lock();
            let removed = clients.entries.remove(id);
            if let Some(client) = removed.as_ref() {
                clients.in_flight_requests = clients
                    .in_flight_requests
                    .saturating_sub(client.in_flight_requests);
            }
            removed
        };
        if signal_disconnect {
            if let Some(client) = removed {
                let _ = client.disconnect.send(true);
            }
        }
        self.transport.lock().remove_client(id);
    }

    fn begin_request(&self, id: &str, message: &str) -> BridgeRequestAdmission {
        let mut clients = self.clients.lock();
        let Some(client) = clients.entries.get(id) else {
            return BridgeRequestAdmission::MissingClient;
        };
        if client.in_flight_requests >= MAX_PENDING_REQUESTS_PER_CLIENT
            || clients.in_flight_requests >= MAX_PENDING_BRIDGE_REQUESTS
        {
            return BridgeRequestAdmission::RateLimited(BridgeRequestCapacity {
                pending_requests: client.in_flight_requests,
                pending_bridge_requests: clients.in_flight_requests,
            });
        }
        clients.in_flight_requests += 1;
        let client = clients
            .entries
            .get_mut(id)
            .expect("admitted client must remain registered");
        client.in_flight_requests += 1;
        *client
            .in_flight_request_ids
            .entry(request_slot_key(message))
            .or_default() += 1;
        BridgeRequestAdmission::Accepted
    }

    fn complete_request_slot(&self, id: &str, message: &str) -> bool {
        let mut clients = self.clients.lock();
        let Some(client) = clients.entries.get_mut(id) else {
            return false;
        };
        let request_key = request_slot_key(message);
        let Some(matching_requests) = client.in_flight_request_ids.get_mut(&request_key) else {
            return false;
        };
        *matching_requests -= 1;
        if *matching_requests == 0 {
            client.in_flight_request_ids.remove(&request_key);
        }
        client.in_flight_requests -= 1;
        clients.in_flight_requests -= 1;
        true
    }

    fn cancel_request(&self, id: &str, request_id: &serde_json::Value) -> bool {
        let request_key = request_id.to_string();
        {
            let mut clients = self.clients.lock();
            let Some(client) = clients.entries.get_mut(id) else {
                return false;
            };
            let Some(matching_requests) = client.in_flight_request_ids.get_mut(&request_key) else {
                return false;
            };
            *matching_requests -= 1;
            if *matching_requests == 0 {
                client.in_flight_request_ids.remove(&request_key);
            }
            client.in_flight_requests -= 1;
            clients.in_flight_requests -= 1;
        }
        self.transport.lock().remove_request(id, &request_key);
        true
    }

    fn enqueue_to(&self, id: &str, msg: String) -> bool {
        let channels = self
            .clients
            .lock()
            .entries
            .get(id)
            .map(|client| (client.outbound.clone(), Arc::clone(&client.queued_bytes)));
        let Some((outbound, queued_bytes)) = channels else {
            return false;
        };
        let Some(message) = OutboundMessage::try_new(msg, queued_bytes) else {
            self.disconnect(id);
            return false;
        };
        if outbound.try_send(message).is_err() {
            self.disconnect(id);
            return false;
        }
        true
    }

    /// Complete one admitted request and queue its reply. Returns false if the
    /// request/client is gone or the bounded client queue required disconnect.
    pub fn send_response_to(&self, id: &str, msg: String) -> bool {
        if !self.complete_request_slot(id, &msg) {
            return false;
        }
        self.enqueue_to(id, msg)
    }

    /// Broadcast an event to every connected client.
    #[allow(dead_code)]
    pub fn broadcast(&self, msg: String) {
        let client_ids = self
            .clients
            .lock()
            .entries
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        for client_id in client_ids {
            let _ = self.enqueue_to(&client_id, msg.clone());
        }
    }

    /// Queue a client request until the main webview listener is ready, or
    /// synchronously emit it while holding the readiness lock. Holding the lock
    /// closes the gap between a readiness check and a page-load reset.
    fn forward_request(&self, app: &AppHandle, payload: BridgeRequestPayload) {
        match self.begin_request(&payload.client_id, &payload.message) {
            BridgeRequestAdmission::Accepted => {}
            BridgeRequestAdmission::MissingClient => return,
            BridgeRequestAdmission::RateLimited(capacity) => {
                let response = bridge_rate_limited_response(&payload.message, &capacity);
                let _ = self.enqueue_to(&payload.client_id, response);
                return;
            }
        }
        let mut transport = self.transport.lock();
        match transport.route(payload) {
            BridgeRequestRoute::Dispatch(payload) => {
                let client_id = payload.client_id.clone();
                let response = bridge_not_ready_response(&payload.message);
                if !emit_bridge_request(app, payload) {
                    drop(transport);
                    let _ = self.send_response_to(&client_id, response);
                }
            }
            BridgeRequestRoute::Queued => {}
            BridgeRequestRoute::Rejected(payload) => {
                drop(transport);
                let response = bridge_not_ready_response(&payload.message);
                let _ = self.send_response_to(&payload.client_id, response);
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

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeCancelPayload {
    client_id: String,
    request_id: serde_json::Value,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeTransportReadyResult {
    accepted: bool,
    queued_requests: Vec<BridgeRequestPayload>,
}

fn emit_bridge_request(app: &AppHandle, payload: BridgeRequestPayload) -> bool {
    if let Err(error) = app.emit("agent-bridge:request", payload) {
        log::warn!("AgentBridge could not forward a request to the main webview: {error}");
        return false;
    }
    true
}

fn emit_bridge_cancel(app: &AppHandle, payload: BridgeCancelPayload) {
    if let Err(error) = app.emit("agent-bridge:cancel", payload) {
        log::warn!("AgentBridge could not forward request cancellation: {error}");
    }
}

fn bridge_rate_limited_response(message: &str, capacity: &BridgeRequestCapacity) -> String {
    let id = request_id_from_message(message);
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": "RATE_LIMITED",
            "message": "Too many AgentBridge requests are already pending",
            "data": {
                "pendingRequests": capacity.pending_requests,
                "maxPendingRequests": MAX_PENDING_REQUESTS_PER_CLIENT,
                "pendingBridgeRequests": capacity.pending_bridge_requests,
                "maxPendingBridgeRequests": MAX_PENDING_BRIDGE_REQUESTS,
                "retryAfterMs": BRIDGE_RATE_LIMIT_RETRY_AFTER_MS,
            },
        },
    })
    .to_string()
}

fn bridge_not_ready_response(message: &str) -> String {
    let id = request_id_from_message(message);
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

fn request_id_from_message(message: &str) -> serde_json::Value {
    serde_json::from_str::<serde_json::Value>(message)
        .ok()
        .and_then(|request| request.get("id").cloned())
        .unwrap_or(serde_json::Value::Null)
}

fn request_slot_key(message: &str) -> String {
    request_id_from_message(message).to_string()
}

fn dangerous_execute_request_from_message(
    message: &str,
) -> Option<(Option<serde_json::Value>, String, Option<String>)> {
    let request = serde_json::from_str::<serde_json::Value>(message).ok()?;
    if request.get("jsonrpc").and_then(serde_json::Value::as_str) != Some("2.0")
        || request.get("method").and_then(serde_json::Value::as_str) != Some("execute")
    {
        return None;
    }
    let params = request.get("params")?;
    let command = params.get("command")?.as_str()?;
    if !DANGEROUS_AGENT_COMMANDS.contains(&command) {
        return None;
    }
    let request_id = request.get("id").and_then(|value| {
        if value.is_string() || value.is_number() {
            Some(value.clone())
        } else {
            None
        }
    });
    let approval_token = params
        .get("approvalToken")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    Some((request_id, command.to_string(), approval_token))
}

fn constant_time_equal(supplied: &str, expected: &str) -> bool {
    if supplied.len() != expected.len() {
        return false;
    }
    supplied
        .bytes()
        .zip(expected.bytes())
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

fn bridge_permission_denied_response(
    request_id: serde_json::Value,
    command: &str,
    policy: &str,
) -> String {
    let message = if policy == "token" {
        format!(
            "Agent command \"{command}\" requires the configured dangerous-operation approval token"
        )
    } else {
        format!("Agent command \"{command}\" is disabled by editor policy")
    };
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {
            "code": "PERMISSION_DENIED",
            "message": message,
            "data": {
                "command": command,
                "policy": policy,
                "approvalRequired": policy == "token",
            },
        },
    })
    .to_string()
}

fn cancellation_request_id_from_message(message: &str) -> Option<serde_json::Value> {
    let request = serde_json::from_str::<serde_json::Value>(message).ok()?;
    if request.get("jsonrpc").and_then(serde_json::Value::as_str) != Some("2.0")
        || request.get("method").and_then(serde_json::Value::as_str) != Some("cancel")
        || request.get("id").is_some()
    {
        return None;
    }
    let request_id = request.get("params")?.get("requestId")?;
    if request_id.is_string() || request_id.is_number() {
        Some(request_id.clone())
    } else {
        None
    }
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
        let connection_slots = Arc::new(Semaphore::new(MAX_BRIDGE_CLIENTS));

        loop {
            match listener.accept().await {
                Ok((stream, _peer)) => {
                    let Ok(connection_slot) = Arc::clone(&connection_slots).try_acquire_owned()
                    else {
                        log::warn!(
                            "AgentBridge rejected a connection because {MAX_BRIDGE_CLIENTS} connection tasks are already active"
                        );
                        continue;
                    };
                    let app = app.clone();
                    let hub = hub.clone();
                    tokio::spawn(async move {
                        let _connection_slot = connection_slot;
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
    let websocket_config = WebSocketConfig {
        max_message_size: Some(MAX_BRIDGE_INBOUND_MESSAGE_BYTES),
        max_frame_size: Some(MAX_BRIDGE_INBOUND_MESSAGE_BYTES),
        max_write_buffer_size: MAX_BRIDGE_OUTBOUND_QUEUED_BYTES,
        ..WebSocketConfig::default()
    };
    let ws = tokio_tungstenite::accept_hdr_async_with_config(
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
        Some(websocket_config),
    )
    .await?;

    let (mut sink, mut stream) = ws.split();
    let client_id = uuid::Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::channel::<OutboundMessage>(MAX_BRIDGE_OUTBOUND_MESSAGES);
    let (disconnect, mut read_disconnect) = watch::channel(false);
    let mut write_disconnect = read_disconnect.clone();
    let client = BridgeClient {
        outbound: tx,
        disconnect,
        queued_bytes: Arc::new(AtomicUsize::new(0)),
        in_flight_requests: 0,
        in_flight_request_ids: HashMap::new(),
    };
    if !hub.register(client_id.clone(), client) {
        let _ = sink
            .send(Message::Close(Some(CloseFrame {
                code: CloseCode::Policy,
                reason: "AgentBridge client limit reached".into(),
            })))
            .await;
        return Ok(());
    }

    // Write loop: forward queued replies/events to this client's socket.
    let write_task = tokio::spawn(async move {
        while let Some(mut outbound) = rx.recv().await {
            let message = outbound.take();
            let send_result = tokio::select! {
                result = sink.send(message) => result,
                _ = write_disconnect.changed() => break,
            };
            drop(outbound);
            if send_result.is_err() {
                break;
            }
        }
        // `Stream` queues the protocol close response when it receives the
        // peer's close frame. Closing the sink flushes that queued response.
        let _ = sink.close().await;
    });

    // Read loop: forward incoming requests to the webview.
    loop {
        let msg = tokio::select! {
            msg = stream.next() => msg,
            _ = read_disconnect.changed() => break,
        };
        let Some(msg) = msg else {
            break;
        };
        match msg {
            Ok(Message::Text(text)) => {
                if let Some(request_id) = cancellation_request_id_from_message(&text) {
                    if hub.cancel_request(&client_id, &request_id) {
                        emit_bridge_cancel(
                            &app,
                            BridgeCancelPayload {
                                client_id: client_id.clone(),
                                request_id,
                            },
                        );
                    }
                    continue;
                }
                match hub.authorize_request(&text) {
                    DangerousOperationAuthorization::Allowed => {}
                    DangerousOperationAuthorization::Denied(response) => {
                        if let Some(response) = response {
                            let _ = hub.enqueue_to(&client_id, response);
                        }
                        continue;
                    }
                }
                hub.forward_request(
                    &app,
                    BridgeRequestPayload {
                        client_id: client_id.clone(),
                        message: text.to_string(),
                    },
                );
            }
            Ok(Message::Close(_)) => break,
            Ok(Message::Binary(_)) => {
                log::warn!("AgentBridge rejected a binary message from client {client_id}");
                break;
            }
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
    let content = serde_json::json!({
        "port": port,
        "token": token,
        "pid": std::process::id(),
        "version": 1,
    })
    .to_string();
    if let Err(error) = write_discovery_record(&path, content.as_bytes()) {
        log::warn!("AgentBridge could not write discovery file: {error}");
    } else {
        log::info!("AgentBridge discovery file: {}", path.display());
    }
}

fn write_discovery_record(path: &std::path::Path, contents: &[u8]) -> std::io::Result<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| std::path::Path::new("."));
    std::fs::create_dir_all(parent)?;
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "AgentBridge discovery target must be a regular file",
            ));
        }
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("agent-bridge.json");
    let temporary = parent.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        crate::replace_file_atomically(&temporary, path)?;
        sync_discovery_parent(parent)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(unix)]
fn sync_discovery_parent(parent: &std::path::Path) -> std::io::Result<()> {
    std::fs::File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_discovery_parent(_parent: &std::path::Path) -> std::io::Result<()> {
    Ok(())
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
    hub.send_response_to(&client_id, payload)
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

    fn test_client() -> (
        BridgeClient,
        mpsc::Receiver<OutboundMessage>,
        watch::Receiver<bool>,
    ) {
        let (outbound, receiver) = mpsc::channel(MAX_BRIDGE_OUTBOUND_MESSAGES);
        let (disconnect, disconnect_receiver) = watch::channel(false);
        (
            BridgeClient {
                outbound,
                disconnect,
                queued_bytes: Arc::new(AtomicUsize::new(0)),
                in_flight_requests: 0,
                in_flight_request_ids: HashMap::new(),
            },
            receiver,
            disconnect_receiver,
        )
    }

    fn execute_message(id: Option<usize>, command: &str, approval_token: Option<&str>) -> String {
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "execute",
            "params": {
                "command": command,
                "requestId": "test-request",
                "args": {},
                "approvalToken": approval_token,
            },
        })
        .to_string()
    }

    #[test]
    fn semantic_ui_interaction_refuses_visible_or_focused_windows() {
        assert!(validate_background_ui_interaction_state(false, false).is_ok());
        assert!(validate_background_ui_interaction_state(true, false).is_err());
        assert!(validate_background_ui_interaction_state(false, true).is_err());
        assert!(validate_background_ui_interaction_state(true, true).is_err());
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
    fn queued_request_cancellation_removes_only_the_exact_rpc_id() {
        let mut state = BridgeTransportState::default();
        state.route(request("client-a", 1));
        state.route(request("client-a", 2));
        state.route(request("client-b", 1));

        state.remove_request("client-a", "1");

        assert_eq!(
            state
                .activate("session-a".to_string())
                .into_iter()
                .collect::<Vec<_>>(),
            vec![request("client-a", 2), request("client-b", 1)]
        );
    }

    #[test]
    fn request_slots_match_response_and_cancellation_ids() {
        let hub = BridgeHub::new("token".to_string());
        let (client, _receiver, _disconnect) = test_client();
        assert!(hub.register("client-a".to_string(), client));
        assert!(matches!(
            hub.begin_request("client-a", &request("client-a", 1).message),
            BridgeRequestAdmission::Accepted
        ));
        assert!(matches!(
            hub.begin_request("client-a", &request("client-a", 2).message),
            BridgeRequestAdmission::Accepted
        ));

        assert!(!hub.send_response_to(
            "client-a",
            r#"{"jsonrpc":"2.0","id":3,"result":{}}"#.to_string()
        ));
        assert_eq!(hub.clients.lock().in_flight_requests, 2);
        assert!(hub.cancel_request("client-a", &serde_json::json!(1)));
        assert!(!hub.cancel_request("client-a", &serde_json::json!(1)));
        assert_eq!(hub.clients.lock().in_flight_requests, 1);
        assert!(hub.send_response_to(
            "client-a",
            r#"{"jsonrpc":"2.0","id":2,"result":{}}"#.to_string()
        ));
        assert_eq!(hub.clients.lock().in_flight_requests, 0);
    }

    #[test]
    fn bridge_cancellation_is_a_strict_notification() {
        assert_eq!(
            cancellation_request_id_from_message(
                r#"{"jsonrpc":"2.0","method":"cancel","params":{"requestId":"rpc-1"}}"#
            ),
            Some(serde_json::json!("rpc-1"))
        );
        assert_eq!(
            cancellation_request_id_from_message(
                r#"{"jsonrpc":"2.0","id":9,"method":"cancel","params":{"requestId":"rpc-1"}}"#
            ),
            None
        );
        assert_eq!(
            cancellation_request_id_from_message(
                r#"{"jsonrpc":"2.0","method":"cancel","params":{"requestId":null}}"#
            ),
            None
        );
        assert_eq!(cancellation_request_id_from_message("not-json"), None);
    }

    #[test]
    fn dangerous_operation_policy_is_fail_closed_when_misconfigured() {
        assert_eq!(
            DangerousOperationPolicy::from_config(None, None),
            Ok(DangerousOperationPolicy::Allow)
        );
        assert_eq!(
            DangerousOperationPolicy::from_config(Some(" DENY "), None),
            Ok(DangerousOperationPolicy::Deny)
        );
        assert_eq!(
            DangerousOperationPolicy::from_config(Some("token"), Some("approval-token-123456")),
            Ok(DangerousOperationPolicy::Token(
                "approval-token-123456".to_string()
            ))
        );
        assert!(DangerousOperationPolicy::from_config(Some("token"), Some("short")).is_err());
        assert!(DangerousOperationPolicy::from_config(Some("unknown"), None).is_err());
    }

    #[test]
    fn dangerous_commands_are_authorized_before_bridge_admission() {
        let approval_token = "approval-token-123456";
        let hub = BridgeHub::with_dangerous_policy(
            "bridge-token".to_string(),
            DangerousOperationPolicy::Token(approval_token.to_string()),
        );

        assert!(matches!(
            hub.authorize_request(&execute_message(Some(1), "build.verify", None)),
            DangerousOperationAuthorization::Allowed
        ));
        let denied = match hub.authorize_request(&execute_message(
            Some(2),
            "scene.delete",
            Some("wrong-token-1234567"),
        )) {
            DangerousOperationAuthorization::Denied(Some(response)) => response,
            _ => panic!("dangerous command without approval must be rejected"),
        };
        let denied = serde_json::from_str::<serde_json::Value>(&denied).unwrap();
        assert_eq!(denied["id"], 2);
        assert_eq!(denied["error"]["code"], "PERMISSION_DENIED");
        assert_eq!(denied["error"]["data"]["command"], "scene.delete");
        assert_eq!(denied["error"]["data"]["policy"], "token");
        assert_eq!(denied["error"]["data"]["approvalRequired"], true);
        assert!(!denied.to_string().contains(approval_token));

        assert!(matches!(
            hub.authorize_request(&execute_message(
                Some(3),
                "scene.delete",
                Some(approval_token),
            )),
            DangerousOperationAuthorization::Allowed
        ));
        assert!(matches!(
            hub.authorize_request(&execute_message(None, "build.start", None)),
            DangerousOperationAuthorization::Denied(None)
        ));

        let deny_hub = BridgeHub::with_dangerous_policy(
            "bridge-token".to_string(),
            DangerousOperationPolicy::Deny,
        );
        assert!(matches!(
            deny_hub.authorize_request(&execute_message(
                Some(4),
                "build.start",
                Some(approval_token),
            )),
            DangerousOperationAuthorization::Denied(Some(_))
        ));
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
    fn connected_clients_and_pending_requests_are_bounded() {
        let connection_hub = BridgeHub::new("token".to_string());
        for index in 0..MAX_BRIDGE_CLIENTS {
            let (client, _receiver, _disconnect) = test_client();
            assert!(connection_hub.register(format!("client-{index}"), client));
        }
        let (excess_client, _receiver, _disconnect) = test_client();
        assert!(!connection_hub.register("client-excess".to_string(), excess_client));

        let hub = BridgeHub::new("token".to_string());
        let (client, _receiver, _disconnect) = test_client();
        assert!(hub.register("client-0".to_string(), client));
        for index in 0..MAX_PENDING_REQUESTS_PER_CLIENT {
            let message = request("client-0", index).message;
            assert!(matches!(
                hub.begin_request("client-0", &message),
                BridgeRequestAdmission::Accepted
            ));
            assert_eq!(
                hub.clients
                    .lock()
                    .entries
                    .get("client-0")
                    .unwrap()
                    .in_flight_requests,
                index + 1
            );
        }
        let excess_message = request("client-0", 10_000).message;
        let capacity = match hub.begin_request("client-0", &excess_message) {
            BridgeRequestAdmission::RateLimited(capacity) => capacity,
            _ => panic!("request after the per-client limit should be rejected"),
        };
        assert_eq!(
            capacity,
            BridgeRequestCapacity {
                pending_requests: MAX_PENDING_REQUESTS_PER_CLIENT,
                pending_bridge_requests: MAX_PENDING_REQUESTS_PER_CLIENT,
            }
        );

        assert!(hub.send_response_to(
            "client-0",
            r#"{"jsonrpc":"2.0","id":0,"result":{}}"#.to_string()
        ));
        let replacement_message = request("client-0", 20_000).message;
        assert!(matches!(
            hub.begin_request("client-0", &replacement_message),
            BridgeRequestAdmission::Accepted
        ));
        hub.unregister("client-0");
        assert_eq!(hub.clients.lock().in_flight_requests, 0);
    }

    #[test]
    fn bridge_wide_pending_requests_are_bounded() {
        let hub = BridgeHub::new("token".to_string());
        for client_index in
            0..=MAX_PENDING_BRIDGE_REQUESTS.div_ceil(MAX_PENDING_REQUESTS_PER_CLIENT)
        {
            let (client, _receiver, _disconnect) = test_client();
            assert!(hub.register(format!("client-{client_index}"), client));
        }
        for client_index in 0..MAX_PENDING_BRIDGE_REQUESTS / MAX_PENDING_REQUESTS_PER_CLIENT {
            for request_index in 0..MAX_PENDING_REQUESTS_PER_CLIENT {
                let message = request(
                    &format!("client-{client_index}"),
                    client_index * MAX_PENDING_REQUESTS_PER_CLIENT + request_index,
                )
                .message;
                assert!(matches!(
                    hub.begin_request(&format!("client-{client_index}"), &message),
                    BridgeRequestAdmission::Accepted
                ));
            }
        }

        let excess_message = request("client-4", 30_000).message;
        let capacity = match hub.begin_request("client-4", &excess_message) {
            BridgeRequestAdmission::RateLimited(capacity) => capacity,
            _ => panic!("request after the bridge-wide limit should be rejected"),
        };
        assert_eq!(capacity.pending_requests, 0);
        assert_eq!(
            capacity.pending_bridge_requests,
            MAX_PENDING_BRIDGE_REQUESTS
        );
        let response: serde_json::Value = serde_json::from_str(&bridge_rate_limited_response(
            r#"{"jsonrpc":"2.0","id":"limited"}"#,
            &capacity,
        ))
        .unwrap();
        assert_eq!(response["id"], "limited");
        assert_eq!(response["error"]["code"], "RATE_LIMITED");
        assert_eq!(
            response["error"]["data"]["maxPendingBridgeRequests"],
            MAX_PENDING_BRIDGE_REQUESTS
        );
    }

    #[test]
    fn slow_client_outbound_queue_disconnects_without_unbounded_growth() {
        let hub = BridgeHub::new("token".to_string());
        let (client, receiver, disconnect) = test_client();
        assert!(hub.register("client-a".to_string(), client));

        for index in 0..MAX_BRIDGE_OUTBOUND_MESSAGES {
            assert!(hub.enqueue_to("client-a", format!("message-{index}")));
        }
        assert!(!hub.enqueue_to("client-a", "excess".to_string()));
        assert!(*disconnect.borrow());
        assert!(!hub.clients.lock().entries.contains_key("client-a"));
        assert_eq!(receiver.len(), MAX_BRIDGE_OUTBOUND_MESSAGES);
    }

    #[test]
    fn outbound_byte_reservation_is_atomic_and_bounded() {
        let queued = AtomicUsize::new(0);
        assert!(try_reserve_queued_bytes(&queued, 6, 10));
        assert!(!try_reserve_queued_bytes(&queued, 5, 10));
        assert_eq!(queued.load(Ordering::Acquire), 6);
        assert!(!try_reserve_queued_bytes(&queued, 11, 10));
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
    fn discovery_publish_is_atomic_and_rejects_non_file_targets() {
        let directory = std::env::temp_dir().join(format!(
            "mengine-agent-bridge-publish-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("agent-bridge.json");
        std::fs::write(&path, br#"{"version":0}"#).unwrap();
        let contents = br#"{"port":4707,"token":"secret","pid":42,"version":1}"#;

        write_discovery_record(&path, contents).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), contents);
        assert_eq!(
            std::fs::read_dir(&directory).unwrap().count(),
            1,
            "temporary publish files must not remain"
        );

        let directory_target = directory.join("not-a-file");
        std::fs::create_dir(&directory_target).unwrap();
        let error = write_discovery_record(&directory_target, contents).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);

        std::fs::remove_dir_all(&directory).unwrap();
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

    #[test]
    fn screenshot_size_is_bounded_before_native_capture() {
        assert_eq!(validated_screenshot_max_size(None).unwrap(), 2_048);
        assert_eq!(validated_screenshot_max_size(Some(256)).unwrap(), 256);
        assert_eq!(validated_screenshot_max_size(Some(4_096)).unwrap(), 4_096);
        assert!(validated_screenshot_max_size(Some(255)).is_err());
        assert!(validated_screenshot_max_size(Some(4_097)).is_err());
        assert!(
            (screenshot_capture_scale(2_160, 1_350, 2_048) - (2_048.0 / 2_160.0)).abs()
                < f64::EPSILON
        );
        assert!(
            (screenshot_capture_scale(2_160, 1_350, 256) - (256.0 / 2_160.0)).abs() < f64::EPSILON
        );
        assert_eq!(screenshot_capture_scale(2_160, 1_350, 4_096), 1.0);
    }

    #[test]
    fn screenshot_regions_must_fit_the_css_viewport() {
        let region = WindowCaptureRegion {
            x: 10.0,
            y: 20.0,
            width: 300.0,
            height: 200.0,
        };
        assert_eq!(
            validated_capture_region(region, 1_280.0, 720.0).unwrap(),
            region
        );
        assert!(validated_capture_region(
            WindowCaptureRegion { x: -1.0, ..region },
            1_280.0,
            720.0
        )
        .is_err());
        assert!(validated_capture_region(
            WindowCaptureRegion {
                width: 0.0,
                ..region
            },
            1_280.0,
            720.0
        )
        .is_err());
        assert!(validated_capture_region(
            WindowCaptureRegion {
                x: 1_000.0,
                ..region
            },
            1_280.0,
            720.0
        )
        .is_err());
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
const DEFAULT_SCREENSHOT_MAX_SIZE: u32 = 2_048;
const MIN_SCREENSHOT_MAX_SIZE: u32 = 256;
const MAX_SCREENSHOT_MAX_SIZE: u32 = 4_096;

fn validated_screenshot_max_size(max_size: Option<u32>) -> Result<u32, String> {
    let max_size = max_size.unwrap_or(DEFAULT_SCREENSHOT_MAX_SIZE);
    if !(MIN_SCREENSHOT_MAX_SIZE..=MAX_SCREENSHOT_MAX_SIZE).contains(&max_size) {
        return Err(format!(
            "maxSize must be an integer from {MIN_SCREENSHOT_MAX_SIZE} to {MAX_SCREENSHOT_MAX_SIZE}"
        ));
    }
    Ok(max_size)
}

fn screenshot_capture_scale(source_width: u32, source_height: u32, max_size: u32) -> f64 {
    let source_max = source_width.max(source_height).max(1);
    source_max.min(max_size) as f64 / source_max as f64
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowCaptureRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn validated_capture_region(
    region: WindowCaptureRegion,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<WindowCaptureRegion, String> {
    if ![
        region.x,
        region.y,
        region.width,
        region.height,
        viewport_width,
        viewport_height,
    ]
    .iter()
    .all(|value| value.is_finite())
    {
        return Err("capture region and viewport coordinates must be finite".to_string());
    }
    if region.x < 0.0 || region.y < 0.0 {
        return Err("capture region x and y must be non-negative".to_string());
    }
    if region.width <= 0.0 || region.height <= 0.0 {
        return Err("capture region width and height must be positive".to_string());
    }
    if viewport_width <= 0.0 || viewport_height <= 0.0 {
        return Err("WebView2 viewport dimensions must be positive".to_string());
    }
    if region.x + region.width > viewport_width || region.y + region.height > viewport_height {
        return Err(format!(
            "capture region must fit inside the {viewport_width}x{viewport_height} CSS pixel viewport"
        ));
    }
    Ok(region)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowCapture {
    data_url: String,
    width: u32,
    height: u32,
    mime: String,
    source_width: u32,
    source_height: u32,
    scale: f64,
    captured_at: u64,
    window_label: String,
    capture_method: String,
    background_safe: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    region: Option<WindowCaptureRegion>,
}

/// Webview -> Rust: capture one editor webview (menus, panels and rendered
/// content). The target defaults to the main window, but detached panel/editor
/// windows can be addressed by label as returned by `list_editor_windows`.
#[tauri::command]
pub async fn capture_editor_window(
    app: AppHandle,
    window_label: Option<String>,
    max_size: Option<u32>,
    region: Option<WindowCaptureRegion>,
) -> Result<WindowCapture, String> {
    let window_label = window_label.unwrap_or_else(|| "main".to_string());
    let max_size = validated_screenshot_max_size(max_size)?;
    capture_editor_window_impl(app, window_label, max_size, region).await
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

/// Read an exact page of one element's text, value, or options without normalizing it.
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
    if !matches!(field.as_str(), "text" | "value" | "options") {
        return Err("field must be text, value, or options".to_string());
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

/// Execute one allow-listed DOM interaction in a hidden, unfocused editor webview.
///
/// This is a fallback for UI surfaces that do not yet have a domain command.
/// It deliberately accepts no JavaScript from the caller and refuses to alter
/// a window that could be part of the user's foreground workflow.
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
    shift_key: Option<bool>,
    ctrl_key: Option<bool>,
    alt_key: Option<bool>,
    meta_key: Option<bool>,
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
    let has_modifiers = shift_key == Some(true)
        || ctrl_key == Some(true)
        || alt_key == Some(true)
        || meta_key == Some(true);
    if has_modifiers
        && !matches!(
            action.as_str(),
            "click" | "doubleClick" | "contextClick" | "keyPress" | "dragTo" | "dragBy"
        )
    {
        return Err("modifier keys are only valid for click, key, or drag actions".to_string());
    }
    let expected_snapshot_revision = expected_snapshot_revision.trim().to_string();
    if !valid_ui_snapshot_revision(&expected_snapshot_revision) {
        return Err(
            "expectedSnapshotRevision must be a snapshotRevision returned by inspect_editor_window"
                .to_string(),
        );
    }
    validate_background_ui_interaction_window(&app, &window_label)?;
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
    // Recheck immediately before injection so a window made visible while the
    // semantic snapshot was being validated cannot receive background input.
    validate_background_ui_interaction_window(&app, &window_label)?;
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
        shift_key,
        ctrl_key,
        alt_key,
        meta_key,
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

fn validate_background_ui_interaction_state(visible: bool, focused: bool) -> Result<(), String> {
    if visible || focused {
        return Err(
            "editor UI interactions require a hidden, unfocused window so background automation cannot disrupt the user"
                .to_string(),
        );
    }
    Ok(())
}

fn validate_background_ui_interaction_window(
    app: &AppHandle,
    window_label: &str,
) -> Result<(), String> {
    let window = app
        .get_webview_window(window_label)
        .ok_or_else(|| format!("editor window \"{window_label}\" was not found"))?;
    let visible = window
        .is_visible()
        .map_err(|error| format!("could not inspect editor window \"{window_label}\": {error}"))?;
    let focused = window
        .is_focused()
        .map_err(|error| format!("could not inspect editor window \"{window_label}\": {error}"))?;
    validate_background_ui_interaction_state(visible, focused)
}

#[cfg(windows)]
async fn capture_editor_window_impl(
    app: AppHandle,
    window_label: String,
    max_size: u32,
    requested_region: Option<WindowCaptureRegion>,
) -> Result<WindowCapture, String> {
    use base64::Engine as _;
    let window = app
        .get_webview_window(&window_label)
        .ok_or_else(|| format!("editor window \"{window_label}\" was not found"))?;
    let source_size = window
        .inner_size()
        .map_err(|error| format!("could not read editor window size: {error}"))?;
    let source_width = source_size.width.max(1);
    let source_height = source_size.height.max(1);
    let metrics = call_webview_devtools(
        &app,
        &window_label,
        "Page.getLayoutMetrics",
        serde_json::json!({}),
    )
    .await?;
    let viewport = metrics
        .get("cssVisualViewport")
        .or_else(|| metrics.get("visualViewport"))
        .or_else(|| metrics.get("cssLayoutViewport"))
        .or_else(|| metrics.get("layoutViewport"))
        .ok_or_else(|| "WebView2 layout metrics did not contain a viewport".to_string())?;
    let viewport_number = |name: &str| {
        viewport
            .get(name)
            .and_then(serde_json::Value::as_f64)
            .filter(|value| value.is_finite())
            .ok_or_else(|| format!("WebView2 viewport did not contain a finite {name}"))
    };
    let page_x = viewport
        .get("pageX")
        .and_then(serde_json::Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(0.0);
    let page_y = viewport
        .get("pageY")
        .and_then(serde_json::Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(0.0);
    let viewport_width = viewport_number("clientWidth")?;
    let viewport_height = viewport_number("clientHeight")?;
    if viewport_width <= 0.0 || viewport_height <= 0.0 {
        return Err("WebView2 viewport dimensions must be positive".to_string());
    }
    let region = requested_region
        .map(|candidate| validated_capture_region(candidate, viewport_width, viewport_height))
        .transpose()?;
    let clip = region.unwrap_or(WindowCaptureRegion {
        x: 0.0,
        y: 0.0,
        width: viewport_width,
        height: viewport_height,
    });
    let region_source_width = (clip.width * source_width as f64 / viewport_width)
        .ceil()
        .max(1.0) as u32;
    let region_source_height = (clip.height * source_height as f64 / viewport_height)
        .ceil()
        .max(1.0) as u32;
    // WebView2 applies the clip scale before its device scale factor. The
    // physical inner size already includes that factor, so dividing by the
    // physical longest edge produces the requested output pixel bound.
    let capture_scale =
        screenshot_capture_scale(region_source_width, region_source_height, max_size);
    let response = call_webview_devtools(
        &app,
        &window_label,
        "Page.captureScreenshot",
        serde_json::json!({
            "format": "png",
            "fromSurface": true,
            "captureBeyondViewport": false,
            "clip": {
                "x": page_x + clip.x,
                "y": page_y + clip.y,
                "width": clip.width,
                "height": clip.height,
                "scale": capture_scale,
            },
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
    if info.width.max(info.height) > max_size {
        return Err(format!(
            "WebView2 screenshot exceeded maxSize {max_size}: {}x{}",
            info.width, info.height
        ));
    }
    let output_scale =
        info.width.max(info.height) as f64 / region_source_width.max(region_source_height) as f64;
    let captured_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("system clock is before Unix epoch: {error}"))?
        .as_millis()
        .try_into()
        .map_err(|_| "screenshot timestamp exceeded u64".to_string())?;

    Ok(WindowCapture {
        data_url: format!("data:image/png;base64,{data}"),
        width: info.width,
        height: info.height,
        mime: "image/png".to_string(),
        source_width: region_source_width,
        source_height: region_source_height,
        scale: output_scale.min(1.0),
        captured_at,
        window_label,
        capture_method: "webview2-devtools".to_string(),
        background_safe: true,
        region,
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
    shift_key: Option<bool>,
    ctrl_key: Option<bool>,
    alt_key: Option<bool>,
    meta_key: Option<bool>,
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
        "shiftKey": shift_key.unwrap_or(false),
        "ctrlKey": ctrl_key.unwrap_or(false),
        "altKey": alt_key.unwrap_or(false),
        "metaKey": meta_key.unwrap_or(false),
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
    _max_size: u32,
    _region: Option<WindowCaptureRegion>,
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
    _shift_key: Option<bool>,
    _ctrl_key: Option<bool>,
    _alt_key: Option<bool>,
    _meta_key: Option<bool>,
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
  const maxGuardedRevisions = 8;
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
    if (tag === 'article') return 'article';
    if (tag === 'aside') return 'complementary';
    if (tag === 'code') return 'code';
    if (tag === 'details' || tag === 'fieldset' || tag === 'dl') return 'group';
    if (tag === 'dialog') return 'dialog';
    if (tag === 'dt') return 'term';
    if (tag === 'dd') return 'definition';
    if (tag === 'figure') return 'figure';
    if (tag === 'hr') return 'separator';
    if (tag === 'li') return 'listitem';
    if (['ol', 'ul', 'menu'].includes(tag)) return 'list';
    if (tag === 'p') return 'paragraph';
    if (tag === 'table') return 'table';
    if (['thead', 'tbody', 'tfoot'].includes(tag)) return 'rowgroup';
    if (tag === 'tr') return 'row';
    if (tag === 'td') return 'cell';
    if (tag === 'th') {
      return element.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
    }
    if (
      tag === 'section'
      && (
        normalize(element.getAttribute('aria-label'))
        || normalize(element.getAttribute('aria-labelledby'))
      )
    ) return 'region';
    if (tag === 'button') return 'button';
    if (tag === 'summary') return 'button';
    if (tag === 'a' && element.hasAttribute('href')) return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return element.multiple ? 'listbox' : 'combobox';
    if (tag === 'option') return 'option';
    if (tag === 'output') return 'status';
    if (tag === 'meter') return 'meter';
    if (tag === 'main') return 'main';
    if (tag === 'nav') return 'navigation';
    if (tag === 'form') return 'form';
    if (tag === 'progress') return 'progressbar';
    if (tag !== 'input') return '';
    const type = String(element.type || 'text').toLowerCase();
    if (type === 'hidden') return '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (element.list) return 'combobox';
    if (type === 'search') return 'searchbox';
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    return 'textbox';
  };
  const semanticallyHidden = (element) => Boolean(
    element.closest('[aria-hidden="true"], [inert]'),
  );
  const visible = (element) => {
    if (semanticallyHidden(element)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden'
      || Number(style.opacity) === 0 || element.hidden) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const nativeDialogIsModal = (element) => {
    if (element.localName !== 'dialog' || !element.hasAttribute('open')) return false;
    try {
      return element.matches(':modal');
    } catch {
      return false;
    }
  };
  const isActiveModalDialog = (element) => (
    nativeDialogIsModal(element)
      || (
        normalize(element.getAttribute('role'), 80) === 'dialog'
        && element.getAttribute('aria-modal') === 'true'
      )
  );
  const effectivelyDisabled = (element) => Boolean(
    element.disabled === true
      || element.matches(':disabled')
      || element.closest('[aria-disabled="true"]'),
  );
  const semanticText = (root, excludedElement = null) => {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (
        (!parent || !semanticallyHidden(parent))
        && !(excludedElement instanceof Element && excludedElement.contains(node))
      ) {
        parts.push(node.textContent || '');
      }
      node = walker.nextNode();
    }
    return normalize(parts.join(' '));
  };
  const referencedText = (idRefs) => normalize(idRefs).split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .map((node) => semanticText(node))
    .filter(Boolean)
    .join(' ');
  const labelledText = (element) => {
    const labelledBy = normalize(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const text = referencedText(labelledBy);
      if (text) return normalize(text);
    }
    if (element.labels?.length) {
      const text = Array.from(element.labels)
        .map((label) => semanticText(label))
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
    const content = semanticText(element);
    return /[\p{L}\p{N}]/u.test(content) ? content : '';
  };
  const containingLabelText = (element) => {
    const label = element.closest('label');
    if (!label) return '';
    return semanticText(label, element);
  };
  const accessibleName = (element, role) => normalize(
    element.getAttribute('aria-label')
      || labelledText(element)
      || element.getAttribute('alt')
      || meaningfulContentName(element, role)
      || (
        ['status', 'meter', 'progressbar'].includes(role)
          ? containingLabelText(element)
          : ''
      )
      || element.getAttribute('placeholder')
      || element.getAttribute('title')
      || (nameFromContent(role) ? semanticText(element) : ''),
  );
  const semanticScopeFor = (element) => {
    let current = element;
    while (current instanceof Element) {
      const explicit = normalize(current.getAttribute('data-agent-scope'), 160);
      const role = normalize(current.getAttribute('role') || implicitRole(current), 80);
      const scopedContainer = Boolean(explicit)
        || role === 'tabpanel'
        || role === 'dialog'
        || role === 'menu'
        || current.classList.contains('detached-panel-workspace')
        || current.classList.contains('editor-window');
      if (scopedContainer) {
        const label = explicit || accessibleName(current, role);
        if (label) return label;
      }
      current = current.parentElement;
    }
    return '';
  };
  const qualifiedNameFor = (scope, name) => {
    if (!name || !scope || name === scope) return name;
    const scopeBase = normalize(scope.replace(/\s+(?:panel|window|dialog|menu)$/iu, ''), 160);
    if (!scopeBase) return name;
    const lowerName = name.toLocaleLowerCase();
    const lowerScope = scopeBase.toLocaleLowerCase();
    return lowerName === lowerScope || lowerName.startsWith(`${lowerScope} `)
      ? name
      : normalize(`${scopeBase} / ${name}`, 400);
  };
  const ownText = (element, role) => {
    if (nameFromContent(role) || element.children.length === 0) {
      return semanticText(element);
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
    if (element instanceof HTMLOutputElement || element instanceof HTMLMeterElement) {
      return normalize(element.value);
    }
    if (element instanceof HTMLProgressElement) {
      return element.hasAttribute('value') ? normalize(element.value) : '';
    }
    if (element.isContentEditable) return normalize(element.textContent);
    return '';
  };
  const optionPayloadFor = (element) => {
    let kind;
    let multiple = false;
    let rawOptions;
    if (element instanceof HTMLSelectElement) {
      kind = 'select';
      multiple = element.multiple;
      rawOptions = Array.from(element.options);
    } else if (element instanceof HTMLInputElement && element.list) {
      kind = 'datalist';
      rawOptions = Array.from(element.list.options);
    } else {
      return null;
    }
    return {
      version: 1,
      kind,
      multiple,
      options: rawOptions.map((option, index) => {
        const group = option.parentElement instanceof HTMLOptGroupElement
          ? option.parentElement
          : null;
        return {
          index,
          value: String(option.value),
          label: String(option.label || option.textContent || option.value),
          disabled: Boolean(option.disabled || group?.disabled),
          selected: kind === 'select' ? option.selected : false,
          group: group?.label || null,
        };
      }),
    };
  };
  const compactContentRevision = (prefix, content) => {
    let hashA = 0x811c9dc5;
    let hashB = 0x9e3779b9;
    for (let index = 0; index < content.length; index += 1) {
      const code = content.charCodeAt(index);
      hashA = Math.imul(hashA ^ code, 0x01000193);
      hashB = Math.imul(hashB ^ (code + index), 0x85ebca6b);
    }
    return `${prefix}-v1-${content.length}-${
      (hashA >>> 0).toString(16).padStart(8, '0')
    }${(hashB >>> 0).toString(16).padStart(8, '0')}`;
  };
  const controlFor = (element) => {
    if (element instanceof HTMLInputElement) {
      const control = {
        kind: 'input',
        inputType: String(element.type || 'text').toLowerCase(),
        required: element.required,
      };
      for (const attribute of ['min', 'max', 'step', 'pattern', 'accept']) {
        if (element.hasAttribute(attribute)) {
          control[attribute] = String(element.getAttribute(attribute));
        }
      }
      if (element.hasAttribute('minlength')) control.minLength = element.minLength;
      if (element.hasAttribute('maxlength')) control.maxLength = element.maxLength;
      const optionPayload = optionPayloadFor(element);
      if (optionPayload) {
        const optionContent = JSON.stringify(optionPayload);
        control.optionCount = optionPayload.options.length;
        control.optionsRevision = compactContentRevision('options', optionContent);
      }
      return control;
    }
    if (element instanceof HTMLTextAreaElement) {
      const control = {
        kind: 'textarea',
        required: element.required,
      };
      if (element.hasAttribute('minlength')) control.minLength = element.minLength;
      if (element.hasAttribute('maxlength')) control.maxLength = element.maxLength;
      return control;
    }
    if (element instanceof HTMLSelectElement) {
      const optionPayload = optionPayloadFor(element);
      const optionContent = JSON.stringify(optionPayload);
      return {
        kind: 'select',
        required: element.required,
        multiple: element.multiple,
        size: element.size,
        optionCount: optionPayload.options.length,
        optionsRevision: compactContentRevision('options', optionContent),
      };
    }
    if (element instanceof HTMLProgressElement) {
      return {
        kind: 'progress',
        min: '0',
        max: String(element.max),
        indeterminate: !element.hasAttribute('value'),
      };
    }
    if (element instanceof HTMLMeterElement) {
      return {
        kind: 'meter',
        min: String(element.min),
        max: String(element.max),
        low: String(element.low),
        high: String(element.high),
        optimum: String(element.optimum),
      };
    }
    if (element instanceof HTMLOutputElement) {
      return { kind: 'output' };
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      return { kind: 'contenteditable' };
    }
    return null;
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
    if (effectivelyDisabled(element)) return actions;
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
    const explicitDragBy = element.getAttribute('data-agent-drag-by') === 'true';
    if (
      (pointerGesture || mouseGesture)
      && (typeof props.onClick !== 'function' || explicitDragBy)
    ) {
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
  const ariaStateKeys = [
    'checked',
    'selected',
    'expanded',
    'pressed',
    'current',
    'level',
    'haspopup',
    'modal',
    'valuemin',
    'valuemax',
    'valuenow',
    'valuetext',
    'orientation',
    'multiselectable',
    'required',
    'invalid',
    'busy',
    'autocomplete',
    'live',
    'atomic',
    'relevant',
    'sort',
    'keyshortcuts',
    'roledescription',
    'setsize',
    'posinset',
    'colcount',
    'rowcount',
    'colindex',
    'rowindex',
    'controls',
    'activedescendant',
    'describedby',
    'details',
    'errormessage',
  ];
  const stateFor = (element, modalBlocked = false) => {
    const state = {
      disabled: effectivelyDisabled(element),
      readOnly: Boolean(element.readOnly || element.getAttribute('aria-readonly') === 'true'),
      focused: document.activeElement === element,
    };
    if (modalBlocked) state.modalBlocked = true;
    for (const key of ariaStateKeys) {
      const value = element.getAttribute(`aria-${key}`);
      if (value !== null) state[key] = value;
    }
    if (state.expanded === undefined) {
      if (element instanceof HTMLDetailsElement) {
        state.expanded = element.open;
      } else if (
        element.localName === 'summary'
        && element.parentElement instanceof HTMLDetailsElement
      ) {
        state.expanded = element.parentElement.open;
      }
    }
    if (element.localName === 'dialog') {
      state.open = element.hasAttribute('open');
      const nativeModal = nativeDialogIsModal(element);
      if (nativeModal || state.modal === undefined) state.modal = nativeModal;
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
    if (element instanceof HTMLProgressElement) {
      if (state.valuemin === undefined) state.valuemin = '0';
      if (state.valuemax === undefined) state.valuemax = String(element.max);
      if (state.valuenow === undefined && element.hasAttribute('value')) {
        state.valuenow = String(element.value);
      }
    }
    if (element instanceof HTMLMeterElement) {
      if (state.valuemin === undefined) state.valuemin = String(element.min);
      if (state.valuemax === undefined) state.valuemax = String(element.max);
      if (state.valuenow === undefined) state.valuenow = String(element.value);
    }
    return state;
  };
  const descriptionFor = (element, name) => normalize(
    referencedText(element.getAttribute('aria-describedby'))
      || element.getAttribute('aria-description')
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
  const visibleModalDialogs = Array.from(
    document.querySelectorAll('dialog, [role="dialog"][aria-modal="true"]'),
  ).filter((candidate) => (
    (candidate instanceof HTMLElement || candidate instanceof SVGElement)
    && visible(candidate)
    && isActiveModalDialog(candidate)
  ));
  const modalLayerFor = (candidate) => {
    let layer = 0;
    let current = candidate;
    while (current instanceof Element) {
      const zIndex = Number.parseInt(getComputedStyle(current).zIndex, 10);
      if (Number.isFinite(zIndex)) layer = Math.max(layer, zIndex);
      current = current.parentElement;
    }
    return layer;
  };
  let activeModal = visibleModalDialogs.find((candidate) => (
    candidate.contains(document.activeElement)
  )) || null;
  let activeModalLayer = activeModal
    ? Number.POSITIVE_INFINITY
    : Number.NEGATIVE_INFINITY;
  for (const candidate of visibleModalDialogs) {
    const layer = modalLayerFor(candidate);
    if (layer >= activeModalLayer) {
      activeModal = candidate;
      activeModalLayer = layer;
    }
  }
  const candidates = [];
  for (const element of all) {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)
      || !visible(element)) continue;
    const role = normalize(element.getAttribute('role') || implicitRole(element), 80);
    const directName = accessibleName(element, role);
    const text = ownText(element, role);
    const tag = element.localName;
    const modalBlocked = Boolean(activeModal && !activeModal.contains(element));
    const actions = modalBlocked ? [] : actionList(element, role);
    const name = directName || (actions.includes('scroll') ? scrollContextName(element) : '');
    const structural = /^h[1-6]$/.test(tag)
      || ['p', 'label', 'summary', 'legend', 'caption'].includes(tag);
    if (!role && !name && !text && !structural && actions.length === 0) continue;
    candidates.push({ element, role, name, text, actions, modalBlocked });
  }
  const ids = new Map(candidates.map((entry, index) => [entry.element, `ui-${index + 1}`]));
  const semanticElementFor = (entry) => {
    const { element, role, name, text, actions, modalBlocked } = entry;
    const scope = semanticScopeFor(element);
    let parent = element.parentElement;
    while (parent && !ids.has(parent)) parent = parent.parentElement;
    return {
      id: ids.get(element),
      parentId: parent ? ids.get(parent) || null : null,
      selector: selectorFor(element),
      tag: element.localName,
      role: role || null,
      name: name || null,
      scope: scope || null,
      qualifiedName: qualifiedNameFor(scope, name) || null,
      text: text && text !== name ? text : null,
      value: valueFor(element) || null,
      control: controlFor(element),
      description: descriptionFor(element, name),
      state: stateFor(element, modalBlocked),
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
    version: 16,
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
  const snapshotRevision = `ui-v15-${candidates.length}-${
    revisionHash.toString(16).padStart(16, '0')
  }`;
  const guardedElements = new Map(semanticElements.map((semanticElement, index) => [
    semanticElement.selector,
    {
      element: candidates[index].element,
      actions: [...semanticElement.actions],
    },
  ]));
  revisionGuard.revisions.delete(snapshotRevision);
  revisionGuard.revisions.set(snapshotRevision, {
    epoch: revisionGuard.epoch,
    elements: guardedElements,
  });
  while (revisionGuard.revisions.size > maxGuardedRevisions) {
    const oldestRevision = revisionGuard.revisions.keys().next().value;
    revisionGuard.revisions.delete(oldestRevision);
  }
  const elements = semanticElements.slice(offset, offset + limit);
  return {
    version: 16,
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
  const guardedRevision = revisionGuard?.revisions?.get(expectedSnapshotRevision);
  if (!revisionGuard || guardedRevision?.epoch !== revisionGuard.epoch) {
    return {
      ok: false,
      error: 'Editor window semantic content changed; get a fresh UI snapshot before reading exact content',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  const guardedElement = guardedRevision.elements?.get(selector);
  if (!guardedElement) {
    return {
      ok: false,
      error: `Selector ${selector} is not exposed by the expected semantic UI snapshot`,
      selectorNotExposed: true,
      expectedSnapshotRevision,
    };
  }
  let element;
  try {
    element = document.querySelector(selector);
  } catch (error) {
    return { ok: false, error: `Invalid selector: ${String(error)}` };
  }
  if (!element) return { ok: false, error: `No element matches ${selector}` };
  if (element !== guardedElement.element) {
    return {
      ok: false,
      error: 'Editor window semantic selector changed; get a fresh UI snapshot before reading exact content',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  let content;
  if (field === 'options') {
    let kind;
    let multiple = false;
    let rawOptions;
    if (element instanceof HTMLSelectElement) {
      kind = 'select';
      multiple = element.multiple;
      rawOptions = Array.from(element.options);
    } else if (element instanceof HTMLInputElement && element.list) {
      kind = 'datalist';
      rawOptions = Array.from(element.list.options);
    } else {
      return {
        ok: false,
        error: `Element ${selector} has no readable select or datalist options`,
      };
    }
    content = JSON.stringify({
      version: 1,
      kind,
      multiple,
      options: rawOptions.map((option, index) => {
        const group = option.parentElement instanceof HTMLOptGroupElement
          ? option.parentElement
          : null;
        return {
          index,
          value: String(option.value),
          label: String(option.label || option.textContent || option.value),
          disabled: Boolean(option.disabled || group?.disabled),
          selected: kind === 'select' ? option.selected : false,
          group: group?.label || null,
        };
      }),
    });
  } else if (field === 'value') {
    if (element instanceof HTMLInputElement) {
      if (String(element.type).toLowerCase() === 'password') {
        return { ok: false, error: 'Password values cannot be read' };
      }
      content = String(element.value);
    } else if (element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLOutputElement
      || element instanceof HTMLMeterElement) {
      content = String(element.value);
    } else if (element instanceof HTMLProgressElement) {
      content = element.hasAttribute('value') ? String(element.value) : '';
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
    shiftKey: requestedShiftKey,
    ctrlKey: requestedCtrlKey,
    altKey: requestedAltKey,
    metaKey: requestedMetaKey,
    expectedSnapshotRevision,
  } = payload;
  const modifiers = {
    shiftKey: requestedShiftKey === true,
    ctrlKey: requestedCtrlKey === true,
    altKey: requestedAltKey === true,
    metaKey: requestedMetaKey === true,
  };
  const revisionGuard = window[Symbol.for('mengine.agent.uiRevisionGuard')];
  const guardedRevision = revisionGuard?.revisions?.get(expectedSnapshotRevision);
  if (!revisionGuard || guardedRevision?.epoch !== revisionGuard.epoch) {
    return {
      ok: false,
      error: 'Editor window semantic content changed; get a fresh UI snapshot before interacting',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  const guardedElement = guardedRevision.elements?.get(selector);
  if (!guardedElement) {
    return {
      ok: false,
      error: `Selector ${selector} is not exposed by the expected semantic UI snapshot`,
      selectorNotExposed: true,
      expectedSnapshotRevision,
    };
  }
  const guardedTarget = action === 'dragTo'
    ? guardedRevision.elements?.get(targetSelector)
    : null;
  if (action === 'dragTo' && !guardedTarget) {
    return {
      ok: false,
      error: `Target selector ${targetSelector} is not exposed by the expected semantic UI snapshot`,
      selectorNotExposed: true,
      targetSelectorNotExposed: true,
      expectedSnapshotRevision,
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
  if (element !== guardedElement.element) {
    return {
      ok: false,
      error: 'Editor window semantic selector changed; get a fresh UI snapshot before interacting',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
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
    if (targetElement !== guardedTarget.element) {
      return {
        ok: false,
        error: 'Editor window semantic target selector changed; get a fresh UI snapshot before interacting',
        staleSnapshot: true,
        expectedSnapshotRevision,
        actualSnapshotRevision: null,
        restartOffset: 0,
      };
    }
  }
  const normalizeName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const semanticallyHidden = (target) => Boolean(
    target instanceof Element && target.closest('[aria-hidden="true"], [inert]'),
  );
  const semanticText = (root) => {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (!parent || !semanticallyHidden(parent)) {
        parts.push(node.textContent || '');
      }
      node = walker.nextNode();
    }
    return normalizeName(parts.join(' '));
  };
  const labelledText = (target) => {
    const ids = String(target.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const referenced = normalizeName(
      ids.map((id) => {
        const labelledBy = document.getElementById(id);
        return labelledBy ? semanticText(labelledBy) : '';
      }).join(' '),
    );
    if (referenced) return referenced;
    return normalizeName(
      Array.from(target.labels || [])
        .map((label) => semanticText(label))
        .join(' '),
    );
  };
  const roleForName = (target) => {
    const explicit = normalizeName(target.getAttribute('role'));
    if (explicit) return explicit;
    if (/^h[1-6]$/.test(target.localName)) return 'heading';
    if (target.localName === 'button') return 'button';
    if (target.localName === 'summary') return 'button';
    if (target.localName === 'a' && target.hasAttribute('href')) return 'link';
    if (target.localName === 'textarea') return 'textbox';
    if (target.localName === 'select') return target.multiple ? 'listbox' : 'combobox';
    if (target.localName === 'option') return 'option';
    if (target.localName === 'output') return 'status';
    if (target.localName === 'meter') return 'meter';
    if (target.localName === 'input') {
      const type = String(target.type || 'text').toLowerCase();
      if (type === 'hidden') return '';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'number') return 'spinbutton';
      if (target instanceof HTMLInputElement && target.list) return 'combobox';
      if (type === 'search') return 'searchbox';
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      return 'textbox';
    }
    return '';
  };
  const directName = (target) => {
    const role = roleForName(target);
    const content = ['button', 'link', 'heading', 'menuitem', 'option', 'tab'].includes(role)
      ? semanticText(target)
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
    return semanticText(target);
  };
  const rendered = (target) => {
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return false;
    if (semanticallyHidden(target)) return false;
    const style = getComputedStyle(target);
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || Number(style.opacity) === 0
      || target.hidden
    ) return false;
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const effectivelyDisabled = (target) => Boolean(
    target.disabled === true
      || target.matches(':disabled')
      || target.closest('[aria-disabled="true"]'),
  );
  const nativeDialogIsModal = (target) => {
    if (target.localName !== 'dialog' || !target.hasAttribute('open')) return false;
    try {
      return target.matches(':modal');
    } catch {
      return false;
    }
  };
  const isActiveModalDialog = (target) => (
    nativeDialogIsModal(target)
      || (
        normalizeName(target.getAttribute('role')) === 'dialog'
        && target.getAttribute('aria-modal') === 'true'
      )
  );
  const visibleModalDialogs = Array.from(
    document.querySelectorAll('dialog, [role="dialog"][aria-modal="true"]'),
  ).filter((candidate) => rendered(candidate) && isActiveModalDialog(candidate));
  const modalLayerFor = (candidate) => {
    let layer = 0;
    let current = candidate;
    while (current instanceof Element) {
      const zIndex = Number.parseInt(getComputedStyle(current).zIndex, 10);
      if (Number.isFinite(zIndex)) layer = Math.max(layer, zIndex);
      current = current.parentElement;
    }
    return layer;
  };
  let activeModal = visibleModalDialogs.find((candidate) => (
    candidate.contains(document.activeElement)
  )) || null;
  let activeModalLayer = activeModal
    ? Number.POSITIVE_INFINITY
    : Number.NEGATIVE_INFINITY;
  for (const candidate of visibleModalDialogs) {
    const layer = modalLayerFor(candidate);
    if (layer >= activeModalLayer) {
      activeModal = candidate;
      activeModalLayer = layer;
    }
  }
  if (
    activeModal
    && (
      !activeModal.contains(element)
      || (targetElement && !activeModal.contains(targetElement))
    )
  ) {
    const blockedTarget = !activeModal.contains(element) ? 'Element' : 'Target element';
    const blockedSelector = !activeModal.contains(element) ? selector : targetSelector;
    const activeModalName = interactionName(activeModal) || 'Modal dialog';
    return {
      ok: false,
      error: `${blockedTarget} ${blockedSelector} is blocked by active modal dialog "${activeModalName}"`,
      modalBlocked: true,
      activeModalName,
      agentAlternative: 'Interact with or dismiss the active modal dialog first',
    };
  }
  if (!rendered(element)) {
    return {
      ok: false,
      error: `Element ${selector} is not rendered in the semantic accessibility tree`,
    };
  }
  if (targetElement && !rendered(targetElement)) {
    return {
      ok: false,
      error: `Target element ${targetSelector} is not rendered in the semantic accessibility tree`,
    };
  }
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
  if (effectivelyDisabled(element)) {
    return { ok: false, error: `Element ${selector} is disabled` };
  }
  if (targetElement && effectivelyDisabled(targetElement)) {
    return { ok: false, error: `Target element ${targetSelector} is disabled` };
  }
  const allowedActions = Array.isArray(guardedElement.actions)
    ? guardedElement.actions
    : [];
  if (!allowedActions.includes(action)) {
    return {
      ok: false,
      error: `Element ${selector} does not expose the ${action} semantic action`,
      actionNotExposed: true,
      requiredAction: action,
      allowedActions,
      expectedSnapshotRevision,
    };
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
      ...modifiers,
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
      ...modifiers,
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
  const nativeValidityIssues = (target) => {
    if (
      !(target instanceof HTMLInputElement)
      && !(target instanceof HTMLTextAreaElement)
      && !(target instanceof HTMLSelectElement)
    ) return [];
    const validity = target.validity;
    const issues = [
      'badInput',
      'customError',
      'patternMismatch',
      'rangeOverflow',
      'rangeUnderflow',
      'stepMismatch',
      'tooLong',
      'tooShort',
      'typeMismatch',
      'valueMissing',
    ].filter((key) => validity[key]);
    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && target.hasAttribute('minlength')
      && target.minLength >= 0
      && target.value.length > 0
      && target.value.length < target.minLength
      && !issues.includes('tooShort')
    ) {
      issues.push('tooShort');
    }
    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && target.hasAttribute('maxlength')
      && target.maxLength >= 0
      && target.value.length > target.maxLength
      && !issues.includes('tooLong')
    ) {
      issues.push('tooLong');
    }
    return issues;
  };
  const constraintFailure = (issues) => ({
    ok: false,
    error: `Element ${selector} violates native constraints (${issues.join(', ')})`,
    constraintViolation: true,
    validityIssues: issues,
  });
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
      ...modifiers,
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
    } else if (
      !Object.values(modifiers).some(Boolean)
      && typeof element.click === 'function'
    ) element.click();
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
      ...modifiers,
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
    const explicitDragBy = element.getAttribute('data-agent-drag-by') === 'true';
    if (
      (!pointerGesture && !mouseGesture)
      || (typeof reactProps.onClick === 'function' && !explicitDragBy)
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
      const checked = value.toLowerCase() === 'true';
      const checkedSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'checked',
      )?.set;
      if (!checkedSetter) {
        return { ok: false, error: `Element ${selector} has no checked setter` };
      }
      const previousChecked = element.checked;
      const previousIndeterminate = element.indeterminate;
      checkedSetter.call(element, checked);
      element.indeterminate = false;
      const validityIssues = nativeValidityIssues(element);
      checkedSetter.call(element, previousChecked);
      element.indeterminate = previousIndeterminate;
      if (validityIssues.length > 0) return constraintFailure(validityIssues);
      if (!setCheckableInput(checked)) {
        return { ok: false, error: `Element ${selector} has no checked setter` };
      }
    } else {
      let prototype;
      if (element instanceof HTMLInputElement) prototype = HTMLInputElement.prototype;
      else if (element instanceof HTMLTextAreaElement) prototype = HTMLTextAreaElement.prototype;
      else if (element instanceof HTMLSelectElement) prototype = HTMLSelectElement.prototype;
      if (prototype) {
        if (element instanceof HTMLSelectElement) {
          const option = Array.from(element.options).find(
            (candidate) => candidate.value === value,
          );
          const disabledGroup = option?.parentElement instanceof HTMLOptGroupElement
            && option.parentElement.disabled;
          if (!option || option.disabled || disabledGroup) {
            const valueLabel = value.length > 160 ? `${value.slice(0, 157)}...` : value;
            return {
              ok: false,
              error: `Element ${selector} does not offer enabled option "${valueLabel}"`,
            };
          }
        }
        if (
          element instanceof HTMLInputElement
          && ['number', 'range'].includes(String(element.type).toLowerCase())
          && (
            !value.trim()
              ? element.type === 'range'
              : !Number.isFinite(Number(value))
          )
        ) {
          return {
            ok: false,
            error: `Element ${selector} requires a finite numeric value`,
          };
        }
        if (
          element instanceof HTMLInputElement
          && String(element.type).toLowerCase() === 'color'
          && !/^#[0-9a-f]{6}$/i.test(value)
        ) {
          return {
            ok: false,
            error: `Element ${selector} requires a six-digit hexadecimal color`,
          };
        }
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!setter) return { ok: false, error: `Element ${selector} has no value setter` };
        const valueToApply = element instanceof HTMLInputElement
          && String(element.type).toLowerCase() === 'color'
          ? value.toLowerCase()
          : value;
        const previousValue = String(element.value);
        setter.call(element, valueToApply);
        if (String(element.value) !== valueToApply) {
          setter.call(element, previousValue);
          return {
            ok: false,
            error: `Element ${selector} cannot represent the requested value`,
          };
        }
        const validityIssues = nativeValidityIssues(element);
        if (validityIssues.length > 0) {
          setter.call(element, previousValue);
          return constraintFailure(validityIssues);
        }
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
      ...modifiers,
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
        'button, input, select, textarea, a[href], area[href], summary, '
          + '[contenteditable], [tabindex]',
      )).filter((candidate) => (
        candidate instanceof HTMLElement
        && candidate.tabIndex >= 0
        && rendered(candidate)
        && !effectivelyDisabled(candidate)
        && (!activeModal || activeModal.contains(candidate))
      )).map((candidate, domIndex) => ({
        candidate,
        domIndex,
        tabIndex: candidate.tabIndex,
      })).sort((left, right) => {
        const leftPositive = left.tabIndex > 0;
        const rightPositive = right.tabIndex > 0;
        if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
        if (leftPositive && left.tabIndex !== right.tabIndex) {
          return left.tabIndex - right.tabIndex;
        }
        return left.domIndex - right.domIndex;
      }).map((entry) => entry.candidate);
      const index = focusable.indexOf(element);
      const nextIndex = index < 0
        ? (modifiers.shiftKey ? focusable.length - 1 : 0)
        : modifiers.shiftKey
          ? (index - 1 + focusable.length) % focusable.length
          : (index + 1) % focusable.length;
      const next = focusable[nextIndex];
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
    modifiers,
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
