// Author: MiYu. Share validated immutable pose sources without retaining unused project assets.
use super::GltfPoseSource;
use crate::AssetError;
use parking_lot::Mutex;
use std::{collections::HashMap, ops::Deref, path::{Path, PathBuf}, sync::{Arc, OnceLock, Weak}, time::SystemTime};

#[derive(Clone, PartialEq)]
pub(super) struct DependencyStamp { pub path: PathBuf, request: PathBuf, pub(super) bytes: u64, modified: SystemTime }
impl DependencyStamp {
    pub(super) fn read(request: &Path) -> Result<Self, AssetError> {
        let path = request.canonicalize()?;
        let metadata = std::fs::metadata(&path)?;
        if !metadata.is_file() { return Err(AssetError::Gltf("pose dependency is not a file".into())); }
        Ok(Self { path, request: request.into(), bytes: metadata.len(), modified: metadata.modified()? })
    }
    pub(super) fn is_current(&self) -> bool { Self::read(&self.request).is_ok_and(|stamp| stamp == *self) }
}

/// Validated source version; cameras and sampled poses remain owned by each caller.
pub struct SharedGltfPoseSource { source: GltfPoseSource, dependencies: Vec<DependencyStamp> }
impl Deref for SharedGltfPoseSource { type Target = GltfPoseSource; fn deref(&self) -> &Self::Target { &self.source } }
pub struct SharedPoseLoad { pub source: Arc<SharedGltfPoseSource>, pub reused: bool }

type SourceKey = (PathBuf, PathBuf);
type SourceSlot = Arc<Mutex<Weak<SharedGltfPoseSource>>>;
#[derive(Default)]
struct SourcePool { slots: Mutex<HashMap<SourceKey, SourceSlot>> }
impl SourcePool {
    fn load(&self, path: &Path, root: &Path) -> Result<SharedPoseLoad, AssetError> {
        let root = root.canonicalize()?;
        let path = path.canonicalize()?;
        if !path.starts_with(&root) { return Err(AssetError::Gltf("pose asset is outside the project".into())); }
        let slot = {
            let mut slots = self.slots.lock();
            let key = (root.clone(), path.clone());
            if !slots.contains_key(&key) && slots.len() >= 128 {
                // In-flight loads retain their slot; live sources retain their weak lookup entry.
                slots.retain(|_, slot| Arc::strong_count(slot) > 1 || slot.try_lock().is_none_or(|source| source.strong_count() > 0));
            }
            Arc::clone(slots.entry(key).or_insert_with(|| Arc::new(Mutex::new(Weak::new()))))
        };
        // Serialize only requests for this exact project/source, never unrelated asset decoding.
        let mut cached = slot.lock();
        if let Some(source) = cached.upgrade().filter(|source| source.is_current()) { return Ok(SharedPoseLoad { source, reused: true }); }
        let (source, dependencies) = GltfPoseSource::load_project_source(&path, &root)?;
        let source = Arc::new(SharedGltfPoseSource { source, dependencies });
        *cached = Arc::downgrade(&source);
        Ok(SharedPoseLoad { source, reused: false })
    }
}

impl SharedGltfPoseSource {
    pub fn load(path: &Path, root: &Path) -> Result<SharedPoseLoad, AssetError> {
        static POOL: OnceLock<SourcePool> = OnceLock::new();
        POOL.get_or_init(SourcePool::default).load(path, root)
    }
    pub fn is_current(&self) -> bool { self.dependencies.iter().all(DependencyStamp::is_current) }
    /// Source-file budget used by existing caller caches; not a measurement of decoded heap bytes.
    pub fn dependency_bytes(&self) -> u64 { let mut paths = std::collections::HashSet::new(); self.dependencies.iter().filter(|stamp| paths.insert(&stamp.path)).map(|stamp| stamp.bytes).sum() }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("mengine-shared-source-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(root.join("project")).unwrap();
            let fixture = Self(root); fixture.write(1., false); fixture
        }
        fn root(&self) -> PathBuf { self.0.join("project") }
        fn path(&self) -> PathBuf { self.root().join("pose.gltf") }
        fn write(&self, offset: f32, padding: bool) {
            let document = serde_json::json!({"asset":{"version":"2.0"},"buffers":[{"uri":"pose%20data.bin","byteLength":32}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":8},{"buffer":0,"byteOffset":8,"byteLength":24}],"accessors":[{"bufferView":0,"componentType":5126,"count":2,"type":"SCALAR","min":[0],"max":[1]},{"bufferView":1,"componentType":5126,"count":2,"type":"VEC3"}],"nodes":[{}],"animations":[{"samplers":[{"input":0,"output":1}],"channels":[{"sampler":0,"target":{"node":0,"path":"translation"}}]}]});
            if !self.path().exists() { std::fs::write(self.path(), document.to_string()).unwrap(); }
            let mut values = vec![0f32, 1., 0., 0., 0., offset, 0., 0.]; if padding { values.push(0.); }
            std::fs::write(self.root().join("pose data.bin"), values.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<_>>()).unwrap();
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    #[test]
    fn concurrent_consumers_share_one_decoded_source_and_release_ownership() {
        let fixture = Fixture::new(); let pool = SourcePool::default(); let barrier = std::sync::Barrier::new(8);
        let results = std::thread::scope(|scope| {
            let handles = (0..8).map(|_| scope.spawn(|| { barrier.wait(); pool.load(&fixture.path(), &fixture.root()).unwrap() })).collect::<Vec<_>>();
            handles.into_iter().map(|handle| handle.join().unwrap()).collect::<Vec<_>>()
        });
        assert_eq!(results.iter().filter(|result| !result.reused).count(), 1);
        assert!(results.iter().all(|result| Arc::ptr_eq(&results[0].source, &result.source)));
        let weak = Arc::downgrade(&results[0].source); drop(results); assert!(weak.upgrade().is_none());
        assert!(!pool.load(&fixture.path(), &fixture.root()).unwrap().reused);
    }

    #[test]
    fn changed_or_missing_buffer_never_reuses_old_version_and_recovery_is_retryable() {
        let fixture = Fixture::new(); let pool = SourcePool::default();
        let first = pool.load(&fixture.path(), &fixture.root()).unwrap().source;
        fixture.write(8., true); assert!(!first.is_current());
        let next = pool.load(&fixture.path(), &fixture.root()).unwrap(); assert!(!next.reused); assert!(!Arc::ptr_eq(&first, &next.source));
        assert_eq!(first.sample_nodes(0, 6, 12, None).unwrap()[0].matrix.w_axis.x, 0.5);
        assert_eq!(next.source.sample_nodes(0, 6, 12, None).unwrap()[0].matrix.w_axis.x, 4.);
        std::fs::remove_file(fixture.root().join("pose data.bin")).unwrap();
        assert!(pool.load(&fixture.path(), &fixture.root()).is_err()); fixture.write(8., true);
        assert!(pool.load(&fixture.path(), &fixture.root()).is_ok());
    }

    #[test]
    fn shared_sources_cannot_bypass_a_narrower_project_boundary() {
        let fixture = Fixture::new(); let pool = SourcePool::default();
        std::fs::rename(fixture.root().join("pose data.bin"), fixture.0.join("outside.bin")).unwrap();
        let mut doc: serde_json::Value = serde_json::from_slice(&std::fs::read(fixture.path()).unwrap()).unwrap();
        doc["buffers"][0]["uri"] = serde_json::json!("../outside.bin"); std::fs::write(fixture.path(), doc.to_string()).unwrap();
        let broad = pool.load(&fixture.path(), &fixture.0).unwrap(); assert!(broad.source.is_current());
        assert!(pool.load(&fixture.path(), &fixture.root()).is_err());
    }
}
