// Author: MiYu. Reuse immutable hierarchy frames only when every ordered native input is unchanged.
use super::*;

fn assert_equal(world: &World, actual: &TransformHierarchy) {
    let expected = TransformHierarchy::build(world); assert_eq!(actual.nodes.len(), expected.nodes.len());
    for entity in world.iter_entities() { assert_eq!(actual.is_active(entity), expected.is_active(entity)); assert_eq!(format!("{:?}", actual.get(entity)), format!("{:?}", expected.get(entity)), "{entity:?}"); }
}

#[test]
fn immutable_hierarchy_frames_reuse_native_inputs_and_release_old_storage() {
    let mut world = World::new(); let parent = world.spawn_empty(); let child = world.spawn_empty();
    world.insert_component(parent, Transform { position: [1., 0., 0.], ..Default::default() }); world.insert_component(child, Transform::default()); world.set_parent(child, Some(parent));
    let mut cache = TransformHierarchyCache::default(); let first = cache.build(&world); let old = Arc::downgrade(&first.nodes);
    let version = cache.version;
    for _ in 0..60 {
        world.insert_component(child, crate::generated::MeshRenderer::default());
        let next = cache.build(&world); assert_equal(&world, &next); assert!(Arc::ptr_eq(&first.nodes, &next.nodes));
    }
    assert_eq!(cache.version, version);
    world.get_component_mut::<Transform>(parent).unwrap().position[0] = 8.;
    let changed = cache.build(&world); assert_equal(&world, &changed); assert!(!Arc::ptr_eq(&first.nodes, &changed.nodes));
    assert_eq!(first.get(child).unwrap().position.x, 1.); assert_eq!(changed.get(child).unwrap().position.x, 8.);
    assert!(Arc::ptr_eq(&changed.nodes, &cache.build(&world).nodes)); drop(first); assert!(old.upgrade().is_none());
    let current = Arc::downgrade(&changed.nodes); drop(changed); cache.build(&World::new()); assert!(current.upgrade().is_none());
}

#[test]
fn hierarchy_frame_reuse_observes_inactive_records_order_cycles_and_sparse_worlds() {
    let mut world = World::new(); let ids: Vec<_> = (0..128).map(|_| world.spawn_empty()).collect();
    for entity in &ids { world.insert_component(*entity, Transform::default()); }
    world.set_parent(ids[127], Some(ids[0])); let mut cache = TransformHierarchyCache::default();
    for phase in 0..8 {
        match phase {
            1 => { for entity in &ids[..127] { world.set_editor_state(*entity, 0, false); } },
            2 => { world.get_component_mut::<Transform>(ids[0]).unwrap().position[0] = 4.; },
            3 => { for entity in &ids { world.set_editor_state(*entity, 0, true); } world.insert_component(ids[0], Parent { entity: ids[127] }); },
            4 => { let order: Vec<_> = ids.iter().rev().copied().collect(); assert!(world.set_entity_iteration_order(&order)); },
            5 => { world.despawn(ids[0]); let replacement = world.spawn_empty(); assert_ne!(replacement, ids[0]); world.insert_component(replacement, Transform::default()); },
            6 => { world.remove_component_by_name(ids[127], "Transform"); },
            7 => { world.set_parent(ids[127], None); },
            _ => {}
        }
        let changed = cache.build(&world); assert_equal(&world, &changed);
        let next = cache.build(&world); assert_equal(&world, &next); assert!(Arc::ptr_eq(&changed.nodes, &next.nodes));
    }
}

#[test]
#[ignore = "manual preserved map immutable hierarchy frame comparison"]
fn benchmark_immutable_hierarchy_frames() {
    use std::{hint::black_box, time::Instant};
    let root = std::env::var_os("MENGINE_HIERARCHY_PROJECT").map(std::path::PathBuf::from).unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms"));
    let doc: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: crate::snapshot::WorldSnapshot = serde_json::from_value(doc["world"].clone()).unwrap(); let mut world = World::new(); let mut ids = HashMap::new();
    for source in &snapshot.entities { let entity = world.spawn_empty(); ids.insert(source.entity, entity); for (name, value) in &source.components { world.set_component_value(entity, name, value.clone()); } world.set_editor_state(entity, source.sibling_index, source.active); }
    for source in &snapshot.entities { if let Some(parent) = source.parent { world.set_parent(ids[&source.entity], Some(ids[&parent])); } }
    let mut caches = [TransformHierarchyCache::default(), TransformHierarchyCache::default()];
    assert_equal(&world, &caches[0].previous_build(&world)); assert_equal(&world, &caches[1].build(&world));
    let meshes: Vec<_> = world.entities_with_components(&["MeshRenderer"]).collect(); let transforms: Vec<_> = world.entities_with_components(&["Transform"]).collect();
    for workload in ["unchanged", "mesh-material", "sparse-transform"] {
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for mode in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let mut elapsed = 0.;
                for frame in 0..40 {
                    if workload == "mesh-material" { world.get_component_mut::<crate::generated::MeshRenderer>(meshes[frame % meshes.len()]).unwrap().material = format!("benchmark-{run}-{frame}"); }
                    if workload == "sparse-transform" { world.get_component_mut::<Transform>(transforms[frame % transforms.len()]).unwrap().position[0] += 0.0001; }
                    let started = Instant::now(); let actual = if mode == 0 { caches[mode].previous_build(&world) } else { caches[mode].build(&world) }; elapsed += started.elapsed().as_secs_f64() * 1000.; black_box(&actual);
                    if frame == 39 { assert_equal(&world, &actual); }
                }
                if run >= 2 { samples[mode].push(elapsed / 40.); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        println!("IMMUTABLE_HIERARCHY_CPU workload={workload} entities={} previousMs={:.6} retainedMs={:.6} samples=9 framesPerSample=40 valuesEqual=true", snapshot.entities.len(), samples[0][4], samples[1][4]);
    }
}

// Pinned 4b63aab resolver entry; only the owned result wrapper follows the shared immutable type.
impl TransformHierarchyCache {
    fn previous_build(&mut self, world: &World) -> TransformHierarchy {
        let mut slots = 0;
        let entities: Vec<_> = world.iter_entities().filter(|entity| {
            slots = slots.max(entity.index as usize + 1); world.entity_active(*entity)
        }).collect();
        if self.world_id != world.snapshot_id || self.frame == u64::MAX || self.version > u64::MAX - slots as u64 - 1 { *self = Self { world_id: world.snapshot_id, ..Default::default() }; }
        self.frame += 1;
        // Sparse worlds keep the existing bounded resolver instead of retaining high entity slots.
        if slots > entities.len().saturating_mul(2) {
            self.entries = Vec::new(); let mut nodes = HierarchyNodes::with_capacity(entities.len());
            for entity in entities { resolve_node(world, entity, &mut nodes); }
            return TransformHierarchy { nodes: Arc::new(nodes) };
        }
        self.entries.resize_with(slots, || None);
        if self.entries.capacity() > slots.saturating_mul(2) { self.entries.shrink_to_fit(); }
        let mut nodes = HierarchyNodes::Dense(vec![None; slots]);
        for entity in entities { self.resolve(world, entity, &mut nodes, false); }
        TransformHierarchy { nodes: Arc::new(nodes) }
    }

}
