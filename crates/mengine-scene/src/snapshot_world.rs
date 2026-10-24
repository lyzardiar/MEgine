// Author: MiYu. Materialize immutable viewport snapshots without rebuilding unchanged entities.
use mengine_core::{snapshot::{EntitySnapshot, SharedWorldSnapshot, WorldSnapshot}, Entity, World};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Default)]
pub struct SharedSnapshotWorld {
    world: World,
    entities: HashMap<u64, Entity>,
    source_ids: HashMap<u64, u64>,
    previous: HashMap<u64, Arc<EntitySnapshot>>,
    order: Vec<(u64, Entity)>,
}

impl SharedSnapshotWorld {
    pub fn world(&self) -> &World { &self.world }

    pub fn source_entity(&self, native: u64) -> Option<u64> { self.source_ids.get(&native).copied() }

    /// Browser snapshots own their payloads; retain equal records to preserve native component revisions.
    pub fn update_owned(&mut self, snapshot: WorldSnapshot) {
        let entities = snapshot.entities.into_iter().map(|record| {
            self.previous.get(&record.entity).filter(|previous| previous.as_ref() == &record).cloned().unwrap_or_else(|| Arc::new(record))
        }).collect();
        self.update(&SharedWorldSnapshot { entities, frame: snapshot.frame, sim_frame: snapshot.sim_frame, elapsed: snapshot.elapsed, clear_color: snapshot.clear_color, selected: snapshot.selected });
    }

    /// Preserve surviving handles and apply only changed records or invalidated entity references.
    pub fn update(&mut self, snapshot: &SharedWorldSnapshot) {
        let stable = snapshot.entities.len() == self.order.len() && snapshot.entities.iter().zip(&self.order).all(|(record, (id, _))| record.entity == *id && self.previous.get(id).is_some_and(|previous| previous.parent == record.parent));
        if stable {
            for index in 0..self.order.len() {
                let (id, entity) = self.order[index]; let record = &snapshot.entities[index];
                if Arc::ptr_eq(&self.previous[&id], record) { continue; }
                let parent = record.parent.and_then(|id| self.entities.get(&id)).copied();
                if self.world.get_component::<mengine_core::Parent>(entity).map(|value| value.entity) != parent { self.world.set_parent(entity, parent); }
                self.apply_record(entity, record);
                self.previous.insert(id, Arc::clone(record));
            }
            self.apply_metadata(snapshot);
            return;
        }
        let incoming: HashSet<_> = snapshot.entities.iter().map(|entity| entity.entity).collect();
        let mut changed_ids: HashSet<_> = incoming.iter().filter(|id| !self.entities.contains_key(id)).copied().collect();
        let mut removed = Vec::new();
        self.entities.retain(|id, entity| {
            if incoming.contains(id) { return true; }
            changed_ids.insert(*id); removed.push(*entity); false
        });
        if !removed.is_empty() { self.world.despawn_many(removed); }
        let mut hierarchy_changed = !changed_ids.is_empty() || snapshot.entities.iter().any(|record| self.previous.get(&record.entity).is_none_or(|previous| previous.parent != record.parent));
        for record in &snapshot.entities { self.entities.entry(record.entity).or_insert_with(|| self.world.spawn_empty()); }
        let mut order: Vec<_> = snapshot.entities.iter().map(|record| (record.entity, self.entities[&record.entity])).collect();
        if order.len() != incoming.len() { let mut seen = HashSet::new(); order.retain(|(id, _)| seen.insert(*id)); }
        if !self.world.iter_entities().eq(order.iter().map(|(_, entity)| *entity)) {
            assert!(self.world.set_entity_iteration_order(&order.iter().map(|(_, entity)| *entity).collect::<Vec<_>>()));
            hierarchy_changed = true;
        }
        for record in &snapshot.entities {
            let same = self.previous.get(&record.entity).is_some_and(|previous| Arc::ptr_eq(previous, record));
            if !hierarchy_changed && same { continue; }
            let entity = self.entities[&record.entity];
            let parent = record.parent.and_then(|id| self.entities.get(&id)).copied();
            if self.world.get_component::<mengine_core::Parent>(entity).map(|value| value.entity) != parent { self.world.set_parent(entity, parent); }
            let references_changed = !changed_ids.is_empty() && crate::entity_reference::scene_reference_mapping_changed(&record.components, &changed_ids);
            if !references_changed && same { continue; }
            self.apply_record(entity, record);
        }
        if hierarchy_changed {
            let mut children = HashMap::<Entity, Vec<Entity>>::new();
            for (_, entity) in &order {
                if let Some(parent) = self.world.get_component::<mengine_core::Parent>(*entity) { children.entry(parent.entity).or_default().push(*entity); }
            }
            for &(_, entity) in &order {
                let expected = children.remove(&entity).unwrap_or_default();
                let current = self.world.get_component::<mengine_core::Children>(entity);
                if expected.is_empty() { if current.is_some() { self.world.remove_component_by_name(entity, "Children"); } }
                else if current.is_none_or(|value| value.entities != expected) { self.world.insert_component(entity, mengine_core::Children { entities: expected }); }
            }
        }
        self.source_ids.clear();
        self.source_ids.extend(order.iter().map(|(source, native)| (native.to_u64(), *source)));
        self.order = order;
        self.previous.clear();
        self.previous.extend(snapshot.entities.iter().map(|record| (record.entity, Arc::clone(record))));
        self.apply_metadata(snapshot);
    }

    fn apply_record(&mut self, entity: Entity, record: &EntitySnapshot) {
        let old: Vec<_> = self.world.serialized_components(entity).into_iter().flat_map(|values| values.keys().cloned()).collect();
        for name in old { if !matches!(name.as_str(), "Parent" | "Children") { self.world.remove_component_by_name(entity, &name); } }
        if let Some(name) = &record.name { self.world.set_component_value(entity, "Name", serde_json::json!({"value":name})); }
        crate::scene_file::apply_snapshot_entity(&mut self.world, record, &self.entities, false);
    }

    fn apply_metadata(&mut self, snapshot: &SharedWorldSnapshot) {
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
    fn native_source_ids_follow_stable_records_reorder_despawn_and_reused_slots() {
        let mut snapshot: WorldSnapshot = serde_json::from_value(serde_json::json!({"entities":[{"entity":99,"components":{}},{"entity":8589934593u64,"components":{}}]})).unwrap();
        let mut mirror = SharedSnapshotWorld::default(); mirror.update_owned(snapshot.clone());
        let original: Vec<_> = mirror.world().iter_entities().collect();
        assert_eq!(mirror.source_entity(original[0].to_u64()), Some(99)); assert_eq!(mirror.source_entity(original[1].to_u64()), Some(8589934593));
        snapshot.entities.reverse(); mirror.update_owned(snapshot.clone()); mirror.update_owned(snapshot.clone());
        assert_eq!(mirror.source_entity(original[0].to_u64()), Some(99));
        snapshot.entities.pop(); mirror.update_owned(snapshot.clone()); assert_eq!(mirror.source_entity(original[0].to_u64()), None);
        snapshot.entities[0].entity = 123; mirror.update_owned(snapshot);
        let replacement = mirror.world().iter_entities().next().unwrap(); assert_eq!(mirror.source_entity(replacement.to_u64()), Some(123));
        assert_eq!(mirror.source_entity(original[1].to_u64()), None);
    }

    #[test]
    fn topology_edits_preserve_survivors_and_snapshot_traversal_order() {
        let mut source = World::new(); let root = source.spawn_empty();
        let nodes: Vec<_> = (0..6).map(|i| { let entity = source.spawn_empty(); source.insert_component(entity, Name { value: i.to_string() }); source.insert_component(entity, Transform::default()); source.set_parent(entity, Some(root)); entity }).collect();
        let mut cache = WorldSnapshotCache::default(); let original = cache.capture(&source);
        let mut mirror = SharedSnapshotWorld::default(); mirror.update(&original);
        let survivor = mirror.entities[&nodes[5].to_u64()];
        let mut retained_cache = WorldSnapshotCache::default();
        let retained = retained_cache.capture(mirror.world()).entities.into_iter().find(|record| record.entity == survivor.to_u64()).unwrap();
        source.despawn(nodes[0]); source.despawn(nodes[2]);
        let added = source.spawn_empty(); source.insert_component(added, Name { value: "new".into() }); source.set_parent(added, Some(root));
        source.set_parent(nodes[1], Some(nodes[3]));
        let edited = cache.capture(&source);
        for snapshot in [&edited, &original, &edited] {
            mirror.update(snapshot);
            assert_eq!(mirror.entities[&nodes[5].to_u64()], survivor);
            let current = retained_cache.capture(mirror.world()).entities.into_iter().find(|record| record.entity == survivor.to_u64()).unwrap();
            assert!(Arc::ptr_eq(&retained, &current));
            let expected: Vec<_> = snapshot.entities.iter().map(|record| record.name.clone()).collect();
            assert_eq!(mirror.world.iter_entities().map(|entity| mirror.world.get_component::<Name>(entity).map(|name| name.value.clone())).collect::<Vec<_>>(), expected);
            for record in &snapshot.entities {
                let entity = mirror.entities[&record.entity];
                let expected: Vec<_> = snapshot.entities.iter().filter(|child| child.parent == Some(record.entity)).map(|child| mirror.entities[&child.entity]).collect();
                assert_eq!(mirror.world.get_component::<mengine_core::Children>(entity).map(|children| children.entities.clone()).unwrap_or_default(), expected);
            }
        }
    }

    #[test]
    fn unchanged_records_restore_missing_parents_and_all_reference_kinds() {
        let mut source = World::new(); let target = source.spawn_empty(); let owner = source.spawn_empty();
        source.insert_component(owner, Transform::default()); source.set_parent(owner, Some(target));
        let mut cache = WorldSnapshotCache::default(); let mut full = cache.capture(&source);
        let record = Arc::make_mut(full.entities.iter_mut().find(|record| record.entity == owner.to_u64()).unwrap());
        let id = target.to_u64().to_string();
        record.components.insert("RawImage".into(), serde_json::json!({"render_camera":id,"render_root":id}));
        record.components.insert("Canvas".into(), serde_json::json!({"render_camera":id}));
        record.components.insert("Button".into(), serde_json::json!({"on_click":[{"target":id,"method":"test"}]}));
        record.components.insert("CustomRef".into(), serde_json::json!({"__mengine_entity_reference_fields":["target"],"target":id}));
        record.components.insert("TimelineDirector".into(), serde_json::json!({"bindings_json":serde_json::json!({"version":1,"bindings":{"target":{"entity":id}}}).to_string()}));
        let mut missing = full.clone(); missing.entities.retain(|record| record.entity != target.to_u64());
        let mut mirror = SharedSnapshotWorld::default();
        for (snapshot, present) in [(&missing,false),(&full,true),(&missing,false),(&full,true)] {
            mirror.update(snapshot); let owner = mirror.entities[&owner.to_u64()];
            let mapped = mirror.entities.get(&target.to_u64()).copied();
            assert_eq!(mirror.world.get_component::<Parent>(owner).map(|value| value.entity), mapped);
            let components = mirror.world.serialized_components(owner).unwrap();
            for (component, field) in [("RawImage","render_camera"),("RawImage","render_root"),("Canvas","render_camera")] { assert_eq!(components[component][field], mapped.map(|entity| entity.to_u64().to_string()).unwrap_or_default()); }
            for value in [&components["Button"]["on_click"][0]["target"], &components["CustomRef"]["target"]] {
                if present { assert_eq!(*value, mapped.unwrap().to_u64().to_string()); }
                else { assert_eq!(value["$mengine_entity_ref"]["kind"], "missing"); }
            }
            let timeline = mirror.world.get_component::<mengine_core::generated::TimelineDirector>(owner).unwrap();
            let bindings = mengine_assets::parse_timeline_binding_table(&timeline.bindings_json).unwrap();
            assert_eq!(bindings.bindings["target"].missing, !present);
            if present { assert_eq!(bindings.bindings["target"].entity, mapped.unwrap().to_u64().to_string()); }
        }
    }

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
    #[test]
    fn owned_viewport_updates_reuse_unchanged_records_and_apply_changes() {
        let mut source = World::new(); let root = source.spawn_empty(); let child = source.spawn_empty();
        source.insert_component(child, mengine_core::generated::Transform::default()); source.set_parent(child, Some(root));
        let mut mirror = SharedSnapshotWorld::default(); mirror.update_owned(WorldSnapshot::from_world(&source));
        let retained = Arc::clone(&mirror.previous[&child.to_u64()]);
        let mut native_cache = mengine_core::snapshot::WorldSnapshotCache::default();
        let native_before = native_cache.capture(mirror.world()).entities;
        mirror.update_owned(WorldSnapshot::from_world(&source));
        assert!(Arc::ptr_eq(&retained, &mirror.previous[&child.to_u64()])); assert!(native_before.iter().zip(native_cache.capture(mirror.world()).entities).all(|(before, after)| Arc::ptr_eq(before, &after)));
        source.get_component_mut::<mengine_core::generated::Transform>(child).unwrap().position[0] = 7.0;
        source.time.elapsed = 3.0; mirror.update_owned(WorldSnapshot::from_world(&source));
        assert!(!Arc::ptr_eq(&retained, &mirror.previous[&child.to_u64()]));
        assert_eq!(mirror.world.get_component::<mengine_core::generated::Transform>(mirror.entities[&child.to_u64()]).unwrap().position[0], 7.0);
        assert_eq!(mirror.world.time.elapsed, 3.0);
        source.despawn(root); mirror.update_owned(WorldSnapshot::from_world(&source));
        assert_eq!(mirror.world.iter_entities().count(), 1);
        assert!(mirror.world.get_component::<mengine_core::Parent>(mirror.entities[&child.to_u64()]).is_none());
        mirror.update_owned(WorldSnapshot::default()); assert_eq!(mirror.world.iter_entities().count(), 0);
    }

}

#[cfg(test)]
#[path = "snapshot_world_stability_tests.rs"]
mod stability_tests;
