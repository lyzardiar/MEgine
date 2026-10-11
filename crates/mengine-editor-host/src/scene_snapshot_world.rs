// Author: MiYu. Retain an edit-mode Scene world across camera-only viewport requests.
use mengine_core::{snapshot::WorldSnapshot, World};
use mengine_scene::SharedSnapshotWorld;

#[derive(Default)]
pub struct SceneSnapshotWorld { mirror: SharedSnapshotWorld, key: Option<String> }

impl SceneSnapshotWorld {
    pub fn update(&mut self, key: Option<String>, snapshot: Option<WorldSnapshot>) -> Result<&World, &'static str> {
        if let Some(snapshot) = snapshot {
            self.mirror.update_owned(snapshot);
            self.key = key;
        } else if key.is_none() || self.key != key {
            return Err("Scene viewport revision expired");
        }
        Ok(self.mirror.world())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scene_references_retain_world_and_expire_after_other_windows_projects_or_changes() {
        let mut cache = SceneSnapshotWorld::default();
        assert!(cache.update(Some("project-a/window-1/revision-1".into()), None).is_err());
        let mut source = World::new(); source.spawn_empty();
        cache.update(Some("project-a/window-1/revision-1".into()), Some(WorldSnapshot::from_world(&source))).unwrap();
        assert_eq!(WorldSnapshot::from_world(cache.update(Some("project-a/window-1/revision-1".into()), None).unwrap()).entities.len(), 1);
        for key in ["project-a/window-2/revision-1", "project-b/window-1/revision-1", "project-a/window-1/revision-2"] { assert!(cache.update(Some(key.into()), None).is_err()); }
        source.spawn_empty();
        cache.update(Some("project-a/window-1/revision-2".into()), Some(WorldSnapshot::from_world(&source))).unwrap();
        assert_eq!(WorldSnapshot::from_world(cache.update(Some("project-a/window-1/revision-2".into()), None).unwrap()).entities.len(), 2);
        assert!(cache.update(Some("project-a/window-1/revision-1".into()), None).is_err());
        cache.update(None, Some(WorldSnapshot::default())).unwrap();
        assert!(cache.update(Some("project-a/window-1/revision-2".into()), None).is_err());
        assert!(cache.update(None, None).is_err());
    }
}
