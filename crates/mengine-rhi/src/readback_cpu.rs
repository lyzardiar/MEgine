// Author: MiYu. Retain bounded independent CPU pixel capacity after the final transport owner releases it.
use std::sync::{Mutex, OnceLock};

const MAX_IDLE_BUFFERS: usize = 3;
const MAX_IDLE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Default)]
struct CpuBuffers { buffers: Vec<Vec<u8>>, bytes: usize }
impl CpuBuffers {
    fn take(&mut self, required: usize) -> Option<Vec<u8>> {
        let index = self.buffers.iter().enumerate().filter(|(_, buffer)| buffer.capacity() >= required).min_by_key(|(_, buffer)| buffer.capacity())?.0;
        let buffer = self.buffers.remove(index); self.bytes -= buffer.capacity(); Some(buffer)
    }

    fn put(&mut self, mut buffer: Vec<u8>) -> Vec<Vec<u8>> {
        let capacity = buffer.capacity();
        if capacity == 0 || capacity > MAX_IDLE_BYTES { return vec![buffer]; }
        buffer.clear(); self.bytes += capacity; self.buffers.push(buffer);
        let mut evicted = Vec::new();
        while self.buffers.len() > MAX_IDLE_BUFFERS || self.bytes > MAX_IDLE_BYTES {
            let old = self.buffers.remove(0); self.bytes -= old.capacity(); evicted.push(old);
        }
        evicted
    }
}

static CPU_BUFFERS: OnceLock<Mutex<CpuBuffers>> = OnceLock::new();
fn buffers() -> &'static Mutex<CpuBuffers> { CPU_BUFFERS.get_or_init(|| Mutex::new(CpuBuffers::default())) }

pub(super) fn take_readback_rgba(required: usize) -> Vec<u8> {
    buffers().lock().unwrap_or_else(|error| error.into_inner()).take(required).unwrap_or_default()
}

/// Return owned pixels only after every reader/copy has completed. No GPU or project owners are retained.
pub fn recycle_readback_rgba(buffer: Vec<u8>) {
    if buffer.capacity() == 0 || buffer.capacity() > MAX_IDLE_BYTES { return; }
    // Free evicted allocations after releasing the cache mutex.
    let evicted = buffers().lock().unwrap_or_else(|error| error.into_inner()).put(buffer);
    drop(evicted);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capacity_is_exclusive_best_fit_and_reused_without_old_length() {
        let mut cache = CpuBuffers::default(); let mut first = vec![1; 4096]; let pointer = first.as_ptr(); first.truncate(5);
        cache.put(first); cache.put(vec![2; 8192]);
        let mut pixels = cache.take(4000).unwrap(); assert_eq!(pixels.as_ptr(), pointer); assert!(pixels.is_empty()); assert_eq!(cache.bytes, 8192);
        assert!(cache.take(9000).is_none()); let mut other = cache.take(4000).unwrap(); assert_ne!(pixels.as_ptr(), other.as_ptr());
        pixels.resize(4000, 3); other.resize(4000, 4); assert!(pixels.iter().all(|byte| *byte == 3)); assert!(other.iter().all(|byte| *byte == 4));
        cache.put(pixels); let recycled = cache.take(4000).unwrap(); assert_eq!(recycled.as_ptr(), pointer); assert!(cache.buffers.is_empty());
    }

    #[test]
    fn idle_capacity_and_entry_budgets_evict_old_buffers_and_reject_oversized_frames() {
        let mut cache = CpuBuffers::default();
        for _ in 0..6 { cache.put(Vec::with_capacity(4 * 1024 * 1024)); assert!(cache.bytes <= MAX_IDLE_BYTES && cache.buffers.len() <= MAX_IDLE_BUFFERS); }
        let newest = Vec::with_capacity(12 * 1024 * 1024); let pointer = newest.as_ptr(); cache.put(newest);
        assert!(cache.bytes <= MAX_IDLE_BYTES); let recycled = cache.take(12 * 1024 * 1024).unwrap(); assert_eq!(recycled.as_ptr(), pointer);
        let before = (cache.bytes, cache.buffers.len()); assert_eq!(cache.put(Vec::with_capacity(MAX_IDLE_BYTES + 1)).len(), 1); assert_eq!((cache.bytes, cache.buffers.len()), before);
        cache.put(Vec::new()); assert_eq!((cache.bytes, cache.buffers.len()), before);
    }
}
