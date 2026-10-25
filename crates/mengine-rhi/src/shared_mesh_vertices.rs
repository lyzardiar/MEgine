// Author: MiYu. Weak device-local lookup shares exact immutable vertex contents across live viewport meshes.
use super::{MeshVertexBufferPool, Vertex};
use std::{collections::{hash_map::DefaultHasher, HashMap, VecDeque}, hash::{Hash, Hasher}, sync::{Arc, Weak, atomic::{AtomicUsize, Ordering}}};

pub(crate) struct SharedVertices { pub buffer: wgpu::Buffer, contents: Box<[u8]>, live_bytes: Arc<AtomicUsize> }
impl Drop for SharedVertices { fn drop(&mut self) { self.live_bytes.fetch_sub(self.contents.len(), Ordering::Relaxed); } }

pub(crate) struct SharedVertexCache {
    slots: HashMap<u64, Vec<Weak<SharedVertices>>>,
    order: VecDeque<u64>,
    live_bytes: Arc<AtomicUsize>,
    max_keys: usize,
    max_bytes: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_bytes_resolve_collisions_and_bound_key_payload_and_weak_metadata() {
        let renderer = pollster::block_on(crate::Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).unwrap();
        let vertices = [Vertex { position:[0.0,0.0,0.5], normal:[0.0,0.0,1.0], uv:[0.5,0.5] };3];
        let mut normal = vertices; normal[0].normal[0] = 0.25;
        let mut uv = vertices; uv[0].uv[0] = 0.25;
        let bytes = std::mem::size_of_val(&vertices); let mut idle = MeshVertexBufferPool::default();
        let mut cache = SharedVertexCache::with_limits(2, 2*bytes);
        let (a, first, _) = cache.acquire(7, &renderer.device, &renderer.queue, &vertices, &mut idle);
        let (b, second, reused) = cache.acquire(7, &renderer.device, &renderer.queue, &normal, &mut idle); assert!(!reused); assert_ne!(a,b);
        let (same, held, reused) = cache.acquire(7, &renderer.device, &renderer.queue, &vertices, &mut idle); assert!(reused); assert_eq!(same,a); assert!(Arc::ptr_eq(first.as_ref().unwrap(),held.as_ref().unwrap()));
        let (_, fallback, _) = cache.acquire(7, &renderer.device, &renderer.queue, &uv, &mut idle); assert!(fallback.is_none()); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),2*bytes);
        let expired = Arc::downgrade(first.as_ref().unwrap()); drop(first); drop(held); assert!(expired.upgrade().is_none()); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),bytes);
        let (_, third, reused) = cache.acquire(7, &renderer.device, &renderer.queue, &uv, &mut idle); assert!(!reused); assert!(third.is_some());
        drop(second); drop(third); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),0);

        let mut cache = SharedVertexCache::with_limits(2, 32*bytes); let mut owners = Vec::new();
        for key in 0..8 { let mut data = vertices; data[0].position[0] = key as f32; owners.push(cache.acquire(key, &renderer.device, &renderer.queue, &data, &mut idle).1.unwrap()); }
        assert_eq!(cache.slots.len(),2); assert_eq!(cache.order.len(),2); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),8*bytes);
        for key in 8..16 { let mut data = vertices; data[0].position[0] = key as f32; owners.push(cache.acquire(99, &renderer.device, &renderer.queue, &data, &mut idle).1.unwrap()); }
        assert_eq!(cache.slots.len(),2); assert_eq!(cache.order.len(),2); assert_eq!(cache.slots[&99].len(),4);
        drop(owners); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),0);
    }
}

impl Default for SharedVertexCache { fn default() -> Self { Self::with_limits(16_384, 64 * 1024 * 1024) } }

impl SharedVertexCache {
    fn with_limits(max_keys: usize, max_bytes: usize) -> Self { Self { slots: HashMap::new(), order: VecDeque::new(), live_bytes: Arc::new(AtomicUsize::new(0)), max_keys, max_bytes } }

    pub(crate) fn fingerprint(vertices: &[Vertex]) -> u64 {
        let mut hash = DefaultHasher::new(); bytemuck::cast_slice::<Vertex,u8>(vertices).hash(&mut hash); hash.finish()
    }

    pub(crate) fn acquire(&mut self, hash: u64, device: &wgpu::Device, queue: &wgpu::Queue, vertices: &[Vertex], idle: &mut MeshVertexBufferPool) -> (wgpu::Buffer, Option<Arc<SharedVertices>>, bool) {
        let contents = bytemuck::cast_slice::<Vertex,u8>(vertices);
        if let Some(bucket) = self.slots.get_mut(&hash) {
            bucket.retain(|entry| entry.strong_count() > 0);
            for entry in bucket {
                if let Some(shared) = entry.upgrade() {
                    if shared.contents.as_ref() == contents { return (shared.buffer.clone(), Some(shared), true); }
                }
            }
        }
        let (buffer, reused) = idle.upload(device, queue, vertices);
        if self.max_keys == 0 || contents.len() > self.max_bytes.saturating_sub(self.live_bytes.load(Ordering::Relaxed)) { return (buffer, None, reused); }
        if !self.slots.contains_key(&hash) {
            if self.slots.len() == self.max_keys { self.slots.remove(&self.order.pop_front().unwrap()); }
            self.order.push_back(hash);
        }
        self.live_bytes.fetch_add(contents.len(), Ordering::Relaxed);
        let shared = Arc::new(SharedVertices { buffer: buffer.clone(), contents: contents.into(), live_bytes: Arc::clone(&self.live_bytes) });
        let bucket = self.slots.entry(hash).or_default();
        if bucket.len() == 4 { bucket.remove(0); }
        bucket.push(Arc::downgrade(&shared));
        (buffer, Some(shared), reused)
    }
}
