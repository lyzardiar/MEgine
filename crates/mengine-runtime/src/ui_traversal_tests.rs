// Author: MiYu. UI traversal benchmarks and ordering/layout regression coverage.
use super::*;

#[test]
fn sequential_placements_match_sibling_lookup_for_every_subset_and_direction() {
    let children: Vec<_> = (0..8).map(|index| Entity::new(index, 0)).collect();
    for mask in 0..256 {
        let layout: Vec<_> = children.iter().enumerate().filter(|(index, _)| mask & (1 << index) != 0).map(|(_, &child)| child).collect();
        for count in 0..=layout.len() + 1 {
            let rects: Vec<_> = (0..count).map(|index| UiRect { x: index as f32, y: 2.0, width: 3.0, height: 4.0 }).collect();
            for reverse in [false, true] {
                let mut expected: Vec<_> = children.iter().map(|&child| (child, layout.iter().position(|&candidate| candidate == child).and_then(|index| rects.get(index).copied()))).collect();
                if reverse { expected.reverse(); }
                assert_eq!(child_placements(&children, &layout, &rects, reverse).collect::<Vec<_>>(), expected);
            }
        }
    }
    assert!(child_placements(&[], &[], &[], true).next().is_none());
}

#[test]
fn borrowed_children_keep_snapshot_ties_reparenting_and_activation() {
    let mut world = World::new(); let parent = world.spawn_empty(); let other = world.spawn_empty();
    let children: Vec<_> = (0..4).map(|_| { let child = world.spawn_empty(); world.set_parent(child, Some(parent)); child }).collect();
    for &child in &children { world.set_editor_state(child, 0, true); }
    let mut order: Vec<_> = world.iter_entities().collect(); order.reverse(); assert!(world.set_entity_iteration_order(&order));
    let tree = index_ui_children(&world); assert_eq!(children_of(&tree, parent), children.iter().rev().copied().collect::<Vec<_>>());
    assert!(std::ptr::eq(children_of(&tree, parent).as_ptr(), tree[&parent].as_ptr()));
    world.set_editor_state(children[2], 0, false); world.set_parent(children[1], Some(other));
    let tree = index_ui_children(&world);
    assert_eq!(children_of(&tree, parent), [children[3], children[0]]); assert_eq!(children_of(&tree, other), [children[1]]);
    world.set_editor_state(children[2], 1, true);
    assert_eq!(children_of(&index_ui_children(&world), parent), [children[3], children[0], children[2]]);
}

#[test]
fn tab_selection_and_canvas_visibility_refresh_each_frame() {
    let mut world = layout_fixture(8, true);
    let canvas = world.entities_with_components(&["Canvas"]).next().unwrap();
    let group = world.entities_with_components(&["LayoutGroup"]).next().unwrap();
    let children = children_of(&index_ui_children(&world), group).to_vec();
    for (index, &child) in children.iter().enumerate() { world.get_component_mut::<Image>(child).unwrap().color = [0.1 + index as f32 * 0.05, 0.13, 0.27, 1.0]; }
    world.insert_component(group, TabView { selected_index: 3, ..Default::default() });
    for selected in [3, 5, 0] {
        world.get_component_mut::<TabView>(group).unwrap().selected_index = selected;
        let frame = collect_ui_frame(&world, 4096, 1024);
        let images: Vec<_> = frame.plan.primitives.iter().filter(|p| p.color[1] == 0.13 && p.color[2] == 0.27).collect();
        assert_eq!(images.len(), 1); assert_eq!(images[0].color[0], 0.1 + selected as f32 * 0.05);
    }
    world.get_component_mut::<Canvas>(canvas).unwrap().target_display = 1;
    assert!(collect_ui_frame(&world, 4096, 1024).plan.primitives.is_empty());
    world.get_component_mut::<Canvas>(canvas).unwrap().target_display = 0;
    world.get_component_mut::<Canvas>(canvas).unwrap().enabled = false;
    assert!(collect_ui_frame(&world, 4096, 1024).plan.primitives.is_empty());
    world.get_component_mut::<Canvas>(canvas).unwrap().enabled = true;
    assert!(!collect_ui_frame(&world, 4096, 1024).plan.primitives.is_empty());
}

fn layout_fixture(count: usize, reverse: bool) -> World {
    let mut world = World::new();
    let canvas = world.spawn_empty(); world.insert_component(canvas, Canvas::default()); world.insert_component(canvas, GraphicRaycaster::default());
    world.insert_component(canvas, RectTransform { anchor_max: [1.0, 1.0], size_delta: [0.0, 0.0], ..Default::default() });
    let group = world.spawn_empty(); world.set_parent(group, Some(canvas));
    world.insert_component(group, RectTransform { size_delta: [4000.0, 100.0], ..Default::default() });
    world.insert_component(group, LayoutGroup { direction: "Horizontal".into(), padding: [0.0; 4], spacing: [0.0; 2], child_force_expand: true, reverse_z_order: reverse, ..Default::default() });
    for index in 0..count {
        let child = world.spawn_empty(); world.set_parent(child, Some(group)); world.insert_component(child, RectTransform { size_delta: [1.0, 10.0], ..Default::default() });
        world.insert_component(child, Image::default());
        if index % 7 == 0 { world.insert_component(child, LayoutElement { ignore_layout: true, ..Default::default() }); }
    }
    world
}

#[test]
#[ignore = "manual UI traversal CPU benchmark"]
fn benchmark_ui_traversal() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("samples/frostbound-realms/Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut authored = World::new(); mengine_scene::apply_snapshot(&mut authored, &snapshot);
    let mut no_canvas = World::new(); let parent = no_canvas.spawn_empty();
    for _ in 0..20_000 { let e = no_canvas.spawn_empty(); no_canvas.set_parent(e, Some(parent)); }
    let label = std::env::var("MENGINE_PERFORMANCE_LABEL").unwrap_or_else(|_| "manual".into()); assert!(label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    let out = root.join("tmp/docs-artifacts/editor-performance-risk"); std::fs::create_dir_all(&out).unwrap();
    let mut reports = Vec::new();
    for (name, world) in [("authored", authored), ("no-canvas", no_canvas), ("layout-forward", layout_fixture(2000, false)), ("layout-reverse", layout_fixture(2000, true))] {
        let hierarchy = TransformHierarchy::build(&world);
        let expected = collect_ui_frame_with_hierarchy(&world, &hierarchy, 4096, 1024);
        if name.starts_with("layout-") { assert_eq!(expected.plan.primitives.len(), 2000); }
        let mut times = Vec::new();
        for run in 0..11 {
            let started = std::time::Instant::now();
            for _ in 0..25 { std::hint::black_box(collect_ui_frame_with_hierarchy(&world, &hierarchy, 4096, 1024)); }
            if run > 1 { times.push(started.elapsed().as_secs_f64() * 1000.0 / 25.0); }
        }
        times.sort_by(f64::total_cmp);
        assert_eq!(format!("{expected:?}"), format!("{:?}", collect_ui_frame_with_hierarchy(&world, &hierarchy, 4096, 1024)));
        std::fs::write(out.join(format!("{label}-ui-{name}.txt")), format!("{expected:?}")).unwrap();
        reports.push(serde_json::json!({"name":name,"entities":world.iter_entities().count(),"controls":expected.controls.len(),"primitives":expected.plan.primitives.len(),"median_ms":times[4],"samples":9,"iterations":25}));
    }
    println!("UI_TRAVERSAL_BENCHMARK={}", serde_json::json!(reports));
}
