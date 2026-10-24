// Author: MiYu. Sparse hierarchy updates must match full resolution and preserve retained frame values.
use super::*;

fn fixture() -> (World, Vec<Entity>) {
    let mut world = World::new(); let ids: Vec<_> = (0..1024).map(|_| world.spawn_empty()).collect();
    for (index, &entity) in ids.iter().enumerate() {
        world.insert_component(entity, Transform { position: [index as f32 * 0.02, 1., -2.], rotation: Quat::from_rotation_y(index as f32 * 0.001).to_array(), scale: [2., 1., -1.] });
        if index >= 64 { world.set_parent(entity, Some(ids[if index < 512 { index % 64 } else { 64 + index % 64 }])); }
    }
    (world, ids)
}

fn assert_equal(world: &World, actual: &TransformHierarchy) {
    let expected = TransformHierarchy::build(world); assert_eq!(actual.nodes.len(), expected.nodes.len());
    for entity in world.iter_entities() {
        assert_eq!(actual.is_active(entity), expected.is_active(entity), "activity {entity:?}");
        assert_eq!(format!("{:?}", actual.get(entity)), format!("{:?}", expected.get(entity)), "transform {entity:?}");
    }
}

#[test]
fn sparse_local_changes_resolve_descendants_and_keep_previous_frames_immutable() {
    let (mut world, ids) = fixture(); let mut order = ids.clone(); order.reverse(); assert!(world.set_entity_iteration_order(&order));
    let mut cache = TransformHierarchyCache::default(); let mut previous = cache.build(&world);
    for phase in 0..64 {
        let retained: Vec<_> = ids.iter().map(|&entity| previous.get(entity)).collect();
        match phase % 7 {
            0 => { world.get_component_mut::<Transform>(ids[3]).unwrap().position[0] += 0.25; },
            1 => { let t = world.get_component_mut::<Transform>(ids[768 + phase]).unwrap(); t.rotation = Quat::from_rotation_z(phase as f32 * 0.1).to_array(); t.scale = [1., 2., 0.5]; },
            2 => { world.remove_component_by_name(ids[90], "Transform"); },
            3 => { world.insert_component(ids[90], Transform::default()); },
            4 => { world.get_component_mut::<Transform>(ids[2]).unwrap().position[1] += 0.1; world.get_component_mut::<Transform>(ids[66]).unwrap().position[2] -= 0.1; },
            5 => { assert!(world.get_component_mut::<Transform>(ids[67]).is_some()); },
            _ => { let t = world.get_component_mut::<Transform>(ids[68]).unwrap(); t.position[0] = f32::NAN; t.rotation = [0.; 4]; t.scale = [f32::INFINITY, -1., 0.]; }
        }
        let count = cache.incremental_frames; let current = cache.build(&world); assert_equal(&world, &current);
        let unchanged = phase % 7 == 5 || phase % 7 == 6 && phase > 6;
        assert_eq!(cache.incremental_frames, count + usize::from(!unchanged), "phase {phase}"); assert_eq!(Arc::ptr_eq(&previous.nodes, &current.nodes), unchanged);
        for (&entity, value) in ids.iter().zip(retained) { assert_eq!(previous.get(entity), value, "retained {entity:?}"); }
        assert!(Arc::ptr_eq(&current.nodes, &cache.build(&world).nodes)); previous = current;
    }
}

#[test]
fn structural_dense_and_invalid_branches_keep_the_complete_resolver() {
    let (mut world, ids) = fixture(); let mut cache = TransformHierarchyCache::default(); cache.build(&world);
    world.get_component_mut::<Transform>(ids[4]).unwrap().position[0] += 1.; assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    world.set_parent(ids[768], Some(ids[5])); assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1); assert!(cache.dependents.is_none());
    world.set_editor_state(ids[5], 0, false); assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    world.get_component_mut::<Transform>(ids[768]).unwrap().position[0] += 1.; assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    world.set_editor_state(ids[5], 0, true); let mut order = ids.clone(); order.reverse(); assert!(world.set_entity_iteration_order(&order)); assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    for &entity in &ids[..200] { world.get_component_mut::<Transform>(entity).unwrap().position[0] += 1.; }
    assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    for &entity in &ids[..9] { world.get_component_mut::<Transform>(entity).unwrap().position[1] += 1.; }
    assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1, "the union of small branches also obeys the affected-node limit");
    world.insert_component(ids[0], Parent { entity: ids[64] }); assert_equal(&world, &cache.build(&world));
    world.get_component_mut::<Transform>(ids[64]).unwrap().position[0] += 1.; assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    world.despawn(ids[30]); let replacement = world.spawn_empty(); world.insert_component(replacement, Transform::default()); assert_equal(&world, &cache.build(&world)); assert_eq!(cache.incremental_frames, 1);
    let mut wide = World::new(); let root = wide.spawn_empty(); wide.insert_component(root, Transform::default());
    for _ in 0..1023 { let entity = wide.spawn_empty(); wide.insert_component(entity, Transform::default()); wide.set_parent(entity, Some(root)); }
    cache.build(&wide); wide.get_component_mut::<Transform>(root).unwrap().position[0] += 1.; assert_equal(&wide, &cache.build(&wide)); assert_eq!(cache.incremental_frames, 0, "large affected subtrees retain the bounded full path");
    let allocation = cache.dependents.as_ref().unwrap().allocation_identity();
    for _ in 0..4 { wide.get_component_mut::<Transform>(root).unwrap().position[0] += 1.; assert_equal(&wide, &cache.build(&wide)); assert_eq!(cache.dependents.as_ref().unwrap().allocation_identity(), allocation); }
    cache.build(&World::new()); assert!(cache.dependents.is_none()); assert_eq!(cache.entries.capacity(), 0);
}

#[test]
fn sparse_native_edits_never_hide_unversioned_custom_transform_changes() {
    use std::{any::Any, sync::{Arc, atomic::{AtomicBool, Ordering}}};
    struct Projected { switch: Arc<AtomicBool>, first: Transform, second: Transform }
    impl crate::Component for Projected {
        fn type_name() -> &'static str { "Projected" }
        fn as_any(&self) -> &dyn Any { if self.switch.load(Ordering::Relaxed) { &self.second } else { &self.first } }
        fn as_any_mut(&mut self) -> &mut dyn Any { self }
        fn to_value(&self) -> serde_json::Value { serde_json::Value::Null }
    }
    let (mut world, ids) = fixture(); let switch = Arc::new(AtomicBool::new(false));
    world.remove_component_by_name(ids[4], "Transform"); world.insert_component(ids[4], Projected { switch: switch.clone(), first: Transform::default(), second: Transform { position: [9., 2., 1.], ..Default::default() } });
    let mut cache = TransformHierarchyCache::default(); let first = cache.build(&world); let revision = world.entity_revision(ids[4]);
    switch.store(true, Ordering::Relaxed); world.get_component_mut::<Transform>(ids[800]).unwrap().position[1] += 1.;
    let current = cache.build(&world); assert_equal(&world, &current); assert_eq!(world.entity_revision(ids[4]), revision); assert_eq!(cache.incremental_frames, 0);
    assert_ne!(current.get(ids[68]), first.get(ids[68]));
}

#[test]
#[ignore = "manual preserved map sparse hierarchy frame CPU comparison"]
fn benchmark_sparse_hierarchy_frames() {
    use std::{hint::black_box, time::Instant};
    let root = std::env::var_os("MENGINE_HIERARCHY_PROJECT").map(std::path::PathBuf::from).unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms"));
    let scene = std::env::var_os("MENGINE_HIERARCHY_SCENE").map(std::path::PathBuf::from).unwrap_or_else(|| "Assets/Scenes/Main.mscene".into());
    let doc: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(scene)).unwrap()).unwrap();
    let snapshot: crate::snapshot::WorldSnapshot = serde_json::from_value(doc["world"].clone()).unwrap(); let mut world = World::new(); let mut ids = HashMap::new();
    for source in &snapshot.entities { let entity = world.spawn_empty(); ids.insert(source.entity, entity); for (name, value) in &source.components { world.set_component_value(entity, name, value.clone()); } world.set_editor_state(entity, source.sibling_index, source.active); }
    for source in &snapshot.entities { if let Some(parent) = source.parent { world.set_parent(ids[&source.entity], Some(ids[&parent])); } }
    let hierarchy = TransformHierarchy::build(&world);
    let transforms: Vec<_> = world.entities_with_components(&["Transform"]).filter(|&entity| hierarchy.is_active(entity)).collect();
    let leaf = *transforms.iter().find(|&&entity| world.get_component::<crate::Children>(entity).is_none_or(|children| children.entities.is_empty())).unwrap();
    let branch = *transforms.iter().find(|&&entity| world.get_component::<crate::Children>(entity).is_some_and(|children| (2..32).contains(&children.entities.len()))).unwrap();
    let wide = transforms.iter().find(|&&entity| {
        let mut queue = vec![entity]; let mut seen = std::collections::HashSet::new();
        while let Some(entity) = queue.pop() { if !hierarchy.is_active(entity) || !seen.insert(entity) { continue; } if seen.len() > snapshot.entities.len().div_ceil(8) { return true; } if let Some(children) = world.get_component::<crate::Children>(entity) { queue.extend_from_slice(&children.entities); } }
        false
    }).copied();
    let mut caches = [TransformHierarchyCache::default(), TransformHierarchyCache::default()];
    assert_equal(&world, &caches[0].previous_frame_build(&world)); assert_equal(&world, &caches[1].build(&world));
    let mut workloads = vec!["unchanged", "revision-only", "one-transform", "branch-transform"]; if wide.is_some() { workloads.push("wide-transform"); } workloads.push("dense-transform");
    for workload in workloads {
        let mut samples = [Vec::new(), Vec::new()]; let before = caches[1].incremental_frames;
        for run in 0..11 {
            for mode in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let mut elapsed = 0.;
                for frame in 0..40 {
                    match workload {
                        "revision-only" => { for &entity in transforms.iter().take(64) { assert!(world.get_component_mut::<Transform>(entity).is_some()); } },
                        "one-transform" => { world.get_component_mut::<Transform>(leaf).unwrap().position[0] += 0.0001; },
                        "branch-transform" => { world.get_component_mut::<Transform>(branch).unwrap().position[0] += 0.0001; },
                        "wide-transform" => { world.get_component_mut::<Transform>(wide.unwrap()).unwrap().position[0] += 0.0001; },
                        "dense-transform" => { for &entity in &transforms { world.get_component_mut::<Transform>(entity).unwrap().position[0] += 0.0001; } },
                        _ => {}
                    }
                    let started = Instant::now(); let actual = if mode == 0 { caches[mode].previous_frame_build(&world) } else { caches[mode].build(&world) }; elapsed += started.elapsed().as_secs_f64() * 1000.; black_box(&actual);
                    if frame == 39 { assert_equal(&world, &actual); }
                }
                if run >= 2 { samples[mode].push(elapsed / 40.); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        println!("SPARSE_HIERARCHY_CPU workload={workload} entities={} previousMs={:.6} currentMs={:.6} samples=9 framesPerSample=40 incrementalFrames={} valuesEqual=true", snapshot.entities.len(), samples[0][4], samples[1][4], caches[1].incremental_frames - before);
    }
}

// Pinned f68f6ce entry, adapting only the resolver's explicit retained-node flag.
impl TransformHierarchyCache {
    fn previous_frame_build(&mut self, world: &World) -> TransformHierarchy {
        // Compare every alive record in author order, including inactive ancestors and generations.
        if self.world_id == world.snapshot_id && self.reusable && self.frame != u64::MAX && self.version <= u64::MAX - self.input_slots as u64 - 1 {
            if let Some(hierarchy) = &self.hierarchy {
                if world.iter_entities().map(|entity| (entity, world.stable_hierarchy_revision(entity), world.entity_active(entity))).eq(self.inputs.iter().copied()) {
                    self.frame += 1; return hierarchy.clone();
                }
            }
        }
        let mut slots = 0;
        let mut inputs = std::mem::take(&mut self.inputs); inputs.clear();
        let entities: Vec<_> = world.iter_entities().filter(|entity| {
            let active = world.entity_active(*entity); inputs.push((*entity, world.stable_hierarchy_revision(*entity), active));
            slots = slots.max(entity.index as usize + 1); active
        }).collect();
        if self.world_id != world.snapshot_id || self.frame == u64::MAX || self.version > u64::MAX - slots as u64 - 1 { *self = Self { world_id: world.snapshot_id, ..Default::default() }; }
        self.frame += 1;
        // Sparse worlds keep the existing bounded resolver instead of retaining high entity slots.
        if slots > entities.len().saturating_mul(2) {
            self.entries = Vec::new(); let mut nodes = HierarchyNodes::with_capacity(entities.len());
            for entity in entities { resolve_node(world, entity, &mut nodes); }
            return self.retain_hierarchy(inputs, slots, nodes);
        }
        self.entries.resize_with(slots, || None);
        if self.entries.capacity() > slots.saturating_mul(2) { self.entries.shrink_to_fit(); }
        let mut nodes = HierarchyNodes::Dense(vec![None; slots]);
        for entity in entities { self.resolve(world, entity, &mut nodes, false); }
        self.retain_hierarchy(inputs, slots, nodes)
    }

}
