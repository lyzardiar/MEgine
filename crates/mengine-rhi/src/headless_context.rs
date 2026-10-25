// Author: MiYu. Share native headless devices while viewport targets and resource caches stay independent.
use crate::{gpu_profiler::profiling_features, RhiError};
use std::sync::{Arc, Mutex, OnceLock, Weak, atomic::{AtomicBool, AtomicU64, Ordering}};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) struct ContextKey { pub backends: wgpu::Backends, pub uniform_objects: bool }

pub(super) struct GpuContext {
    pub id: u64,
    _instance: wgpu::Instance,
    pub adapter: wgpu::Adapter,
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub poll_gate: Arc<Mutex<()>>,
    pub supports_anisotropy: bool,
    pub indexed_objects: bool,
    lost: Arc<AtomicBool>,
}

impl GpuContext {
    pub async fn new(instance: wgpu::Instance, surface: Option<&wgpu::Surface<'_>>, uniform_objects: bool) -> Result<Self, RhiError> {
        let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, compatible_surface: surface, force_fallback_adapter: false }).await.ok_or(RhiError::NoAdapter)?;
        let supports_anisotropy = adapter.get_downlevel_capabilities().flags.contains(wgpu::DownlevelFlags::ANISOTROPIC_FILTERING);
        let mut required_limits = wgpu::Limits::default();
        let indexed_objects = !uniform_objects && adapter.limits().max_storage_buffer_binding_size as u64 >= required_limits.max_buffer_size;
        if indexed_objects { required_limits.max_storage_buffer_binding_size = required_limits.max_buffer_size as u32; }
        let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor { label: Some("mengine"), required_features: profiling_features(adapter.features(), true), required_limits, memory_hints: Default::default() }, None).await.map_err(|error| RhiError::RequestDevice(error.to_string()))?;
        let lost = Arc::new(AtomicBool::new(false));
        let notification = Arc::clone(&lost);
        device.set_device_lost_callback(move |_, _| notification.store(true, Ordering::Release));
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        Ok(Self { id: NEXT_ID.fetch_add(1, Ordering::Relaxed), _instance: instance, adapter, device, queue, poll_gate: Arc::new(Mutex::new(())), supports_anisotropy, indexed_objects, lost })
    }
}

struct ContextPool<T> { slots: Mutex<Vec<(ContextKey, Weak<T>)>> }
impl<T> Default for ContextPool<T> { fn default() -> Self { Self { slots: Mutex::new(Vec::new()) } } }
impl<T> ContextPool<T> {
    fn load<E>(&self, key: ContextKey, usable: impl Fn(&T) -> bool, create: impl FnOnce() -> Result<T, E>) -> Result<Arc<T>, E> {
        let mut slots = self.slots.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        slots.retain(|(_, value)| value.upgrade().is_some_and(|value| usable(&value)));
        if let Some(value) = slots.iter().find(|(candidate, _)| *candidate == key).and_then(|(_, value)| value.upgrade()) { return Ok(value); }
        let value = Arc::new(create()?);
        slots.push((key, Arc::downgrade(&value)));
        Ok(value)
    }
}

pub(super) fn shared(key: ContextKey) -> Result<Arc<GpuContext>, RhiError> {
    static POOL: OnceLock<ContextPool<GpuContext>> = OnceLock::new();
    POOL.get_or_init(ContextPool::default).load(key, |context| !context.lost.load(Ordering::Acquire), || {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor { backends: key.backends, ..Default::default() });
        pollster::block_on(GpuContext::new(instance, None, key.uniform_objects))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    fn key() -> ContextKey { ContextKey { backends: wgpu::Backends::DX12, uniform_objects: false } }

    #[test]
    fn concurrent_initialization_coalesces_and_pool_owns_only_weak_references() {
        let pool = ContextPool::default(); let calls = AtomicUsize::new(0); let barrier = std::sync::Barrier::new(4);
        let values = std::thread::scope(|scope| {
            let handles = (0..4).map(|_| scope.spawn(|| { barrier.wait(); pool.load(key(), |_| true, || { calls.fetch_add(1, Ordering::SeqCst); Ok::<_, ()>(17) }).unwrap() })).collect::<Vec<_>>();
            handles.into_iter().map(|handle| handle.join().unwrap()).collect::<Vec<_>>()
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1); assert!(values.iter().all(|value| Arc::ptr_eq(value, &values[0])));
        let weak = Arc::downgrade(&values[0]); drop(values); assert!(weak.upgrade().is_none());
        assert_eq!(*pool.load(key(), |_| true, || Ok::<_, ()>(23)).unwrap(), 23);
        assert_eq!(pool.slots.lock().unwrap().len(), 1);
    }

    #[test]
    fn backend_and_object_layout_are_separate_and_failed_creation_is_retryable() {
        let pool = ContextPool::default();
        assert_eq!(pool.load(key(), |_| true, || Err::<u32, _>("device unavailable")).unwrap_err(), "device unavailable");
        let first = pool.load(key(), |_| true, || Ok::<_, ()>(1)).unwrap();
        let uniform = pool.load(ContextKey { uniform_objects: true, ..key() }, |_| true, || Ok::<_, ()>(2)).unwrap();
        let backend = pool.load(ContextKey { backends: wgpu::Backends::VULKAN, ..key() }, |_| true, || Ok::<_, ()>(3)).unwrap();
        assert_eq!((*first, *uniform, *backend), (1, 2, 3));
        assert!(Arc::ptr_eq(&first, &pool.load(key(), |_| true, || panic!("live device must be reused")).unwrap_or_else(|_: ()| unreachable!())));
    }

    #[test]
    fn unusable_context_is_replaced_without_destroying_its_existing_owners() {
        let pool = ContextPool::default();
        let first = pool.load(key(), |_| true, || Ok::<_, ()>(1)).unwrap();
        let replacement = pool.load(key(), |value| *value != 1, || Ok::<_, ()>(2)).unwrap();
        assert_eq!((*first, *replacement), (1, 2));
        assert!(!Arc::ptr_eq(&first, &replacement));
        assert!(Arc::ptr_eq(&replacement, &pool.load(key(), |value| *value != 1, || panic!("replacement must be reused")).unwrap_or_else(|_: ()| unreachable!())));
    }
}
