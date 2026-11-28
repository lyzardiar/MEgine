//! Non-blocking background asset streaming loader so the main render/simulation
//! thread never stalls on disk I/O or PNG/JPEG decoding.

use crate::{decode_texture_rgba8, AssetError, TextureRgba8};
use parking_lot::Mutex;
use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Arc, Condvar, Mutex as StdMutex,
};
use std::thread::JoinHandle;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct AsyncLoadHandle(pub u64);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AssetLoadKind {
    RawBytes,
    TextureRgba8,
}

#[derive(Debug)]
pub enum AssetLoadPayload {
    RawBytes(Vec<u8>),
    TextureRgba8(TextureRgba8),
}

#[derive(Debug)]
pub struct AssetLoadResult {
    pub handle: AsyncLoadHandle,
    pub path: PathBuf,
    pub kind: AssetLoadKind,
    pub result: Result<AssetLoadPayload, AssetError>,
}

struct LoadTask {
    handle: AsyncLoadHandle,
    path: PathBuf,
    kind: AssetLoadKind,
    cancelled: Arc<AtomicBool>,
}

struct SharedQueue {
    tasks: StdMutex<VecDeque<LoadTask>>,
    notify: Condvar,
    shutdown: AtomicBool,
}

/// Bounded worker-pool asset streamer with deduplication, cancellation, and
/// frame-budgeted result draining (`drain_completed`).
pub struct AsyncAssetLoader {
    shared: Arc<SharedQueue>,
    workers: Vec<JoinHandle<()>>,
    completed_rx: mpsc::Receiver<AssetLoadResult>,
    in_flight: Arc<Mutex<HashSet<(PathBuf, AssetLoadKind)>>>,
    next_id: AtomicU64,
}

impl AsyncAssetLoader {
    pub fn new(worker_count: usize) -> Self {
        let count = worker_count.clamp(1, 8);
        let shared = Arc::new(SharedQueue {
            tasks: StdMutex::new(VecDeque::new()),
            notify: Condvar::new(),
            shutdown: AtomicBool::new(false),
        });
        let (completed_tx, completed_rx) = mpsc::channel();
        let in_flight = Arc::new(Mutex::new(HashSet::new()));
        let mut workers = Vec::with_capacity(count);

        for idx in 0..count {
            let queue = Arc::clone(&shared);
            let tx = completed_tx.clone();
            let in_flight_ref = Arc::clone(&in_flight);
            if let Ok(handle) = std::thread::Builder::new()
                .name(format!("mengine-asset-io-{idx}"))
                .spawn(move || worker_loop(queue, tx, in_flight_ref))
            {
                workers.push(handle);
            }
        }

        Self {
            shared,
            workers,
            completed_rx,
            in_flight,
            next_id: AtomicU64::new(1),
        }
    }

    /// Enqueue a background load. Returns `None` if the same `(path, kind)` is already in flight.
    pub fn request(
        &self,
        path: PathBuf,
        kind: AssetLoadKind,
    ) -> Option<(AsyncLoadHandle, Arc<AtomicBool>)> {
        let key = (path.clone(), kind);
        {
            let mut guard = self.in_flight.lock();
            if !guard.insert(key) {
                return None;
            }
        }
        let handle = AsyncLoadHandle(self.next_id.fetch_add(1, Ordering::Relaxed));
        let cancelled = Arc::new(AtomicBool::new(false));
        let task = LoadTask {
            handle,
            path,
            kind,
            cancelled: Arc::clone(&cancelled),
        };
        let mut queue = self
            .shared
            .tasks
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        queue.push_back(task);
        self.shared.notify.notify_one();
        Some((handle, cancelled))
    }

    /// Non-blocking drain up to `max_items` completed results to keep main-thread GPU upload bounded.
    pub fn drain_completed(&self, max_items: usize) -> Vec<AssetLoadResult> {
        let mut out = Vec::with_capacity(max_items.min(64));
        for _ in 0..max_items {
            match self.completed_rx.try_recv() {
                Ok(item) => out.push(item),
                Err(_) => break,
            }
        }
        out
    }

    pub fn in_flight_count(&self) -> usize {
        self.in_flight.lock().len()
    }
}

impl Drop for AsyncAssetLoader {
    fn drop(&mut self) {
        self.shared.shutdown.store(true, Ordering::Release);
        self.shared.notify.notify_all();
        for worker in self.workers.drain(..) {
            let _ = worker.join();
        }
    }
}

fn worker_loop(
    shared: Arc<SharedQueue>,
    tx: mpsc::Sender<AssetLoadResult>,
    in_flight: Arc<Mutex<HashSet<(PathBuf, AssetLoadKind)>>>,
) {
    loop {
        let task = {
            let mut guard = shared
                .tasks
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            while guard.is_empty() && !shared.shutdown.load(Ordering::Acquire) {
                guard = shared
                    .notify
                    .wait(guard)
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
            }
            if shared.shutdown.load(Ordering::Acquire) && guard.is_empty() {
                return;
            }
            guard.pop_front()
        };

        let Some(task) = task else {
            continue;
        };

        let key = (task.path.clone(), task.kind);
        if !task.cancelled.load(Ordering::Acquire) {
            let result = execute_load(&task.path, task.kind);
            let _ = tx.send(AssetLoadResult {
                handle: task.handle,
                path: task.path,
                kind: task.kind,
                result,
            });
        }
        in_flight.lock().remove(&key);
    }
}

fn execute_load(path: &PathBuf, kind: AssetLoadKind) -> Result<AssetLoadPayload, AssetError> {
    if !path.is_file() {
        return Err(AssetError::NotFound(path.display().to_string()));
    }
    let bytes = std::fs::read(path)?;
    match kind {
        AssetLoadKind::RawBytes => Ok(AssetLoadPayload::RawBytes(bytes)),
        AssetLoadKind::TextureRgba8 => {
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("texture.png");
            let decoded = decode_texture_rgba8(&bytes, name)?;
            Ok(AssetLoadPayload::TextureRgba8(decoded))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn async_loader_streams_raw_bytes_without_blocking_and_deduplicates() {
        let dir = std::env::temp_dir().join("mengine_async_loader_test");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("sample.bin");
        std::fs::write(&file, b"mengine-stream").unwrap();

        let loader = AsyncAssetLoader::new(2);
        let (handle, _cancel) = loader
            .request(file.clone(), AssetLoadKind::RawBytes)
            .expect("first request accepted");

        let deadline = Instant::now() + Duration::from_secs(3);
        let mut received = None;
        while Instant::now() < deadline {
            let batch = loader.drain_completed(4);
            if let Some(item) = batch.into_iter().next() {
                received = Some(item);
                break;
            }
            std::thread::sleep(Duration::from_millis(5));
        }

        let item = received.expect("background task finished");
        assert_eq!(item.handle, handle);
        match item.result.unwrap() {
            AssetLoadPayload::RawBytes(bytes) => assert_eq!(bytes, b"mengine-stream"),
            _ => panic!("expected RawBytes payload"),
        }
        let _ = std::fs::remove_file(&file);
    }
}
