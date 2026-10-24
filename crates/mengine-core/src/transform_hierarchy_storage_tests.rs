// Author: MiYu. Validate dense hierarchy storage against the 08ce6b2 hash-table resolver.
use super::*;
use std::{hint::black_box, time::Instant};

fn hashed_resolve(world: &World, entity: Entity, nodes: &mut HashMap<Entity, ResolvedNode>) -> ResolvedNode {
    if let Some(node) = nodes.get(&entity) { return *node; }
    if !world.is_alive(entity) {
        return ResolvedNode::INVALID;
    }
    // Re-entering an ancestor while it is being resolved disables the cyclic branch.
    nodes.insert(entity, ResolvedNode::INVALID);

    let parent = world
        .get_component::<Parent>(entity)
        .map(|value| value.entity);
    let parent_node = parent.map_or(
        ResolvedNode {
            active: true,
            has_transform: false,
            aggregate: WorldTransform::IDENTITY,
        },
        |parent| hashed_resolve(world, parent, nodes),
    );
    let local = world
        .get_component::<Transform>(entity)
        .map(WorldTransform::from_local);
    let node = ResolvedNode {
        active: parent_node.active && world.entity_active(entity),
        has_transform: local.is_some(),
        aggregate: local.map_or(parent_node.aggregate, |local| {
            parent_node.aggregate.compose(local)
        }),
    };
    nodes.insert(entity, node);
    node
}


fn hashed(world: &World) -> HashMap<Entity, ResolvedNode> {
    let entities: Vec<_> = world.iter_entities().filter(|entity| world.entity_active(*entity)).collect();
    let mut nodes = HashMap::with_capacity(entities.len());
    for entity in entities { hashed_resolve(world, entity, &mut nodes); }
    nodes
}

fn assert_equivalent(world: &World, hierarchy: &TransformHierarchy, stale: &[Entity]) {
    let expected = hashed(world);
    assert_eq!(hierarchy.nodes.len(), expected.len());
    for entity in world.iter_entities().chain(stale.iter().copied()) {
        let node = expected.get(&entity);
        assert_eq!(hierarchy.is_active(entity), node.is_some_and(|node| node.active));
        assert_eq!(hierarchy.get_ref(entity), node.filter(|node| node.active && node.has_transform).map(|node| &node.aggregate));
        let parent = world.get_component::<Parent>(entity).map(|parent| parent.entity);
        let expected_parent = parent.map_or(Some(WorldTransform::IDENTITY), |parent| expected.get(&parent).filter(|node| node.active).map(|node| node.aggregate));
        assert_eq!(hierarchy.parent_world(world, entity), expected_parent);
    }
}

#[test]
fn dense_storage_matches_hashes_across_generation_parent_activity_and_order_changes() {
    let mut world = World::new();
    let entities: Vec<_> = (0..256).map(|_| world.spawn_empty()).collect();
    for (i, entity) in entities.iter().enumerate() {
        world.insert_component(*entity, Transform { position: [i as f32, 2.0, -1.0], rotation: Quat::from_rotation_y(i as f32 * 0.03).to_array(), scale: [2.0, 1.0, -1.0] });
        if i > 0 { world.set_parent(*entity, Some(entities[(i - 1) / 2])); }
    }
    let old = TransformHierarchy::build(&world); assert!(matches!(&*old.nodes, HierarchyNodes::Dense(_)));
    assert_equivalent(&world, &old, &[Entity::INVALID, Entity::new(u32::MAX - 1, 2)]);
    // Replace an entity at the same slot and keep an explicit stale parent reference.
    let stale = entities[17]; world.despawn(stale); let replacement = world.spawn_empty();
    assert_eq!(replacement.index, stale.index); assert_ne!(replacement.generation, stale.generation);
    world.insert_component(replacement, Transform::default());
    world.insert_component(entities[35], Parent { entity: stale });
    world.insert_component(entities[33], Parent { entity: Entity::new(u32::MAX - 1, 2) });
    world.insert_component(entities[40], Parent { entity: entities[41] }); world.insert_component(entities[41], Parent { entity: entities[40] });
    world.insert_component(entities[42], Parent { entity: entities[42] });
    world.remove_component_by_name(entities[4], "Transform");
    world.set_editor_state(entities[8], 0, false);
    let changed = world.get_component_mut::<Transform>(entities[2]).unwrap();
    changed.position = [f32::INFINITY, f32::NAN, -3.0]; changed.rotation = [0.0; 4]; changed.scale = [f32::NAN, 2.0, 1.0];
    for reverse in [false, true] {
        if reverse { let mut order: Vec<_> = world.iter_entities().collect(); order.reverse(); assert!(world.set_entity_iteration_order(&order)); }
        let hierarchy = TransformHierarchy::build(&world); assert!(matches!(&*hierarchy.nodes, HierarchyNodes::Dense(_)));
        assert_equivalent(&world, &hierarchy, &[stale, Entity::INVALID]);
        assert_eq!(hierarchy.get(stale), None); assert!(hierarchy.get(replacement).is_some());
    }
    assert!(old.get(stale).is_some()); assert_eq!(old.get(replacement), None);
}

#[test]
fn density_limit_includes_inactive_ancestors_and_keeps_sparse_storage_bounded() {
    let mut world = World::new(); let entities: Vec<_> = (0..128).map(|_| world.spawn_empty()).collect();
    for entity in &entities { world.insert_component(*entity, Transform::default()); }
    world.set_parent(entities[0], Some(entities[127])); world.set_editor_state(entities[127], 0, false);
    let dense = TransformHierarchy::build(&world); assert!(matches!(&*dense.nodes, HierarchyNodes::Dense(_))); assert!(!dense.is_active(entities[0])); assert_equivalent(&world, &dense, &[]);
    for entity in &entities[64..127] { world.set_editor_state(*entity, 0, false); }
    let half = TransformHierarchy::build(&world); assert!(matches!(&*half.nodes, HierarchyNodes::Dense(_))); assert_equivalent(&world, &half, &[]);
    world.set_editor_state(entities[63], 0, false);
    let below_half = TransformHierarchy::build(&world); assert!(matches!(&*below_half.nodes, HierarchyNodes::Sparse(_))); assert_equivalent(&world, &below_half, &[]);
    for entity in &entities[1..127] { world.set_editor_state(*entity, 0, false); }
    let sparse = TransformHierarchy::build(&world); assert!(matches!(&*sparse.nodes, HierarchyNodes::Sparse(_))); assert!(sparse.nodes.capacity() < 8); assert_equivalent(&world, &sparse, &[]);
    world.set_parent(entities[0], None); world.despawn_many(entities[..127].iter().copied()); world.set_editor_state(entities[127], 0, true);
    let high_slot = TransformHierarchy::build(&world); assert!(matches!(&*high_slot.nodes, HierarchyNodes::Sparse(_))); assert!(high_slot.nodes.capacity() < 8); assert_equivalent(&world, &high_slot, &entities[..127]);
    let empty = TransformHierarchy::build(&World::new()); assert_eq!(empty.nodes.capacity(), 0);
    let subset = TransformHierarchy::build_for_entities(&world, [entities[127]]); assert!(matches!(&*subset.nodes, HierarchyNodes::Sparse(_))); assert_eq!(subset.get(entities[127]), high_slot.get(entities[127]));
}

#[test]
#[ignore = "manual authored hierarchy storage comparison"]
fn benchmark_dense_hierarchy() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms"); let mut reports = Vec::new();
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
        let actual = TransformHierarchy::build(&world); assert_equivalent(&world, &actual, &[]);
        let mut samples = [Vec::new(), Vec::new()];
        for group in 0..11 {
            for index in if group % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..30 { if index == 0 { black_box(hashed(&world)); } else { black_box(TransformHierarchy::build(&world)); } }
                if group >= 2 { samples[index].push(started.elapsed().as_secs_f64() * 1000. / 30.); }
            }
        }
        let raw = samples.clone(); for values in &mut samples { values.sort_by(f64::total_cmp); }
        reports.push(serde_json::json!({"scene":scene,"entities":snapshot.entities.len(),"resolved":actual.nodes.len(),"dense":matches!(&*actual.nodes, HierarchyNodes::Dense(_)),"storage_capacity":actual.nodes.capacity(),"dense_slot_bytes":std::mem::size_of::<Option<(u32, ResolvedNode)>>(),"baseline_ms":samples[0][4],"current_ms":samples[1][4],"samples_ms":raw,"iterations_per_sample":30,"equal":true}));
    }
    println!("DENSE_HIERARCHY={}", serde_json::json!(reports));
}
