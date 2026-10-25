// Author: MiYu. Device-local weak lookup coalesces immutable material textures with exact descriptor and pixel equality.
use super::MaterialTextureGpu;
use std::{collections::{hash_map::DefaultHasher, HashMap, VecDeque}, hash::{Hash, Hasher}, sync::{Arc, Weak, atomic::{AtomicUsize, Ordering}}};

pub(super) struct TextureContentKey { descriptor: (u32,u32,bool), pixels: Box<[u8]>, live_bytes: Arc<AtomicUsize> }
impl Drop for TextureContentKey { fn drop(&mut self) { self.live_bytes.fetch_sub(self.pixels.len(), Ordering::Relaxed); } }

pub(super) struct SharedMaterialTextureCache {
    slots: HashMap<u64, Vec<Weak<MaterialTextureGpu>>>,
    order: VecDeque<u64>,
    live_bytes: Arc<AtomicUsize>,
    max_keys: usize,
    max_bytes: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn material_texture_keys_resolve_collisions_descriptor_variants_and_bounded_weak_retention() {
        let renderer = pollster::block_on(crate::Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).unwrap();
        let create = |(width,height,srgb), pixels: &[u8]| super::super::create_material_texture_rgba8(&renderer.device,&renderer.queue,"material_texture",width,height,pixels,srgb);
        let pixels = [255;64]; let mut changed = pixels; changed[0] = 0;
        let mut cache = SharedMaterialTextureCache::with_limits(2,4*pixels.len());
        let a = cache.acquire(7,(4,4,true),&pixels,|| create((4,4,true),&pixels));
        let linear = cache.acquire(7,(4,4,false),&pixels,|| create((4,4,false),&pixels));
        let shape = cache.acquire(7,(2,8,true),&pixels,|| create((2,8,true),&pixels));
        let other = cache.acquire(7,(4,4,true),&changed,|| create((4,4,true),&changed));
        for other in [&linear,&shape,&other] { assert!(!Arc::ptr_eq(&a,other)); }
        let same = cache.acquire(7,(4,4,true),&pixels,|| panic!("exact cache hit must skip GPU creation")); assert!(Arc::ptr_eq(&a,&same));
        let mut next = pixels; next[1] = 0;
        let fallback = cache.acquire(7,(4,4,true),&next,|| create((4,4,true),&next)); assert!(fallback.content_key.is_none());
        assert_eq!(cache.live_bytes.load(Ordering::Relaxed),4*pixels.len());
        let weak = Arc::downgrade(&a); drop(a); drop(same); assert!(weak.upgrade().is_none());
        let admitted = cache.acquire(7,(4,4,true),&next,|| create((4,4,true),&next)); assert!(admitted.content_key.is_some());
        drop(linear); drop(shape); drop(other); drop(admitted); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),0);

        let mut cache = SharedMaterialTextureCache::with_limits(2,32*pixels.len()); let mut owners = Vec::new();
        for key in 0..8 { let mut data = pixels; data[0] = key as u8; owners.push(cache.acquire(key,(4,4,true),&data,|| create((4,4,true),&data))); }
        assert_eq!(cache.slots.len(),2); assert_eq!(cache.order.len(),2);
        for key in 8..16 { let mut data = pixels; data[0] = key as u8; owners.push(cache.acquire(99,(4,4,true),&data,|| create((4,4,true),&data))); }
        assert_eq!(cache.slots.len(),2); assert_eq!(cache.order.len(),2); assert_eq!(cache.slots[&99].len(),4);
        drop(owners); assert_eq!(cache.live_bytes.load(Ordering::Relaxed),0);
    }
}

impl Default for SharedMaterialTextureCache { fn default() -> Self { Self::with_limits(2048,64*1024*1024) } }

impl SharedMaterialTextureCache {
    fn with_limits(max_keys: usize, max_bytes: usize) -> Self { Self { slots: HashMap::new(), order: VecDeque::new(), live_bytes: Arc::new(AtomicUsize::new(0)), max_keys, max_bytes } }

    pub(super) fn fingerprint(descriptor: (u32,u32,bool), pixels: &[u8]) -> u64 {
        let mut hash = DefaultHasher::new(); descriptor.hash(&mut hash); pixels.hash(&mut hash); hash.finish()
    }

    pub(super) fn find(&mut self, hash: u64, descriptor: (u32,u32,bool), pixels: &[u8]) -> Option<Arc<MaterialTextureGpu>> {
        let bucket = self.slots.get_mut(&hash)?; bucket.retain(|entry| entry.strong_count() > 0);
        for entry in bucket {
            if let Some(texture) = entry.upgrade() {
                if texture.content_key.as_ref().is_some_and(|key| key.descriptor == descriptor && key.pixels.as_ref() == pixels) { return Some(texture); }
            }
        }
        None
    }

    pub(super) fn acquire(&mut self, hash: u64, descriptor: (u32,u32,bool), pixels: &[u8], create: impl FnOnce() -> MaterialTextureGpu) -> Arc<MaterialTextureGpu> {
        if let Some(texture) = self.find(hash,descriptor,pixels) { return texture; }
        let mut texture = create();
        if self.max_keys == 0 || pixels.len() > self.max_bytes.saturating_sub(self.live_bytes.load(Ordering::Relaxed)) { return Arc::new(texture); }
        if !self.slots.contains_key(&hash) {
            if self.slots.len() == self.max_keys { self.slots.remove(&self.order.pop_front().unwrap()); }
            self.order.push_back(hash);
        }
        self.live_bytes.fetch_add(pixels.len(),Ordering::Relaxed);
        texture.content_key = Some(TextureContentKey { descriptor, pixels:pixels.into(), live_bytes:Arc::clone(&self.live_bytes) });
        let texture = Arc::new(texture); let bucket = self.slots.entry(hash).or_default();
        if bucket.len() == 4 { bucket.remove(0); }
        bucket.push(Arc::downgrade(&texture)); texture
    }
}
