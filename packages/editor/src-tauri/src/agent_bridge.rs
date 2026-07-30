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
        return Some(directory.join(if crate::starts_in_background() {
            "agent-bridge-background.json"
        } else {
            "agent-bridge.json"
        }));
    }
    if crate::starts_in_background() {
        return crate::default_editor_config_dir()
            .map(|directory| directory.join("agent-bridge-background.json"));
    }
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("agent-bridge.json"))
}

/// Write `{ port, token, pid }` so adapters can discover and authenticate.
/// Location: `$MENGINE_AGENT_BRIDGE_FILE` if set, then
/// `$MENGINE_EDITOR_CONFIG_DIR`, else the stable native app config directory.
/// Background records use `agent-bridge-background.json` so they never replace
/// the foreground `agent-bridge.json`.
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
        "runtimeIdentifier": app.config().identifier,
        "background": crate::starts_in_background(),
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
    fn semantic_ui_keys_accept_single_printable_characters_only() {
        for valid in [
            "Enter",
            "ArrowLeft",
            "F1",
            "F2",
            "F12",
            "F24",
            "A",
            "7",
            "文",
            "é",
        ] {
            assert!(valid_editor_ui_key(valid), "{valid}");
        }
        for invalid in ["", "F0", "F02", "F25", "f2", "AB", "👩‍💻", " ", "\n", "\0"] {
            assert!(!valid_editor_ui_key(invalid), "{invalid:?}");
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

    #[test]
    fn element_capture_regions_clip_to_the_visible_viewport() {
        let inside = WindowCaptureRegion {
            x: 10.0,
            y: 20.0,
            width: 300.0,
            height: 200.0,
        };
        assert_eq!(
            clipped_element_capture_region(inside, inside, 1_280.0, 720.0).unwrap(),
            (inside, false)
        );
        let partly_visible = WindowCaptureRegion {
            x: 10.0,
            y: 80.0,
            width: 300.0,
            height: 140.0,
        };
        assert_eq!(
            clipped_element_capture_region(inside, partly_visible, 1_280.0, 720.0).unwrap(),
            (partly_visible, true)
        );
        let partly_outside = WindowCaptureRegion {
            x: -20.0,
            y: 650.0,
            width: 100.0,
            height: 100.0,
        };
        assert_eq!(
            clipped_element_capture_region(partly_outside, partly_outside, 1_280.0, 720.0,)
                .unwrap(),
            (
                WindowCaptureRegion {
                    x: 0.0,
                    y: 650.0,
                    width: 80.0,
                    height: 70.0,
                },
                true,
            )
        );
        assert!(clipped_element_capture_region(
            WindowCaptureRegion {
                x: 1_300.0,
                ..inside
            },
            WindowCaptureRegion {
                x: 1_300.0,
                ..inside
            },
            1_280.0,
            720.0,
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

#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorUiDragPathPoint {
    delta_x: f64,
    delta_y: f64,
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

fn clipped_element_capture_region(
    element_rect: WindowCaptureRegion,
    visible_rect: WindowCaptureRegion,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<(WindowCaptureRegion, bool), String> {
    if ![
        element_rect.x,
        element_rect.y,
        element_rect.width,
        element_rect.height,
        visible_rect.x,
        visible_rect.y,
        visible_rect.width,
        visible_rect.height,
        viewport_width,
        viewport_height,
    ]
    .iter()
    .all(|value| value.is_finite())
    {
        return Err("element bounds and viewport coordinates must be finite".to_string());
    }
    if element_rect.width <= 0.0 || element_rect.height <= 0.0 {
        return Err("semantic element must have positive rendered bounds".to_string());
    }
    if viewport_width <= 0.0 || viewport_height <= 0.0 {
        return Err("WebView2 viewport dimensions must be positive".to_string());
    }
    let left = visible_rect.x.max(0.0);
    let top = visible_rect.y.max(0.0);
    let right = (visible_rect.x + visible_rect.width).min(viewport_width);
    let bottom = (visible_rect.y + visible_rect.height).min(viewport_height);
    if right <= left || bottom <= top {
        return Err(
            "semantic element is outside the current WebView2 viewport or overflow clip"
                .to_string(),
        );
    }
    let region = WindowCaptureRegion {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    };
    let clipped = region != element_rect;
    Ok((region, clipped))
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedWindowElementBounds {
    element_rect: WindowCaptureRegion,
    visible_rect: WindowCaptureRegion,
    viewport_width: f64,
    viewport_height: f64,
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

/// Capture the currently visible portion of one semantic element. The selector
/// is resolved only through the guarded snapshot that exposed it, then the
/// snapshot is checked again after capture so a caller never receives evidence
/// silently associated with stale UI content.
#[tauri::command]
pub async fn capture_editor_window_element(
    app: AppHandle,
    window_label: Option<String>,
    selector: String,
    expected_snapshot_revision: String,
    max_size: Option<u32>,
) -> Result<serde_json::Value, String> {
    let window_label = window_label.unwrap_or_else(|| "main".to_string());
    let selector = selector.trim().to_string();
    if selector.is_empty() || selector.len() > 1_000 {
        return Err("selector must contain 1 to 1000 characters".to_string());
    }
    let expected_snapshot_revision = expected_snapshot_revision.trim().to_string();
    if !valid_ui_snapshot_revision(&expected_snapshot_revision) {
        return Err(
            "expectedSnapshotRevision must be a snapshotRevision returned by inspect_editor_window"
                .to_string(),
        );
    }
    let max_size = validated_screenshot_max_size(max_size)?;
    let current_snapshot =
        inspect_editor_window_impl(app.clone(), window_label.clone(), 50, 0).await?;
    let actual_snapshot_revision = current_snapshot
        .get("snapshotRevision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "editor UI snapshot did not contain a revision".to_string())?;
    if actual_snapshot_revision != expected_snapshot_revision {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "Editor window semantic content changed; get a fresh UI snapshot before capturing the element",
            "staleSnapshot": true,
            "expectedSnapshotRevision": expected_snapshot_revision,
            "actualSnapshotRevision": actual_snapshot_revision,
            "restartOffset": 0,
        }));
    }
    let resolved = resolve_editor_window_element_bounds_impl(
        app.clone(),
        window_label.clone(),
        selector.clone(),
        expected_snapshot_revision.clone(),
    )
    .await?;
    if resolved.get("ok").and_then(serde_json::Value::as_bool) == Some(false) {
        return Ok(resolved);
    }
    let bounds: ResolvedWindowElementBounds =
        serde_json::from_value(resolved).map_err(|error| {
            format!("WebView2 semantic element bounds had an invalid shape: {error}")
        })?;
    let (region, clipped) = match clipped_element_capture_region(
        bounds.element_rect,
        bounds.visible_rect,
        bounds.viewport_width,
        bounds.viewport_height,
    ) {
        Ok(value) => value,
        Err(error) => {
            return Ok(serde_json::json!({
                "ok": false,
                "error": error,
                "notVisible": true,
                "selector": selector,
                "expectedSnapshotRevision": expected_snapshot_revision,
            }));
        }
    };
    let capture =
        capture_editor_window_impl(app.clone(), window_label.clone(), max_size, Some(region))
            .await?;
    let post_snapshot = inspect_editor_window_impl(app, window_label.clone(), 50, 0).await?;
    let post_snapshot_revision = post_snapshot
        .get("snapshotRevision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "editor UI snapshot did not contain a post-capture revision".to_string())?;
    if post_snapshot_revision != expected_snapshot_revision {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "Editor window semantic content changed during element capture; discard the image and retry from a fresh UI snapshot",
            "staleSnapshot": true,
            "expectedSnapshotRevision": expected_snapshot_revision,
            "actualSnapshotRevision": post_snapshot_revision,
            "restartOffset": 0,
        }));
    }
    let mut result = serde_json::to_value(capture)
        .map_err(|error| format!("could not encode capture: {error}"))?;
    let object = result
        .as_object_mut()
        .ok_or_else(|| "encoded element capture was not an object".to_string())?;
    object.insert("ok".to_string(), serde_json::Value::Bool(true));
    object.insert("selector".to_string(), serde_json::Value::String(selector));
    object.insert(
        "snapshotRevision".to_string(),
        serde_json::Value::String(expected_snapshot_revision),
    );
    object.insert(
        "elementRect".to_string(),
        serde_json::to_value(bounds.element_rect)
            .map_err(|error| format!("could not encode element bounds: {error}"))?,
    );
    object.insert("clipped".to_string(), serde_json::Value::Bool(clipped));
    Ok(result)
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

/// Read an exact page of one element's semantic or authored content.
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
    if !matches!(
        field.as_str(),
        "text" | "name" | "description" | "value" | "options"
    ) {
        return Err("field must be text, name, description, value, or options".to_string());
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
    offset_x: Option<f64>,
    offset_y: Option<f64>,
    target_offset_x: Option<f64>,
    target_offset_y: Option<f64>,
    button: Option<String>,
    path: Option<Vec<EditorUiDragPathPoint>>,
    hover_state: Option<String>,
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
            | "scrollIntoView"
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
    for (name, coordinate) in [
        ("offsetX", offset_x),
        ("offsetY", offset_y),
        ("targetOffsetX", target_offset_x),
        ("targetOffsetY", target_offset_y),
        ("deltaX", delta_x),
        ("deltaY", delta_y),
    ] {
        if coordinate
            .is_some_and(|coordinate| !coordinate.is_finite() || coordinate.abs() > 1_000_000.0)
        {
            return Err(format!("{name} must be from -1000000 to 1000000"));
        }
    }
    let pointer_action = matches!(
        action.as_str(),
        "click" | "doubleClick" | "contextClick" | "scroll" | "dragTo" | "dragBy" | "hover"
    );
    if !pointer_action && (offset_x.is_some() || offset_y.is_some()) {
        return Err("offsetX and offsetY are only valid for pointer actions".to_string());
    }
    if action != "dragTo" && (target_offset_x.is_some() || target_offset_y.is_some()) {
        return Err("targetOffsetX and targetOffsetY are only valid for dragTo".to_string());
    }
    if action == "dragBy" {
        if button
            .as_deref()
            .is_some_and(|button| !matches!(button, "left" | "middle" | "right"))
        {
            return Err("button must be left, middle, or right".to_string());
        }
    } else if button.is_some() {
        return Err("button is only valid for dragBy".to_string());
    }
    if action == "scroll"
        && delta_x.unwrap_or_default() == 0.0
        && delta_y.unwrap_or_default() == 0.0
    {
        return Err("scroll requires a non-zero deltaX or deltaY".to_string());
    }
    if action == "dragBy" {
        if let Some(path) = path.as_ref() {
            if !(1..=64).contains(&path.len()) {
                return Err("path must contain 1 to 64 cumulative drag points".to_string());
            }
            if delta_x.is_some() || delta_y.is_some() {
                return Err("path is mutually exclusive with deltaX and deltaY".to_string());
            }
            if path.iter().any(|point| {
                !point.delta_x.is_finite()
                    || !point.delta_y.is_finite()
                    || point.delta_x.abs() > 1_000_000.0
                    || point.delta_y.abs() > 1_000_000.0
            }) {
                return Err("path displacements must be from -1000000 to 1000000".to_string());
            }
            if !path
                .iter()
                .any(|point| point.delta_x != 0.0 || point.delta_y != 0.0)
            {
                return Err("path must contain at least one non-zero displacement".to_string());
            }
        } else if delta_x.is_none()
            || delta_y.is_none()
            || delta_x == Some(0.0) && delta_y == Some(0.0)
        {
            return Err("dragBy requires a path or non-zero deltaX/deltaY fields".to_string());
        }
    } else if path.is_some() {
        return Err("path is only valid for dragBy".to_string());
    }
    if action == "hover" {
        if hover_state
            .as_deref()
            .is_some_and(|state| !matches!(state, "enter" | "leave"))
        {
            return Err("hoverState must be enter or leave".to_string());
        }
    } else if hover_state.is_some() {
        return Err("hoverState is only valid for hover".to_string());
    }
    if action == "keyPress" {
        let key = key
            .as_deref()
            .ok_or_else(|| "keyPress requires key".to_string())?;
        if !valid_editor_ui_key(key) {
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
            "click" | "doubleClick" | "contextClick" | "scroll" | "keyPress" | "dragTo" | "dragBy"
        )
    {
        return Err(
            "modifier keys are only valid for click, wheel, key, or drag actions".to_string(),
        );
    }
    let expected_snapshot_revision = expected_snapshot_revision.trim().to_string();
    if !valid_ui_snapshot_revision(&expected_snapshot_revision) {
        return Err(
            "expectedSnapshotRevision must be a snapshotRevision returned by inspect_editor_window"
                .to_string(),
        );
    }
    validate_background_ui_interaction_window(&app, &window_label)?;
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
        offset_x,
        offset_y,
        target_offset_x,
        target_offset_y,
        button,
        path,
        hover_state,
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

fn valid_editor_ui_key(value: &str) -> bool {
    if matches!(
        value,
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
        return true;
    }
    if let Some(number) = value.strip_prefix('F') {
        return number
            .parse::<u8>()
            .map(|parsed| (1..=24).contains(&parsed) && number == parsed.to_string())
            .unwrap_or(false);
    }
    let mut characters = value.chars();
    matches!(
        (characters.next(), characters.next()),
        (Some(character), None) if !character.is_control() && !character.is_whitespace()
    )
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
async fn resolve_editor_window_element_bounds_impl(
    app: AppHandle,
    window_label: String,
    selector: String,
    expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    use base64::Engine as _;
    let payload = serde_json::json!({
        "selector": selector,
        "expectedSnapshotRevision": expected_snapshot_revision,
    })
    .to_string();
    let payload = base64::engine::general_purpose::STANDARD.encode(payload);
    let expression = WINDOW_UI_ELEMENT_BOUNDS_SCRIPT.replace(
        "__MENGINE_PAYLOAD_BASE64__",
        &serde_json::to_string(&payload).map_err(|error| error.to_string())?,
    );
    evaluate_webview_script(&app, &window_label, expression).await
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
    offset_x: Option<f64>,
    offset_y: Option<f64>,
    target_offset_x: Option<f64>,
    target_offset_y: Option<f64>,
    button: Option<String>,
    path: Option<Vec<EditorUiDragPathPoint>>,
    hover_state: Option<String>,
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
        "offsetX": offset_x,
        "offsetY": offset_y,
        "targetOffsetX": target_offset_x,
        "targetOffsetY": target_offset_y,
        "button": button,
        "path": path,
        "hoverState": hover_state,
        "deltaX": delta_x,
        "deltaY": delta_y,
        "key": key,
        "shiftKey": shift_key.unwrap_or(false),
        "ctrlKey": ctrl_key.unwrap_or(false),
        "altKey": alt_key.unwrap_or(false),
        "metaKey": meta_key.unwrap_or(false),
        "expectedSnapshotRevision": expected_snapshot_revision.clone(),
    })
    .to_string();
    let payload = base64::engine::general_purpose::STANDARD.encode(payload);
    let interaction_expression = WINDOW_UI_INTERACTION_SCRIPT.replace(
        "__MENGINE_PAYLOAD_BASE64__",
        &serde_json::to_string(&payload).map_err(|error| error.to_string())?,
    );
    let snapshot_expression = WINDOW_UI_SNAPSHOT_SCRIPT
        .replace("__MENGINE_MAX_ELEMENTS__", "50")
        .replace("__MENGINE_OFFSET__", "0");
    // Refresh the current semantic guard and synchronously dispatch the action
    // in one renderer task. Live React updates cannot invalidate the guard in
    // the gap between two DevTools Runtime.evaluate calls.
    let expression = [
        "(() => { const preActionSnapshot = (",
        &snapshot_expression,
        "); const pendingInteraction = (",
        &interaction_expression,
        "); return Promise.resolve(pendingInteraction).then((result) => ({ preActionSnapshotRevision: preActionSnapshot.snapshotRevision, result })); })()",
    ]
    .concat();
    let envelope =
        evaluate_webview_script_with_await(&app, &window_label, expression, true).await?;
    let pre_snapshot_revision = envelope
        .get("preActionSnapshotRevision")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            "WebView2 UI interaction did not report its pre-action snapshot revision".to_string()
        })?
        .to_string();
    let mut result = envelope
        .get("result")
        .cloned()
        .ok_or_else(|| "WebView2 UI interaction did not return a result".to_string())?;
    let stale_snapshot = result
        .get("staleSnapshot")
        .and_then(serde_json::Value::as_bool)
        == Some(true);
    let object = result
        .as_object_mut()
        .ok_or_else(|| "WebView2 UI interaction returned a non-object value".to_string())?;
    object.insert(
        "preSnapshotRevision".to_string(),
        serde_json::Value::String(pre_snapshot_revision.clone()),
    );
    object.insert(
        "snapshotDriftedBeforeAction".to_string(),
        serde_json::Value::Bool(pre_snapshot_revision != expected_snapshot_revision),
    );
    if stale_snapshot
        && object
            .get("actualSnapshotRevision")
            .is_none_or(serde_json::Value::is_null)
    {
        object.insert(
            "actualSnapshotRevision".to_string(),
            serde_json::Value::String(pre_snapshot_revision),
        );
    }
    Ok(result)
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
async fn resolve_editor_window_element_bounds_impl(
    _app: AppHandle,
    _window_label: String,
    _selector: String,
    _expected_snapshot_revision: String,
) -> Result<serde_json::Value, String> {
    Err("background editor-element capture is currently only supported on Windows".to_string())
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
    _offset_x: Option<f64>,
    _offset_y: Option<f64>,
    _target_offset_x: Option<f64>,
    _target_offset_y: Option<f64>,
    _button: Option<String>,
    _path: Option<Vec<EditorUiDragPathPoint>>,
    _hover_state: Option<String>,
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
  if (!revisionGuard || typeof revisionGuard.observeRoot !== 'function') {
    revisionGuard?.observer?.disconnect?.();
    const invalidateRevisionGuard = () => {
      revisionGuard.epoch += 1;
    };
    const mutationOptions = {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    };
    const observer = new MutationObserver(invalidateRevisionGuard);
    revisionGuard = {
      epoch: 0,
      revisions: new Map(),
      invalidate: invalidateRevisionGuard,
      observer,
      observedRoots: new WeakSet(),
    };
    const documentInvalidationEvents = [
      'input',
      'change',
      'selectionchange',
      'focusin',
      'focusout',
      'scroll',
      'toggle',
      'reset',
    ];
    revisionGuard.observeRoot = (root) => {
      if (
        !(root instanceof Document || root instanceof ShadowRoot)
        || revisionGuard.observedRoots.has(root)
      ) return;
      revisionGuard.observedRoots.add(root);
      observer.observe(root, mutationOptions);
      for (const eventName of documentInvalidationEvents) {
        root.addEventListener(eventName, invalidateRevisionGuard, true);
      }
    };
    revisionGuard.observeRoot(document);
    const windowInvalidationEvents = ['resize', 'scroll', 'hashchange', 'popstate'];
    for (const eventName of windowInvalidationEvents) {
      window.addEventListener(eventName, invalidateRevisionGuard, true);
    }
    window.visualViewport?.addEventListener('resize', invalidateRevisionGuard, true);
    window.visualViewport?.addEventListener('scroll', invalidateRevisionGuard, true);
    const originalHistoryMethods = {};
    for (const methodName of ['pushState', 'replaceState']) {
      const originalMethod = window.history[methodName];
      originalHistoryMethods[methodName] = originalMethod;
      window.history[methodName] = function (...args) {
        const previousUrl = window.location.href;
        const result = originalMethod.apply(this, args);
        if (window.location.href !== previousUrl) invalidateRevisionGuard();
        return result;
      };
    }
    revisionGuard.documentInvalidationEvents = documentInvalidationEvents;
    revisionGuard.windowInvalidationEvents = windowInvalidationEvents;
    revisionGuard.originalHistoryMethods = originalHistoryMethods;
    window[revisionGuardKey] = revisionGuard;
  }
  const attachShadowGuardKey = Symbol.for('mengine.agent.attachShadowGuard');
  if (!Element.prototype[attachShadowGuardKey]) {
    const originalAttachShadow = Element.prototype.attachShadow;
    Object.defineProperty(Element.prototype, attachShadowGuardKey, {
      value: originalAttachShadow,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Element.prototype.attachShadow = function (...args) {
      const root = originalAttachShadow.apply(this, args);
      const currentGuard = window[revisionGuardKey];
      currentGuard?.observeRoot?.(root);
      currentGuard?.invalidate?.();
      return root;
    };
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
    'scrollIntoView',
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
      current = composedParent(current);
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
    if (tag === 'img' && normalize(element.getAttribute('alt'))) return 'img';
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
  const composedParent = (element) => {
    if (!(element instanceof Element)) return null;
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const closestComposed = (element, selector) => {
    let current = element;
    while (current instanceof Element) {
      if (current.matches(selector)) return current;
      current = composedParent(current);
    }
    return null;
  };
  const composedContains = (container, candidate) => {
    let current = candidate instanceof Element
      ? candidate
      : candidate?.parentElement;
    while (current instanceof Element) {
      if (current === container) return true;
      current = composedParent(current);
    }
    return false;
  };
  const deepActiveElement = () => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  const composedChildNodes = (node) => {
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true });
      if (assigned.length > 0) return assigned;
    }
    if (node instanceof Element && node.shadowRoot) {
      return Array.from(node.shadowRoot.childNodes);
    }
    return Array.from(node.childNodes || []);
  };
  const semanticallyHidden = (element) => Boolean(
    closestComposed(element, '[aria-hidden="true"], [inert]'),
  );
  const renderedRectFor = (element, style = getComputedStyle(element)) => {
    const rect = element.getBoundingClientRect();
    if (
      typeof SVGGeometryElement === 'undefined'
      || !(element instanceof SVGGeometryElement)
      || (rect.width > 0 && rect.height > 0)
      || (rect.width <= 0 && rect.height <= 0)
    ) return rect;
    const parsedStrokeWidth = Number.parseFloat(style.strokeWidth);
    const thickness = (
      Number.isFinite(parsedStrokeWidth) && parsedStrokeWidth > 0
        ? parsedStrokeWidth
        : 1
    );
    const width = Math.max(rect.width, thickness);
    const height = Math.max(rect.height, thickness);
    const left = rect.left - (width - rect.width) / 2;
    const top = rect.top - (height - rect.height) / 2;
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  };
  const renderedInComposedTree = (element) => {
    let current = element;
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || style.visibility === 'collapse'
        || style.contentVisibility === 'hidden'
        || Number(style.opacity) === 0
        || current.hidden
      ) return false;
      current = composedParent(current);
    }
    return true;
  };
  const visible = (element) => {
    if (semanticallyHidden(element) || !renderedInComposedTree(element)) return false;
    const rect = renderedRectFor(element);
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
      || closestComposed(element, '[aria-disabled="true"]'),
  );
  const semanticText = (
    root,
    excludedElement = null,
    includeHiddenSubtree = false,
  ) => {
    const parts = [];
    const visit = (node, semanticParent = null) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (
          includeHiddenSubtree
          || !(semanticParent instanceof Element)
          || !semanticallyHidden(semanticParent)
        ) {
          parts.push(node.textContent || '');
        }
        return;
      }
      if (node instanceof Element) {
        if (excludedElement instanceof Element && node === excludedElement) return;
        if (
          ['script', 'style', 'template', 'noscript'].includes(node.localName)
          || (!includeHiddenSubtree && semanticallyHidden(node))
        ) return;
      }
      const nextParent = node instanceof Element ? node : semanticParent;
      for (const child of composedChildNodes(node)) {
        visit(child, nextParent);
      }
    };
    visit(root);
    return normalize(parts.join(' '));
  };
  const referencedText = (idRefs, context) => {
    const root = context instanceof Element ? context.getRootNode() : document;
    return normalize(idRefs).split(/\s+/)
    .map((id) => root.getElementById?.(id) || null)
    .filter(Boolean)
    .map((node) => semanticText(node, null, semanticallyHidden(node)))
    .filter(Boolean)
    .join(' ');
  };
  const labelledByText = (element) => {
    const labelledBy = normalize(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const text = referencedText(labelledBy, element);
      if (text) return normalize(text);
    }
    return '';
  };
  const nativeLabelText = (element) => {
    if (element.labels?.length) {
      const text = Array.from(element.labels)
        .map((label) => semanticText(label, null, semanticallyHidden(label)))
        .filter(Boolean)
        .join(' ');
      if (text) return normalize(text);
    }
    return '';
  };
  const nativeCaptionText = (element) => {
    const captionTag = element.localName === 'fieldset'
      ? 'legend'
      : element.localName === 'figure'
        ? 'figcaption'
        : element.localName === 'table'
          ? 'caption'
          : '';
    if (!captionTag) return '';
    const caption = Array.from(element.children)
      .find((child) => child.localName === captionTag);
    return caption
      ? semanticText(caption, null, semanticallyHidden(caption))
      : '';
  };
  const nativeButtonValue = (element) => {
    if (!(element instanceof HTMLInputElement)) return '';
    const type = String(element.type || 'text').toLowerCase();
    return ['button', 'submit', 'reset'].includes(type)
      ? normalize(element.value)
      : '';
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
    const label = closestComposed(element, 'label');
    if (!label) return '';
    return semanticText(label, element);
  };
  const accessibleName = (element, role) => normalize(
    labelledByText(element)
      || element.getAttribute('aria-label')
      || nativeLabelText(element)
      || element.getAttribute('alt')
      || nativeCaptionText(element)
      || nativeButtonValue(element)
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
      current = composedParent(current);
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
  const selectorWithinRoot = (element, root) => {
    const escape = (value) => CSS.escape(String(value));
    if (element.id) {
      const selector = `#${escape(element.id)}`;
      if (root.querySelectorAll(selector).length === 1) return selector;
    }
    const parts = [];
    let current = element;
    const boundary = root instanceof Document ? document.documentElement : null;
    while (current && current !== boundary) {
      let part = current.localName;
      const parent = current.parentElement;
      if (current.id) {
        const selector = `#${escape(current.id)}`;
        if (root.querySelectorAll(selector).length === 1) {
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
  const selectorFor = (element) => {
    const segments = [];
    let current = element;
    while (current instanceof Element) {
      const root = current.getRootNode();
      if (!(root instanceof Document || root instanceof ShadowRoot)) break;
      segments.unshift(selectorWithinRoot(current, root));
      current = root instanceof ShadowRoot ? root.host : null;
    }
    return segments.join(' >>> ');
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
    return null;
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
  const needsScrollIntoView = (element) => {
    const rect = renderedRectFor(element);
    if (
      rect.left < 0
      || rect.top < 0
      || rect.right > document.documentElement.clientWidth
      || rect.bottom > document.documentElement.clientHeight
    ) return true;
    let current = composedParent(element);
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';
      if (clipsX || clipsY) {
        const ancestorRect = renderedRectFor(current, style);
        const clipLeft = current instanceof HTMLElement
          ? ancestorRect.left + current.clientLeft
          : ancestorRect.left;
        const clipTop = current instanceof HTMLElement
          ? ancestorRect.top + current.clientTop
          : ancestorRect.top;
        const clipRight = current instanceof HTMLElement
          ? clipLeft + current.clientWidth
          : ancestorRect.right;
        const clipBottom = current instanceof HTMLElement
          ? clipTop + current.clientHeight
          : ancestorRect.bottom;
        if (
          (clipsX && (rect.left < clipLeft || rect.right > clipRight))
          || (clipsY && (rect.top < clipTop || rect.bottom > clipBottom))
        ) return true;
      }
      current = composedParent(current);
    }
    return false;
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
    const readOnly = Boolean(
      element.readOnly || element.getAttribute('aria-readonly') === 'true',
    );
    if ((writableInput && !readOnly)
      || (element instanceof HTMLTextAreaElement && !readOnly)
      || (element instanceof HTMLSelectElement && !readOnly)
      || (element.isContentEditable && !readOnly)) {
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
    const wheelGesture = element.getAttribute('data-agent-wheel') === 'true'
      && typeof props.onWheel === 'function';
    if (scrollsVertically || scrollsHorizontally || wheelGesture) {
      actions.push('scroll');
    }
    const keyboardTarget = (
      element instanceof HTMLElement
      || element instanceof SVGElement
    ) && (
      element.tabIndex >= 0
      || element.hasAttribute('tabindex')
      || writableInput
      || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
      || element.isContentEditable
    );
    if (keyboardTarget) actions.push('keyPress');
    if (element.draggable || typeof props.onDragStart === 'function') {
      actions.push('dragTo');
    }
    const gestureHint = normalize(
      `${element.getAttribute('aria-label') || ''} `
        + `${element.getAttribute('title') || ''} ${element.className || ''}`,
      240,
    ).toLocaleLowerCase();
    const explicitDragBy = element.getAttribute('data-agent-drag-by') === 'true';
    const pointerGesture = typeof props.onPointerDown === 'function' && (
      explicitDragBy
      || typeof props.onPointerMove === 'function'
      || typeof props.onPointerUp === 'function'
      || typeof props.onPointerCancel === 'function'
      || /drag|scrub|resize|拖|调整|调节/.test(gestureHint)
    );
    const mouseGesture = typeof props.onMouseDown === 'function'
      && typeof props.onClick !== 'function';
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
      const label = labelledByText(current)
        || normalize(current.getAttribute('aria-label'), 160)
        || nativeLabelText(current);
      if (label) return `${label} scroll area`;
      current = composedParent(current);
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
  const selectionFor = (element) => {
    const password = element instanceof HTMLInputElement
      && String(element.type).toLowerCase() === 'password';
    if (password) return null;
    if (
      element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
    ) {
      try {
        if (
          typeof element.selectionStart !== 'number'
          || typeof element.selectionEnd !== 'number'
        ) return null;
        return {
          selectionStart: element.selectionStart,
          selectionEnd: element.selectionEnd,
          selectionDirection: element.selectionDirection || 'none',
        };
      } catch {
        return null;
      }
    }
    if (!(element instanceof HTMLElement) || !element.isContentEditable) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const pointInside = (node) => Boolean(
      node
      && (
        node === element
        || element.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
      )
    );
    if (!pointInside(selection.anchorNode) || !pointInside(selection.focusNode)) return null;
    const textOffset = (node, offset) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      if (
        !(node instanceof Node)
        || !Number.isInteger(offset)
        || offset < 0
      ) return null;
      try {
        range.setEnd(node, offset);
        return String(range.cloneContents().textContent ?? '').length;
      } catch {
        return null;
      }
    };
    const anchor = textOffset(selection.anchorNode, selection.anchorOffset);
    const focus = textOffset(selection.focusNode, selection.focusOffset);
    if (anchor === null || focus === null) return null;
    return {
      selectionStart: Math.min(anchor, focus),
      selectionEnd: Math.max(anchor, focus),
      selectionDirection: focus < anchor
        ? 'backward'
        : focus > anchor
          ? 'forward'
          : 'none',
    };
  };
  const stateFor = (element, modalBlocked = false) => {
    const state = {
      disabled: effectivelyDisabled(element),
      readOnly: Boolean(element.readOnly || element.getAttribute('aria-readonly') === 'true'),
      focused: deepActiveElement() === element,
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
    const selection = selectionFor(element);
    if (selection) Object.assign(state, selection);
    return state;
  };
  const descriptionFor = (element, name) => normalize(
    referencedText(element.getAttribute('aria-describedby'), element)
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
    const rect = renderedRectFor(element);
    return {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
  };
  const all = [];
  const collectedElements = new Set();
  const collectOpenComposedTree = (element) => {
    if (!(element instanceof Element) || collectedElements.has(element)) return;
    collectedElements.add(element);
    all.push(element);
    if (element.shadowRoot) revisionGuard.observeRoot(element.shadowRoot);
    for (const child of composedChildNodes(element)) {
      if (child instanceof Element) collectOpenComposedTree(child);
    }
  };
  collectOpenComposedTree(document.documentElement);
  const visibleModalDialogs = Array.from(
    all.filter((candidate) => candidate.matches?.(
      'dialog, [role="dialog"][aria-modal="true"]',
    )),
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
      current = composedParent(current);
    }
    return layer;
  };
  let activeModal = visibleModalDialogs.find((candidate) => (
    composedContains(candidate, deepActiveElement())
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
    const modalBlocked = Boolean(activeModal && !composedContains(activeModal, element));
    const actions = modalBlocked ? [] : actionList(element, role);
    const name = directName || (actions.includes('scroll') ? scrollContextName(element) : '');
    const structural = /^h[1-6]$/.test(tag)
      || ['p', 'summary', 'legend', 'caption'].includes(tag);
    if (!role && !name && !text && !structural && actions.length === 0) continue;
    if (!modalBlocked && needsScrollIntoView(element)) {
      actions.unshift('scrollIntoView');
    }
    candidates.push({ element, role, name, text, actions, modalBlocked });
  }
  const ids = new Map(candidates.map((entry, index) => [entry.element, `ui-${index + 1}`]));
  const semanticElementFor = (entry) => {
    const { element, role, name, text, actions, modalBlocked } = entry;
    const scope = semanticScopeFor(element);
    let parent = composedParent(element);
    while (parent && !ids.has(parent)) parent = composedParent(parent);
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
      value: valueFor(element),
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
  const activeElement = deepActiveElement();
  const activeElementSelector =
    activeElement instanceof Element ? selectorFor(activeElement) : null;
  const revisionSource = JSON.stringify({
    version: 32,
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
  const snapshotRevision = `ui-v32-${candidates.length}-${
    revisionHash.toString(16).padStart(16, '0')
  }`;
  const interactionSignatureFor = (semanticElement) => {
    const state = { ...semanticElement.state };
    delete state.focused;
    return JSON.stringify({
      ...semanticElement,
      state,
      rect: undefined,
      scroll: undefined,
    });
  };
  const guardedElements = new Map(semanticElements.map((semanticElement, index) => [
    semanticElement.selector,
    {
      element: candidates[index].element,
      actions: [...semanticElement.actions],
      signature: interactionSignatureFor(semanticElement),
    },
  ]));
  revisionGuard.revisions.delete(snapshotRevision);
  revisionGuard.revisions.set(snapshotRevision, {
    epoch: revisionGuard.epoch,
    elements: guardedElements,
  });
  revisionGuard.latestRevision = snapshotRevision;
  while (revisionGuard.revisions.size > maxGuardedRevisions) {
    const oldestRevision = revisionGuard.revisions.keys().next().value;
    revisionGuard.revisions.delete(oldestRevision);
  }
  const elements = semanticElements.slice(offset, offset + limit);
  return {
    version: 32,
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
const WINDOW_UI_ELEMENT_BOUNDS_SCRIPT: &str = r#"
(() => {
  const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(
    atob(__MENGINE_PAYLOAD_BASE64__),
    (character) => character.charCodeAt(0),
  )));
  const { selector, expectedSnapshotRevision } = payload;
  const revisionGuard = window[Symbol.for('mengine.agent.uiRevisionGuard')];
  const guardedRevision = revisionGuard?.revisions?.get(expectedSnapshotRevision);
  if (!guardedRevision || guardedRevision.epoch !== revisionGuard?.epoch) {
    return {
      ok: false,
      error: 'Editor window semantic snapshot expired before element capture',
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
      error: `Selector ${selector} was not exposed by the expected semantic UI snapshot`,
      selectorNotExposed: true,
      expectedSnapshotRevision,
    };
  }
  const element = guardedElement.element;
  if (
    !(element instanceof Element)
    || !element.isConnected
    || element.ownerDocument !== document
  ) {
    return {
      ok: false,
      error: 'Editor window semantic element changed before capture',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
    return {
      ok: false,
      error: `Selector ${selector} no longer resolves to a renderable semantic element`,
      notVisible: true,
      expectedSnapshotRevision,
    };
  }
  const composedParent = (target) => {
    if (!(target instanceof Element)) return null;
    if (target.assignedSlot) return target.assignedSlot;
    if (target.parentElement) return target.parentElement;
    const root = target.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const closestComposed = (target, cssSelector) => {
    let current = target;
    while (current instanceof Element) {
      if (current.matches(cssSelector)) return current;
      current = composedParent(current);
    }
    return null;
  };
  if (closestComposed(element, '[aria-hidden="true"], [inert]')) {
    return {
      ok: false,
      error: `Selector ${selector} is hidden from the semantic accessibility tree`,
      notVisible: true,
      expectedSnapshotRevision,
    };
  }
  const style = getComputedStyle(element);
  const renderedRectFor = (target, targetStyle = getComputedStyle(target)) => {
    const rect = target.getBoundingClientRect();
    if (
      typeof SVGGeometryElement === 'undefined'
      || !(target instanceof SVGGeometryElement)
      || (rect.width > 0 && rect.height > 0)
      || (rect.width <= 0 && rect.height <= 0)
    ) return rect;
    const parsedStrokeWidth = Number.parseFloat(targetStyle.strokeWidth);
    const thickness = (
      Number.isFinite(parsedStrokeWidth) && parsedStrokeWidth > 0
        ? parsedStrokeWidth
        : 1
    );
    const width = Math.max(rect.width, thickness);
    const height = Math.max(rect.height, thickness);
    const left = rect.left - (width - rect.width) / 2;
    const top = rect.top - (height - rect.height) / 2;
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  };
  const renderedInComposedTree = (target) => {
    let current = target;
    while (current instanceof Element) {
      const currentStyle = getComputedStyle(current);
      if (
        currentStyle.display === 'none'
        || currentStyle.visibility === 'hidden'
        || currentStyle.visibility === 'collapse'
        || currentStyle.contentVisibility === 'hidden'
        || Number(currentStyle.opacity) === 0
        || current.hidden
      ) return false;
      current = composedParent(current);
    }
    return true;
  };
  const rect = renderedRectFor(element, style);
  if (!renderedInComposedTree(element) || rect.width <= 0 || rect.height <= 0) {
    return {
      ok: false,
      error: `Selector ${selector} is not currently rendered`,
      notVisible: true,
      expectedSnapshotRevision,
    };
  }
  let visibleLeft = Math.max(0, rect.left);
  let visibleTop = Math.max(0, rect.top);
  let visibleRight = Math.min(document.documentElement.clientWidth, rect.right);
  let visibleBottom = Math.min(document.documentElement.clientHeight, rect.bottom);
  let current = composedParent(element);
  while (current instanceof Element) {
    const ancestorStyle = getComputedStyle(current);
    const clipsX = ancestorStyle.overflowX !== 'visible';
    const clipsY = ancestorStyle.overflowY !== 'visible';
    if (clipsX || clipsY) {
      const ancestorRect = renderedRectFor(current, ancestorStyle);
      const clipLeft = current instanceof HTMLElement
        ? ancestorRect.left + current.clientLeft
        : ancestorRect.left;
      const clipTop = current instanceof HTMLElement
        ? ancestorRect.top + current.clientTop
        : ancestorRect.top;
      const clipRight = current instanceof HTMLElement
        ? clipLeft + current.clientWidth
        : ancestorRect.right;
      const clipBottom = current instanceof HTMLElement
        ? clipTop + current.clientHeight
        : ancestorRect.bottom;
      if (clipsX) {
        visibleLeft = Math.max(visibleLeft, clipLeft);
        visibleRight = Math.min(visibleRight, clipRight);
      }
      if (clipsY) {
        visibleTop = Math.max(visibleTop, clipTop);
        visibleBottom = Math.min(visibleBottom, clipBottom);
      }
    }
    current = composedParent(current);
  }
  return {
    ok: true,
    elementRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    visibleRect: {
      x: visibleLeft,
      y: visibleTop,
      width: Math.max(0, visibleRight - visibleLeft),
      height: Math.max(0, visibleBottom - visibleTop),
    },
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
  };
})()
"#;

#[cfg(windows)]
const WINDOW_UI_CONTENT_SCRIPT: &str = r#"
(() => {
  const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(
    atob(__MENGINE_PAYLOAD_BASE64__),
    (character) => character.charCodeAt(0),
  )));
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
  const element = guardedElement.element;
  if (
    !(element instanceof Element)
    || !element.isConnected
    || element.ownerDocument !== document
  ) {
    return {
      ok: false,
      error: 'Editor window semantic selector changed; get a fresh UI snapshot before reading exact content',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: null,
      restartOffset: 0,
    };
  }
  const normalizeSemantic = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const composedParent = (target) => {
    if (!(target instanceof Element)) return null;
    if (target.assignedSlot) return target.assignedSlot;
    if (target.parentElement) return target.parentElement;
    const root = target.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const closestComposed = (target, cssSelector) => {
    let current = target;
    while (current instanceof Element) {
      if (current.matches(cssSelector)) return current;
      current = composedParent(current);
    }
    return null;
  };
  const composedChildNodes = (node) => {
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true });
      if (assigned.length > 0) return assigned;
    }
    if (node instanceof Element && node.shadowRoot) {
      return Array.from(node.shadowRoot.childNodes);
    }
    return Array.from(node.childNodes || []);
  };
  const semanticallyHidden = (target) => Boolean(
    target instanceof Element
      && closestComposed(target, '[aria-hidden="true"], [inert]'),
  );
  const semanticText = (
    root,
    excludedElement = null,
    includeHiddenSubtree = false,
  ) => {
    const parts = [];
    const visit = (node, semanticParent = null) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (
          includeHiddenSubtree
          || !(semanticParent instanceof Element)
          || !semanticallyHidden(semanticParent)
        ) {
          parts.push(node.textContent || '');
        }
        return;
      }
      if (node instanceof Element) {
        if (excludedElement instanceof Element && node === excludedElement) return;
        if (
          ['script', 'style', 'template', 'noscript'].includes(node.localName)
          || (!includeHiddenSubtree && semanticallyHidden(node))
        ) return;
      }
      const nextParent = node instanceof Element ? node : semanticParent;
      for (const child of composedChildNodes(node)) {
        visit(child, nextParent);
      }
    };
    visit(root);
    return normalizeSemantic(parts.join(' '));
  };
  const referencedText = (idRefs, context) => {
    const root = context instanceof Element ? context.getRootNode() : document;
    return normalizeSemantic(idRefs).split(/\s+/)
    .map((id) => root.getElementById?.(id) || null)
    .filter(Boolean)
    .map((node) => semanticText(node, null, semanticallyHidden(node)))
    .filter(Boolean)
    .join(' ');
  };
  const labelledByText = (target) => {
    const labelledBy = normalizeSemantic(target.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const text = referencedText(labelledBy, target);
      if (text) return normalizeSemantic(text);
    }
    return '';
  };
  const nativeLabelText = (target) => {
    if (target.labels?.length) {
      const text = Array.from(target.labels)
        .map((label) => semanticText(label, null, semanticallyHidden(label)))
        .filter(Boolean)
        .join(' ');
      if (text) return normalizeSemantic(text);
    }
    return '';
  };
  const nativeCaptionText = (target) => {
    const captionTag = target.localName === 'fieldset'
      ? 'legend'
      : target.localName === 'figure'
        ? 'figcaption'
        : target.localName === 'table'
          ? 'caption'
          : '';
    if (!captionTag) return '';
    const caption = Array.from(target.children)
      .find((child) => child.localName === captionTag);
    return caption
      ? semanticText(caption, null, semanticallyHidden(caption))
      : '';
  };
  const nativeButtonValue = (target) => {
    if (!(target instanceof HTMLInputElement)) return '';
    const type = String(target.type || 'text').toLowerCase();
    return ['button', 'submit', 'reset'].includes(type)
      ? normalizeSemantic(target.value)
      : '';
  };
  const implicitNamingRole = (target) => {
    const tag = target.localName;
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'a' && target.hasAttribute('href')) return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return target.multiple ? 'listbox' : 'combobox';
    if (tag === 'option') return 'option';
    if (tag === 'output') return 'status';
    if (tag === 'meter') return 'meter';
    if (tag === 'progress') return 'progressbar';
    if (tag !== 'input') return '';
    const type = String(target.type || 'text').toLowerCase();
    if (type === 'hidden') return '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (target.list) return 'combobox';
    if (type === 'search') return 'searchbox';
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    return 'textbox';
  };
  const nameFromContent = (role) => [
    'button', 'link', 'heading', 'menuitem', 'option', 'tab',
  ].includes(role);
  const containingLabelText = (target) => {
    const label = closestComposed(target, 'label');
    return label ? semanticText(label, target) : '';
  };
  const semanticName = (target) => {
    const role = normalizeSemantic(
      target.getAttribute('role') || implicitNamingRole(target),
    );
    const content = nameFromContent(role) ? semanticText(target) : '';
    const meaningfulContent = /[\p{L}\p{N}]/u.test(content) ? content : '';
    return normalizeSemantic(
      labelledByText(target)
        || target.getAttribute('aria-label')
        || nativeLabelText(target)
        || target.getAttribute('alt')
        || nativeCaptionText(target)
        || nativeButtonValue(target)
        || meaningfulContent
        || (
          ['status', 'meter', 'progressbar'].includes(role)
            ? containingLabelText(target)
            : ''
        )
        || target.getAttribute('placeholder')
        || target.getAttribute('title')
        || content,
    );
  };
  const semanticDescription = (target, name) => normalizeSemantic(
    referencedText(target.getAttribute('aria-describedby'), target)
      || target.getAttribute('aria-description')
      || (
        normalizeSemantic(target.getAttribute('title')) !== name
          ? target.getAttribute('title')
          : ''
      ),
  );
  const textNodeIsRendered = (parent) => {
    if (!(parent instanceof Element) || semanticallyHidden(parent)) return false;
    const parentStyle = getComputedStyle(parent);
    if (parentStyle.visibility === 'hidden' || parentStyle.visibility === 'collapse') {
      return false;
    }
    let current = parent;
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      if (
        style.display === 'none'
        || style.contentVisibility === 'hidden'
        || Number(style.opacity) === 0
        || current.hidden
      ) return false;
      current = composedParent(current);
    }
    return true;
  };
  const exactSemanticText = (root) => {
    const parts = [];
    const visit = (node, semanticParent = null) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (textNodeIsRendered(semanticParent)) {
          parts.push(node.textContent || '');
        }
        return;
      }
      const nextParent = node instanceof Element ? node : semanticParent;
      for (const child of composedChildNodes(node)) {
        visit(child, nextParent);
      }
    };
    visit(root);
    return parts.join('');
  };
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
  } else if (field === 'name') {
    content = semanticName(element);
  } else if (field === 'description') {
    const name = semanticName(element);
    content = semanticDescription(element, name);
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
    content = exactSemanticText(element);
  }
  const revisionSource = JSON.stringify([selector, field, content]);
  let revisionHashA = 0x811c9dc5;
  let revisionHashB = 0x9e3779b9;
  for (let index = 0; index < revisionSource.length; index += 1) {
    const code = revisionSource.charCodeAt(index);
    revisionHashA = Math.imul(revisionHashA ^ code, 0x01000193);
    revisionHashB = Math.imul(revisionHashB ^ (code + index), 0x85ebca6b);
  }
  const contentRevision = `content-v3-${content.length}-${
    (revisionHashA >>> 0).toString(16).padStart(8, '0')
  }${(revisionHashB >>> 0).toString(16).padStart(8, '0')}`;
  const start = Math.min(Number(offset), content.length);
  const isHighSurrogate = (unit) => unit >= 0xd800 && unit <= 0xdbff;
  const isLowSurrogate = (unit) => unit >= 0xdc00 && unit <= 0xdfff;
  if (
    start > 0
    && start < content.length
    && isHighSurrogate(content.charCodeAt(start - 1))
    && isLowSurrogate(content.charCodeAt(start))
  ) {
    return {
      ok: false,
      error: `Content offset ${start} splits a Unicode surrogate pair; retry from ${start - 1}`,
      invalidContentOffset: true,
      requestedOffset: start,
      restartOffset: start - 1,
      contentRevision,
    };
  }
  let end = Math.min(start + Number(maxChars), content.length);
  if (
    end > start
    && end < content.length
    && isHighSurrogate(content.charCodeAt(end - 1))
    && isLowSurrogate(content.charCodeAt(end))
  ) {
    end += 1;
  }
  const page = content.slice(start, end);
  const nextOffset = end < content.length ? end : null;
  return {
    ok: true,
    version: 3,
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
  const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(
    atob(__MENGINE_PAYLOAD_BASE64__),
    (character) => character.charCodeAt(0),
  )));
  const {
    selector,
    action,
    targetSelector,
    value: requestedValue,
    offsetX: requestedOffsetX,
    offsetY: requestedOffsetY,
    targetOffsetX: requestedTargetOffsetX,
    targetOffsetY: requestedTargetOffsetY,
    button: requestedButton,
    path: requestedPath,
    hoverState: requestedHoverState,
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
  const composedParent = (target) => {
    if (!(target instanceof Element)) return null;
    if (target.assignedSlot) return target.assignedSlot;
    if (target.parentElement) return target.parentElement;
    const root = target.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const closestComposed = (target, cssSelector) => {
    let current = target;
    while (current instanceof Element) {
      if (current.matches(cssSelector)) return current;
      current = composedParent(current);
    }
    return null;
  };
  const composedContains = (container, candidate) => {
    let current = candidate instanceof Element
      ? candidate
      : candidate?.parentElement;
    while (current instanceof Element) {
      if (current === container) return true;
      current = composedParent(current);
    }
    return false;
  };
  const deepActiveElement = () => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  const composedChildNodes = (node) => {
    if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true });
      if (assigned.length > 0) return assigned;
    }
    if (node instanceof Element && node.shadowRoot) {
      return Array.from(node.shadowRoot.childNodes);
    }
    return Array.from(node.childNodes || []);
  };
  const allOpenComposedElements = () => {
    const elements = [];
    const collected = new Set();
    const collect = (candidate) => {
      if (!(candidate instanceof Element) || collected.has(candidate)) return;
      collected.add(candidate);
      elements.push(candidate);
      for (const child of composedChildNodes(candidate)) {
        if (child instanceof Element) collect(child);
      }
    };
    collect(document.documentElement);
    return elements;
  };
  const revisionGuard = window[Symbol.for('mengine.agent.uiRevisionGuard')];
  const guardedRevision = revisionGuard?.revisions?.get(expectedSnapshotRevision);
  if (!revisionGuard || !guardedRevision) {
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
  const currentSnapshotRevision = revisionGuard.latestRevision;
  const currentRevision = revisionGuard.revisions?.get(currentSnapshotRevision);
  const currentGuardedElement = currentRevision?.elements?.get(selector);
  if (
    currentRevision?.epoch !== revisionGuard.epoch
    || !currentGuardedElement
    || currentGuardedElement.element !== guardedElement.element
    || currentGuardedElement.signature !== guardedElement.signature
  ) {
    return {
      ok: false,
      error: 'Editor window semantic target changed; get a fresh UI snapshot before interacting',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: currentSnapshotRevision || null,
      restartOffset: 0,
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
  const currentGuardedTarget = action === 'dragTo'
    ? currentRevision?.elements?.get(targetSelector)
    : null;
  if (
    action === 'dragTo'
    && (
      !currentGuardedTarget
      || currentGuardedTarget.element !== guardedTarget.element
      || currentGuardedTarget.signature !== guardedTarget.signature
    )
  ) {
    return {
      ok: false,
      error: 'Editor window semantic drag target changed; get a fresh UI snapshot before interacting',
      staleSnapshot: true,
      expectedSnapshotRevision,
      actualSnapshotRevision: currentSnapshotRevision || null,
      restartOffset: 0,
    };
  }
  const agentActionNames = [
    'click',
    'doubleClick',
    'contextClick',
    'setValue',
    'scrollIntoView',
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
      current = composedParent(current);
    }
    return blockedActions.size > 0
      ? {
          blockedActions: agentActionNames.filter((name) => blockedActions.has(name)),
          alternative,
        }
      : null;
  };
  const element = guardedElement.element;
  if (
    !(element instanceof Element)
    || !element.isConnected
    || element.ownerDocument !== document
  ) {
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
    targetElement = guardedTarget.element;
    if (
      !(targetElement instanceof Element)
      || !targetElement.isConnected
      || targetElement.ownerDocument !== document
    ) {
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
    target instanceof Element
      && closestComposed(target, '[aria-hidden="true"], [inert]'),
  );
  const semanticText = (root, includeHiddenSubtree = false) => {
    const parts = [];
    const visit = (node, semanticParent = null) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (
          includeHiddenSubtree
          || !(semanticParent instanceof Element)
          || !semanticallyHidden(semanticParent)
        ) {
          parts.push(node.textContent || '');
        }
        return;
      }
      if (node instanceof Element) {
        if (
          ['script', 'style', 'template', 'noscript'].includes(node.localName)
          || (!includeHiddenSubtree && semanticallyHidden(node))
        ) return;
      }
      const nextParent = node instanceof Element ? node : semanticParent;
      for (const child of composedChildNodes(node)) {
        visit(child, nextParent);
      }
    };
    visit(root);
    return normalizeName(parts.join(' '));
  };
  const labelledByText = (target) => {
    const ids = String(target.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const root = target.getRootNode();
    return normalizeName(
      ids.map((id) => {
        const labelledBy = root.getElementById?.(id) || null;
        return labelledBy
          ? semanticText(labelledBy, semanticallyHidden(labelledBy))
          : '';
      }).join(' '),
    );
  };
  const nativeLabelText = (target) => normalizeName(
    Array.from(target.labels || [])
      .map((label) => semanticText(label, semanticallyHidden(label)))
      .join(' '),
  );
  const nativeCaptionText = (target) => {
    const captionTag = target.localName === 'fieldset'
      ? 'legend'
      : target.localName === 'figure'
        ? 'figcaption'
        : target.localName === 'table'
          ? 'caption'
          : '';
    if (!captionTag) return '';
    const caption = Array.from(target.children)
      .find((child) => child.localName === captionTag);
    return caption
      ? semanticText(caption, semanticallyHidden(caption))
      : '';
  };
  const nativeButtonValue = (target) => {
    if (!(target instanceof HTMLInputElement)) return '';
    const type = String(target.type || 'text').toLowerCase();
    return ['button', 'submit', 'reset'].includes(type)
      ? normalizeName(target.value)
      : '';
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
    return labelledByText(target)
      || normalizeName(target.getAttribute('aria-label'))
      || nativeLabelText(target)
      || normalizeName(target.getAttribute('alt'))
      || nativeCaptionText(target)
      || nativeButtonValue(target)
      || meaningfulContent
      || normalizeName(target.getAttribute('placeholder'))
      || normalizeName(target.getAttribute('title'))
      || content;
  };
  const interactionName = (target, includeScrollContext = false) => {
    const direct = directName(target);
    if (direct) return direct;
    if (includeScrollContext) {
      let current = composedParent(target);
      while (current instanceof Element) {
        const context = directName(current);
        if (context) return `${context} scroll area`;
        current = composedParent(current);
      }
    }
    return semanticText(target);
  };
  const renderedRectFor = (target, style = getComputedStyle(target)) => {
    const rect = target.getBoundingClientRect();
    if (
      typeof SVGGeometryElement === 'undefined'
      || !(target instanceof SVGGeometryElement)
      || (rect.width > 0 && rect.height > 0)
      || (rect.width <= 0 && rect.height <= 0)
    ) return rect;
    const parsedStrokeWidth = Number.parseFloat(style.strokeWidth);
    const thickness = (
      Number.isFinite(parsedStrokeWidth) && parsedStrokeWidth > 0
        ? parsedStrokeWidth
        : 1
    );
    const width = Math.max(rect.width, thickness);
    const height = Math.max(rect.height, thickness);
    const left = rect.left - (width - rect.width) / 2;
    const top = rect.top - (height - rect.height) / 2;
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  };
  const renderedInComposedTree = (target) => {
    let current = target;
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || style.visibility === 'collapse'
        || style.contentVisibility === 'hidden'
        || Number(style.opacity) === 0
        || current.hidden
      ) return false;
      current = composedParent(current);
    }
    return true;
  };
  const rendered = (target) => {
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return false;
    if (semanticallyHidden(target) || !renderedInComposedTree(target)) return false;
    const rect = renderedRectFor(target);
    return rect.width > 0 && rect.height > 0;
  };
  const effectivelyDisabled = (target) => Boolean(
    target.disabled === true
      || target.matches(':disabled')
      || closestComposed(target, '[aria-disabled="true"]'),
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
    allOpenComposedElements().filter((candidate) => candidate.matches(
      'dialog, [role="dialog"][aria-modal="true"]',
    )),
  ).filter((candidate) => rendered(candidate) && isActiveModalDialog(candidate));
  const modalLayerFor = (candidate) => {
    let layer = 0;
    let current = candidate;
    while (current instanceof Element) {
      const zIndex = Number.parseInt(getComputedStyle(current).zIndex, 10);
      if (Number.isFinite(zIndex)) layer = Math.max(layer, zIndex);
      current = composedParent(current);
    }
    return layer;
  };
  let activeModal = visibleModalDialogs.find((candidate) => (
    composedContains(candidate, deepActiveElement())
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
      !composedContains(activeModal, element)
      || (targetElement && !composedContains(activeModal, targetElement))
    )
  ) {
    const blockedTarget = !composedContains(activeModal, element) ? 'Element' : 'Target element';
    const blockedSelector = !composedContains(activeModal, element) ? selector : targetSelector;
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
  if (effectivelyDisabled(element) && action !== 'scrollIntoView') {
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
  const pointerVisibleRectFor = (target) => {
    const rect = renderedRectFor(target);
    let left = Math.max(0, rect.left);
    let top = Math.max(0, rect.top);
    let right = Math.min(document.documentElement.clientWidth, rect.right);
    let bottom = Math.min(document.documentElement.clientHeight, rect.bottom);
    let current = composedParent(target);
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';
      if (clipsX || clipsY) {
        const ancestorRect = renderedRectFor(current, style);
        const clipLeft = current instanceof HTMLElement
          ? ancestorRect.left + current.clientLeft
          : ancestorRect.left;
        const clipTop = current instanceof HTMLElement
          ? ancestorRect.top + current.clientTop
          : ancestorRect.top;
        const clipRight = current instanceof HTMLElement
          ? clipLeft + current.clientWidth
          : ancestorRect.right;
        const clipBottom = current instanceof HTMLElement
          ? clipTop + current.clientHeight
          : ancestorRect.bottom;
        if (clipsX) {
          left = Math.max(left, clipLeft);
          right = Math.min(right, clipRight);
        }
        if (clipsY) {
          top = Math.max(top, clipTop);
          bottom = Math.min(bottom, clipBottom);
        }
      }
      current = composedParent(current);
    }
    return right > left && bottom > top
      ? { left, top, right, bottom, width: right - left, height: bottom - top }
      : null;
  };
  const deepestElementFromPoint = (clientX, clientY) => {
    let hit = document.elementFromPoint(clientX, clientY);
    while (
      hit instanceof Element
      && hit.shadowRoot
      && typeof hit.shadowRoot.elementFromPoint === 'function'
    ) {
      const nested = hit.shadowRoot.elementFromPoint(clientX, clientY);
      if (!(nested instanceof Element) || nested === hit) break;
      hit = nested;
    }
    return hit;
  };
  const pointerHitsTarget = (target, clientX, clientY) => {
    const hit = deepestElementFromPoint(clientX, clientY);
    return {
      hit,
      reachable: hit instanceof Element && composedContains(target, hit),
    };
  };
  const automaticPointerCandidates = (visibleRect) => {
    const xs = [0.5, 0.25, 0.75, 0.1, 0.9];
    const ys = [0.5, 0.25, 0.75, 0.1, 0.9];
    const candidates = [];
    for (const y of ys) {
      for (const x of xs) {
        candidates.push({
          clientX: visibleRect.left + visibleRect.width * x,
          clientY: visibleRect.top + visibleRect.height * y,
        });
      }
    }
    return candidates;
  };
  const coordinateFor = (
    target,
    requestedX,
    requestedY,
    targetLabel,
    requireReachable = true,
  ) => {
    const rect = renderedRectFor(target);
    const offsetX = requestedX == null ? rect.width / 2 : Number(requestedX);
    const offsetY = requestedY == null ? rect.height / 2 : Number(requestedY);
    if (
      !Number.isFinite(offsetX)
      || !Number.isFinite(offsetY)
      || offsetX < 0
      || offsetY < 0
      || offsetX >= rect.width
      || offsetY >= rect.height
    ) {
      throw new Error(
        `${targetLabel} offsets must resolve inside its current ${
          rect.width.toFixed(2)
        } by ${rect.height.toFixed(2)} CSS-pixel bounds`,
      );
    }
    const explicitCoordinates = requestedX != null || requestedY != null;
    const visibleRect = pointerVisibleRectFor(target);
    if (!explicitCoordinates && !visibleRect) {
      throw new Error(`${targetLabel} has no pointer area inside the target WebView viewport and overflow clips`);
    }
    const candidates = explicitCoordinates
      ? [{ clientX: rect.left + offsetX, clientY: rect.top + offsetY }]
      : automaticPointerCandidates(visibleRect);
    const inViewport = candidates.filter((candidate) => (
      candidate.clientX >= 0
      && candidate.clientY >= 0
      && candidate.clientX < document.documentElement.clientWidth
      && candidate.clientY < document.documentElement.clientHeight
    ));
    if (inViewport.length === 0) {
      throw new Error(`${targetLabel} has no pointer coordinates inside the target WebView viewport and overflow clips`);
    }
    const resolved = requireReachable
      ? inViewport.find((candidate) => (
          pointerHitsTarget(target, candidate.clientX, candidate.clientY).reachable
        ))
      : inViewport[0];
    if (!resolved) {
      const blocker = pointerHitsTarget(
        target,
        inViewport[0].clientX,
        inViewport[0].clientY,
      ).hit;
      const blockerName = blocker instanceof Element
        ? interactionName(blocker) || blocker.localName
        : null;
      const error = new Error(
        `${targetLabel} has no reachable pointer point${
          blockerName ? `; blocked by "${blockerName}"` : ''
        }`,
      );
      error.pointerTargetObscured = true;
      error.blockerName = blockerName;
      throw error;
    }
    return {
      offsetX: resolved.clientX - rect.left,
      offsetY: resolved.clientY - rect.top,
      clientX: resolved.clientX,
      clientY: resolved.clientY,
    };
  };
  const pointerActions = [
    'click',
    'doubleClick',
    'contextClick',
    'scroll',
    'dragTo',
    'dragBy',
    'hover',
  ];
  let sourceCoordinates = null;
  let targetCoordinates = null;
  try {
    if (pointerActions.includes(action)) {
      sourceCoordinates = coordinateFor(
        element,
        requestedOffsetX,
        requestedOffsetY,
        'Element',
        !(action === 'hover' && requestedHoverState === 'leave'),
      );
    }
    if (action === 'dragTo') {
      targetCoordinates = coordinateFor(
        targetElement,
        requestedTargetOffsetX,
        requestedTargetOffsetY,
        'Target element',
      );
    }
  } catch (error) {
    const pointerTargetObscured = Boolean(error?.pointerTargetObscured);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      invalidPointerCoordinates: !pointerTargetObscured,
      pointerTargetObscured,
      blockerName: pointerTargetObscured ? error?.blockerName ?? null : null,
    };
  }
  const eventCoordinates = (target = element) => {
    if (target === element && sourceCoordinates) return sourceCoordinates;
    if (target === targetElement && targetCoordinates) return targetCoordinates;
    const rect = renderedRectFor(target);
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
  const reactValueEvent = (target, type, data = null) => ({
    type,
    target,
    currentTarget: target,
    nativeEvent: null,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    data,
    inputType: type === 'input' ? 'insertText' : null,
    propagationStopped: false,
    ...modifiers,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    isDefaultPrevented() { return this.defaultPrevented; },
    isPropagationStopped() { return this.propagationStopped; },
    persist() {},
  });
  const dispatchValueChange = (target, value) => {
    const reactProps = reactPropsFor(target);
    let handledByReact = false;
    if (typeof reactProps.onInput === 'function') {
      reactProps.onInput(reactValueEvent(target, 'input', value));
      handledByReact = true;
    }
    if (typeof reactProps.onChange === 'function') {
      reactProps.onChange(reactValueEvent(target, 'change', value));
      handledByReact = true;
    }
    if (!handledByReact) {
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: value,
      }));
      target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    return handledByReact;
  };
  const dispatchReactFocusLifecycle = (target, type, nativeTransition) => {
    const captureName = type === 'focus' ? 'onFocusCapture' : 'onBlurCapture';
    const bubbleName = type === 'focus' ? 'onFocus' : 'onBlur';
    const path = [];
    for (let current = target; current instanceof Element; current = composedParent(current)) {
      path.push({ target: current, props: reactPropsFor(current) });
    }
    const handlers = [];
    for (const entry of path) {
      for (const name of [captureName, bubbleName]) {
        if (typeof entry.props[name] === 'function') {
          handlers.push({ ...entry, name, handler: entry.props[name] });
        }
      }
    }
    let nativeHandlerCount = 0;
    for (const entry of handlers) {
      entry.props[entry.name] = (...args) => {
        nativeHandlerCount += 1;
        return entry.handler(...args);
      };
    }
    try {
      nativeTransition();
    } finally {
      for (const entry of handlers) entry.props[entry.name] = entry.handler;
    }
    if (nativeHandlerCount > 0 || handlers.length === 0) {
      return { handledByReact: nativeHandlerCount > 0, nativeHandlerCount };
    }
    const event = reactValueEvent(target, type);
    for (const entry of [...path].reverse()) {
      const handler = entry.props[captureName];
      if (typeof handler !== 'function') continue;
      event.currentTarget = entry.target;
      handler(event);
      if (event.isPropagationStopped()) return { handledByReact: true, nativeHandlerCount: 0 };
    }
    for (const entry of path) {
      const handler = entry.props[bubbleName];
      if (typeof handler !== 'function') continue;
      event.currentTarget = entry.target;
      handler(event);
      if (event.isPropagationStopped()) break;
    }
    return { handledByReact: true, nativeHandlerCount: 0 };
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
    const changed = element.checked !== Boolean(checked) || element.indeterminate;
    setter.call(element, Boolean(checked));
    element.indeterminate = false;
    const reactProps = reactPropsFor(element);
    let handledByReact = false;
    if (includeClick && typeof reactProps.onClick === 'function') {
      reactProps.onClick(reactValueEvent(element, 'click'));
      handledByReact = true;
    }
    if (typeof reactProps.onChange === 'function') {
      reactProps.onChange(reactValueEvent(element, 'change'));
      handledByReact = true;
    }
    if (!handledByReact) {
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
    if (action === 'setValue' || (action === 'keyPress' && changed)) {
      valueHandledByReact = handledByReact;
    }
    if (action === 'keyPress' && changed) {
      valueCommitMethod = 'change';
      pendingValueChangeConfirmation = () => (
        element.isConnected
        && element.checked === Boolean(checked)
        && !element.indeterminate
      );
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
      && requestedOffsetX == null
      && requestedOffsetY == null
      && typeof element.click === 'function'
    ) element.click();
    else dispatchPointer('click', 0, 0, detail);
  };
  let performedDragPath = null;
  let performedHoverState = null;
  let hoverStateChanged = null;
  let scrollIntoViewChanged = null;
  let revealedRect = null;
  let pendingValueBlur = false;
  let valueCommitMethod = null;
  let valueCommitConfirmed = null;
  let pendingValueChangeConfirmation = null;
  let valueHandledByReact = null;
  let valueDraftSynchronized = null;
  let valueFocusHandledByReact = null;
  let valueBlurHandledByReact = null;
  let performedSettledFrames = 0;
  let pendingFocusTarget = null;
  let keyboardValueTarget = false;
  let semanticClipboardOperation = null;
  let semanticClipboardLength = null;
  let performedTextHistoryOperation = null;
  let textHistoryApplied = null;
  let textHistoryUndoDepth = null;
  let textHistoryRedoDepth = null;
  const semanticTextHistoryKey = Symbol.for('mengine.agent.textHistory');
  const semanticTextHistoryInputTypes = ['text', 'search', 'email', 'url', 'tel'];
  const isSemanticTextHistoryTarget = (target) => (
    (
      target instanceof HTMLInputElement
      && semanticTextHistoryInputTypes.includes(String(target.type).toLowerCase())
    )
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
  );
  let semanticTextHistoryRegistry = window[semanticTextHistoryKey];
  if (!(semanticTextHistoryRegistry instanceof WeakMap)) {
    semanticTextHistoryRegistry = new WeakMap();
    window[semanticTextHistoryKey] = semanticTextHistoryRegistry;
  }
  const clearSemanticTextHistory = (target) => {
    if (isSemanticTextHistoryTarget(target)) semanticTextHistoryRegistry.delete(target);
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
    const path = Array.isArray(requestedPath)
      ? requestedPath.map((point) => ({
          deltaX: Number(point?.deltaX),
          deltaY: Number(point?.deltaY),
        }))
      : [{
          deltaX: Number(requestedDeltaX),
          deltaY: Number(requestedDeltaY),
        }];
    const buttonName = requestedButton ?? 'left';
    const button = buttonName === 'middle' ? 1 : buttonName === 'right' ? 2 : 0;
    const heldButtons = button === 1 ? 4 : button === 2 ? 2 : 1;
    if (
      path.length < 1
      || path.length > 64
      || path.some((point) => (
        !Number.isFinite(point.deltaX)
        || !Number.isFinite(point.deltaY)
        || Math.abs(point.deltaX) > 1000000
        || Math.abs(point.deltaY) > 1000000
      ))
      || !path.some((point) => point.deltaX !== 0 || point.deltaY !== 0)
    ) {
      return { ok: false, error: 'dragBy requires 1 to 64 finite path points with a non-zero displacement' };
    }
    const start = sourceCoordinates;
    const resolvedPath = path.map((point) => ({
      clientX: start.clientX + point.deltaX,
      clientY: start.clientY + point.deltaY,
    }));
    if (resolvedPath.some((point) => (
      point.clientX < 0
      || point.clientY < 0
      || point.clientX >= document.documentElement.clientWidth
      || point.clientY >= document.documentElement.clientHeight
    ))) {
      return {
        ok: false,
        error: 'Every dragBy path point must stay inside the target WebView viewport',
      };
    }
    performedDragPath = path;
    const end = resolvedPath[resolvedPath.length - 1];
    const reactProps = reactPropsFor(element);
    const gestureHint = String(
      `${element.getAttribute('aria-label') || ''} `
        + `${element.getAttribute('title') || ''} ${element.className || ''}`,
    ).toLocaleLowerCase();
    const explicitDragBy = element.getAttribute('data-agent-drag-by') === 'true';
    const pointerGesture = typeof reactProps.onPointerDown === 'function' && (
      explicitDragBy
      || typeof reactProps.onPointerMove === 'function'
      || typeof reactProps.onPointerUp === 'function'
      || typeof reactProps.onPointerCancel === 'function'
      || /drag|scrub|resize|拖|调整|调节/.test(gestureHint)
    );
    const mouseGesture = typeof reactProps.onMouseDown === 'function'
      && typeof reactProps.onClick !== 'function';
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
      dispatchPointerAt(element, 'pointerdown', button, heldButtons, 1, start);
      dispatchPointerAt(element, 'mousedown', button, heldButtons, 1, start);
      let previous = { deltaX: 0, deltaY: 0 };
      for (const point of path) {
        const segmentX = point.deltaX - previous.deltaX;
        const segmentY = point.deltaY - previous.deltaY;
        const distance = Math.hypot(segmentX, segmentY);
        const steps = Math.max(2, Math.min(8, Math.ceil(distance / 20)));
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          const coordinates = {
            clientX: start.clientX + previous.deltaX + segmentX * progress,
            clientY: start.clientY + previous.deltaY + segmentY * progress,
          };
          dispatchPointerAt(element, 'pointermove', -1, heldButtons, 1, coordinates);
          dispatchPointerAt(element, 'mousemove', 0, heldButtons, 1, coordinates);
        }
        previous = point;
      }
      dispatchPointerAt(element, 'pointerup', button, 0, 1, end);
      dispatchPointerAt(element, 'mouseup', button, 0, 1, end);
    } finally {
      captureMethods.forEach(([name], index) => {
        const descriptor = captureDescriptors[index];
        if (descriptor) Object.defineProperty(element, name, descriptor);
        else delete element[name];
      });
    }
  } else if (action === 'hover') {
    const reactProps = reactPropsFor(element);
    performedHoverState = requestedHoverState ?? 'enter';
    const hoverState = Symbol.for('mengine.agent.hoveredElement');
    const storedHover = window[hoverState];
    const previous = storedHover instanceof Element && storedHover.isConnected
      ? storedHover
      : null;
    const dispatchLeave = (target, relatedTarget) => {
      const props = reactPropsFor(target);
      if (typeof props.onPointerOut === 'function') {
        props.onPointerOut(reactHoverEvent(target, 'pointerout', relatedTarget));
      }
      if (typeof props.onPointerLeave === 'function') {
        props.onPointerLeave(reactHoverEvent(target, 'pointerleave', relatedTarget));
      }
      if (typeof props.onMouseOut === 'function') {
        props.onMouseOut(reactHoverEvent(target, 'mouseout', relatedTarget));
      }
      if (typeof props.onMouseLeave === 'function') {
        props.onMouseLeave(reactHoverEvent(target, 'mouseleave', relatedTarget));
      }
    };
    if (performedHoverState === 'leave') {
      if (previous && previous !== element) {
        return {
          ok: false,
          error: `Element ${selector} is not the current semantic hover target`,
          hoverTargetMismatch: true,
        };
      }
      if (previous) dispatchLeave(previous, null);
      window[hoverState] = null;
      hoverStateChanged = previous !== null;
    } else {
      if (
        typeof reactProps.onPointerEnter !== 'function'
        && typeof reactProps.onPointerOver !== 'function'
        && typeof reactProps.onMouseEnter !== 'function'
        && typeof reactProps.onMouseOver !== 'function'
      ) {
        return { ok: false, error: `Element ${selector} has no semantic hover interaction` };
      }
      if (
        previous
        && previous !== element
        && !composedContains(previous, element)
      ) {
        dispatchLeave(previous, element);
      }
      if (previous !== element) {
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
      }
      hoverStateChanged = previous !== element;
    }
  } else if (action === 'setValue') {
    if (element.readOnly || element.getAttribute('aria-readonly') === 'true') {
      return { ok: false, error: `Element ${selector} is read-only` };
    }
    const value = requestedValue == null ? '' : String(requestedValue);
    const beginBlurCommit = () => {
      if (typeof element.focus !== 'function') return false;
      const focusLifecycle = dispatchReactFocusLifecycle(
        element,
        'focus',
        () => element.focus({ preventScroll: true }),
      );
      valueFocusHandledByReact = focusLifecycle.handledByReact;
      if (deepActiveElement() !== element) return false;
      pendingValueBlur = true;
      return true;
    };
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
      valueCommitMethod = 'change';
      valueCommitConfirmed = true;
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
        setter.call(element, previousValue);
        if (validityIssues.length > 0) {
          return constraintFailure(validityIssues);
        }
        if (!beginBlurCommit()) {
          return { ok: false, error: `Element ${selector} could not receive edit focus` };
        }
        clearSemanticTextHistory(element);
        setter.call(element, valueToApply);
        valueHandledByReact = dispatchValueChange(element, valueToApply);
      } else if (element.isContentEditable) {
        if (!beginBlurCommit()) {
          return { ok: false, error: `Element ${selector} could not receive edit focus` };
        }
        clearSemanticTextHistory(element);
        element.textContent = value;
        valueHandledByReact = dispatchValueChange(element, value);
      } else {
        return { ok: false, error: `Element ${selector} does not accept a value` };
      }
    }
  } else if (action === 'keyPress') {
    const keyboardInputType = element instanceof HTMLInputElement
      ? String(element.type || 'text').toLowerCase()
      : '';
    const keyboardReadOnly = Boolean(
      element.readOnly || element.getAttribute('aria-readonly') === 'true',
    );
    keyboardValueTarget = !keyboardReadOnly && (
      (
        element instanceof HTMLInputElement
        && ![
          'button',
          'submit',
          'reset',
          'file',
          'image',
          'checkbox',
          'radio',
        ].includes(keyboardInputType)
      )
        || element instanceof HTMLTextAreaElement
        || element instanceof HTMLSelectElement
        || (element instanceof HTMLElement && element.isContentEditable)
      );
    const printableKey = (
      typeof requestedKey === 'string'
      && Array.from(requestedKey).length === 1
      && !/[\p{Cc}\p{Cs}\p{Z}]/u.test(requestedKey)
    );
    const key = requestedKey === 'Space' ? ' ' : String(requestedKey || '');
    const primaryTextShortcut = (
      !modifiers.altKey
      && modifiers.ctrlKey !== modifiers.metaKey
    );
    const semanticClipboardKey = Symbol.for('mengine.agent.textClipboard');
    const readSemanticClipboard = () => (
      typeof window[semanticClipboardKey] === 'string'
        ? window[semanticClipboardKey]
        : ''
    );
    const writeSemanticClipboard = (text) => {
      window[semanticClipboardKey] = String(text);
      return window[semanticClipboardKey].length;
    };
    const primaryClipboardShortcut = (
      primaryTextShortcut
      && !modifiers.shiftKey
      && ['c', 'x', 'v'].includes(key.toLowerCase())
    );
    const clipboardCommand = primaryClipboardShortcut
      ? key.toLowerCase()
      : null;
    const selectAllShortcut = (
      key.toLowerCase() === 'a'
      && !modifiers.shiftKey
      && primaryTextShortcut
    );
    const requestedTextHistoryOperation = primaryTextShortcut && (
      (
        key.toLowerCase() === 'z'
        && !modifiers.shiftKey
        && 'undo'
      )
      || (
        (
          (key.toLowerCase() === 'y' && !modifiers.shiftKey)
          || (key.toLowerCase() === 'z' && modifiers.shiftKey)
        )
        && 'redo'
      )
    ) || null;
    const textHistoryMaxEntries = 64;
    const textHistoryMaxCharacters = 1000000;
    const textHistoryStateFor = (target) => {
      let state = semanticTextHistoryRegistry.get(target);
      if (!state) {
        state = { undo: [], redo: [] };
        semanticTextHistoryRegistry.set(target, state);
      }
      return state;
    };
    const textHistorySnapshotCost = (snapshot) => (
      snapshot?.kind === 'contenteditable'
        ? String(snapshot.html ?? '').length
        : String(snapshot?.value ?? '').length
    );
    const textHistoryStackCost = (stack) => stack.reduce(
      (total, snapshot) => total + textHistorySnapshotCost(snapshot),
      0,
    );
    const sameTextHistorySnapshot = (left, right) => (
      left?.kind === right?.kind
      && (
        left?.kind === 'contenteditable'
          ? (
              left.html === right.html
              && left.anchor === right.anchor
              && left.focus === right.focus
            )
          : (
              left?.value === right?.value
              && left?.start === right?.start
              && left?.end === right?.end
              && left?.direction === right?.direction
            )
      )
    );
    const pushTextHistorySnapshot = (stack, snapshot) => {
      if (!snapshot || textHistorySnapshotCost(snapshot) > textHistoryMaxCharacters) {
        return false;
      }
      if (sameTextHistorySnapshot(stack[stack.length - 1], snapshot)) return true;
      stack.push(snapshot);
      while (
        stack.length > textHistoryMaxEntries
        || textHistoryStackCost(stack) > textHistoryMaxCharacters
      ) stack.shift();
      return stack.includes(snapshot);
    };
    const contentEditableTextOffset = (target, node, offset) => {
      if (
        !node
        || !(
          node === target
          || target.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
        )
      ) return null;
      const range = document.createRange();
      range.selectNodeContents(target);
      try {
        range.setEnd(node, offset);
        return String(range.cloneContents().textContent ?? '').length;
      } catch {
        return null;
      }
    };
    const contentEditableTextPoint = (target, rawOffset) => {
      const textLength = String(target.textContent ?? '').length;
      let remaining = Math.max(0, Math.min(textLength, Number(rawOffset)));
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let last = null;
      while (node) {
        last = node;
        const nodeLength = String(node.textContent ?? '').length;
        if (remaining <= nodeLength) return { node, offset: remaining };
        remaining -= nodeLength;
        node = walker.nextNode();
      }
      return last
        ? { node: last, offset: String(last.textContent ?? '').length }
        : { node: target, offset: 0 };
    };
    const restoreContentEditableSelection = (target, anchor, focus) => {
      const selection = window.getSelection();
      if (!selection) return false;
      const anchorPoint = contentEditableTextPoint(target, anchor);
      const focusPoint = contentEditableTextPoint(target, focus);
      const range = document.createRange();
      range.setStart(anchorPoint.node, anchorPoint.offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      if (typeof selection.extend === 'function') {
        selection.extend(focusPoint.node, focusPoint.offset);
      } else {
        range.setEnd(focusPoint.node, focusPoint.offset);
      }
      return true;
    };
    const captureTextHistorySnapshot = (target) => {
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
      ) {
        if (
          target instanceof HTMLInputElement
          && String(target.type).toLowerCase() === 'password'
        ) return null;
        let start;
        let end;
        let direction;
        try {
          start = target.selectionStart;
          end = target.selectionEnd;
          direction = target.selectionDirection || 'none';
        } catch {
          return null;
        }
        if (typeof start !== 'number' || typeof end !== 'number') return null;
        return {
          kind: 'value',
          value: String(target.value),
          start,
          end,
          direction,
        };
      }
      if (!(target instanceof HTMLElement) || !target.isContentEditable) return null;
      const selection = window.getSelection();
      const textLength = String(target.textContent ?? '').length;
      const anchor = selection
        ? contentEditableTextOffset(target, selection.anchorNode, selection.anchorOffset)
        : null;
      const focus = selection
        ? contentEditableTextOffset(target, selection.focusNode, selection.focusOffset)
        : null;
      return {
        kind: 'contenteditable',
        html: target.innerHTML,
        anchor: anchor ?? textLength,
        focus: focus ?? textLength,
      };
    };
    const restoreTextHistorySnapshot = (target, snapshot) => {
      if (
        snapshot?.kind === 'value'
        && (
          target instanceof HTMLInputElement
          || target instanceof HTMLTextAreaElement
        )
      ) {
        const prototype = target instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(target, snapshot.value);
        try {
          target.setSelectionRange(
            snapshot.start,
            snapshot.end,
            snapshot.direction,
          );
        } catch {
          return false;
        }
        valueHandledByReact = dispatchValueChange(target, snapshot.value);
        if (target.isConnected) {
          target.setSelectionRange(
            snapshot.start,
            snapshot.end,
            snapshot.direction,
          );
        }
        valueCommitMethod = 'change';
        pendingValueChangeConfirmation = () => (
          target.isConnected && String(target.value) === snapshot.value
        );
        return true;
      }
      if (
        snapshot?.kind === 'contenteditable'
        && target instanceof HTMLElement
        && target.isContentEditable
      ) {
        target.innerHTML = snapshot.html;
        restoreContentEditableSelection(target, snapshot.anchor, snapshot.focus);
        valueHandledByReact = dispatchValueChange(
          target,
          String(target.textContent ?? ''),
        );
        if (target.isConnected) {
          restoreContentEditableSelection(target, snapshot.anchor, snapshot.focus);
        }
        valueCommitMethod = 'change';
        pendingValueChangeConfirmation = () => (
          target.isConnected && target.innerHTML === snapshot.html
        );
        return true;
      }
      return false;
    };
    const recordTextHistoryMutation = (target, snapshot) => {
      const state = textHistoryStateFor(target);
      state.redo.length = 0;
      pushTextHistorySnapshot(state.undo, snapshot);
    };
    const applyTextHistoryOperation = (target, operation) => {
      performedTextHistoryOperation = operation;
      const state = textHistoryStateFor(target);
      const source = operation === 'undo' ? state.undo : state.redo;
      const destination = operation === 'undo' ? state.redo : state.undo;
      textHistoryApplied = false;
      textHistoryUndoDepth = state.undo.length;
      textHistoryRedoDepth = state.redo.length;
      if (keyboardReadOnly || source.length === 0) return true;
      const current = captureTextHistorySnapshot(target);
      const snapshot = source[source.length - 1];
      if (
        !current
        || !snapshot
        || textHistorySnapshotCost(current) > textHistoryMaxCharacters
      ) return true;
      const beforeInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: operation === 'undo' ? 'historyUndo' : 'historyRedo',
        data: null,
      });
      if (!target.dispatchEvent(beforeInput)) return true;
      if (!restoreTextHistorySnapshot(target, snapshot)) return true;
      source.pop();
      pushTextHistorySnapshot(destination, current);
      delete target[Symbol.for('mengine.agent.textVerticalColumn')];
      textHistoryApplied = true;
      textHistoryUndoDepth = state.undo.length;
      textHistoryRedoDepth = state.redo.length;
      return true;
    };
    const graphemeBoundaries = (rawText) => {
      const text = String(rawText ?? '');
      const boundaries = [0];
      if (typeof Intl.Segmenter === 'function') {
        const segments = new Intl.Segmenter(undefined, {
          granularity: 'grapheme',
        }).segment(text);
        for (const segment of segments) {
          const end = segment.index + segment.segment.length;
          if (end > boundaries[boundaries.length - 1]) boundaries.push(end);
        }
      } else {
        let offset = 0;
        for (const codePoint of Array.from(text)) {
          offset += codePoint.length;
          boundaries.push(offset);
        }
      }
      if (boundaries[boundaries.length - 1] !== text.length) {
        boundaries.push(text.length);
      }
      return boundaries;
    };
    const previousGraphemeBoundary = (boundaries, rawOffset) => {
      const offset = Number(rawOffset);
      for (let index = boundaries.length - 1; index >= 0; index -= 1) {
        if (boundaries[index] < offset) return boundaries[index];
      }
      return 0;
    };
    const nextGraphemeBoundary = (boundaries, rawOffset) => {
      const offset = Number(rawOffset);
      for (const boundary of boundaries) {
        if (boundary > offset) return boundary;
      }
      return boundaries[boundaries.length - 1] ?? 0;
    };
    const floorGraphemeBoundary = (boundaries, rawOffset) => {
      const offset = Number(rawOffset);
      for (let index = boundaries.length - 1; index >= 0; index -= 1) {
        if (boundaries[index] <= offset) return boundaries[index];
      }
      return 0;
    };
    const wordStarts = (rawText) => {
      const text = String(rawText ?? '');
      const starts = [];
      if (typeof Intl.Segmenter === 'function') {
        const segments = new Intl.Segmenter(undefined, {
          granularity: 'word',
        }).segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) starts.push(segment.index);
        }
      } else {
        let offset = 0;
        let insideWord = false;
        for (const codePoint of Array.from(text)) {
          const wordLike = /[\p{L}\p{N}\p{M}_]/u.test(codePoint);
          if (wordLike && !insideWord) starts.push(offset);
          insideWord = wordLike;
          offset += codePoint.length;
        }
      }
      return starts;
    };
    const previousWordBoundary = (starts, rawOffset) => {
      const offset = Number(rawOffset);
      for (let index = starts.length - 1; index >= 0; index -= 1) {
        if (starts[index] < offset) return starts[index];
      }
      return 0;
    };
    const nextWordBoundary = (starts, rawOffset, length) => {
      const offset = Number(rawOffset);
      for (const start of starts) {
        if (start > offset) return start;
      }
      return length;
    };
    const primaryTextDefault = (
      primaryTextShortcut
      && (
        requestedTextHistoryOperation !== null
        ||
        primaryClipboardShortcut
        || [
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'Backspace',
          'Delete',
        ].includes(requestedKey)
      )
    );
    if (
      primaryClipboardShortcut
      && element instanceof HTMLInputElement
      && String(element.type).toLowerCase() === 'password'
    ) {
      return {
        ok: false,
        error: 'Password fields cannot use the Agent private text clipboard',
        clipboardDenied: true,
      };
    }
    if (
      requestedTextHistoryOperation
      && element instanceof HTMLInputElement
      && String(element.type).toLowerCase() === 'password'
    ) {
      return {
        ok: false,
        error: 'Password fields cannot use the Agent private text history',
        textHistoryDenied: true,
      };
    }
    const code = requestedKey === 'Space'
      ? 'Space'
      : /^[A-Za-z]$/.test(key)
        ? `Key${key.toUpperCase()}`
        : /^[0-9]$/.test(key)
          ? `Digit${key}`
          : key;
    if (typeof element.focus === 'function') {
      const focusLifecycle = dispatchReactFocusLifecycle(
        element,
        'focus',
        () => element.focus({ preventScroll: true }),
      );
      valueFocusHandledByReact = focusLifecycle.handledByReact;
      if (deepActiveElement() !== element) {
        return { ok: false, error: `Element ${selector} could not receive keyboard focus` };
      }
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
    if (
      requestedKey === 'Enter'
      || requestedKey === 'Space'
      || (
        printableKey
        && !modifiers.ctrlKey
        && !modifiers.altKey
        && !modifiers.metaKey
      )
    ) {
      dispatchKeyboard('keypress');
    }
    const applyTextControlDefault = () => {
      const password = element instanceof HTMLInputElement
        && String(element.type).toLowerCase() === 'password';
      if (
        password
        || !(
          element instanceof HTMLInputElement
          || element instanceof HTMLTextAreaElement
        )
      ) return false;
      let start;
      let end;
      let direction;
      try {
        start = element.selectionStart;
        end = element.selectionEnd;
        direction = element.selectionDirection || 'none';
      } catch {
        return false;
      }
      if (typeof start !== 'number' || typeof end !== 'number') return false;
      if (requestedTextHistoryOperation) {
        return applyTextHistoryOperation(element, requestedTextHistoryOperation);
      }
      const length = element.value.length;
      const boundaries = graphemeBoundaries(element.value);
      const starts = wordStarts(element.value);
      const setSelection = (anchor, focus) => {
        const boundedAnchor = Math.max(0, Math.min(length, anchor));
        const boundedFocus = Math.max(0, Math.min(length, focus));
        const nextDirection = boundedFocus < boundedAnchor
          ? 'backward'
          : boundedFocus > boundedAnchor
            ? 'forward'
            : 'none';
        element.setSelectionRange(
          Math.min(boundedAnchor, boundedFocus),
          Math.max(boundedAnchor, boundedFocus),
          nextDirection,
        );
      };
      if (selectAllShortcut) {
        setSelection(0, length);
        return true;
      }
      if (
        (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey)
        && !primaryTextDefault
      ) return false;
      const anchor = direction === 'backward' ? end : start;
      const focus = direction === 'backward' ? start : end;
      const verticalColumnKey = Symbol.for('mengine.agent.textVerticalColumn');
      if (clipboardCommand === 'c') {
        if (start !== end) {
          writeSemanticClipboard(element.value.slice(start, end));
        }
        semanticClipboardOperation = 'copy';
        semanticClipboardLength = readSemanticClipboard().length;
        return true;
      }
      if (clipboardCommand === 'x') {
        if (!keyboardReadOnly && start !== end) {
          writeSemanticClipboard(element.value.slice(start, end));
        }
        semanticClipboardOperation = 'cut';
        semanticClipboardLength = readSemanticClipboard().length;
        if (keyboardReadOnly || start === end) return true;
      }
      if (clipboardCommand === 'v') {
        semanticClipboardOperation = 'paste';
        semanticClipboardLength = readSemanticClipboard().length;
        if (keyboardReadOnly) return true;
      }
      if (requestedKey === 'ArrowLeft') {
        delete element[verticalColumnKey];
        if (modifiers.shiftKey) {
          setSelection(
            anchor,
            primaryTextShortcut
              ? previousWordBoundary(starts, focus)
              : previousGraphemeBoundary(boundaries, focus),
          );
        } else {
          const caret = start === end
            ? primaryTextShortcut
              ? previousWordBoundary(starts, start)
              : previousGraphemeBoundary(boundaries, start)
            : start;
          setSelection(caret, caret);
        }
        return true;
      }
      if (requestedKey === 'ArrowRight') {
        delete element[verticalColumnKey];
        if (modifiers.shiftKey) {
          setSelection(
            anchor,
            primaryTextShortcut
              ? nextWordBoundary(starts, focus, length)
              : nextGraphemeBoundary(boundaries, focus),
          );
        } else {
          const caret = start === end
            ? primaryTextShortcut
              ? nextWordBoundary(starts, end, length)
              : nextGraphemeBoundary(boundaries, end)
            : end;
          setSelection(caret, caret);
        }
        return true;
      }
      if (
        element instanceof HTMLTextAreaElement
        && [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
        ].includes(requestedKey)
      ) {
        const lineStarts = [0];
        for (let index = 0; index < element.value.length; index += 1) {
          if (element.value[index] === '\n') lineStarts.push(index + 1);
        }
        let currentLine = 0;
        while (
          currentLine + 1 < lineStarts.length
          && lineStarts[currentLine + 1] <= focus
        ) {
          currentLine += 1;
        }
        const currentColumn = focus - lineStarts[currentLine];
        const storedColumn = element[verticalColumnKey];
        const preferredColumn = (
          storedColumn
          && storedColumn.position === focus
          && storedColumn.lineStart === lineStarts[currentLine]
          && Number.isInteger(storedColumn.column)
          && storedColumn.column >= 0
        )
          ? storedColumn.column
          : currentColumn;
        const lineDelta = requestedKey === 'ArrowUp'
          ? -1
          : requestedKey === 'ArrowDown'
            ? 1
            : requestedKey === 'PageUp'
              ? -10
              : 10;
        const targetLine = Math.max(
          0,
          Math.min(lineStarts.length - 1, currentLine + lineDelta),
        );
        const targetLineStart = lineStarts[targetLine];
        const nextLineStart = lineStarts[targetLine + 1];
        const targetLineEnd = nextLineStart === undefined
          ? length
          : Math.max(targetLineStart, nextLineStart - 1);
        const target = floorGraphemeBoundary(
          boundaries,
          Math.min(targetLineEnd, targetLineStart + preferredColumn),
        );
        element[verticalColumnKey] = {
          column: preferredColumn,
          position: target,
          lineStart: targetLineStart,
        };
        if (modifiers.shiftKey) setSelection(anchor, target);
        else setSelection(target, target);
        return true;
      }
      if (requestedKey === 'Home') {
        delete element[verticalColumnKey];
        const lineStart = primaryTextShortcut
          ? 0
          : element instanceof HTMLTextAreaElement
            ? element.value.lastIndexOf('\n', Math.max(0, focus - 1)) + 1
            : 0;
        if (modifiers.shiftKey) setSelection(anchor, lineStart);
        else setSelection(lineStart, lineStart);
        return true;
      }
      if (requestedKey === 'End') {
        delete element[verticalColumnKey];
        const nextLineBreak = !primaryTextShortcut && element instanceof HTMLTextAreaElement
          ? element.value.indexOf('\n', focus)
          : -1;
        const lineEnd = nextLineBreak < 0 ? length : nextLineBreak;
        if (modifiers.shiftKey) setSelection(anchor, lineEnd);
        else setSelection(lineEnd, lineEnd);
        return true;
      }
      let replacement = null;
      let replacementStart = start;
      let replacementEnd = end;
      let inputType = 'insertText';
      if (clipboardCommand === 'x') {
        replacement = '';
        inputType = 'deleteByCut';
      } else if (clipboardCommand === 'v') {
        replacement = readSemanticClipboard();
        inputType = 'insertFromPaste';
      } else if (printableKey) {
        replacement = key;
      } else if (requestedKey === 'Space') {
        replacement = ' ';
      } else if (
        requestedKey === 'Enter'
        && element instanceof HTMLTextAreaElement
      ) {
        replacement = '\n';
        inputType = 'insertLineBreak';
      } else if (requestedKey === 'Backspace') {
        if (keyboardReadOnly) return true;
        if (start === end && start === 0) return true;
        inputType = primaryTextShortcut
          ? 'deleteWordBackward'
          : 'deleteContentBackward';
        if (start === end) {
          replacementStart = primaryTextShortcut
            ? previousWordBoundary(starts, start)
            : previousGraphemeBoundary(boundaries, start);
        }
        replacement = '';
      } else if (requestedKey === 'Delete') {
        if (keyboardReadOnly) return true;
        if (start === end && end === length) return true;
        inputType = primaryTextShortcut
          ? 'deleteWordForward'
          : 'deleteContentForward';
        if (start === end) {
          replacementEnd = primaryTextShortcut
            ? nextWordBoundary(starts, end, length)
            : nextGraphemeBoundary(boundaries, end);
        }
        replacement = '';
      } else {
        return false;
      }
      delete element[verticalColumnKey];
      if (keyboardReadOnly) return true;
      const prototype = element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) return false;
      const nextValue = `${element.value.slice(0, replacementStart)}${
        replacement
      }${element.value.slice(replacementEnd)}`;
      if (element.maxLength >= 0 && nextValue.length > element.maxLength) return true;
      const beforeInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType,
        data: replacement || null,
      });
      if (!element.dispatchEvent(beforeInput)) return true;
      const caret = replacementStart + replacement.length;
      if (nextValue !== element.value || start !== caret || end !== caret) {
        recordTextHistoryMutation(element, captureTextHistorySnapshot(element));
      }
      setter.call(element, nextValue);
      element.setSelectionRange(caret, caret, 'none');
      valueHandledByReact = dispatchValueChange(element, nextValue);
      if (element.isConnected) element.setSelectionRange(caret, caret, 'none');
      return true;
    };
    const handledTextDefault = acceptsDefault && applyTextControlDefault();
    const applyContentEditableDefault = () => {
      if (
        !(element instanceof HTMLElement)
        || !element.isContentEditable
      ) return false;
      const selection = window.getSelection();
      if (!selection) return false;
      if (requestedTextHistoryOperation) {
        return applyTextHistoryOperation(element, requestedTextHistoryOperation);
      }
      if (selectAllShortcut) {
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      if (
        (
          (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey)
          && !primaryTextDefault
        )
        || selection.rangeCount === 0
      ) return false;
      const pointInside = (node) => Boolean(
        node
        && (
          node === element
          || element.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
        )
      );
      if (!pointInside(selection.anchorNode) || !pointInside(selection.focusNode)) return false;
      const textOffset = (node, offset) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        try {
          range.setEnd(node, offset);
          return String(range.cloneContents().textContent ?? '').length;
        } catch {
          return null;
        }
      };
      const anchor = textOffset(selection.anchorNode, selection.anchorOffset);
      const focus = textOffset(selection.focusNode, selection.focusOffset);
      if (anchor === null || focus === null) return false;
      const text = String(element.textContent ?? '');
      const length = text.length;
      const boundaries = graphemeBoundaries(text);
      const starts = wordStarts(text);
      const textPointAt = (rawOffset) => {
        const targetOffset = Math.max(0, Math.min(length, rawOffset));
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let remaining = targetOffset;
        let node = walker.nextNode();
        let last = null;
        while (node) {
          last = node;
          const nodeLength = String(node.textContent ?? '').length;
          if (remaining <= nodeLength) return { node, offset: remaining };
          remaining -= nodeLength;
          node = walker.nextNode();
        }
        return last
          ? { node: last, offset: String(last.textContent ?? '').length }
          : { node: element, offset: 0 };
      };
      const setSelection = (nextAnchor, nextFocus) => {
        const anchorPoint = textPointAt(nextAnchor);
        const focusPoint = textPointAt(nextFocus);
        const range = document.createRange();
        range.setStart(anchorPoint.node, anchorPoint.offset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        if (typeof selection.extend === 'function') {
          selection.extend(focusPoint.node, focusPoint.offset);
        } else {
          range.setEnd(focusPoint.node, focusPoint.offset);
        }
      };
      const start = Math.min(anchor, focus);
      const end = Math.max(anchor, focus);
      const verticalColumnKey = Symbol.for('mengine.agent.textVerticalColumn');
      if (clipboardCommand === 'c') {
        if (start !== end) {
          writeSemanticClipboard(text.slice(start, end));
        }
        semanticClipboardOperation = 'copy';
        semanticClipboardLength = readSemanticClipboard().length;
        return true;
      }
      if (clipboardCommand === 'x') {
        if (!keyboardReadOnly && start !== end) {
          writeSemanticClipboard(text.slice(start, end));
        }
        semanticClipboardOperation = 'cut';
        semanticClipboardLength = readSemanticClipboard().length;
        if (keyboardReadOnly || start === end) return true;
      }
      if (clipboardCommand === 'v') {
        semanticClipboardOperation = 'paste';
        semanticClipboardLength = readSemanticClipboard().length;
        if (keyboardReadOnly) return true;
      }
      if (requestedKey === 'ArrowLeft' || requestedKey === 'ArrowRight') {
        delete element[verticalColumnKey];
        const nextFocus = requestedKey === 'ArrowLeft'
          ? primaryTextShortcut
            ? previousWordBoundary(starts, focus)
            : previousGraphemeBoundary(boundaries, focus)
          : primaryTextShortcut
            ? nextWordBoundary(starts, focus, length)
            : nextGraphemeBoundary(boundaries, focus);
        if (modifiers.shiftKey) setSelection(anchor, nextFocus);
        else {
          const caret = start === end
            ? nextFocus
            : requestedKey === 'ArrowLeft'
              ? start
              : end;
          setSelection(caret, caret);
        }
        return true;
      }
      if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(requestedKey)
      ) {
        const lineStarts = [0];
        for (let index = 0; index < text.length; index += 1) {
          if (text[index] === '\n') lineStarts.push(index + 1);
        }
        let currentLine = 0;
        while (
          currentLine + 1 < lineStarts.length
          && lineStarts[currentLine + 1] <= focus
        ) {
          currentLine += 1;
        }
        const currentColumn = focus - lineStarts[currentLine];
        const storedColumn = element[verticalColumnKey];
        const preferredColumn = (
          storedColumn
          && storedColumn.position === focus
          && storedColumn.lineStart === lineStarts[currentLine]
          && Number.isInteger(storedColumn.column)
          && storedColumn.column >= 0
        )
          ? storedColumn.column
          : currentColumn;
        const lineDelta = requestedKey === 'ArrowUp'
          ? -1
          : requestedKey === 'ArrowDown'
            ? 1
            : requestedKey === 'PageUp'
              ? -10
              : 10;
        const targetLine = Math.max(
          0,
          Math.min(lineStarts.length - 1, currentLine + lineDelta),
        );
        const targetLineStart = lineStarts[targetLine];
        const nextLineStart = lineStarts[targetLine + 1];
        const targetLineEnd = nextLineStart === undefined
          ? length
          : Math.max(targetLineStart, nextLineStart - 1);
        const target = floorGraphemeBoundary(
          boundaries,
          Math.min(targetLineEnd, targetLineStart + preferredColumn),
        );
        element[verticalColumnKey] = {
          column: preferredColumn,
          position: target,
          lineStart: targetLineStart,
        };
        if (modifiers.shiftKey) setSelection(anchor, target);
        else setSelection(target, target);
        return true;
      }
      if (requestedKey === 'Home' || requestedKey === 'End') {
        delete element[verticalColumnKey];
        const lineStart = text.lastIndexOf('\n', Math.max(0, focus - 1)) + 1;
        const nextLineBreak = text.indexOf('\n', focus);
        const lineEnd = nextLineBreak < 0 ? length : nextLineBreak;
        const target = requestedKey === 'Home'
          ? primaryTextShortcut
            ? 0
            : lineStart
          : primaryTextShortcut
            ? length
            : lineEnd;
        if (modifiers.shiftKey) setSelection(anchor, target);
        else setSelection(target, target);
        return true;
      }
      let replacement = null;
      let replacementStart = start;
      let replacementEnd = end;
      let inputType = 'insertText';
      if (clipboardCommand === 'x') {
        replacement = '';
        inputType = 'deleteByCut';
      } else if (clipboardCommand === 'v') {
        replacement = readSemanticClipboard();
        inputType = 'insertFromPaste';
      } else if (printableKey) {
        replacement = key;
      } else if (requestedKey === 'Space') {
        replacement = ' ';
      } else if (requestedKey === 'Enter') {
        replacement = '\n';
        inputType = 'insertLineBreak';
      } else if (requestedKey === 'Backspace') {
        if (start === end && start === 0) return true;
        inputType = primaryTextShortcut
          ? 'deleteWordBackward'
          : 'deleteContentBackward';
        if (start === end) {
          replacementStart = primaryTextShortcut
            ? previousWordBoundary(starts, start)
            : previousGraphemeBoundary(boundaries, start);
        }
        replacement = '';
      } else if (requestedKey === 'Delete') {
        if (start === end && end === length) return true;
        inputType = primaryTextShortcut
          ? 'deleteWordForward'
          : 'deleteContentForward';
        if (start === end) {
          replacementEnd = primaryTextShortcut
            ? nextWordBoundary(starts, end, length)
            : nextGraphemeBoundary(boundaries, end);
        }
        replacement = '';
      } else {
        return false;
      }
      delete element[verticalColumnKey];
      if (keyboardReadOnly) return true;
      const beforeInput = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType,
        data: replacement || null,
      });
      if (!element.dispatchEvent(beforeInput)) return true;
      const caret = replacementStart + replacement.length;
      if (text !== `${text.slice(0, replacementStart)}${replacement}${text.slice(replacementEnd)}`
        || start !== caret || end !== caret) {
        recordTextHistoryMutation(element, captureTextHistorySnapshot(element));
      }
      const replacementRange = document.createRange();
      const startPoint = textPointAt(replacementStart);
      const endPoint = textPointAt(replacementEnd);
      replacementRange.setStart(startPoint.node, startPoint.offset);
      replacementRange.setEnd(endPoint.node, endPoint.offset);
      replacementRange.deleteContents();
      if (replacement) {
        const inserted = document.createTextNode(replacement);
        replacementRange.insertNode(inserted);
      }
      setSelection(caret, caret);
      valueHandledByReact = dispatchValueChange(element, String(element.textContent ?? ''));
      if (element.isConnected) setSelection(caret, caret);
      return true;
    };
    const handledContentEditableDefault = (
      acceptsDefault
      && !handledTextDefault
      && applyContentEditableDefault()
    );
    const applyNativeDialogDefault = () => {
      if (requestedKey !== 'Escape') return false;
      const dialog = closestComposed(element, 'dialog');
      if (!dialog || !nativeDialogIsModal(dialog)) return false;
      const cancelled = !dialog.dispatchEvent(new Event('cancel', {
        cancelable: true,
      }));
      if (!cancelled && dialog.open) dialog.close();
      return true;
    };
    const handledDialogDefault = (
      acceptsDefault
      && !handledTextDefault
      && !handledContentEditableDefault
      && applyNativeDialogDefault()
    );
    const applyNativeControlDefault = () => {
      if (
        keyboardReadOnly
        && (
          element instanceof HTMLInputElement
          || element instanceof HTMLSelectElement
        )
        && [
          'Space',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
        ].includes(requestedKey)
      ) return true;
      if (
        requestedKey === 'Space'
        && element instanceof HTMLInputElement
        && ['checkbox', 'radio'].includes(element.type)
      ) {
        dispatchClick(1);
        return true;
      }
      if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey) return false;
      if (element instanceof HTMLSelectElement && !element.multiple) {
        const optionIndices = Array.from(element.options)
          .map((option, index) => ({ option, index }))
          .filter(({ option }) => (
            !option.disabled
            && !(
              option.parentElement instanceof HTMLOptGroupElement
              && option.parentElement.disabled
            )
          ))
          .map(({ index }) => index);
        if (optionIndices.length === 0) return false;
        const currentPosition = optionIndices.indexOf(element.selectedIndex);
        let nextPosition;
        if (requestedKey === 'ArrowDown') {
          nextPosition = currentPosition < 0 ? 0 : currentPosition + 1;
        } else if (requestedKey === 'ArrowUp') {
          nextPosition = currentPosition < 0
            ? optionIndices.length - 1
            : currentPosition - 1;
        } else if (requestedKey === 'Home') {
          nextPosition = 0;
        } else if (requestedKey === 'End') {
          nextPosition = optionIndices.length - 1;
        } else if (requestedKey === 'PageDown') {
          nextPosition = (currentPosition < 0 ? 0 : currentPosition) + 10;
        } else if (requestedKey === 'PageUp') {
          nextPosition = (currentPosition < 0
            ? optionIndices.length - 1
            : currentPosition) - 10;
        } else {
          return false;
        }
        const boundedPosition = Math.max(
          0,
          Math.min(optionIndices.length - 1, nextPosition),
        );
        const nextIndex = optionIndices[boundedPosition];
        if (nextIndex !== element.selectedIndex) {
          element.selectedIndex = nextIndex;
          valueHandledByReact = dispatchValueChange(element, element.value);
          valueCommitMethod = 'change';
          pendingValueChangeConfirmation = () => (
            element.isConnected && element.selectedIndex === nextIndex
          );
        }
        return true;
      }
      if (!(element instanceof HTMLInputElement)) return false;
      const type = String(element.type).toLowerCase();
      if (type !== 'number' && type !== 'range') return false;
      let steps = 0;
      if (
        requestedKey === 'ArrowUp'
        || (type === 'range' && requestedKey === 'ArrowRight')
      ) steps = 1;
      else if (
        requestedKey === 'ArrowDown'
        || (type === 'range' && requestedKey === 'ArrowLeft')
      ) steps = -1;
      else if (type === 'range' && requestedKey === 'PageUp') steps = 10;
      else if (type === 'range' && requestedKey === 'PageDown') steps = -10;
      const previousValue = element.value;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setter) return false;
      if (
        type === 'range'
        && (requestedKey === 'Home' || requestedKey === 'End')
      ) {
        const fallback = requestedKey === 'Home' ? 0 : 100;
        const boundaryAttribute = requestedKey === 'Home'
          ? element.getAttribute('min')
          : element.getAttribute('max');
        const boundary = boundaryAttribute === null
          ? Number.NaN
          : Number(boundaryAttribute);
        setter.call(element, String(Number.isFinite(boundary) ? boundary : fallback));
      } else if (steps !== 0) {
        try {
          if (steps > 0) element.stepUp(steps);
          else element.stepDown(-steps);
        } catch {
          const current = Number(element.value);
          const fallback = Number.isFinite(current) ? current : 0;
          setter.call(element, String(fallback + steps));
        }
      } else {
        return false;
      }
      if (element.value !== previousValue) {
        valueHandledByReact = dispatchValueChange(element, element.value);
        valueCommitMethod = 'change';
        const expectedValue = element.value;
        pendingValueChangeConfirmation = () => (
          element.isConnected && element.value === expectedValue
        );
      }
      return true;
    };
    const handledNativeDefault = (
      acceptsDefault
      && !handledTextDefault
      && !handledContentEditableDefault
      && !handledDialogDefault
      && applyNativeControlDefault()
    );
    if (
      acceptsDefault
      && !handledTextDefault
      && !handledContentEditableDefault
      && !handledDialogDefault
      && !handledNativeDefault
      && (requestedKey === 'Enter' || requestedKey === 'Space')
    ) {
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
          || element instanceof HTMLSelectElement
        )
      ) {
        const form = element.form || closestComposed(element, 'form');
        if (form instanceof HTMLFormElement && typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        }
      }
    }
    if (acceptsDefault && requestedKey === 'Tab') {
      const focusable = allOpenComposedElements().filter((candidate) => (
        candidate.matches(
          'button, input, select, textarea, a[href], area[href], summary, '
            + '[contenteditable], [tabindex]',
        )
        &&
        (
          candidate instanceof HTMLElement
          || candidate instanceof SVGElement
        )
        && typeof candidate.focus === 'function'
        && candidate.tabIndex >= 0
        && rendered(candidate)
        && !effectivelyDisabled(candidate)
        && (!activeModal || composedContains(activeModal, candidate))
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
      if (
        (next instanceof HTMLElement || next instanceof SVGElement)
        && typeof next.focus === 'function'
      ) {
        if (keyboardValueTarget) pendingValueBlur = true;
        pendingFocusTarget = next;
      }
    }
    dispatchKeyboard('keyup');
    if (
      keyboardValueTarget
      &&
      deepActiveElement() !== element
      && (requestedKey === 'Enter' || requestedKey === 'Escape')
    ) {
      pendingValueBlur = true;
    }
  } else if (action === 'scrollIntoView') {
    const before = renderedRectFor(element);
    element.scrollIntoView({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    });
    const after = renderedRectFor(element);
    scrollIntoViewChanged = (
      before.left !== after.left
      || before.top !== after.top
      || before.right !== after.right
      || before.bottom !== after.bottom
    );
    revealedRect = {
      x: after.x,
      y: after.y,
      left: after.left,
      top: after.top,
      right: after.right,
      bottom: after.bottom,
      width: after.width,
      height: after.height,
    };
  } else if (action === 'scroll') {
    if (!(element instanceof HTMLElement) || typeof element.scrollBy !== 'function') {
      return { ok: false, error: `Element ${selector} is not scrollable` };
    }
    const deltaX = Number(requestedDeltaX ?? 0);
    const deltaY = Number(requestedDeltaY ?? 0);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return { ok: false, error: 'Scroll deltas must be finite numbers' };
    }
    const coordinates = sourceCoordinates;
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: coordinates.clientX,
      clientY: coordinates.clientY,
      deltaX,
      deltaY,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      ...modifiers,
    });
    const applyNativeScroll = element.dispatchEvent(wheelEvent);
    if (applyNativeScroll) {
      element.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' });
    }
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
  if (pendingValueBlur) {
    for (let frame = 0; frame < 4; frame += 1) {
      await waitForRender();
      performedSettledFrames += 1;
      const currentReactProps = reactPropsFor(element);
      if (!('value' in currentReactProps) || String(currentReactProps.value) === String(element.value)) {
        valueDraftSynchronized = true;
        break;
      }
      valueDraftSynchronized = false;
    }
    if (element.isConnected) {
      const blurLifecycle = dispatchReactFocusLifecycle(
        element,
        'blur',
        () => {
          if (deepActiveElement() === element) element.blur();
        },
      );
      valueBlurHandledByReact = blurLifecycle.handledByReact;
      valueCommitConfirmed = (
        valueDraftSynchronized !== false
        && deepActiveElement() !== element
      );
    } else {
      valueCommitConfirmed = false;
    }
    await waitForRender();
    performedSettledFrames += 1;
    valueCommitMethod = 'blur';
  }
  if (
    (
      pendingFocusTarget instanceof HTMLElement
      || pendingFocusTarget instanceof SVGElement
    )
    && typeof pendingFocusTarget.focus === 'function'
  ) {
    dispatchReactFocusLifecycle(
      pendingFocusTarget,
      'focus',
      () => pendingFocusTarget.focus({ preventScroll: true }),
    );
  }
  await waitForRender();
  performedSettledFrames += 1;
  await waitForRender();
  performedSettledFrames += 1;
  if (typeof pendingValueChangeConfirmation === 'function') {
    valueCommitConfirmed = pendingValueChangeConfirmation();
  }
  return {
    ok: true,
    settledFrames: performedSettledFrames,
    elementConnected: element.isConnected,
    action,
    key: action === 'keyPress' ? requestedKey : null,
    modifiers,
    offsetX: sourceCoordinates?.offsetX ?? null,
    offsetY: sourceCoordinates?.offsetY ?? null,
    clientX: sourceCoordinates?.clientX ?? null,
    clientY: sourceCoordinates?.clientY ?? null,
    targetOffsetX: targetCoordinates?.offsetX ?? null,
    targetOffsetY: targetCoordinates?.offsetY ?? null,
    targetClientX: targetCoordinates?.clientX ?? null,
    targetClientY: targetCoordinates?.clientY ?? null,
    button: action === 'dragBy' ? requestedButton ?? 'left' : null,
    path: action === 'dragBy' ? performedDragPath : null,
    hoverState: action === 'hover' ? performedHoverState : null,
    hoverStateChanged: action === 'hover' ? hoverStateChanged : null,
    scrollIntoViewChanged: action === 'scrollIntoView' ? scrollIntoViewChanged : null,
    revealedRect: action === 'scrollIntoView' ? revealedRect : null,
    valueCommitMethod: ['setValue', 'keyPress'].includes(action) ? valueCommitMethod : null,
    valueCommitConfirmed: ['setValue', 'keyPress'].includes(action) ? valueCommitConfirmed : null,
    valueHandledByReact: ['setValue', 'keyPress'].includes(action) ? valueHandledByReact : null,
    valueDraftSynchronized: ['setValue', 'keyPress'].includes(action) ? valueDraftSynchronized : null,
    valueFocusHandledByReact: ['setValue', 'keyPress'].includes(action)
      ? valueFocusHandledByReact
      : null,
    valueBlurHandledByReact: ['setValue', 'keyPress'].includes(action)
      ? valueBlurHandledByReact
      : null,
    clipboardOperation: action === 'keyPress' ? semanticClipboardOperation : null,
    clipboardLength: action === 'keyPress' ? semanticClipboardLength : null,
    clipboardScope: semanticClipboardOperation ? 'window-private' : null,
    textHistoryOperation: action === 'keyPress' ? performedTextHistoryOperation : null,
    textHistoryApplied: action === 'keyPress' ? textHistoryApplied : null,
    textHistoryUndoDepth: action === 'keyPress' ? textHistoryUndoDepth : null,
    textHistoryRedoDepth: action === 'keyPress' ? textHistoryRedoDepth : null,
    textHistoryScope: performedTextHistoryOperation ? 'element-private' : null,
    deltaX: action === 'dragBy'
      ? performedDragPath[performedDragPath.length - 1].deltaX
      : action === 'scroll' ? requestedDeltaX ?? 0 : null,
    deltaY: action === 'dragBy'
      ? performedDragPath[performedDragPath.length - 1].deltaY
      : action === 'scroll' ? requestedDeltaY ?? 0 : null,
    selector,
    targetSelector: action === 'dragTo' ? targetSelector : null,
    targetName: targetElement ? interactionName(targetElement) : null,
    tag: element.localName,
    role: roleForName(element) || null,
    name: interactionName(element, action === 'scroll'),
    value: element instanceof HTMLInputElement && element.type === 'password'
      ? '<redacted>'
      : ('value' in element
          ? String(element.value)
          : element.isContentEditable ? element.textContent ?? '' : null),
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
