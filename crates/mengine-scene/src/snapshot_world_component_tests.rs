// Author: MiYu. Compare component deltas with the pinned full-record materializer.
use super::*;

// Pinned 9f352cb production materializer; entity-map visibility supports canonical assertions.
mod baseline {
// Author: MiYu. Materialize immutable viewport snapshots without rebuilding unchanged entities.
use mengine_core::{snapshot::{EntitySnapshot, SharedWorldSnapshot, WorldSnapshot}, Entity, World};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Default)]
pub struct SharedSnapshotWorld {
    world: World,
    pub(super) entities: HashMap<u64, Entity>,
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

}

fn canonical_snapshot(world: &World, entities: &HashMap<u64, Entity>) -> WorldSnapshot {
    let reverse: HashMap<_, _> = entities.iter().map(|(source, local)| (local.to_u64(), Entity::from_u64(*source))).collect();
    let mut snapshot = WorldSnapshot::from_world(world); snapshot.selected = snapshot.selected.map(|id| reverse[&id].to_u64());
    for record in &mut snapshot.entities {
        record.entity = reverse[&record.entity].to_u64(); record.parent = record.parent.map(|id| reverse[&id].to_u64());
        let mut values = serde_json::to_value(&record.components).unwrap(); crate::entity_reference::remap_scene_entity_references(&mut values, &reverse).unwrap();
        if let Some(bindings) = values.get_mut("TimelineDirector").and_then(|value| value.get_mut("bindings_json")) {
            if let Some(json) = bindings.as_str() { if let Ok(mut table) = mengine_assets::parse_timeline_binding_table(json) { table.remap_entities(&reverse); *bindings = serde_json::Value::String(mengine_assets::serialize_timeline_binding_table(table).unwrap()); } }
        }
        record.components = serde_json::from_value(values).unwrap();
    }
    snapshot
}

fn assert_equal(previous: &baseline::SharedSnapshotWorld, current: &SharedSnapshotWorld) {
    assert_eq!(canonical_snapshot(previous.world(), &previous.entities), canonical_snapshot(current.world(), &current.entities));
    for (&source, &entity) in &current.entities { assert_eq!(previous.world().entity_name(previous.entities[&source]), current.world().entity_name(entity)); assert_eq!(previous.source_entity(previous.entities[&source].to_u64()), Some(source)); assert_eq!(current.source_entity(entity.to_u64()), Some(source)); }
}

fn shared(snapshot: WorldSnapshot) -> SharedWorldSnapshot {
    SharedWorldSnapshot { entities: snapshot.entities.into_iter().map(Arc::new).collect(), frame: snapshot.frame, sim_frame: snapshot.sim_frame, elapsed: snapshot.elapsed, clear_color: snapshot.clear_color, selected: snapshot.selected }
}

#[test]
fn component_deltas_preserve_values_metadata_invalid_replacements_and_duplicate_records() {
    let original: WorldSnapshot = serde_json::from_value(serde_json::json!({"entities":[
        {"entity":10,"name":"root","components":{"Transform":{}}},
        {"entity":20,"name":"child","parent":10,"components":{"Transform":{},"MeshRenderer":{"mesh":"cube"},"MaterialPropertyBlock":{"base_color":[1,0,0,1]}}}
    ]})).unwrap();
    let a = shared(original); let mut updates = vec![a.clone()];
    let mut mesh = a.clone(); Arc::make_mut(&mut mesh.entities[1]).components.get_mut("MeshRenderer").unwrap()["mesh"] = serde_json::json!("animated.glb#pose=0:1@30"); updates.push(mesh.clone());
    let mut metadata = mesh.clone(); let record = Arc::make_mut(&mut metadata.entities[1]); record.name = Some("renamed".into()); record.sibling_index = 7; record.active = false; record.tag = "Player".into(); record.layer = 8; updates.push(metadata.clone());
    let mut nameless = metadata.clone(); Arc::make_mut(&mut nameless.entities[1]).name = None; updates.push(nameless);
    let mut removed = metadata.clone(); Arc::make_mut(&mut removed.entities[1]).components.remove("Transform"); updates.push(removed);
    let mut invalid = mesh.clone(); Arc::make_mut(&mut invalid.entities[1]).components.insert("MeshRenderer".into(), serde_json::json!({"mesh":42})); updates.push(invalid.clone()); updates.push(mesh.clone());
    let mut aliases = mesh.clone(); let record = Arc::make_mut(&mut aliases.entities[1]); record.components.insert("transform".into(), serde_json::json!({"position":[3,4,5]})); record.components.insert("Name".into(), serde_json::json!({"value":"component name"})); updates.push(aliases); updates.push(mesh.clone());
    let mut unknown = mesh.clone(); Arc::make_mut(&mut unknown.entities[1]).components.insert("CustomData".into(), serde_json::json!({"array":[1,2],"text":"数据"})); updates.push(unknown); updates.push(mesh.clone());
    let mut duplicate = mesh.clone(); let mut first = mesh.entities[1].as_ref().clone(); first.components.insert("Transform".into(), serde_json::json!({"position":[7,0,0]})); duplicate.entities[1] = Arc::new(first);
    let mut last = mesh.entities[1].as_ref().clone(); last.components.get_mut("MeshRenderer").unwrap()["mesh"] = serde_json::json!("last"); duplicate.entities.push(Arc::new(last)); updates.push(duplicate.clone()); updates.push(duplicate.clone());
    let mut unique = duplicate.clone(); unique.entities.remove(1); updates.push(unique.clone()); let mut later = unique; Arc::make_mut(&mut later.entities[1]).components.get_mut("MeshRenderer").unwrap()["mesh"] = serde_json::json!("after-duplicate"); updates.push(later);
    let mut reverse = mesh.clone(); reverse.entities.reverse(); reverse.selected = Some(20); updates.push(reverse); updates.push(mesh.clone());
    let mut partial = mesh.clone(); partial.entities.remove(0); updates.push(partial); updates.push(mesh); updates.push(shared(WorldSnapshot::default())); updates.push(a.clone());
    let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default();
    for snapshot in updates.iter().chain(updates.iter().rev()) { previous.update(snapshot); current.update(snapshot); assert_equal(&previous, &current); }
    current.update(&duplicate); assert!(current.ambiguous_sources.contains(&20)); current.update(&shared(WorldSnapshot::default())); assert!(current.ambiguous_sources.is_empty());
    let owned = WorldSnapshot { entities: a.entities.iter().map(|record| record.as_ref().clone()).collect(), ..Default::default() }; previous.update_owned(owned.clone()); current.update_owned(owned); assert_equal(&previous, &current);
}

#[test]
fn unchanged_components_and_equal_records_do_not_reinstall_native_values() {
    let a = shared(serde_json::from_value(serde_json::json!({"entities":[{"entity":1,"name":"node","components":{"Transform":{},"MeshRenderer":{"mesh":"cube"},"MaterialPropertyBlock":{"base_color":[1,0,0,1]}}}]})).unwrap());
    let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default(); previous.update(&a); current.update(&a);
    let id = current.entities[&1]; let mut hierarchy = mengine_core::transform_hierarchy::TransformHierarchyCache::default(); let first = hierarchy.build(current.world());
    for frame in 0..8 {
        let mut b = a.clone(); Arc::make_mut(&mut b.entities[0]).components.get_mut("MeshRenderer").unwrap()["mesh"] = serde_json::json!(format!("pose-{frame}"));
        let before = current.world().stable_entity_revision(id).unwrap(); let old_before = previous.world().stable_entity_revision(previous.entities[&1]).unwrap();
        previous.update(&b); current.update(&b); assert_equal(&previous, &current);
        assert!(current.world().stable_entity_revision(id).unwrap() - before < previous.world().stable_entity_revision(previous.entities[&1]).unwrap() - old_before);
        let next = hierarchy.build(current.world()); assert!(std::ptr::eq(first.get_ref(id).unwrap(), next.get_ref(id).unwrap()));
        let mut equal = b.clone(); equal.entities[0] = Arc::new(b.entities[0].as_ref().clone());
        let before = current.world().stable_entity_revision(id); current.update(&equal); assert_eq!(current.world().stable_entity_revision(id), before);
    }
}

#[test]
fn reference_entities_keep_full_remapping_and_error_recovery_across_mapping_changes() {
    let a = shared(serde_json::from_value(serde_json::json!({"entities":[{"entity":10,"name":"target","components":{"Transform":{}}},{"entity":20,"name":"owner","parent":10,"components":{
        "Transform":{},"MeshRenderer":{"mesh":"cube"},"RawImage":{"render_camera":"10","render_root":"10"},"Canvas":{"render_camera":"10"},"Button":{"on_click":[{"target":"10","method":"test"}]},
        "CustomRef":{"__mengine_entity_reference_fields":["target"],"target":"10"},"TimelineDirector":{"bindings_json":"{\"version\":1,\"bindings\":{\"target\":{\"entity\":\"10\"}}}"}
    }}]})).unwrap());
    let mut missing = a.clone(); missing.entities.remove(0);
    let mut changed = a.clone(); Arc::make_mut(&mut changed.entities[1]).components.get_mut("MeshRenderer").unwrap()["mesh"] = serde_json::json!("changed");
    let mut invalid = changed.clone(); Arc::make_mut(&mut invalid.entities[1]).components.get_mut("CustomRef").unwrap()["__mengine_entity_reference_fields"] = serde_json::json!([""]);
    let mut repaired = invalid.clone(); Arc::make_mut(&mut repaired.entities[1]).components.get_mut("CustomRef").unwrap()["__mengine_entity_reference_fields"] = serde_json::json!(["target"]);
    let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default();
    for snapshot in [&a, &changed, &missing, &changed, &invalid, &invalid, &repaired, &missing, &repaired] { previous.update(snapshot); current.update(snapshot); assert_equal(&previous, &current); }
}

#[test]
fn each_reference_component_keeps_mapping_restoration_when_other_values_change() {
    for (name, field, event) in [("RawImage","render_camera",false),("RawImage","render_root",false),("Canvas","render_camera",false),("Button","on_click",true),("Toggle","on_value_changed",true),("Slider","on_value_changed",true),("Scrollbar","on_value_changed",true),("InputField","on_value_changed",true),("InputField","on_submit",true),("Dropdown","on_value_changed",true),("ListView","on_value_changed",true),("ScrollView","on_value_changed",true),("TabView","on_value_changed",true)] {
        let mut a = shared(serde_json::from_value(serde_json::json!({"entities":[{"entity":10,"components":{"Transform":{}}},{"entity":20,"components":{"Transform":{},"MeshRenderer":{"mesh":"cube"}}}]})).unwrap());
        let mut value = serde_json::json!({}); value[field] = if event { serde_json::json!([{"target":"10","method":"test"}]) } else { serde_json::json!("10") };
        Arc::make_mut(&mut a.entities[1]).components.insert(name.into(), value); let mut missing = a.clone(); missing.entities.remove(0);
        let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default();
        for snapshot in [&a, &missing, &a, &missing, &a] {
            previous.update(snapshot); current.update(snapshot); assert_equal(&previous, &current);
            let owner = current.entities[&20]; let fields = &current.world().serialized_components(owner).unwrap()[name]; let target = if event { &fields[field][0]["target"] } else { &fields[field] };
            if let Some(entity) = current.entities.get(&10) { assert_eq!(*target, serde_json::json!(entity.to_u64().to_string()), "{name}.{field}"); }
            else if event { assert_eq!(target["$mengine_entity_ref"]["kind"], "missing"); } else { assert_eq!(*target, ""); }
        }
    }
}

#[test]
#[ignore = "manual preserved-map component delta materialization CPU comparison"]
fn benchmark_snapshot_component_deltas() {
    use std::{hint::black_box, time::Instant};
    let root = std::env::var_os("MENGINE_HIERARCHY_PROJECT").map(std::path::PathBuf::from).unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms"));
    let scene = std::env::var_os("MENGINE_HIERARCHY_SCENE").map(std::path::PathBuf::from).unwrap_or_else(|| "Assets/Scenes/Main.mscene".into());
    let doc: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(scene)).unwrap()).unwrap(); let source: WorldSnapshot = serde_json::from_value(doc["world"].clone()).unwrap(); let a = shared(source);
    for workload in ["unchanged", "mesh-64", "transform-64", "mesh-512", "metadata-64"] {
        let mut b = a.clone(); b.frame += 1; b.elapsed += 1. / 60.; let mut changed = 0; let limit = if workload == "mesh-512" { 512 } else { 64 };
        for record in &mut b.entities {
            let component = if workload == "transform-64" { "Transform" } else { "MeshRenderer" };
            if workload == "unchanged" || changed == limit || !record.components.contains_key(component) { continue; }
            let record = Arc::make_mut(record);
            match workload {
                "transform-64" => { let transform = record.components.get_mut("Transform").unwrap(); let mut position: [f64; 3] = std::array::from_fn(|index| transform.get("position").and_then(|value| value.get(index)).and_then(serde_json::Value::as_f64).unwrap_or(0.)); position[0] += 0.1; transform["position"] = serde_json::json!(position); },
                "metadata-64" => { record.name = Some(format!("changed-{}",record.entity)); record.tag = "Edited".into(); record.layer = 8; },
                _ => { record.components.get_mut("MeshRenderer").unwrap()["mesh"] = serde_json::json!(format!("bench-{}.glb#pose=0:1@30",record.entity)); }
            }
            changed += 1;
        }
        assert_eq!(changed, if workload == "unchanged" { 0 } else { limit });
        let mut previous = baseline::SharedSnapshotWorld::default(); let mut current = SharedSnapshotWorld::default(); previous.update(&a); current.update(&a);
        for snapshot in [&b, &a] { previous.update(snapshot); current.update(snapshot); assert_equal(&previous, &current); }
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for mode in if run % 2 == 0 { [0,1] } else { [1,0] } {
                let started = Instant::now();
                for frame in 0..40 { let snapshot = if frame % 2 == 0 { &b } else { &a }; if mode == 0 { previous.update(black_box(snapshot)); } else { current.update(black_box(snapshot)); } }
                if run >= 2 { samples[mode].push(started.elapsed().as_secs_f64() * 1000. / 40.); }
            }
        }
        assert_equal(&previous, &current); for values in &mut samples { values.sort_by(f64::total_cmp); }
        println!("SNAPSHOT_COMPONENT_DELTAS workload={workload} entities={} previousMs={:.6} currentMs={:.6} changedRecords={changed} samples=9 framesPerSample=40 valuesEqual=true", a.entities.len(), samples[0][4], samples[1][4]);
    }
}
