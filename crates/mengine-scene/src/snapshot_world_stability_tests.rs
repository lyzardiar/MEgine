// Author: MiYu. Compare topology-stable updates with the complete pre-optimization materializer.
use super::*;
use std::{hint::black_box, time::Instant};

mod baseline {
// Author: MiYu. Materialize immutable viewport snapshots without rebuilding unchanged entities.
use mengine_core::{snapshot::{EntitySnapshot, SharedWorldSnapshot, WorldSnapshot}, Entity, World};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Default)]
pub struct SharedSnapshotWorld {
    world: World,
    pub(super) entities: HashMap<u64, Entity>,
    previous: HashMap<u64, Arc<EntitySnapshot>>,
}

impl SharedSnapshotWorld {
    pub fn world(&self) -> &World { &self.world }

    /// Browser snapshots own their payloads; retain equal records to preserve native component revisions.
    pub fn update_owned(&mut self, snapshot: WorldSnapshot) {
        let entities = snapshot.entities.into_iter().map(|record| {
            self.previous.get(&record.entity).filter(|previous| previous.as_ref() == &record).cloned().unwrap_or_else(|| Arc::new(record))
        }).collect();
        self.update(&SharedWorldSnapshot { entities, frame: snapshot.frame, sim_frame: snapshot.sim_frame, elapsed: snapshot.elapsed, clear_color: snapshot.clear_color, selected: snapshot.selected });
    }

    /// Preserve surviving handles and apply only changed records or invalidated entity references.
    pub fn update(&mut self, snapshot: &SharedWorldSnapshot) {
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
        let mut order: Vec<_> = snapshot.entities.iter().map(|record| self.entities[&record.entity]).collect();
        if order.len() != incoming.len() { let mut seen = HashSet::new(); order.retain(|entity| seen.insert(*entity)); }
        if !self.world.iter_entities().eq(order.iter().copied()) {
            assert!(self.world.set_entity_iteration_order(&order));
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
            let old: Vec<_> = self.world.serialized_components(entity).into_iter().flat_map(|values| values.keys().cloned()).collect();
            for name in old { if !matches!(name.as_str(), "Parent" | "Children") { self.world.remove_component_by_name(entity, &name); } }
            if let Some(name) = &record.name { self.world.set_component_value(entity, "Name", serde_json::json!({"value":name})); }
            crate::scene_file::apply_snapshot_entity(&mut self.world, record, &self.entities, false);
        }
        if hierarchy_changed {
            let mut children = HashMap::<Entity, Vec<Entity>>::new();
            for entity in &order {
                if let Some(parent) = self.world.get_component::<mengine_core::Parent>(*entity) { children.entry(parent.entity).or_default().push(*entity); }
            }
            for entity in order {
                let expected = children.remove(&entity).unwrap_or_default();
                let current = self.world.get_component::<mengine_core::Children>(entity);
                if expected.is_empty() { if current.is_some() { self.world.remove_component_by_name(entity, "Children"); } }
                else if current.is_none_or(|value| value.entities != expected) { self.world.insert_component(entity, mengine_core::Children { entities: expected }); }
            }
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


}

fn canonical_snapshot(world: &World, entities: &HashMap<u64, Entity>) -> WorldSnapshot {
    // Independent hash maps can release slots in different orders; compare through authored IDs.
    let reverse: HashMap<_, _> = entities.iter().map(|(source, local)| (local.to_u64(), Entity::from_u64(*source))).collect();
    let mut snapshot = WorldSnapshot::from_world(world);
    snapshot.selected = snapshot.selected.map(|id| reverse[&id].to_u64());
    for record in &mut snapshot.entities {
        record.entity = reverse[&record.entity].to_u64(); record.parent = record.parent.map(|id| reverse[&id].to_u64());
        let mut values = serde_json::to_value(&record.components).unwrap();
        crate::entity_reference::remap_scene_entity_references(&mut values, &reverse).unwrap();
        record.components = serde_json::from_value(values).unwrap();
    }
    snapshot
}

fn assert_worlds(previous: &baseline::SharedSnapshotWorld, current: &SharedSnapshotWorld) {
    assert_eq!(canonical_snapshot(previous.world(), &previous.entities), canonical_snapshot(current.world(), &current.entities));
}

#[test]
fn stable_updates_match_full_materialization_across_topology_and_duplicate_ids() {
    let mut source = World::new();
    let root = source.spawn_empty(); let child = source.spawn_empty(); let target = source.spawn_empty();
    source.set_parent(child, Some(root));
    source.insert_component(child, mengine_core::generated::Transform::default());
    source.insert_component(child, mengine_core::generated::RawImage { render_camera: target.to_u64().to_string(), ..Default::default() });
    let mut cache = mengine_core::snapshot::WorldSnapshotCache::default();
    let original = cache.capture(&source);
    let mut updates = vec![original.clone()];
    let mut clock = original.clone(); clock.frame = 99; clock.sim_frame = 70; clock.elapsed = 2.0; clock.selected = Some(child.to_u64()); clock.clear_color = [0.2,0.4,0.6,1.0]; updates.push(clock.clone());
    let mut changed = clock.clone();
    let record = Arc::make_mut(&mut changed.entities[1]); record.name = Some("changed".into()); record.sibling_index = -2; record.active = false; record.tag = "modified".into(); record.layer = 7;
    record.components.insert("Transform".into(), serde_json::json!({"position":[3,4,5]})); updates.push(changed.clone());
    let mut reordered = changed.clone(); reordered.entities.reverse(); updates.push(reordered);
    let mut parent = changed.clone(); Arc::make_mut(&mut parent.entities[1]).parent = Some(target.to_u64()); updates.push(parent);
    let mut missing = changed.clone(); missing.entities.remove(2); updates.push(missing.clone());
    let mut replacement = missing.clone(); let mut reused = original.entities[2].as_ref().clone(); reused.entity += 1u64 << 32; replacement.entities.push(Arc::new(reused)); updates.push(replacement);
    let mut duplicate = changed.clone(); let mut last = duplicate.entities[1].as_ref().clone(); last.name = Some("last duplicate".into()); last.parent = None; duplicate.entities.push(Arc::new(last)); updates.push(duplicate.clone()); updates.push(duplicate);
    let mut removed_component = changed.clone(); Arc::make_mut(&mut removed_component.entities[1]).components.remove("Transform"); updates.push(removed_component);
    let mut invalid_clock = original.clone(); invalid_clock.elapsed = f64::NAN; invalid_clock.selected = Some(u64::MAX); updates.push(invalid_clock);
    let mut empty = original.clone(); empty.entities.clear(); updates.push(empty); updates.push(changed); updates.push(original.clone());
    let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default();
    for snapshot in updates.iter().chain(updates.iter().rev()) { previous.update(snapshot); current.update(snapshot); assert_worlds(&previous, &current); }
    previous.update(&original); current.update(&original);
    let mut old_cache = mengine_core::snapshot::WorldSnapshotCache::default(); let before = old_cache.capture(current.world());
    for _ in 0..3 { current.update(&original); }
    let after = old_cache.capture(current.world());
    assert!(before.entities.iter().zip(&after.entities).all(|(a,b)| Arc::ptr_eq(a,b)), "unchanged component revisions survive the fast path");
    let owned = WorldSnapshot::from_world(&source); previous.update_owned(owned.clone()); current.update_owned(owned); assert_worlds(&previous, &current);
}

#[test]
#[ignore = "manual Amazonia world materialization comparison with the previous production implementation"]
fn benchmark_stable_snapshot_world() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let scene = "Assets/Maps/amazonia/Scenes/Main.mscene";
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(scene)).unwrap()).unwrap();
    let source: WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let a = SharedWorldSnapshot { entities: source.entities.into_iter().map(Arc::new).collect(), frame: source.frame, sim_frame: source.sim_frame, elapsed: source.elapsed, clear_color: source.clear_color, selected: source.selected };
    for changed_count in [0,64] {
        let mut b = a.clone(); b.frame += 1; b.sim_frame += 1; b.elapsed += 1.0 / 60.0;
        let mut count = 0;
        for record in &mut b.entities { if record.components.get("Transform").is_some_and(|value| value["position"][0].as_f64().is_some()) && count < changed_count {
            let transform = Arc::make_mut(record).components.get_mut("Transform").unwrap();
            let x = transform["position"][0].as_f64().unwrap(); transform["position"][0] = serde_json::json!(x + 0.5); count += 1;
        } }
        assert_eq!(count,changed_count);
        let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default();
        for snapshot in [&a,&b,&a] { previous.update(snapshot); current.update(snapshot); assert_worlds(&previous,&current); }
        let mut samples = [Vec::new(),Vec::new()];
        for run in 0..11 { for mode in [run%2,1-run%2] {
            let started = Instant::now();
            for i in 0..20 { let snapshot = if i%2==0 { &b } else { &a }; if mode==0 { previous.update(black_box(snapshot)); } else { current.update(black_box(snapshot)); } }
            if run>=2 { samples[mode].push(started.elapsed().as_secs_f64()*1000.0/20.0); }
        } }
        assert_worlds(&previous,&current);
        println!("STABLE_SNAPSHOT_WORLD {}",serde_json::json!({"scene":scene,"entities":a.entities.len(),"changedRecords":changed_count,"samplesMs":samples,"iterations":20,"warmups":2,"orderEntryBytes":std::mem::size_of::<(u64,Entity)>(),"orderCapacity":current.order.capacity(),"scope":"Previous production materialization versus stable topology path, alternating clocks or 64 transforms; excludes simulation, IPC and renderer"}));
    }
}
