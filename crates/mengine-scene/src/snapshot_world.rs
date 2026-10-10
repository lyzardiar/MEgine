// Author: MiYu. Materialize immutable viewport snapshots without rebuilding unchanged entities.
use mengine_core::{snapshot::{EntitySnapshot, SharedWorldSnapshot}, Entity, World};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Default)]
pub struct SharedSnapshotWorld {
    world: World,
    entities: HashMap<u64, Entity>,
    previous: HashMap<u64, Arc<EntitySnapshot>>,
}

impl SharedSnapshotWorld {
    pub fn world(&self) -> &World { &self.world }

    /// Structural changes rebuild mappings in snapshot order; stable hierarchy updates only changed records.
    pub fn update(&mut self, snapshot: &SharedWorldSnapshot) {
        let incoming: HashSet<_> = snapshot.entities.iter().map(|entity| entity.entity).collect();
        let topology_changed = incoming.len() != self.entities.len() || self.entities.keys().any(|id| !incoming.contains(id));
        let hierarchy_changed = topology_changed || snapshot.entities.iter().any(|record| self.previous.get(&record.entity).is_none_or(|previous| previous.parent != record.parent));
        if hierarchy_changed { self.world = World::new(); self.entities.clear(); self.previous.clear(); }
        for record in &snapshot.entities { self.entities.entry(record.entity).or_insert_with(|| self.world.spawn_empty()); }
        for record in &snapshot.entities {
            if !hierarchy_changed && self.previous.get(&record.entity).is_some_and(|previous| Arc::ptr_eq(previous, record)) { continue; }
            let entity = self.entities[&record.entity];
            let old: Vec<_> = self.world.serialized_components(entity).into_iter().flat_map(|values| values.keys().cloned()).collect();
            for name in old { if !matches!(name.as_str(), "Parent" | "Children") { self.world.remove_component_by_name(entity, &name); } }
            if let Some(name) = &record.name { self.world.set_component_value(entity, "Name", serde_json::json!({"value":name})); }
            let parent = record.parent.and_then(|id| self.entities.get(&id)).copied();
            let refresh_parent = hierarchy_changed || self.world.get_component::<mengine_core::Parent>(entity).map(|value| value.entity) != parent;
            crate::scene_file::apply_snapshot_entity(&mut self.world, record, &self.entities, refresh_parent);
        }
        self.previous.clear();
        self.previous.extend(snapshot.entities.iter().map(|record| (record.entity, Arc::clone(record))));
        self.world.time.clear_color = glam::Vec4::from_array(snapshot.clear_color);
        self.world.time.frame = snapshot.frame;
        self.world.time.sim_frame = snapshot.sim_frame;
        self.world.time.elapsed = if snapshot.elapsed.is_finite() { snapshot.elapsed.max(0.0) } else { 0.0 };
        self.world.selected = snapshot.selected.and_then(|id| self.entities.get(&id)).copied();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::{generated::{Name, RawImage, Transform}, snapshot::WorldSnapshotCache, Parent};

    #[test]
    fn changed_components_preserve_sibling_order_and_removed_transforms() {
        let mut source = World::new(); let parent = source.spawn_empty(); let first = source.spawn_empty(); let second = source.spawn_empty();
        source.insert_component(first, Transform::default());
        source.set_parent(first, Some(parent)); source.set_parent(second, Some(parent));
        let mut snapshots = WorldSnapshotCache::default(); let original = snapshots.capture(&source);
        let mut mirror = SharedSnapshotWorld::default(); mirror.update(&original);
        let parent_id = mirror.entities[&parent.to_u64()]; let first_id = mirror.entities[&first.to_u64()];
        let children = mirror.world.get_component::<mengine_core::Children>(parent_id).unwrap().entities.clone();
        source.get_component_mut::<Transform>(first).unwrap().position[0] = 8.0;
        source.set_editor_state(first, 7, false); source.set_entity_metadata(first, "changed".into(), 4);
        mirror.update(&snapshots.capture(&source));
        assert_eq!(mirror.world.get_component::<mengine_core::Children>(parent_id).unwrap().entities, children);
        assert_eq!(mirror.world.get_component::<Transform>(first_id).unwrap().position[0], 8.0);
        assert_eq!(mirror.world.sibling_index(first_id), 7); assert!(!mirror.world.entity_active(first_id));
        assert_eq!(mirror.world.entity_tag(first_id), "changed"); assert_eq!(mirror.world.entity_layer(first_id), 4);
        source.remove_component_by_name(first, "Transform"); source.set_parent(first, None);
        mirror.update(&snapshots.capture(&source));
        assert!(mirror.world.get_component::<Transform>(first_id).is_none()); assert!(mirror.world.get_component::<Parent>(first_id).is_none());
        assert_eq!(mirror.world.get_component::<mengine_core::Children>(parent_id).unwrap().entities, vec![mirror.entities[&second.to_u64()]]);
        mirror.update(&original);
        assert_eq!(mirror.world.get_component::<mengine_core::Children>(parent_id).unwrap().entities, children);
        assert_eq!(mirror.world.get_component::<Transform>(first_id).unwrap().position[0], 0.0);
    }

    #[test]
    fn shared_world_updates_values_and_references_across_removal_reuse_and_backward_revisions() {
        let mut source = World::new();
        let discarded = source.spawn_empty(); source.despawn(discarded);
        let parent = source.spawn_empty(); let child = source.spawn_empty(); let unrelated = source.spawn_empty();
        source.insert_component(parent, Name { value: "parent".into() });
        source.insert_component(child, Name { value: "child".into() });
        source.insert_component(child, Transform { position: [4.0, 5.0, 6.0], ..Transform::default() });
        source.insert_component(child, RawImage { render_camera: parent.to_u64().to_string(), ..RawImage::default() });
        source.set_parent(child, Some(parent)); source.selected = Some(child);
        let mut snapshots = WorldSnapshotCache::default(); let original = snapshots.capture(&source);
        let mut mirror = SharedSnapshotWorld::default(); mirror.update(&original);
        let child_id = mirror.entities[&child.to_u64()]; let parent_id = mirror.entities[&parent.to_u64()];
        assert_ne!(parent_id.to_u64(), parent.to_u64());
        assert_eq!(mirror.world.get_component::<Parent>(child_id).unwrap().entity, parent_id);
        assert_eq!(mirror.world.get_component::<RawImage>(child_id).unwrap().render_camera, parent_id.to_u64().to_string());
        let unrelated_id = mirror.entities[&unrelated.to_u64()]; let mut mirror_snapshots = WorldSnapshotCache::default();
        let unchanged = mirror_snapshots.capture(mirror.world()).entities.into_iter().find(|record| record.entity == unrelated_id.to_u64()).unwrap();
        source.get_component_mut::<Transform>(child).unwrap().position[0] = 9.0;
        source.remove_component_by_name(child, "Name"); source.time.elapsed = 2.0;
        mirror.update(&snapshots.capture(&source));
        let current = mirror_snapshots.capture(mirror.world()).entities.into_iter().find(|record| record.entity == unrelated_id.to_u64()).unwrap();
        assert!(Arc::ptr_eq(&unchanged, &current));
        assert_eq!(mirror.world.get_component::<Transform>(child_id).unwrap().position[0], 9.0);
        assert!(mirror.world.get_component::<Name>(child_id).is_none());
        assert_eq!(mirror.world.time.elapsed, 2.0);
        source.despawn(parent); let replacement = source.spawn_empty();
        source.insert_component(replacement, Name { value: "replacement".into() });
        let replaced = snapshots.capture(&source); mirror.update(&replaced);
        assert!(!mirror.entities.contains_key(&parent.to_u64()));
        assert!(mirror.world.get_component::<Parent>(child_id).is_none());
        assert!(mirror.world.get_component::<RawImage>(child_id).unwrap().render_camera.is_empty());
        assert_eq!(mirror.world.selected, Some(child_id));
        mirror.update(&original);
        let restored_parent = mirror.entities[&parent.to_u64()];
        assert_eq!(mirror.world.get_component::<Parent>(child_id).unwrap().entity, restored_parent);
        assert_eq!(mirror.world.get_component::<RawImage>(child_id).unwrap().render_camera, restored_parent.to_u64().to_string());
        assert_eq!(mirror.world.get_component::<Transform>(child_id).unwrap().position, [4.0, 5.0, 6.0]);
        mirror.update(&replaced);
        assert!(mirror.world.get_component::<RawImage>(child_id).unwrap().render_camera.is_empty());
        let mut empty = replaced; empty.entities.clear(); empty.selected = None; mirror.update(&empty);
        assert_eq!(mirror.world.iter_entities().count(), 0); assert_eq!(mirror.world.selected, None);
        mirror.update(&original); assert_eq!(mirror.world.iter_entities().count(), 3);
    }
}
