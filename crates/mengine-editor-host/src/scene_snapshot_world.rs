// Author: MiYu. Retain Scene worlds across camera requests and filter published Play revisions.
use mengine_core::{snapshot::{SharedWorldSnapshot, WorldSnapshot}, World};
use mengine_scene::SharedSnapshotWorld;
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub struct SceneSnapshotWorld { mirror: SharedSnapshotWorld, key: Option<String> }

impl SceneSnapshotWorld {
    pub fn source_entity(&self, native: u64) -> Option<u64> { self.mirror.source_entity(native) }

    /// Filter source IDs and inactive ancestry before the mirror allocates native entity IDs.
    pub fn update_filtered(&mut self, snapshot: &SharedWorldSnapshot, hidden_ids: &[u64]) -> &World {
        let filtered = filter_scene_snapshot(snapshot, hidden_ids);
        self.mirror.update(&filtered); self.key = None;
        self.mirror.world()
    }

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

pub(crate) fn filter_scene_snapshot(snapshot: &SharedWorldSnapshot, hidden_ids: &[u64]) -> SharedWorldSnapshot {
    let hidden: HashSet<_> = hidden_ids.iter().copied().collect();
    let records: HashMap<_, _> = snapshot.entities.iter().map(|record| (record.entity, record)).collect();
    let mut active = HashMap::new();
    let mut filtered = snapshot.clone();
    filtered.entities.retain(|record| {
        let mut current = Some(record.entity); let mut allowed = true;
        let mut path = Vec::new(); let mut visiting = HashSet::new();
        while let Some(id) = current {
            if let Some(cached) = active.get(&id) { allowed = *cached; break; }
            if hidden.contains(&id) { allowed = false; break; }
            let Some(record) = records.get(&id) else { allowed = false; break; };
            if !record.active { allowed = false; break; }
            if !visiting.insert(id) { break; }
            path.push(id); current = record.parent;
        }
        for id in path { active.insert(id, allowed); }
        allowed
    });
    filtered
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::{generated::{Name, Transform}, snapshot::WorldSnapshotCache};
    use std::sync::Arc;

    fn names(world: &World) -> Vec<String> {
        let mut names: Vec<_> = world.iter_entities().filter_map(|entity| world.get_component::<Name>(entity).map(|name| name.value.clone())).collect();
        names.sort(); names
    }

    #[test]
    fn filtered_revisions_preserve_source_ids_ancestry_records_and_backward_updates() {
        let source: WorldSnapshot = serde_json::from_value(serde_json::json!({"frame":4,"sim_frame":4,"elapsed":2,"selected":42,"clear_color":[0.2,0.3,0.4,1],"entities":[
            {"entity":4294967297u64,"name":"Hidden","components":{}},
            {"entity":42,"name":"Child","parent":4294967297u64,"components":{}},
            {"entity":43,"name":"Grandchild","parent":42,"components":{}},
            {"entity":1,"name":"Visible","components":{}},
            {"entity":45,"name":"Visible child","parent":1,"components":{"Transform":{"position":[1,2,3]}}},
            {"entity":46,"name":"Inactive","active":false,"components":{}},
            {"entity":47,"name":"Inactive child","parent":46,"components":{}},
            {"entity":48,"name":"Orphan","parent":999,"components":{}}
        ]})).unwrap();
        let mut shared = SharedWorldSnapshot { entities: source.entities.iter().cloned().map(Arc::new).collect(), frame: source.frame, sim_frame: source.sim_frame, elapsed: source.elapsed, clear_color: source.clear_color, selected: source.selected };
        let original = shared.clone(); let mut cache = SceneSnapshotWorld::default(); let mut captures = WorldSnapshotCache::default();
        let world = cache.update_filtered(&shared, &[4294967297]);
        assert_eq!(names(world), vec!["Visible", "Visible child"]); assert!(world.selected.is_none());
        let mut spawned = (*shared.entities[3]).clone(); spawned.entity = 90; spawned.name = Some("New hidden child".into()); spawned.parent = Some(43); shared.entities.push(Arc::new(spawned));
        assert_eq!(names(cache.update_filtered(&shared, &[4294967297])), vec!["Visible", "Visible child"]);
        let world = cache.update_filtered(&shared, &[4294967297]);
        assert_eq!(world.time.frame, 4); assert_eq!(world.time.elapsed, 2.0);
        let native = captures.capture(world); let visible = native.entities.iter().find(|entity| entity.name.as_deref() == Some("Visible")).unwrap().clone();
        assert_eq!(cache.source_entity(visible.entity), Some(1));
        let mut changed = (*shared.entities[4]).clone(); changed.components.get_mut("Transform").unwrap()["position"][0] = serde_json::json!(7);
        shared.entities[4] = Arc::new(changed); shared.frame = 5;
        let world = cache.update_filtered(&shared, &[4294967297]);
        let child = world.iter_entities().find(|id| world.get_component::<Name>(*id).is_some_and(|name| name.value == "Visible child")).unwrap();
        assert_eq!(world.get_component::<Transform>(child).unwrap().position[0], 7.0);
        let next = captures.capture(world); assert!(Arc::ptr_eq(&visible, next.entities.iter().find(|entity| entity.name.as_deref() == Some("Visible")).unwrap()));
        let mut reparented = (*shared.entities[4]).clone(); reparented.parent = Some(42); shared.entities[4] = Arc::new(reparented);
        assert_eq!(names(cache.update_filtered(&shared, &[4294967297])), vec!["Visible"]);
        assert_eq!(names(cache.update_filtered(&original, &[4294967297])), vec!["Visible", "Visible child"]);
        let mut replacement = (*shared.entities[0]).clone(); replacement.entity = 8589934593; replacement.name = Some("Reused slot".into()); shared.entities[0] = Arc::new(replacement);
        assert_eq!(names(cache.update_filtered(&shared, &[4294967297])), vec!["Reused slot", "Visible"]);
        assert_eq!(names(cache.update_filtered(&original, &[1])), vec!["Child", "Grandchild", "Hidden"]);
        assert_eq!(original.clone().into_owned(), source);
    }

    #[test]
    fn filtered_views_invalidate_edit_keys_and_allow_empty_or_all_hidden_worlds() {
        let mut cache = SceneSnapshotWorld::default(); let mut source = World::new(); let id = source.spawn_empty();
        cache.update(Some("edit".into()), Some(WorldSnapshot::from_world(&source))).unwrap();
        let shared = WorldSnapshotCache::default().capture(&source);
        assert_eq!(cache.update_filtered(&shared, &[id.to_u64()]).iter_entities().count(), 0);
        assert!(cache.update(Some("edit".into()), None).is_err());
        assert_eq!(cache.update_filtered(&shared, &[]).iter_entities().count(), 1);
        let mut empty = shared; empty.entities.clear();
        assert_eq!(cache.update_filtered(&empty, &[id.to_u64()]).iter_entities().count(), 0);
    }

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
