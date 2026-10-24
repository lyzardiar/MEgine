// Author: MiYu. Compare cached traversal against live collection through topology, layout and custom Any changes.
use super::*;
use crate::ui::traversal_tests::layout_fixture;
use std::path::PathBuf;

fn compare(world: &World, cache: &mut UiTraversalCache, size: [u32; 2]) {
    assert_eq!(cache.sync(world), &*index_ui_children(world).children);
    let hierarchy = TransformHierarchy::build(world);
    let collect = |cache| collect_ui_primitives(world, &hierarchy, size[0], size[1], None, None, 0, UiInteractionState::default(), None, None, cache);
    assert_eq!(format!("{:?}", collect(None)), format!("{:?}", collect(Some(cache))));
}

#[test]
fn cached_traversal_prunes_removed_nodes_and_does_not_index_parent_slots() {
    let mut world = layout_fixture(1000, false); let mut cache = UiTraversalCache::default();
    compare(&world, &mut cache, [800, 600]);
    let images: Vec<_> = world.entities_with_components(&["Image"]).collect();
    world.despawn_many(images.iter().skip(2).copied()); compare(&world, &mut cache, [800, 600]);
    assert_eq!(cache.nodes.len(), 4); assert!(cache.nodes.capacity() <= 64);
    world.insert_component(images[0], Parent { entity: Entity::new(u32::MAX, 7) }); compare(&world, &mut cache, [800, 600]);
    assert_eq!(cache.children.len(), 3); assert_eq!(cache.nodes.len(), 4);
}

#[test]
fn cached_traversal_preserves_live_topology_order_and_frame_local_layout() {
    let mut world = layout_fixture(8, true); let mut cache = UiTraversalCache::default();
    compare(&world, &mut cache, [800, 600]);
    let group = world.entities_with_components(&["LayoutGroup"]).next().unwrap();
    let image = world.entities_with_components(&["Image"]).next().unwrap();
    let pointer = cache.children[&group].as_ptr();
    compare(&world, &mut cache, [1920, 1080]); assert_eq!(cache.children[&group].as_ptr(), pointer);
    world.get_component_mut::<RectTransform>(image).unwrap().size_delta = [37., 41.];
    compare(&world, &mut cache, [1920, 1080]); assert_eq!(cache.children[&group].as_ptr(), pointer, "layout edits retain only the child index");
    let mut order: Vec<_> = world.iter_entities().collect(); order.reverse(); assert!(world.set_entity_iteration_order(&order));
    compare(&world, &mut cache, [800, 600]);
    world.set_editor_state(image, -1, false); compare(&world, &mut cache, [800, 600]);
    world.set_editor_state(image, -1, true); compare(&world, &mut cache, [800, 600]);
    let canvas = world.entities_with_components(&["Canvas"]).next().unwrap();
    world.set_parent(image, Some(canvas)); compare(&world, &mut cache, [800, 600]);
    world.get_component_mut::<Parent>(image).unwrap().entity = group; compare(&world, &mut cache, [800, 600]);
    world.remove_component_by_name(image, "Parent"); compare(&world, &mut cache, [800, 600]);
    world.insert_component(image, Parent { entity: group }); compare(&world, &mut cache, [800, 600]);
    world.set_editor_state(group, 0, false); compare(&world, &mut cache, [800, 600]);
    world.set_editor_state(group, 0, true); compare(&world, &mut cache, [800, 600]);
    world.despawn(image); let replacement = world.spawn_empty(); assert_eq!(replacement.index, image.index); assert_ne!(replacement, image);
    world.insert_component(replacement, Image::default()); world.set_parent(replacement, Some(group)); compare(&world, &mut cache, [800, 600]);
    world.get_component_mut::<Canvas>(canvas).unwrap().enabled = false; compare(&world, &mut cache, [800, 600]); assert!(cache.nodes.is_empty()); assert!(cache.children.is_empty());
    let other = layout_fixture(3, false); compare(&other, &mut cache, [800, 600]); assert_eq!(cache.world_id, other.cache_identity());
    compare(&World::new(), &mut cache, [800, 600]); assert!(cache.nodes.is_empty()); assert_eq!(cache.nodes.capacity(), 0);
}

#[test]
fn cached_traversal_rereads_custom_any_parent_projections() {
    use std::sync::atomic::{AtomicBool, Ordering};
    struct ProjectedParent { choose: Arc<AtomicBool>, first: Parent, second: Parent }
    impl mengine_core::component::Component for ProjectedParent {
        fn type_name() -> &'static str { "ProjectedParent" }
        fn as_any(&self) -> &dyn std::any::Any { if self.choose.load(Ordering::Relaxed) { &self.first } else { &self.second } }
        fn as_any_mut(&mut self) -> &mut dyn std::any::Any { &mut self.first }
        fn to_value(&self) -> serde_json::Value { serde_json::Value::Null }
    }
    let mut world = layout_fixture(2, false); let mut cache = UiTraversalCache::default();
    let canvas = world.entities_with_components(&["Canvas"]).next().unwrap(); let group = world.entities_with_components(&["LayoutGroup"]).next().unwrap();
    let entity = world.spawn_empty(); world.insert_component(entity, Image::default());
    let choose = Arc::new(AtomicBool::new(false));
    world.insert_component(entity, ProjectedParent { choose: choose.clone(), first: Parent { entity: canvas }, second: Parent { entity: group } });
    assert!(world.stable_entity_revision(entity).is_none());
    compare(&world, &mut cache, [800, 600]); assert!(cache.children[&group].contains(&entity));
    choose.store(true, Ordering::Relaxed); compare(&world, &mut cache, [800, 600]); assert!(cache.children[&canvas].contains(&entity)); assert!(!cache.children[&group].contains(&entity));
}

#[test]
#[ignore = "manual production UI collection comparison with and without traversal index reuse"]
fn benchmark_ui_traversal_cache() {
    let root = PathBuf::from(std::env::var_os("MENGINE_UI_PROJECT").unwrap());
    let scene = std::env::var_os("MENGINE_UI_SCENE").unwrap_or_else(|| "Assets/Scenes/Main.mscene".into());
    let mut actual = World::new(); mengine_scene::load_scene(&root.join(scene), &mut actual).unwrap();
    for (name, mut world) in [("authored", actual), ("layout", layout_fixture(2000, false)), ("layout-edits", layout_fixture(2000, false))] {
        let hierarchy = TransformHierarchy::build(&world); let mut cache = UiTraversalCache::default();
        compare(&world, &mut cache, [1280, 720]);
        let edited = world.entities_with_components(&["Image"]).next().unwrap();
        let mut samples = [Vec::new(), Vec::new()];
        for round in 0..11 { for mode in [round % 2, 1 - round % 2] {
            let started = std::time::Instant::now();
            for iteration in 0..25 {
                if name == "layout-edits" { world.get_component_mut::<RectTransform>(edited).unwrap().size_delta[0] = 1. + (iteration % 2) as f32; }
                std::hint::black_box(collect_ui_primitives(&world, &hierarchy, 1280, 720, None, None, 0, UiInteractionState::default(), None, None, (mode == 1).then_some(&mut cache)));
            }
            if round >= 2 { samples[mode].push(started.elapsed().as_secs_f64() * 1000. / 25.); }
        }}
        let medians = samples.each_ref().map(|values| { let mut values = values.clone(); values.sort_by(f64::total_cmp); values[values.len()/2] });
        compare(&world, &mut cache, [1280, 720]);
        println!("UI_INDEX_BENCH {}", serde_json::json!({"case":name,"entities":world.iter_entities().count(),"nodeCapacityBytes":cache.nodes.capacity()*std::mem::size_of::<Node>(),"parents":cache.children.len(),"baselineMs":medians[0],"cachedMs":medians[1],"samples":samples}));
    }
}
