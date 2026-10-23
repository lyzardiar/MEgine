// Author: MiYu. Compare capacity planning with incremental hierarchy growth on authored scenes.
use super::*;
use std::{hint::black_box, time::Instant};

fn incremental(world: &World) -> TransformHierarchy {
    let mut nodes = HierarchyNodes::default();
    for entity in world.iter_entities().filter(|entity| world.entity_active(*entity)) { resolve_node(world, entity, &mut nodes); }
    TransformHierarchy { nodes }
}

fn assert_equal(world: &World, left: &TransformHierarchy, right: &TransformHierarchy) {
    assert_eq!(left.nodes.len(), right.nodes.len());
    for entity in world.iter_entities() {
        assert_eq!(left.is_active(entity), right.is_active(entity));
        assert_eq!(left.get(entity), right.get(entity));
        assert_eq!(left.parent_world(world, entity), right.parent_world(world, entity));
    }
}

#[test]
fn capacity_planning_keeps_sparse_requests_and_inactive_ancestors() {
    let mut world = World::new();
    let entities: Vec<_> = (0..1024).map(|_| world.spawn_empty()).collect();
    for entity in &entities { world.insert_component(*entity, Transform::default()); }
    for pair in entities[..8].windows(2) { world.set_parent(pair[0], Some(pair[1])); }
    world.set_editor_state(entities[7], 0, false);
    let full = TransformHierarchy::build(&world);
    assert_equal(&world, &incremental(&world), &full);
    let sparse = TransformHierarchy::build_for_entities(&world, [entities[0], entities[0]]);
    assert_eq!(sparse.nodes.len(), 8);
    assert!(sparse.nodes.capacity() < 32);
    assert!(!sparse.is_active(entities[0]));
    assert!(world.set_entity_iteration_order(&entities.iter().rev().copied().collect::<Vec<_>>()));
    assert_equal(&world, &incremental(&world), &TransformHierarchy::build(&world));
    assert_eq!(TransformHierarchy::build(&World::new()).nodes.capacity(), 0);
}

#[test]
#[ignore = "manual authored scene hierarchy allocation comparison"]
fn benchmark_hierarchy_capacity() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let reserved = |world: &World| TransformHierarchy::build_for_entities(world, world.iter_entities().filter(|entity| world.entity_active(*entity)).collect::<Vec<_>>());
    let mut reports = Vec::new();
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(scene)).unwrap()).unwrap();
        let snapshot: crate::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
        let mut world = World::new(); let mut ids = HashMap::new();
        for source in &snapshot.entities {
            let entity = world.spawn_empty(); ids.insert(source.entity, entity);
            for (name, value) in &source.components { world.set_component_value(entity, name, value.clone()); }
            world.set_editor_state(entity, source.sibling_index, source.active);
        }
        for source in &snapshot.entities { if let Some(parent) = source.parent { world.set_parent(ids[&source.entity], Some(ids[&parent])); } }
        let expected = incremental(&world); let actual = reserved(&world);
        assert_equal(&world, &expected, &actual);
        let mut samples = [Vec::new(), Vec::new()];
        for group in 0..11 {
            for index in if group % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..30 { black_box(if index == 0 { incremental(&world) } else { reserved(&world) }); }
                if group >= 2 { samples[index].push(started.elapsed().as_secs_f64() * 1000. / 30.); }
            }
        }
        let raw = samples.clone(); for values in &mut samples { values.sort_by(f64::total_cmp); }
        reports.push(serde_json::json!({"scene":scene,"entities":snapshot.entities.len(),"nodes":actual.nodes.len(),"capacity_before":expected.nodes.capacity(),"capacity_after":actual.nodes.capacity(),"baseline_ms":samples[0][4],"reserved_ms":samples[1][4],"samples_ms":raw,"iterations_per_sample":30,"equal":true}));
    }
    println!("HIERARCHY_CAPACITY={}", serde_json::json!(reports));
}
