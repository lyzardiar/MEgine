// Author: MiYu. Drain project viewport work before releasing its renderer and mirror caches.
use parking_lot::{RwLock, RwLockReadGuard};
use std::sync::OnceLock;

#[derive(Default)]
struct ProjectLifetime { generation: RwLock<u64> }
impl ProjectLifetime {
    fn current(&self) -> u64 { *self.generation.read() }
    fn enter(&self, expected: u64) -> Result<RwLockReadGuard<'_, u64>, String> {
        let lease = self.generation.read();
        if *lease != expected { return Err("Viewport session expired: project changed".into()); } Ok(lease)
    }
    fn reset(&self, release: impl FnOnce()) {
        let mut generation = self.generation.write(); *generation = generation.wrapping_add(1); release();
    }
}
static LIFETIME: OnceLock<ProjectLifetime> = OnceLock::new();
fn lifetime() -> &'static ProjectLifetime { LIFETIME.get_or_init(ProjectLifetime::default) }
pub(crate) fn current() -> u64 { lifetime().current() }
pub(crate) fn enter(expected: u64) -> Result<RwLockReadGuard<'static, u64>, String> { lifetime().enter(expected) }
pub(crate) fn reset(release: impl FnOnce()) { lifetime().reset(release); }

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::{Arc, Mutex, mpsc}, thread, time::Duration};

    #[test]
    fn close_drains_inflight_work_releases_payloads_and_rejects_queued_old_requests() {
        let lifetime = Arc::new(ProjectLifetime::default()); let generation = lifetime.current();
        let data = Arc::new(vec![1u8; 4096]); let weak = Arc::downgrade(&data);
        let cache = Arc::new(Mutex::new(Some(data)));
        let (started_tx, started_rx) = mpsc::channel(); let (finish_tx, finish_rx) = mpsc::channel();
        let worker_lifetime = Arc::clone(&lifetime); let worker_cache = Arc::clone(&cache);
        let worker = thread::spawn(move || {
            let _lease = worker_lifetime.enter(generation).unwrap(); started_tx.send(()).unwrap();
            finish_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            let mut cache = worker_cache.lock().unwrap(); let payload = cache.take().unwrap(); *cache = Some(payload);
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let (closing_tx, closing_rx) = mpsc::channel(); let (closed_tx, closed_rx) = mpsc::channel();
        let close_lifetime = Arc::clone(&lifetime); let close_cache = Arc::clone(&cache);
        let close = thread::spawn(move || { closing_tx.send(()).unwrap(); close_lifetime.reset(|| { close_cache.lock().unwrap().take(); }); closed_tx.send(()).unwrap(); });
        closing_rx.recv_timeout(Duration::from_secs(5)).unwrap(); assert!(closed_rx.try_recv().is_err());
        finish_tx.send(()).unwrap(); worker.join().unwrap(); closed_rx.recv_timeout(Duration::from_secs(5)).unwrap(); close.join().unwrap();
        assert!(cache.lock().unwrap().is_none()); assert!(weak.upgrade().is_none());
        assert!(lifetime.enter(generation).is_err()); let next = lifetime.current(); assert_ne!(next, generation);
        let _lease = lifetime.enter(next).unwrap(); *cache.lock().unwrap() = Some(Arc::new(vec![3; 8]));
        assert_eq!(cache.lock().unwrap().as_ref().unwrap().len(), 8);
    }

    #[test]
    fn project_release_clears_all_mirror_revisions_and_retained_pick_frames() {
        use crate::{CAMERA_PREVIEW_SNAPSHOT_WORLD, FILTERED_PLAY_SCENE_WORLD, GAME_SNAPSHOT_WORLD, SCENE_SNAPSHOT_WORLD, native_scene_picking};
        use mengine_core::{World, snapshot::WorldSnapshot};
        let mut source = World::new(); source.spawn_empty(); let generation = current();
        for slot in [&GAME_SNAPSHOT_WORLD, &SCENE_SNAPSHOT_WORLD, &CAMERA_PREVIEW_SNAPSHOT_WORLD, &FILTERED_PLAY_SCENE_WORLD] {
            let mut mirror = slot.get_or_init(Default::default).lock();
            assert_eq!(mirror.update(Some("retained".into()), Some(WorldSnapshot::from_world(&source))).unwrap().iter_entities().count(), 1);
        }
        let owner = native_scene_picking::Owner { project: "project-a".into(), window: "test".into(), generation: 0 };
        let token = native_scene_picking::publish(owner.clone(), Some(mengine_rhi::MeshPickFrame { camera: mengine_rhi::FrameCamera { view: Default::default(), proj: Default::default(), position: Default::default() }, objects: vec![] })).unwrap();
        crate::release_project_viewports(); assert!(enter(generation).is_err());
        assert!(native_scene_picking::read(&owner, &token).is_none());
        for slot in [&GAME_SNAPSHOT_WORLD, &SCENE_SNAPSHOT_WORLD, &CAMERA_PREVIEW_SNAPSHOT_WORLD, &FILTERED_PLAY_SCENE_WORLD] {
            assert!(slot.get().unwrap().lock().update(Some("retained".into()), None).is_err());
        }
    }
}
