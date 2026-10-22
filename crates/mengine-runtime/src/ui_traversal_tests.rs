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
    assert!(std::ptr::eq(children_of(&tree, parent).as_ptr(), tree.children[&parent].as_ptr()));
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

fn graphic_storage_fixture(count: usize, reverse: bool) -> World {
    let mut world = layout_fixture(count, reverse);
    let children: Vec<_> = world.entities_with_components(&["Image"]).collect();
    for child in children {
        world.remove_component_by_name(child, "Image");
        world.insert_component(child, InputField::default());
    }
    world
}

#[test]
fn multi_primitive_controls_keep_mask_depth_and_sibling_order() {
    let mut world = World::new();
    let canvas = world.spawn_empty(); world.insert_component(canvas, Canvas::default());
    let mask = world.spawn_empty(); world.set_parent(mask, Some(canvas));
    world.insert_component(mask, RectTransform::default()); world.insert_component(mask, Image::default()); world.insert_component(mask, Mask::default());
    for parent in [mask, canvas] {
        let input = world.spawn_empty(); world.set_parent(input, Some(parent));
        world.insert_component(input, RectTransform::default()); world.insert_component(input, InputField::default());
    }
    world.set_editor_state(mask, 0, false);
    let plain = collect_ui_frame(&world, 800, 600);
    let input_count = plain.plan.primitives.len();
    assert!(input_count > 5);
    assert!(plain.plan.primitives.iter().all(|p| p.key.stencil == UiStencilMode::Disabled));
    world.set_editor_state(mask, 0, true);
    for show in [false, true] {
        for enabled in [false, true] {
            world.get_component_mut::<Mask>(mask).unwrap().show_mask_graphic = show;
            world.get_component_mut::<Image>(mask).unwrap().enabled = enabled;
            let frame = collect_ui_frame(&world, 800, 600);
            let mut expected = Vec::new();
            if enabled && show { expected.push(UiStencilMode::Disabled); }
            if enabled { expected.push(UiStencilMode::Push { reference: 0 }); }
            expected.extend(std::iter::repeat_n(UiStencilMode::Test { reference: 1 }, input_count));
            if enabled { expected.push(UiStencilMode::Pop { reference: 1 }); }
            expected.extend(std::iter::repeat_n(UiStencilMode::Disabled, input_count));
            assert_eq!(frame.plan.primitives.iter().map(|p| p.key.stencil).collect::<Vec<_>>(), expected, "show={show}, enabled={enabled}");
            let tail = &frame.plan.primitives[frame.plan.primitives.len() - input_count..];
            for (actual, expected) in tail.iter().zip(&plain.plan.primitives) { assert_eq!(format!("{actual:?}"), format!("{expected:?}")); }
        }
    }
}

#[test]
#[ignore = "manual UI graphic storage CPU benchmark"]
fn benchmark_ui_graphic_storage() {
    use std::fmt::Write;
    use std::hash::Hasher;
    struct Digest(std::hash::DefaultHasher);
    impl std::fmt::Write for Digest {
        fn write_str(&mut self, value: &str) -> std::fmt::Result { self.0.write(value.as_bytes()); Ok(()) }
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("samples/frostbound-realms/Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut authored = World::new(); mengine_scene::apply_snapshot(&mut authored, &snapshot);
    let mut reports = Vec::new();
    for (name, world) in [("authored", authored), ("images", layout_fixture(2000, false)), ("input-forward", graphic_storage_fixture(512, false)), ("input-reverse", graphic_storage_fixture(512, true))] {
        let hierarchy = TransformHierarchy::build(&world);
        let expected = collect_ui_frame_with_hierarchy(&world, &hierarchy, 4096, 1024);
        let mut digest = Digest(std::hash::DefaultHasher::new()); write!(digest, "{expected:?}").unwrap();
        let mut times = Vec::new();
        for run in 0..11 {
            let started = std::time::Instant::now();
            for _ in 0..8 { std::hint::black_box(collect_ui_frame_with_hierarchy(&world, &hierarchy, 4096, 1024)); }
            if run > 1 { times.push(started.elapsed().as_secs_f64() * 1000.0 / 8.0); }
        }
        times.sort_by(f64::total_cmp);
        reports.push(serde_json::json!({"name":name,"entities":world.iter_entities().count(),"controls":expected.controls.len(),"primitives":expected.plan.primitives.len(),"all_fields_digest":format!("{:016x}", digest.0.finish()),"median_ms":times[4],"samples":9,"iterations":8}));
    }
    println!("UI_GRAPHIC_STORAGE_BENCHMARK={}", serde_json::json!(reports));
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

#[test]
#[ignore = "manual UI generation and batching CPU breakdown"]
fn benchmark_ui_generation_and_batching() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("samples/frostbound-realms/Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut authored = World::new(); mengine_scene::apply_snapshot(&mut authored, &snapshot);
    let mut reports = Vec::new();
    for (name, world) in [("authored", authored), ("input-forward", graphic_storage_fixture(512, false)), ("input-reverse", graphic_storage_fixture(512, true))] {
        let hierarchy = TransformHierarchy::build(&world);
        let mut samples = Vec::new(); let mut count = 0;
        for group in 0..11 {
            let mut totals = [0.; 3];
            for _ in 0..8 {
                let start = std::time::Instant::now();
                let mut frame = collect_ui_primitives(&world, &hierarchy, 4096, 1024, None, None, 0, UiInteractionState::default(), None, None);
                let generation = start.elapsed().as_secs_f64() * 1000.;
                count = frame.plan.primitives.len();
                let start = std::time::Instant::now();
                frame.plan = UiBatchPlan::build(std::mem::take(&mut frame.plan.primitives));
                let batching = start.elapsed().as_secs_f64() * 1000.;
                let start = std::time::Instant::now(); drop(std::hint::black_box(frame));
                totals[0] += generation; totals[1] += batching; totals[2] += start.elapsed().as_secs_f64() * 1000.;
            }
            if group > 1 { samples.push(totals.map(|value| value / 8.)); }
        }
        let median = |column: usize| { let mut values: Vec<_> = samples.iter().map(|sample| sample[column]).collect(); values.sort_by(f64::total_cmp); values[4] };
        reports.push(serde_json::json!({"name":name,"primitives":count,"generation_ms":median(0),"batching_ms":median(1),"drop_ms":median(2),"groups":9,"iterations":8}));
    }
    println!("UI_GENERATION_BATCHING_BENCHMARK={}", serde_json::json!(reports));
}

#[test]
#[ignore = "manual Canvas collection and child-index CPU breakdown"]
fn benchmark_ui_collection_breakdown() {
    use std::{fmt::Write, hash::Hasher, hint::black_box, time::Instant};
    struct Digest(std::hash::DefaultHasher);
    impl std::fmt::Write for Digest { fn write_str(&mut self, value: &str) -> std::fmt::Result { self.0.write(value.as_bytes()); Ok(()) } }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let scene: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let mut inputs = vec![("authored", scene["world"].clone())];
    if let Ok(path) = std::env::var("MENGINE_PERFORMANCE_WORLD") { inputs.push(("paused-game", serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap())); }
    let mut worlds: Vec<_> = inputs.into_iter().map(|(name, value)| { let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &serde_json::from_value(value).unwrap()); (name, world) }).collect();
    worlds.push(("images", layout_fixture(2000, false)));
    worlds.push(("nested-layout", nested_layout_fixture(7)));
    let mut reports = Vec::new();
    for (name, world) in worlds {
        let hierarchy = TransformHierarchy::build(&world); let mut fonts = crate::fonts::RuntimeFontCache::new(Some(root.clone()));
        let mut collect = || { fonts.begin_frame(); collect_ui_primitives(&world, &hierarchy, 850, 478, None, None, 0, UiInteractionState::default(), None, Some(&mut fonts)) };
        let expected = collect(); let mut digest = Digest(std::hash::DefaultHasher::new()); write!(digest, "{expected:?}").unwrap();
        let mut samples = [Vec::new(), Vec::new()];
        for group in 0..11 {
            let started = Instant::now(); for _ in 0..50 { black_box(index_ui_children(&world)); }
            let index_ms = started.elapsed().as_secs_f64() * 1000.0 / 50.0;
            let started = Instant::now(); for _ in 0..50 { black_box(collect()); }
            if group >= 2 { samples[0].push(index_ms); samples[1].push(started.elapsed().as_secs_f64() * 1000.0 / 50.0); }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        reports.push(serde_json::json!({"name":name,"entities":world.iter_entities().count(),"controls":expected.controls.len(),"primitives":expected.plan.primitives.len(),"all_fields_digest":format!("{:016x}", digest.0.finish()),"child_index_ms":samples[0][4],"collection_ms":samples[1][4],"groups":9,"iterations":50}));
    }
    println!("UI_COLLECTION_BREAKDOWN={}", serde_json::json!(reports));
}

fn nested_layout_fixture(depth: usize) -> World {
    let mut world = World::new(); let canvas = world.spawn_empty(); world.insert_component(canvas, Canvas::default());
    world.insert_component(canvas, RectTransform { anchor_max: [1.0, 1.0], size_delta: [0.0, 0.0], ..Default::default() });
    let mut parent = canvas;
    for _ in 0..depth {
        let group = world.spawn_empty(); world.set_parent(group, Some(parent));
        world.insert_component(group, RectTransform { size_delta: [320.0, 180.0], ..Default::default() });
        world.insert_component(group, LayoutGroup { direction: "Horizontal".into(), ..Default::default() });
        world.insert_component(group, ContentSizeFitter { horizontal_fit: "PreferredSize".into(), vertical_fit: "PreferredSize".into() });
        parent = group;
    }
    let leaf = world.spawn_empty(); world.set_parent(leaf, Some(parent));
    world.insert_component(leaf, RectTransform { size_delta: [32.0, 24.0], ..Default::default() });
    world.insert_component(leaf, Image { source_size: [32.0, 24.0], ..Default::default() });
    world
}

struct CountingLayoutFont { calls: usize }
impl UiFontResolver for CountingLayoutFont {
    fn measure_glyph(&mut self, _: &str, _: char, _: f32, _: &str) -> Option<UiFontGlyphMetrics> {
        self.calls += 1;
        Some(UiFontGlyphMetrics { advance: 20.0, metric_width: 18.0, line_height: 30.0, geometry: Some((0.0, 18.0)) })
    }
    fn resolve_glyph_texture(&mut self, _: &str, _: char, _: f32, _: &str, _: f32) -> Option<UiFontGlyphTexture> { None }
}

#[test]
fn layout_subtree_cache_preserves_width_sensitive_text_and_refreshes_next_frame() {
    let mut world = nested_layout_fixture(1);
    let group = world.entities_with_components(&["LayoutGroup"]).next().unwrap();
    let text = world.entities_with_components(&["Image"]).next().unwrap();
    world.remove_component_by_name(text, "Image");
    world.insert_component(text, Text { text: "AAAA".into(), font: "Assets/Fonts/Wrapped.ttf".into(), font_size: 10.0, horizontal_overflow: "Wrap".into(), ..Default::default() });
    world.insert_component(group, LayoutGroup { direction: "Vertical".into(), padding: [0.0; 4], spacing: [0.0; 2], child_force_expand: false, child_force_expand_width: true, ..Default::default() });
    fn measure(world: &World, tree: &UiLayoutTree, entity: Entity, width: f32, font: &mut CountingLayoutFont) -> LayoutChildMetrics {
        layout_children_metrics(tree, world, &[entity], Some(&[width]), &mut Some(font as &mut dyn UiFontResolver))[0]
    }
    let tree = index_ui_children(&world); let mut font = CountingLayoutFont { calls: 0 };
    let narrow = measure(&world, &tree, group, 50.0, &mut font); let first_calls = font.calls;
    assert!(first_calls > 0); assert_eq!(narrow.preferred_height, Some(60.0));
    assert_eq!(narrow, measure(&world, &tree, group, 50.0, &mut font)); assert_eq!(font.calls, first_calls);
    let wide = measure(&world, &tree, group, 100.0, &mut font);
    assert_eq!(wide.preferred_height, Some(30.0)); assert!(font.calls > first_calls);
    let uncached = index_ui_children(&world); uncached.cyclic_layout.set(true);
    assert_eq!(narrow, measure(&world, &uncached, group, 50.0, &mut font)); assert_eq!(wide, measure(&world, &uncached, group, 100.0, &mut font));
    world.get_component_mut::<Text>(text).unwrap().text = "AAAAAAAA".into();
    let next = measure(&world, &index_ui_children(&world), group, 50.0, &mut font);
    assert_eq!(next.preferred_height, Some(120.0));
    world.set_editor_state(text, 0, false);
    assert_ne!(next, measure(&world, &index_ui_children(&world), group, 50.0, &mut font));
}

#[test]
fn cyclic_layout_measurements_keep_guard_dependent_results_uncached() {
    let mut world = nested_layout_fixture(2);
    let groups: Vec<_> = world.entities_with_components(&["LayoutGroup"]).collect();
    world.insert_component(groups[0], Parent { entity: groups[1] });
    let tree = index_ui_children(&world); let uncached = index_ui_children(&world); uncached.cyclic_layout.set(true);
    for entity in [groups[0], groups[1], groups[0]] {
        let actual = layout_children_metrics(&tree, &world, &[entity], Some(&[50.0]), &mut None);
        let expected = layout_children_metrics(&uncached, &world, &[entity], Some(&[50.0]), &mut None);
        assert_eq!(actual, expected); assert!(tree.cyclic_layout.get()); assert!(tree.metrics.borrow().is_empty());
    }
}

#[test]
fn nested_layout_measurement_reuses_subtrees_without_changing_results() {
    let mut world = nested_layout_fixture(7);
    let group = world.entities_with_components(&["LayoutGroup"]).next().unwrap();
    let text = world.entities_with_components(&["Image"]).next().unwrap();
    world.remove_component_by_name(text, "Image");
    world.insert_component(text, Text { text: "Nested layout".into(), font: "Assets/Fonts/Wrapped.ttf".into(), horizontal_overflow: "Wrap".into(), ..Default::default() });
    let tree = index_ui_children(&world); let uncached = index_ui_children(&world); uncached.cyclic_layout.set(true);
    let mut font = CountingLayoutFont { calls: 0 }; let mut baseline_font = CountingLayoutFont { calls: 0 };
    let actual = layout_children_metrics(&tree, &world, &[group], Some(&[320.0]), &mut Some(&mut font as &mut dyn UiFontResolver));
    let expected = layout_children_metrics(&uncached, &world, &[group], Some(&[320.0]), &mut Some(&mut baseline_font as &mut dyn UiFontResolver));
    assert_eq!(actual, expected); assert!(font.calls > 0); assert!(font.calls * 4 < baseline_font.calls, "cached {} uncached {}", font.calls, baseline_font.calls);
}
