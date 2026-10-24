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
    pub posted: bool, pub closed: bool, pub pooled: bool, pub pool_hit: bool, pub buffer_id: u64,
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

const MAX_OPACITY_SCAN_BYTES: usize = 16 * 1024 * 1024;
/// MiYu: bound alpha scanning; only a proven complete opaque image can replace the browser underlay.
pub fn opaque_rgba_pixels(rgba: &[u8]) -> bool { !rgba.is_empty() && rgba.len() <= MAX_OPACITY_SCAN_BYTES && rgba.len().is_multiple_of(4) && rgba.chunks_exact(4).all(|pixel| pixel[3] == 255) }

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

    fn shared_metadata_len(&self) -> usize { self.metadata.len().div_ceil(4096) * 4096 }

    fn shared_len(&self) -> usize { 16 + self.shared_metadata_len() + self.rgba.len() }

    fn max_shared_len(&self) -> usize { 16 + MAX_SHARED_METADATA_BYTES + self.rgba.len() }

    fn write_shared_to(&self, destination: &mut [u8]) {
        assert!(destination.len() >= self.shared_len());
        let metadata_len = destination.len() - 16 - self.rgba.len();
        let (header, rest) = destination.split_at_mut(16);
        let (metadata, rgba) = rest.split_at_mut(metadata_len);
        header.copy_from_slice(&self.header);
        header[12..16].copy_from_slice(&(metadata_len as u32).to_le_bytes());
        metadata[..self.metadata.len()].copy_from_slice(&self.metadata);
        metadata[self.metadata.len()..].fill(b' ');
        rgba.copy_from_slice(&self.rgba);
    }

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

const POOL_SLOTS: usize = 3;
const POOL_BYTES: usize = 96 * 1024 * 1024;
const MAX_SHARED_METADATA_BYTES: usize = 256 * 1024;
struct Lease { request: String, id: u64, post_finished: bool, acknowledged: bool }
struct PoolSlot<B> { buffer: Option<B>, bytes: usize, id: u64, lease: Option<Lease> }
struct FramePool<B> { slots: Vec<Option<PoolSlot<B>>> }
impl<B> Default for FramePool<B> { fn default() -> Self { Self { slots: Vec::new() } } }
struct Reservation<B> { index: usize, id: u64, lease_id: u64, bytes: usize, buffer: Option<B>, retired: Option<B> }
impl<B: Clone> FramePool<B> {
    /// MiYu: reserve before COM calls, and reuse only after Post returns and the browser acknowledges completed pixel access.
    fn reserve(&mut self, bytes: usize, max_bytes: usize, request: &str) -> Option<Reservation<B>> {
        if bytes > max_bytes { return None; }
        if self.slots.iter().flatten().any(|slot| slot.lease.as_ref().is_some_and(|lease| lease.request == request)) { return None; }
        let retained: usize = self.slots.iter().flatten().map(|slot| slot.bytes).sum();
        // Keep the smallest sufficient capacity across metadata fluctuations; bound padding by the caller's wire limit.
        let matching = self.slots.iter().enumerate().filter_map(|(index, slot)| slot.as_ref().filter(|slot| slot.lease.is_none() && slot.bytes >= bytes && slot.bytes <= max_bytes).map(|slot| (index, slot.bytes))).min_by_key(|(_, capacity)| *capacity).map(|(index, _)| index);
        let index = matching.or_else(|| self.slots.iter().position(|slot| match slot {
            Some(slot) => slot.lease.is_none() && retained - slot.bytes + bytes <= POOL_BYTES,
            None => retained + bytes <= POOL_BYTES,
        })).or_else(|| (self.slots.len() < POOL_SLOTS && retained + bytes <= POOL_BYTES).then_some(self.slots.len()))?;
        if index == self.slots.len() { self.slots.push(None); }
        let mut retired = None;
        if matching.is_none() {
            retired = self.slots[index].take().and_then(|slot| slot.buffer);
            static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
            let id = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            self.slots[index] = Some(PoolSlot { buffer: None, bytes, id, lease: None });
        }
        let slot = self.slots[index].as_mut().unwrap();
        static NEXT_LEASE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let lease_id = NEXT_LEASE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        slot.lease = Some(Lease { request: request.into(), id: lease_id, post_finished: false, acknowledged: false });
        Some(Reservation { index, id: slot.id, lease_id, bytes: slot.bytes, buffer: slot.buffer.clone(), retired })
    }

    fn install(&mut self, index: usize, id: u64, buffer: B) -> bool {
        if let Some(slot) = self.slots.get_mut(index).and_then(Option::as_mut).filter(|slot| slot.id == id) { slot.buffer = Some(buffer); true } else { false }
    }

    fn acknowledge(&mut self, request: &str, id: u64) {
        for slot in self.slots.iter_mut().flatten() {
            if let Some(lease) = slot.lease.as_mut().filter(|lease| lease.request == request && lease.id == id) {
                lease.acknowledged = true;
                if lease.post_finished { slot.lease = None; }
                return;
            }
        }
    }

    fn finish(&mut self, request: &str, id: u64, posted: bool) -> Option<B> {
        for entry in &mut self.slots {
            let Some(slot) = entry.as_mut() else { continue; };
            let Some(lease) = slot.lease.as_mut().filter(|lease| lease.request == request && lease.id == id) else { continue; };
            if !posted { return entry.take().and_then(|slot| slot.buffer); }
            lease.post_finished = true;
            if lease.acknowledged { slot.lease = None; }
            return None;
        }
        None
    }
}

#[cfg(windows)]
mod shared_pool {
    use super::*;
    use std::{cell::RefCell, collections::HashMap};
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2SharedBuffer;
    thread_local! { static WINDOWS: RefCell<HashMap<String, FramePool<ICoreWebView2SharedBuffer>>> = RefCell::new(HashMap::new()); }

    pub fn enabled() -> bool {
        static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *ENABLED.get_or_init(|| std::env::var("MENGINE_NATIVE_VIEWPORT_BUFFER_REUSE").as_deref() != Ok("0"))
    }

    pub fn reserve(label: &str, bytes: usize, max_bytes: usize, request: &str) -> Option<Reservation<ICoreWebView2SharedBuffer>> {
        WINDOWS.with(|windows| windows.borrow_mut().entry(label.into()).or_default().reserve(bytes, max_bytes, request))
    }

    pub fn install(label: &str, reservation: &Reservation<ICoreWebView2SharedBuffer>, buffer: &ICoreWebView2SharedBuffer) -> bool {
        WINDOWS.with(|windows| windows.borrow_mut().get_mut(label).is_some_and(|pool| pool.install(reservation.index, reservation.id, buffer.clone())))
    }

    pub fn acknowledge(label: &str, request: &str, id: u64) {
        WINDOWS.with(|windows| { if let Some(pool) = windows.borrow_mut().get_mut(label) { pool.acknowledge(request, id); } });
    }

    pub fn finish(label: &str, request: &str, id: u64, posted: bool) -> Option<ICoreWebView2SharedBuffer> {
        WINDOWS.with(|windows| windows.borrow_mut().get_mut(label).and_then(|pool| pool.finish(request, id, posted)))
    }

    /// Destroyed is delivered on the UI thread while COM interfaces are still available.
    pub fn destroy(label: &str) {
        if let Some(pool) = WINDOWS.with(|windows| windows.borrow_mut().remove(label)) {
            unsafe { for slot in pool.slots.into_iter().flatten() { if let Some(buffer) = slot.buffer { let _ = buffer.Close(); } } }
        }
    }
}

/// MiYu: Tauri authenticates the source window; ACK processing stays on the WebView UI thread.
#[cfg(windows)]
pub async fn release_frame(window: tauri::WebviewWindow, request: String, lease: String) -> Result<(), String> {
    if request.len() > 128 { return Err("Invalid viewport release request".into()); }
    let id = lease.parse::<u64>().map_err(|_| "Invalid viewport lease")?;
    let label = window.label().to_owned();
    let (tx, rx) = tokio::sync::oneshot::channel();
    window.with_webview(move |_| { shared_pool::acknowledge(&label, &request, id); let _ = tx.send(()); }).map_err(|error| error.to_string())?;
    rx.await.map_err(|error| error.to_string())
}

#[cfg(not(windows))]
pub async fn release_frame(_window: tauri::WebviewWindow, _request: String, _lease: String) -> Result<(), String> { Err("WebView2 shared buffers are unavailable on this platform".into()) }

pub fn destroy_window(_label: &str) { #[cfg(windows)] shared_pool::destroy(_label); }

/// SharedBuffer is CPU shared memory. COM calls stay on WebView2's UI thread.
#[cfg(windows)]
pub async fn share_frame(window: &tauri::WebviewWindow, bytes: Arc<FramePayload>, request: String, reuse: bool, preparation: PreparationTimings, command_started: std::time::Instant) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment12, ICoreWebView2_2, ICoreWebView2_17, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY};
    use windows::core::{HSTRING, Interface};
    let queued_at = std::time::Instant::now();
    let tracing = trace_enabled();
    let window_label = window.label().to_owned();
    let (tx, rx) = tokio::sync::oneshot::channel();
    window.with_webview(move |platform| {
        let ui_queue_ms = queued_at.elapsed().as_secs_f64() * 1000.0;
        let setup_at = std::time::Instant::now();
        let result = (|| -> windows::core::Result<()> {
            unsafe {
                let webview = platform.controller().CoreWebView2()?;
                let environment = webview.cast::<ICoreWebView2_2>()?.Environment()?.cast::<ICoreWebView2Environment12>()?;
                let receiver = webview.cast::<ICoreWebView2_17>()?;
                let reusable = reuse && shared_pool::enabled() && bytes.shared_metadata_len() <= MAX_SHARED_METADATA_BYTES;
                let reservation = if reusable { shared_pool::reserve(&window_label, bytes.shared_len(), bytes.max_shared_len(), &request) } else { None };
                let pooled = reservation.is_some();
                let pool_hit = reservation.as_ref().is_some_and(|slot| slot.buffer.is_some());
                let buffer_id = reservation.as_ref().map(|slot| slot.id).unwrap_or(0);
                let lease_id = reservation.as_ref().map(|slot| slot.lease_id).unwrap_or(0);
                let payload_len = reservation.as_ref().map_or_else(|| bytes.len(), |slot| slot.bytes);
                if let Some(retired) = reservation.as_ref().and_then(|slot| slot.retired.as_ref()) { let _ = retired.Close(); }
                let setup_ms = setup_at.elapsed().as_secs_f64() * 1000.0;
                let allocate_at = std::time::Instant::now();
                let buffer = match reservation.as_ref().and_then(|slot| slot.buffer.clone()) {
                    Some(buffer) => buffer,
                    None => match environment.CreateSharedBuffer(payload_len as u64) {
                        Ok(buffer) => buffer,
                        Err(error) => { if pooled { shared_pool::finish(&window_label, &request, lease_id, false); } return Err(error); }
                    },
                };
                if let Some(slot) = &reservation {
                    if !shared_pool::install(&window_label, slot, &buffer) { let _ = buffer.Close(); return Err(windows::core::Error::from_hresult(windows::core::HRESULT(0x80000013u32 as i32))); }
                }
                let allocate_ms = allocate_at.elapsed().as_secs_f64() * 1000.0;
                let mut close_attempted = false;
                let result = (|| {
                    let copy_at = std::time::Instant::now();
                    let mut destination = std::ptr::null_mut();
                    buffer.Buffer(&mut destination)?;
                    // No browser view can read this slot until publication, and no live lease is overwritten.
                    let destination = std::slice::from_raw_parts_mut(destination, payload_len);
                    if pooled { bytes.write_shared_to(destination); } else { bytes.write_to(destination); }
                    let copy_ms = copy_at.elapsed().as_secs_f64() * 1000.0;
                    let publication_ready_epoch_ms = if tracing { epoch_ms() } else { 0.0 };
                    let additional_data_at = std::time::Instant::now();
                    let mut data = serde_json::json!({"nativeViewportRequest": &request, "nativeViewportLease": reservation.as_ref().map(|slot| slot.lease_id.to_string()), "nativeViewportPooled": pooled, "nativeViewportTransport": {"uiQueueMs": ui_queue_ms, "setupMs": setup_ms, "allocateMs": allocate_ms, "copyMs": copy_ms, "bytes": payload_len, "pooled": pooled, "poolHit": pool_hit, "bufferId": buffer_id}});
                    if tracing { data["nativeViewportTransport"]["publicationReadyEpochMs"] = serde_json::json!(publication_ready_epoch_ms); }
                    let metadata = HSTRING::from(data.to_string());
                    let additional_data_ms = additional_data_at.elapsed().as_secs_f64() * 1000.0;
                    let publication_started_epoch_ms = if tracing { epoch_ms() } else { 0.0 };
                    let publish_at = std::time::Instant::now();
                    let posted = receiver.PostSharedBufferToScript(&buffer, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY, &metadata);
                    let publish_ms = publish_at.elapsed().as_secs_f64() * 1000.0;
                    let publication_finished_epoch_ms = if tracing { epoch_ms() } else { 0.0 };
                    // Pooled mappings remain open until retirement or window destruction.
                    let close_at = std::time::Instant::now();
                    close_attempted = true;
                    let closed = if pooled {
                        shared_pool::finish(&window_label, &request, lease_id, posted.is_ok()).is_some_and(|buffer| buffer.Close().is_ok())
                    } else { buffer.Close().is_ok() };
                    let close_ms = close_at.elapsed().as_secs_f64() * 1000.0;
                    if tracing {
                        let trace = TransportTrace { request: request.clone(), window: window_label.clone(), bytes: payload_len, preparation: preparation.clone(), ui_queue_ms, setup_ms, allocate_ms, copy_ms, additional_data_ms, publish_ms, close_ms, native_total_ms: command_started.elapsed().as_secs_f64() * 1000.0, publication_ready_epoch_ms, publication_started_epoch_ms, publication_finished_epoch_ms, posted: posted.is_ok(), closed, pooled, pool_hit, buffer_id };
                        TRACES.get_or_init(Default::default).lock().unwrap_or_else(|error| error.into_inner()).push(trace);
                    }
                    posted
                })();
                if !close_attempted {
                    if pooled { shared_pool::finish(&window_label, &request, lease_id, false); }
                    let _ = buffer.Close();
                }
                result
            }
        })().map_err(|error| error.to_string());
        let _ = tx.send(result);
    }).map_err(|error| error.to_string())?;
    rx.await.map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
pub async fn share_frame(_window: &tauri::WebviewWindow, _bytes: Arc<FramePayload>, _request: String, _reuse: bool, _preparation: PreparationTimings, _command_started: std::time::Instant) -> Result<(), String> {
    Err("WebView2 shared buffers are unavailable on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pool_waits_for_matching_consumption_ack_and_post_return() {
        let mut pool = FramePool::<u64>::default();
        let first = pool.reserve(4096, 4096, "first").unwrap();
        assert!(pool.install(first.index, first.id, 7));
        pool.acknowledge("wrong-window-request", first.lease_id);
        pool.finish("first", first.lease_id, true);
        assert!(pool.slots[first.index].as_ref().unwrap().lease.is_some());
        assert!(pool.reserve(4096, 4096, "first").is_none(), "duplicate in-flight requests cannot alias a lease");
        pool.acknowledge("first", first.lease_id);
        let next = pool.reserve(4096, 4096, "next").unwrap();
        assert_eq!(next.buffer, Some(7));
        assert_eq!(next.id, first.id);
        pool.acknowledge("first", first.lease_id);
        pool.acknowledge("next", next.lease_id);
        assert!(pool.slots[next.index].as_ref().unwrap().lease.is_some(), "reentrant ACK cannot reuse a still-posting mapping");
        pool.finish("next", next.lease_id, true);
        assert!(pool.slots[next.index].as_ref().unwrap().lease.is_none());
        pool.acknowledge("next", next.lease_id);
        let repeated = pool.reserve(4096, 4096, "next").unwrap();
        assert_eq!(repeated.buffer, Some(7));
        pool.finish("next", next.lease_id, false);
        pool.finish("next", next.lease_id, true);
        assert!(pool.slots[repeated.index].as_ref().unwrap().lease.as_ref().is_some_and(|lease| !lease.post_finished), "old Post completion cannot affect the next lease");
        pool.finish("next", repeated.lease_id, true); pool.acknowledge("next", next.lease_id);
        assert!(pool.slots[repeated.index].as_ref().unwrap().lease.is_some(), "old ACK cannot release a later lease with the same request");
    }

    #[test]
    fn pool_preserves_live_slots_and_bounds_retained_memory() {
        let mut pool = FramePool::<u64>::default();
        for index in 0..POOL_SLOTS { let slot = pool.reserve(4096, 4096, &index.to_string()).unwrap(); pool.install(slot.index, slot.id, index as u64); }
        assert!(pool.reserve(4096, 4096, "overflow").is_none());
        let first_lease = pool.slots[0].as_ref().unwrap().lease.as_ref().unwrap().id;
        pool.acknowledge("0", first_lease); pool.finish("0", first_lease, true);
        let changed = pool.reserve(8192, 8192, "resized").unwrap();
        assert_eq!(changed.index, 0); assert_eq!(changed.retired, Some(0)); assert_eq!(changed.buffer, None);
        pool.install(changed.index, changed.id, 10);
        assert_eq!(pool.finish("resized", changed.lease_id, false), Some(10));
        assert!(pool.slots[0].is_none());
        assert!(pool.reserve(POOL_BYTES, POOL_BYTES, "over-budget").is_none());
        assert!(FramePool::<u64>::default().reserve(POOL_BYTES + 1, POOL_BYTES + 1, "huge").is_none());
        assert!(FramePool::<u64>::default().reserve(POOL_BYTES, POOL_BYTES, "limit").is_some());
    }

    #[test]
    fn pool_reuses_smallest_sufficient_capacity_with_bounded_metadata_slack() {
        let mut pool = FramePool::<u64>::default();
        let large = pool.reserve(16384, 16384, "large").unwrap(); pool.install(large.index, large.id, 1);
        let small = pool.reserve(8192, 8192, "small").unwrap(); pool.install(small.index, small.id, 2);
        pool.finish("large", large.lease_id, true); pool.acknowledge("large", large.lease_id);
        pool.finish("small", small.lease_id, true); pool.acknowledge("small", small.lease_id);
        let reused = pool.reserve(4096, 16384, "shorter").unwrap();
        assert_eq!((reused.id, reused.bytes, reused.buffer), (small.id, 8192, Some(2)));
        assert!(reused.retired.is_none());
        let concurrent = pool.reserve(4096, 16384, "concurrent").unwrap();
        assert_eq!(concurrent.id, large.id, "active smaller mapping cannot be overwritten");
        pool.finish("shorter", reused.lease_id, true); pool.acknowledge("shorter", reused.lease_id);
        let resized = pool.reserve(4096, 4096, "small-target").unwrap();
        assert_eq!(resized.bytes, 4096); assert_ne!(resized.id, small.id); assert_eq!(resized.retired, Some(2));
        assert!(pool.reserve(8192, 4096, "invalid-range").is_none());
    }

    #[test]
    fn fluctuating_metadata_reuses_high_water_capacity_and_preserves_wire_pixels() {
        let mut pool = FramePool::<u64>::default();
        let mut retained_id = None;
        for (index, metadata_len) in [4097, 4095, 4097, 100, 4096].into_iter().enumerate() {
            let mut metadata = b"{\"revision\":".to_vec(); metadata.extend_from_slice(index.to_string().as_bytes()); metadata.push(b'}'); metadata.resize(metadata_len, b' ');
            let rgba = vec![index as u8, 2, 3, 255]; let frame = FramePayload::new(1, 1, metadata, rgba.clone()).unwrap();
            let request = format!("frame-{index}"); let slot = pool.reserve(frame.shared_len(), frame.max_shared_len(), &request).unwrap();
            if let Some(id) = retained_id { assert_eq!(slot.id, id); assert_eq!(slot.buffer, Some(1)); } else { retained_id = Some(slot.id); }
            pool.install(slot.index, slot.id, 1);
            let mut mapped = vec![0xff; slot.bytes]; frame.write_shared_to(&mut mapped);
            let padded = u32::from_le_bytes(mapped[12..16].try_into().unwrap()) as usize;
            assert_eq!(mapped.len(), 16 + padded + rgba.len()); assert_eq!(padded, 8192); assert!(padded <= MAX_SHARED_METADATA_BYTES);
            assert_eq!(serde_json::from_slice::<serde_json::Value>(&mapped[16..16 + padded]).unwrap()["revision"], index);
            assert_eq!(&mapped[16 + padded..], rgba.as_slice());
            pool.finish(&request, slot.lease_id, true); pool.acknowledge(&request, slot.lease_id);
        }
    }

    #[test]
    fn retained_capacity_pads_metadata_after_pixel_dimensions_change() {
        let frame = FramePayload::new(2, 1, b"{\"revision\":9}".to_vec(), vec![1, 2, 3, 255, 4, 5, 6, 255]).unwrap();
        let mut mapped = vec![0xff; 16 + 8192 + 4]; frame.write_shared_to(&mut mapped);
        let padded = u32::from_le_bytes(mapped[12..16].try_into().unwrap()) as usize;
        assert_eq!(padded, 8188);
        assert_eq!(u32::from_le_bytes(mapped[4..8].try_into().unwrap()), 2);
        assert_eq!(mapped.len(), 16 + padded + 2 * 4);
        assert_eq!(serde_json::from_slice::<serde_json::Value>(&mapped[16..16 + padded]).unwrap()["revision"], 9);
        assert_eq!(&mapped[16 + padded..], &[1, 2, 3, 255, 4, 5, 6, 255]);
    }

    #[test]
    fn pooled_wire_padding_keeps_strict_length_and_exact_pixels() {
        for metadata_len in [2, 4095, 4096, 4097, 256 * 1024 + 1] {
            let mut metadata = b"{}".to_vec(); metadata.resize(metadata_len, b' ');
            let frame = FramePayload::new(1, 1, metadata.clone(), vec![1, 2, 3, 255]).unwrap();
            let mut mapped = vec![0; frame.shared_len()]; frame.write_shared_to(&mut mapped);
            let padded = u32::from_le_bytes(mapped[12..16].try_into().unwrap()) as usize;
            assert_eq!(padded % 4096, 0);
            assert_eq!(mapped.len(), 16 + padded + 4);
            assert_eq!(&mapped[16..16 + metadata_len], &metadata);
            assert!(mapped[16 + metadata_len..16 + padded].iter().all(|byte| *byte == b' '));
            assert_eq!(&mapped[16 + padded..], &[1, 2, 3, 255]);
            assert_eq!(frame.encode().len(), 16 + metadata_len + 4, "IPC fallback remains exact");
        }
    }

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
    fn opacity_requires_complete_nonempty_rgba_and_every_alpha_byte() {
        for bytes in [vec![], vec![255], vec![255; 7]] { assert!(!opaque_rgba_pixels(&bytes)); }
        assert!(!opaque_rgba_pixels(&vec![255; MAX_OPACITY_SCAN_BYTES + 4]));
        let bytes = vec![7, 0, 22, 255, 255, 1, 0, 255, 9, 9, 9, 255];
        assert!(opaque_rgba_pixels(&bytes));
        for index in [3, 7, 11] {
            for alpha in [0, 1, 127, 254] { let mut transparent = bytes.clone(); transparent[index] = alpha; assert!(!opaque_rgba_pixels(&transparent)); }
        }
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
