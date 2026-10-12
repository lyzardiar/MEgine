use std::sync::Arc;

/// MiYu: bounded opt-in native timings correlated with the browser's shared-buffer request.
#[derive(Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparationTimings { pub metadata_value_ms: f64, pub metadata_encode_ms: f64, pub payload_ms: f64 }

#[derive(Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransportTrace {
    pub request: String, pub window: String, pub bytes: usize, pub preparation: PreparationTimings,
    pub ui_queue_ms: f64, pub setup_ms: f64, pub allocate_ms: f64, pub copy_ms: f64,
    pub additional_data_ms: f64, pub publish_ms: f64, pub close_ms: f64, pub native_total_ms: f64,
    pub publication_ready_epoch_ms: f64, pub publication_started_epoch_ms: f64, pub publication_finished_epoch_ms: f64,
    pub posted: bool, pub closed: bool,
}

const TRACE_CAPACITY: usize = 1024;
#[derive(Default)]
struct TraceHistory { records: std::collections::VecDeque<TransportTrace> }
impl TraceHistory {
    fn push(&mut self, trace: TransportTrace) { if self.records.len() == TRACE_CAPACITY { self.records.pop_front(); } self.records.push_back(trace); }
    fn take(&mut self) -> Vec<TransportTrace> { self.records.drain(..).collect() }
}
static TRACES: std::sync::OnceLock<std::sync::Mutex<TraceHistory>> = std::sync::OnceLock::new();
pub fn trace_enabled() -> bool {
    static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("MENGINE_NATIVE_VIEWPORT_TRANSPORT_TRACE").is_ok_and(|value| value == "1"))
}
pub fn take_traces() -> Vec<TransportTrace> {
    TRACES.get().map(|history| history.lock().unwrap_or_else(|error| error.into_inner()).take()).unwrap_or_default()
}
#[cfg(windows)]
fn epoch_ms() -> f64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|time| time.as_secs_f64() * 1000.0).unwrap_or(0.0) }

/// MiYu: retain the renderer's RGBA allocation until writing the final transport buffer.
pub struct FramePayload { header: [u8; 16], metadata: Vec<u8>, rgba: Vec<u8> }

impl FramePayload {
    pub fn new(width: u32, height: u32, metadata: Vec<u8>, rgba: Vec<u8>) -> Result<Self, String> {
        let metadata_len = u32::try_from(metadata.len()).map_err(|_| "Viewport metadata exceeds 4 GiB")?;
        let mut header = [0; 16];
        for (slot, value) in header.chunks_exact_mut(4).zip([0x3146474d_u32, width, height, metadata_len]) { slot.copy_from_slice(&value.to_le_bytes()); }
        Ok(Self { header, metadata, rgba })
    }

    fn len(&self) -> usize { self.header.len() + self.metadata.len() + self.rgba.len() }

    fn write_to(&self, destination: &mut [u8]) {
        assert_eq!(destination.len(), self.len());
        let (header, rest) = destination.split_at_mut(16);
        let (metadata, rgba) = rest.split_at_mut(self.metadata.len());
        header.copy_from_slice(&self.header);metadata.copy_from_slice(&self.metadata);rgba.copy_from_slice(&self.rgba);
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.len());
        bytes.extend_from_slice(&self.header);bytes.extend_from_slice(&self.metadata);bytes.extend_from_slice(&self.rgba);
        bytes
    }
}

/// SharedBuffer is CPU shared memory. COM calls stay on WebView2's UI thread.
#[cfg(windows)]
pub async fn share_frame(window: &tauri::WebviewWindow, bytes: Arc<FramePayload>, request: String, preparation: PreparationTimings, command_started: std::time::Instant) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment12, ICoreWebView2_2, ICoreWebView2_17, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY};
    use windows::core::{HSTRING, Interface};
    let queued_at = std::time::Instant::now();
    let tracing = trace_enabled();
    let window_label = tracing.then(|| window.label().to_owned());
    let (tx, rx) = tokio::sync::oneshot::channel();
    window.with_webview(move |platform| {
        let ui_queue_ms = queued_at.elapsed().as_secs_f64() * 1000.0;
        let setup_at = std::time::Instant::now();
        let result = (|| -> windows::core::Result<()> {
            unsafe {
                let webview = platform.controller().CoreWebView2()?;
                let environment = webview.cast::<ICoreWebView2_2>()?.Environment()?.cast::<ICoreWebView2Environment12>()?;
                let receiver = webview.cast::<ICoreWebView2_17>()?;
                let setup_ms = setup_at.elapsed().as_secs_f64() * 1000.0;
                let allocate_at = std::time::Instant::now();
                let buffer = environment.CreateSharedBuffer(bytes.len() as u64)?;
                let allocate_ms = allocate_at.elapsed().as_secs_f64() * 1000.0;
                let mut close_attempted = false;
                let result = (|| {
                    let copy_at = std::time::Instant::now();
                    let mut destination = std::ptr::null_mut();
                    buffer.Buffer(&mut destination)?;
                    // The allocated mapping has exactly bytes.len() writable native bytes.
                    bytes.write_to(std::slice::from_raw_parts_mut(destination, bytes.len()));
                    let copy_ms = copy_at.elapsed().as_secs_f64() * 1000.0;
                    let publication_ready_epoch_ms = if tracing { epoch_ms() } else { 0.0 };
                    let additional_data_at = std::time::Instant::now();
                    let mut data = serde_json::json!({"nativeViewportRequest": &request, "nativeViewportTransport": {"uiQueueMs": ui_queue_ms, "setupMs": setup_ms, "allocateMs": allocate_ms, "copyMs": copy_ms, "bytes": bytes.len()}});
                    if tracing { data["nativeViewportTransport"]["publicationReadyEpochMs"] = serde_json::json!(publication_ready_epoch_ms); }
                    let metadata = HSTRING::from(data.to_string());
                    let additional_data_ms = additional_data_at.elapsed().as_secs_f64() * 1000.0;
                    let publication_started_epoch_ms = if tracing { epoch_ms() } else { 0.0 };
                    let publish_at = std::time::Instant::now();
                    let posted = receiver.PostSharedBufferToScript(&buffer, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY, &metadata);
                    let publish_ms = publish_at.elapsed().as_secs_f64() * 1000.0;
                    let publication_finished_epoch_ms = if tracing { epoch_ms() } else { 0.0 };
                    // JS owns its mapping until releaseBuffer; native Close does not revoke it.
                    let close_at = std::time::Instant::now();
                    close_attempted = true;
                    let closed = buffer.Close().is_ok();
                    let close_ms = close_at.elapsed().as_secs_f64() * 1000.0;
                    if tracing {
                        let trace = TransportTrace { request: request.clone(), window: window_label.clone().unwrap_or_default(), bytes: bytes.len(), preparation: preparation.clone(), ui_queue_ms, setup_ms, allocate_ms, copy_ms, additional_data_ms, publish_ms, close_ms, native_total_ms: command_started.elapsed().as_secs_f64() * 1000.0, publication_ready_epoch_ms, publication_started_epoch_ms, publication_finished_epoch_ms, posted: posted.is_ok(), closed };
                        TRACES.get_or_init(Default::default).lock().unwrap_or_else(|error| error.into_inner()).push(trace);
                    }
                    posted
                })();
                if !close_attempted { let _ = buffer.Close(); }
                result
            }
        })().map_err(|error| error.to_string());
        let _ = tx.send(result);
    }).map_err(|error| error.to_string())?;
    rx.await.map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
pub async fn share_frame(_window: &tauri::WebviewWindow, _bytes: Arc<FramePayload>, _request: String, _preparation: PreparationTimings, _command_started: std::time::Instant) -> Result<(), String> {
    Err("WebView2 shared buffers are unavailable on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traces_remain_bounded_ordered_and_drain_once() {
        let mut history = TraceHistory::default();
        for index in 0..=TRACE_CAPACITY { history.push(TransportTrace { request: index.to_string(), ..Default::default() }); }
        let records = history.take();
        assert_eq!(records.len(), TRACE_CAPACITY);
        assert_eq!(records.first().unwrap().request, "1");
        assert_eq!(records.last().unwrap().request, TRACE_CAPACITY.to_string());
        assert!(history.take().is_empty());
        history.push(TransportTrace { request: "next-frame".into(), ..Default::default() });
        assert_eq!(history.take()[0].request, "next-frame");
    }

    #[test]
    fn mapped_and_ipc_frames_have_identical_wire_bytes() {
        let metadata = br#"{"hasAuthoredCamera":true}"#.to_vec();
        let rgba = vec![1, 2, 3, 255, 7, 8, 9, 0];
        let pointer = rgba.as_ptr();
        let frame = FramePayload::new(2, 1, metadata.clone(), rgba.clone()).unwrap();
        let retained = FramePayload::new(2, 1, metadata.clone(), rgba).unwrap();
        assert_eq!(retained.rgba.as_ptr(), pointer, "shared transport retains the renderer allocation");
        let mut mapped = vec![0; frame.len()];
        frame.write_to(&mut mapped);
        let expected = [0x3146474d_u32, 2, 1, metadata.len() as u32].into_iter().flat_map(u32::to_le_bytes).chain(metadata).chain([1, 2, 3, 255, 7, 8, 9, 0]).collect::<Vec<_>>();
        assert_eq!(mapped, expected);
        assert_eq!(frame.encode(), expected);
    }
}
