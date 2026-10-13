// Author: MiYu. V8 isolate ownership, bounded execution and ArrayBuffer allocation.
use std::{alloc::{alloc_zeroed, dealloc, Layout}, ffi::c_void, sync::{Arc, Condvar, Mutex, atomic::{AtomicBool, AtomicUsize, Ordering}}, thread::JoinHandle, time::{Duration, Instant}};
use crate::ScriptError;
pub(super) const HEAP_LIMIT: usize = 256 * 1024 * 1024;

// OwnedIsolate enters on creation and requires itself current at disposal. Keep idle hosts exited.
pub(super) struct Isolate(pub Option<v8::OwnedIsolate>);
impl Isolate {
    pub fn new() -> Self {
        let allocator = unsafe { v8::new_rust_allocator(Box::into_raw(Box::new(AtomicUsize::new(0))), &BUFFER_ALLOCATOR) }.make_shared();
        let isolate = v8::Isolate::new(v8::CreateParams::default().heap_limits(0, HEAP_LIMIT).array_buffer_allocator(allocator));
        unsafe { isolate.exit(); }
        Self(Some(isolate))
    }
    pub fn enter(&mut self) -> Entered<'_> {
        let isolate = self.0.as_mut().unwrap();
        unsafe { isolate.enter(); }
        Entered { isolate }
    }
}
impl Drop for Isolate {
    fn drop(&mut self) { if let Some(isolate) = self.0.take() { unsafe { isolate.enter(); } drop(isolate); } }
}
pub(super) struct Entered<'a> { pub isolate: &'a mut v8::OwnedIsolate }
impl Drop for Entered<'_> { fn drop(&mut self) { unsafe { self.isolate.exit(); } } }

#[derive(Default)]
struct DeadlineState { deadline: Option<Instant>, stopped: bool, timed_out: bool }
pub(super) struct Watchdog {
    state: Arc<(Mutex<DeadlineState>, Condvar)>,
    handle: v8::IsolateHandle,
    thread: Option<JoinHandle<()>>,
}
impl Watchdog {
    pub fn new(handle: v8::IsolateHandle) -> Result<Self, ScriptError> {
        let state = Arc::new((Mutex::new(DeadlineState::default()), Condvar::new()));
        let worker_state = state.clone(); let worker_handle = handle.clone();
        let thread = std::thread::Builder::new().name("mengine-v8-deadline".into()).spawn(move || {
            let (mutex, changed) = &*worker_state; let mut state = mutex.lock().unwrap();
            loop {
                if state.stopped { break; }
                match state.deadline {
                    Some(deadline) if Instant::now() >= deadline => {
                        // The caller disarms under this same lock, so an old timer cannot terminate its next call.
                        worker_handle.terminate_execution(); state.timed_out = true; state.deadline = None;
                    }
                    Some(deadline) => { state = changed.wait_timeout(state, deadline.saturating_duration_since(Instant::now())).unwrap().0; }
                    None => { state = changed.wait(state).unwrap(); }
                }
            }
        })?;
        Ok(Self { state, handle, thread: Some(thread) })
    }
    pub fn arm(&self, duration: Duration) -> DeadlineGuard<'_> {
        let mut state = self.state.0.lock().unwrap(); state.timed_out = false; state.deadline = Some(Instant::now() + duration); self.state.1.notify_one();
        DeadlineGuard(self)
    }
    fn disarm(&self) {
        let mut state = self.state.0.lock().unwrap(); state.deadline = None;
        self.handle.cancel_terminate_execution(); self.state.1.notify_one();
    }
    pub fn timed_out(&self) -> bool { self.state.0.lock().unwrap().timed_out }
}
impl Drop for Watchdog {
    fn drop(&mut self) {
        { let mut state = self.state.0.lock().unwrap(); state.stopped = true; state.deadline = None; self.state.1.notify_one(); }
        if let Some(thread) = self.thread.take() { let _ = thread.join(); }
    }
}
pub(super) struct DeadlineGuard<'a>(&'a Watchdog);
impl Drop for DeadlineGuard<'_> { fn drop(&mut self) { self.0.disarm(); } }

pub(super) struct HeapLimit { pub exhausted: AtomicBool, pub handle: v8::IsolateHandle }
pub(super) unsafe extern "C" fn near_heap_limit(data: *mut c_void, current: usize, initial: usize) -> usize {
    let limit = unsafe { &*(data as *const HeapLimit) };
    limit.exhausted.store(true, Ordering::Relaxed);
    limit.handle.terminate_execution();
    // One fixed reserve permits unwinding. An exhausted host rejects further execution.
    current.max(initial.saturating_add(64 * 1024 * 1024))
}

// ArrayBuffer backing stores are external to V8's managed heap and need a separate quota.
unsafe extern "C" fn allocate_buffer(used: &AtomicUsize, len: usize) -> *mut c_void {
    let size = len.max(1);
    let Ok(layout) = Layout::from_size_align(size, 8) else { return std::ptr::null_mut(); };
    if used.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(size).filter(|n| *n <= HEAP_LIMIT)).is_err() { return std::ptr::null_mut(); }
    let data = unsafe { alloc_zeroed(layout) };
    if data.is_null() { used.fetch_sub(size, Ordering::Relaxed); }
    data.cast()
}
unsafe extern "C" fn free_buffer(used: &AtomicUsize, data: *mut c_void, len: usize) {
    if data.is_null() { return; }
    let size = len.max(1);
    unsafe { dealloc(data.cast(), Layout::from_size_align_unchecked(size, 8)); }
    used.fetch_sub(size, Ordering::Relaxed);
}
unsafe extern "C" fn drop_allocator(data: *const AtomicUsize) { unsafe { drop(Box::from_raw(data.cast_mut())); } }
static BUFFER_ALLOCATOR: v8::RustAllocatorVtable<AtomicUsize> = v8::RustAllocatorVtable { allocate: allocate_buffer, allocate_uninitialized: allocate_buffer, free: free_buffer, drop: drop_allocator };
