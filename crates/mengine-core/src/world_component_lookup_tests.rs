// Author: MiYu. Typed lookup compatibility and comparison with the former per-entity scan.
use super::*;
use crate::generated::{Camera3D, Image, MeshRenderer, PbrMaterial, RectTransform, RigidBody3D, Text};
use crate::snapshot::{WorldSnapshot, WorldSnapshotCache};
use std::{hint::black_box, sync::Arc, time::Instant};

#[derive(Debug, PartialEq)]
struct Custom(u32);
impl Component for Custom {
    fn type_name() -> &'static str { "Custom" }
    fn as_any(&self) -> &dyn Any { self }
    fn as_any_mut(&mut self) -> &mut dyn Any { self }
    fn to_value(&self) -> Value { serde_json::json!({"value":self.0}) }
}

struct TransformReplacement;
impl Component for TransformReplacement {
    fn type_name() -> &'static str { "Transform" }
    fn as_any(&self) -> &dyn Any { self }
    fn as_any_mut(&mut self) -> &mut dyn Any { self }
    fn to_value(&self) -> Value { serde_json::json!({"replacement":true}) }
}

struct ViewA { read: u32, write: u64 }
impl Component for ViewA {
    fn type_name() -> &'static str { "ViewA" }
    fn as_any(&self) -> &dyn Any { &self.read }
    fn as_any_mut(&mut self) -> &mut dyn Any { &mut self.write }
    fn to_value(&self) -> Value { serde_json::json!({"read":self.read,"write":self.write}) }
}
struct ViewB(u32);
impl Component for ViewB {
    fn type_name() -> &'static str { "ViewB" }
    fn as_any(&self) -> &dyn Any { &self.0 }
    fn as_any_mut(&mut self) -> &mut dyn Any { &mut self.0 }
    fn to_value(&self) -> Value { serde_json::json!(self.0) }
}

struct SwitchingView { first: u32, second: Option<u64> }
impl Component for SwitchingView {
    fn type_name() -> &'static str { "SwitchingView" }
    fn as_any(&self) -> &dyn Any { if let Some(second) = &self.second { second } else { &self.first } }
    fn as_any_mut(&mut self) -> &mut dyn Any { self }
    fn to_value(&self) -> Value { serde_json::json!(self.second.unwrap_or(self.first as u64)) }
}

struct SelfThenView { project: bool, value: u32 }
impl Component for SelfThenView {
    fn type_name() -> &'static str { "SelfThenView" }
    fn as_any(&self) -> &dyn Any { if self.project { &self.value } else { self } }
    fn as_any_mut(&mut self) -> &mut dyn Any { self }
    fn to_value(&self) -> Value { serde_json::json!(self.value) }
}

fn original_get<T: Any + Send + Sync>(world: &World, entity: Entity) -> Option<&T> {
    if !world.is_alive(entity) { return None; }
    world.entities[entity.index as usize].components.values().find_map(|component| component.as_any().downcast_ref::<T>())
}

fn original_get_mut<T: Any + Send + Sync>(world: &mut World, entity: Entity) -> Option<&mut T> {
    if !world.is_alive(entity) { return None; }
    let record = &mut world.entities[entity.index as usize];
    let value = record.components.values_mut().find_map(|component| component.as_any_mut().downcast_mut::<T>());
    if value.is_some() { record.revision += 1; }
    value
}

#[test]
fn component_lookup_handles_typed_dynamic_and_custom_lifecycles() {
    let mut world = World::new(); let entity = world.spawn_empty();
    assert!(world.get_component::<Transform>(entity).is_none());
    let revision = world.entity_revision(entity);
    assert!(world.get_component_mut::<Transform>(entity).is_none());
    assert_eq!(world.entity_revision(entity), revision);
    world.insert_component(entity, Transform::default());
    world.set_component_value(entity, "camera3d", serde_json::json!({"fov_y_degrees":47.0}));
    assert_eq!(world.get_component::<Camera3D>(entity).unwrap().fov_y_degrees, 47.0);
    world.set_component_value(entity, "Camera3D", serde_json::json!({"fov_y_degrees":"invalid"}));
    assert_eq!(world.get_component::<Camera3D>(entity).unwrap().fov_y_degrees, 47.0);
    assert_eq!(world.get_component::<Transform>(entity).unwrap().position, [0.0; 3]);
    world.set_component_value(entity, "transform", serde_json::json!({"position":[1,2,3]}));
    assert_eq!(world.get_component::<Transform>(entity).unwrap().position, [1.0,2.0,3.0]);
    world.insert_component(entity, Custom(7));
    world.set_component_value(entity, "UnknownBehaviour", serde_json::json!({"speed":12}));
    assert_eq!(world.get_component::<Custom>(entity), Some(&Custom(7)));
    assert_eq!(world.serialized_components(entity).unwrap()["UnknownBehaviour"]["speed"], 12);
    assert!(world.get_component::<Value>(entity).is_none());
    assert!(world.get_component_mut::<usize>(entity).is_none());
    world.insert_component(entity, TransformReplacement);
    assert!(world.get_component::<Transform>(entity).is_none());
    assert!(world.get_component::<TransformReplacement>(entity).is_some());
    world.set_component_value(entity, "Transform", serde_json::json!({"position":[4,5,6]}));
    assert!(world.get_component::<TransformReplacement>(entity).is_none());
    assert_eq!(world.get_component::<Transform>(entity).unwrap().position, [4.0,5.0,6.0]);
    world.remove_component_by_name(entity, "transform");
    world.remove_component_by_name(entity, "camera3d");
    assert!(world.get_component::<Transform>(entity).is_none());
    assert!(world.get_component_mut::<Camera3D>(entity).is_none());
    world.despawn(entity); let recycled = world.spawn_empty();
    assert_eq!(entity.index, recycled.index); assert_ne!(entity, recycled);
    world.insert_component(recycled, Custom(9));
    assert!(world.get_component::<Custom>(entity).is_none());
    assert!(world.get_component_mut::<Custom>(entity).is_none());
    assert!(world.get_component::<Transform>(recycled).is_none());
    assert_eq!(world.get_component::<Custom>(recycled), Some(&Custom(9)));
    world.remove_component_by_name(recycled, "Custom");
    assert!(world.get_component::<Custom>(recycled).is_none());
}

#[test]
fn component_lookup_mutation_invalidates_only_successful_snapshot_access() {
    let mut world = World::new(); let entity = world.spawn_empty();
    world.insert_component(entity, Transform::default()); world.insert_component(entity, Custom(5));
    let mut cache = WorldSnapshotCache::default(); let before = cache.capture(&world);
    let revision = world.entity_revision(entity);
    assert!(world.get_component::<Transform>(entity).is_some());
    assert!(world.get_component_mut::<Camera3D>(entity).is_none());
    assert_eq!(world.entity_revision(entity), revision);
    assert!(Arc::ptr_eq(&before.entities[0], &cache.capture(&world).entities[0]));
    world.get_component_mut::<Transform>(entity).unwrap().position[0] = 9.0;
    assert_eq!(world.entity_revision(entity), revision + 1);
    world.get_component_mut::<Custom>(entity).unwrap().0 = 11;
    let after = cache.capture(&world);
    assert!(!Arc::ptr_eq(&before.entities[0], &after.entities[0]));
    assert_eq!(before.entities[0].components["Transform"]["position"][0], 0.0);
    assert_eq!(after.entities[0].components["Transform"]["position"][0], 9.0);
    assert_eq!(after.entities[0].components["Custom"]["value"], 11);
    assert_eq!(after.into_owned(), WorldSnapshot::from_world(&world));
}

#[test]
fn component_lookup_preserves_any_views_and_ambiguous_scan_order() {
    let mut world = World::new(); let entity = world.spawn_empty();
    world.insert_component(entity, ViewA { read: 10, write: 20 });
    assert_eq!(world.get_component::<u32>(entity), Some(&10));
    assert!(world.get_component::<ViewA>(entity).is_none());
    assert!(world.get_component::<u64>(entity).is_none());
    *world.get_component_mut::<u64>(entity).unwrap() = 30;
    assert_eq!(world.component_value(entity, "ViewA").unwrap()["write"], 30);
    world.insert_component(entity, ViewB(40));
    assert_eq!(world.get_component::<u32>(entity), original_get::<u32>(&world, entity));
    let expected = original_get_mut::<u32>(&mut world, entity).unwrap() as *mut u32;
    assert_eq!(world.get_component_mut::<u32>(entity).unwrap() as *mut u32, expected);
    world.remove_component_by_name(entity, "ViewA");
    assert_eq!(world.get_component::<u32>(entity), Some(&40));
    world.remove_component_by_name(entity, "ViewB");
    assert!(world.get_component::<u32>(entity).is_none());
    world.insert_component(entity, SwitchingView { first: 50, second: None });
    assert_eq!(world.get_component::<u32>(entity), Some(&50));
    world.get_component_mut::<SwitchingView>(entity).unwrap().second = Some(60);
    assert_eq!(world.get_component::<u64>(entity), Some(&60));
    assert!(world.get_component::<u32>(entity).is_none());
}

#[test]
fn component_lookup_preserves_custom_self_views_that_later_project() {
    let mut world = World::new(); let entity = world.spawn_empty();
    world.insert_component(entity, SelfThenView { project: false, value: 72 });
    assert!(world.get_component::<SelfThenView>(entity).is_some());
    assert!(world.get_component::<u32>(entity).is_none());
    world.get_component_mut::<SelfThenView>(entity).unwrap().project = true;
    assert_eq!(world.get_component::<u32>(entity), original_get::<u32>(&world, entity));
    assert_eq!(world.get_component::<u32>(entity), Some(&72));
    assert!(world.get_component::<SelfThenView>(entity).is_none());
}

fn frost_world() -> (World, Vec<Entity>) {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms/Assets/Scenes/Main.mscene");
    let scene: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let snapshot: WorldSnapshot = serde_json::from_value(scene["world"].clone()).unwrap();
    let mut world = World::new(); let mut ids = HashMap::new();
    for source in &snapshot.entities {
        let entity = world.spawn_empty(); ids.insert(source.entity, entity);
        if let Some(name) = &source.name { world.insert_component(entity, Name { value: name.clone() }); }
        for (name, value) in &source.components { world.set_component_value(entity, name, value.clone()); }
    }
    for source in &snapshot.entities { if let Some(parent) = source.parent.and_then(|parent| ids.get(&parent)) { world.set_parent(ids[&source.entity], Some(*parent)); } }
    let entities = world.iter_entities().collect(); (world, entities)
}

#[test]
fn component_lookup_matches_scan_after_scene_deserialization() {
    let (world, entities) = frost_world();
    for entity in entities {
        macro_rules! compare { ($kind:ty) => { assert_eq!(world.get_component::<$kind>(entity).map(|value| value as *const $kind), original_get::<$kind>(&world, entity).map(|value| value as *const $kind)); }; }
        compare!(Transform); compare!(MeshRenderer); compare!(RectTransform); compare!(Image); compare!(Text); compare!(Camera3D); compare!(RigidBody3D); compare!(usize); compare!(Parent); compare!(Children);
    }
}

fn median(mut samples: Vec<f64>) -> f64 { samples.sort_by(f64::total_cmp); samples[samples.len() / 2] }

fn query_benchmark<T: Any + Send + Sync>(world: &World, entities: &[Entity]) -> Value {
    let mut before = Vec::new(); let mut after = Vec::new(); let mut hits = 0;
    for sample in 0..11 {
        for baseline in [sample % 2 == 0, sample % 2 != 0] {
            let started = Instant::now(); let mut found = 0;
            for _ in 0..100 { for entity in entities { found += black_box(if baseline { original_get::<T>(black_box(world), black_box(*entity)) } else { world.get_component::<T>(black_box(*entity)) }).is_some() as usize; } }
            let ns = started.elapsed().as_nanos() as f64 / (entities.len() * 100) as f64;
            hits = found / 100;
            if sample >= 2 { if baseline { before.push(ns); } else { after.push(ns); } }
        }
    }
    serde_json::json!({"type":std::any::type_name::<T>(),"entities":entities.len(),"hits":hits,"samples":9,"queries_per_sample":entities.len()*100,"baseline_median_ns":median(before),"indexed_median_ns":median(after)})
}

fn weighted_query_benchmark(world: &mut World, entities: &[Entity]) -> Value {
    let mut before = Vec::new(); let mut after = Vec::new();
    for sample in 0..11 {
        for baseline in [sample % 2 == 0, sample % 2 != 0] {
            let started = Instant::now();
            for _ in 0..30 { for entity in entities {
                macro_rules! read { ($kind:ty, $repeats:expr) => { for _ in 0..$repeats { black_box(if baseline { original_get::<$kind>(black_box(&*world), black_box(*entity)) } else { black_box(&*world).get_component::<$kind>(black_box(*entity)) }); } }; }
                read!(Transform, 4); read!(MeshRenderer, 2); read!(RectTransform, 2); read!(Image, 2); read!(Text, 1); read!(PbrMaterial, 1); read!(Camera3D, 1); read!(RigidBody3D, 1);
                black_box(if baseline { original_get_mut::<Transform>(world, black_box(*entity)) } else { world.get_component_mut::<Transform>(black_box(*entity)) });
            } }
            let ms = started.elapsed().as_secs_f64() * 1000.0 / 30.0;
            if sample >= 2 { if baseline { before.push(ms); } else { after.push(ms); } }
        }
    }
    serde_json::json!({"weights_per_entity":{"Transform_read":4,"Transform_mut":1,"MeshRenderer":2,"RectTransform":2,"Image":2,"Text":1,"PbrMaterial":1,"Camera3D":1,"RigidBody3D_missing":1},"queries_per_sweep":entities.len()*15,"samples":9,"sweeps_per_sample":30,"baseline_median_ms":median(before),"indexed_median_ms":median(after)})
}

fn original_insert<T: Component>(world: &mut World, entity: Entity, value: T) {
    if !world.is_alive(entity) { return; }
    let name = T::type_name(); let record = &mut world.entities[entity.index as usize];
    record.revision += 1;
    if record.components.insert(name.to_owned(), Box::new(value)).is_none() { world.component_entities.entry(name.to_owned()).or_default().insert(entity.index); }
}

fn insertion_benchmark() -> Value {
    let mut before = Vec::new(); let mut after = Vec::new();
    for sample in 0..11 {
        for baseline in [sample % 2 == 0, sample % 2 != 0] {
            let mut world = World::new(); let entities: Vec<_> = (0..20_000).map(|_| world.spawn_empty()).collect();
            let started = Instant::now();
            for entity in entities {
                if baseline { original_insert(&mut world, entity, Transform::default()); original_insert(&mut world, entity, MeshRenderer::default()); }
                else { world.insert_component(entity, Transform::default()); world.insert_component(entity, MeshRenderer::default()); }
            }
            black_box(&world);
            let ms = started.elapsed().as_secs_f64() * 1000.0;
            if sample >= 2 { if baseline { before.push(ms); } else { after.push(ms); } }
        }
    }
    serde_json::json!({"entities":20000,"inserts":40000,"samples":9,"baseline_median_ms":median(before),"indexed_median_ms":median(after)})
}

#[test]
#[ignore = "manual ECS component lookup measurement"]
fn benchmark_component_type_lookup() {
    let (mut world, entities) = frost_world();
    let rows = vec![query_benchmark::<Transform>(&world, &entities), query_benchmark::<MeshRenderer>(&world, &entities), query_benchmark::<PbrMaterial>(&world, &entities), query_benchmark::<RectTransform>(&world, &entities), query_benchmark::<Image>(&world, &entities), query_benchmark::<Text>(&world, &entities), query_benchmark::<Camera3D>(&world, &entities), query_benchmark::<RigidBody3D>(&world, &entities), query_benchmark::<usize>(&world, &entities)];
    let mut before = Vec::new(); let mut after = Vec::new();
    for sample in 0..11 {
        for baseline in [sample % 2 == 0, sample % 2 != 0] {
            let started = Instant::now();
            for _ in 0..100 { for entity in &entities { black_box(if baseline { original_get_mut::<Transform>(&mut world, black_box(*entity)) } else { world.get_component_mut::<Transform>(black_box(*entity)) }); } }
            let ns = started.elapsed().as_nanos() as f64 / (entities.len() * 100) as f64;
            if sample >= 2 { if baseline { before.push(ns); } else { after.push(ns); } }
        }
    }
    let weighted = weighted_query_benchmark(&mut world, &entities);
    println!("COMPONENT_LOOKUP_BENCHMARK={}", serde_json::json!({"scene":"Frostbound Main.mscene","read":rows,"mutable_transform":{"baseline_median_ns":median(before),"indexed_median_ns":median(after)},"weighted":weighted,"insertion":insertion_benchmark()}));
}

#[test]
fn typed_candidates_preserve_sparse_dense_and_dynamic_views() {
    let mut world = World::new(); let entities: Vec<_> = (0..100).map(|_| world.spawn_empty()).collect();
    for entity in &entities[..2] { world.insert_component(*entity, RigidBody3D::default()); }
    world.set_editor_state(entities[0], 0, false);
    assert_eq!(world.typed_component_candidates(&["RigidBody3D"]).collect::<Vec<_>>(), entities[..2]);
    assert!(world.set_entity_iteration_order(&entities.iter().rev().copied().collect::<Vec<_>>()));
    assert_eq!(world.typed_component_candidates(&["RigidBody3D"]).collect::<Vec<_>>(), [entities[1], entities[0]]);
    world.remove_component_by_name(entities[0], "RigidBody3D"); world.despawn(entities[1]);
    let replacement = world.spawn_empty(); world.insert_component(replacement, RigidBody3D::default());
    assert_eq!(world.typed_component_candidates(&["RigidBody3D"]).collect::<Vec<_>>(), [replacement]);
    for entity in &entities[2..60] { world.insert_component(*entity, RigidBody3D::default()); }
    assert_eq!(world.typed_component_candidates(&["RigidBody3D"]).collect::<Vec<_>>(), world.iter_entities().collect::<Vec<_>>());
    let mut projected = World::new(); let entity = projected.spawn_empty();
    projected.insert_component(entity, SelfThenView { project: false, value: 72 });
    for _ in 0..100 { projected.spawn_empty(); }
    assert!(projected.typed_component_candidates(&["u32"]).any(|candidate| candidate == entity));
    projected.get_component_mut::<SelfThenView>(entity).unwrap().project = true;
    let values: Vec<_> = projected.typed_component_candidates(&["u32"]).filter_map(|candidate| projected.get_component::<u32>(candidate).copied()).collect();
    assert_eq!(values, [72]);
}
