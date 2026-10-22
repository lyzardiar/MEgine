// Author: MiYu. Per-extraction material sharing preserves per-object overrides and authored hot reload.
use super::*;
use mengine_core::generated::Transform;
use std::{hint::black_box, time::{Duration, Instant}};

fn baseline_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache) -> Vec<RenderObject> {
    let mut out = Vec::new();
    for entity in world.entities_with_components(&["MeshRenderer"]) {
        let Some(transform) = hierarchy.get(entity) else { continue; };
        if let Some(mesh) = world.get_component::<MeshRenderer>(entity) {
            let mut material = world.get_component::<PbrMaterial>(entity).map(render_material_from_component).unwrap_or_else(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material)));
            if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) { material = apply_material_property_block(material, block); }
            out.push(RenderObject { mesh_key: mesh.mesh.trim().replace('\\', "/"), model: transform.matrix, cast_shadows: mesh.cast_shadows, receive_shadows: mesh.receive_shadows, material });
        }
    }
    out
}

fn assert_objects_equal(left: &[RenderObject], right: &[RenderObject]) {
    assert_eq!(left.len(), right.len());
    for (left, right) in left.iter().zip(right) {
        assert_eq!(left.mesh_key, right.mesh_key); assert_eq!(left.model, right.model);
        assert_eq!(left.cast_shadows, right.cast_shadows); assert_eq!(left.receive_shadows, right.receive_shadows);
        assert_eq!(format!("{:?}", left.material), format!("{:?}", right.material));
    }
}

#[test]
fn shared_material_extraction_keeps_overrides_private_and_refreshes_next_frame() {
    let root = std::env::temp_dir().join(format!("mengine-frame-materials-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join("Assets")).unwrap();
    let file = root.join("Assets/Shared.mmat");
    std::fs::write(&file, r#"{"version":8,"shader":"pbr","base_color":[1,0,0,1],"roughness":0.8}"#).unwrap();
    let mut world = World::new();
    let entities: Vec<_> = (0..3).map(|_| { let entity = world.spawn_empty(); world.insert_component(entity, Transform::default()); world.insert_component(entity, MeshRenderer { mesh: "Assets\\Cube.glb".into(), material: "Assets/Shared.mmat".into(), ..Default::default() }); entity }).collect();
    world.insert_component(entities[0], MaterialPropertyBlock { override_base_color: true, base_color: [0.0, 1.0, 0.0, 1.0], ..Default::default() });
    world.insert_component(entities[2], PbrMaterial { base_color: [0.0, 0.0, 1.0, 1.0], ..Default::default() });
    let hierarchy = TransformHierarchy::build(&world);
    let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
    let first = collect_objects(&world, &hierarchy, &mut materials);
    assert_eq!(first[0].material.base_color, [0.0, 1.0, 0.0, 1.0]);
    assert_eq!(first[1].material.base_color, [1.0, 0.0, 0.0, 1.0]);
    assert_eq!(first[2].material.base_color, [0.0, 0.0, 1.0, 1.0]);
    assert_objects_equal(&first, &baseline_objects(&world, &hierarchy, &mut materials));
    assert_objects_equal(&collect_shared_view_objects(&world, &entities, &first, Some(entities[1])), &first[1..2]);
    std::thread::sleep(Duration::from_millis(270));
    std::fs::write(&file, r#"{"version":8,"shader":"pbr","base_color":[0.5,0.5,0.5,1],"roughness":0.2}"#).unwrap();
    let changed = collect_objects(&world, &hierarchy, &mut materials);
    assert_eq!(changed[1].material.base_color, [0.5, 0.5, 0.5, 1.0]);
    assert_eq!(changed[0].material.base_color, first[0].material.base_color);
    assert_eq!(changed[2].material.base_color, first[2].material.base_color);
    assert_objects_equal(&changed, &baseline_objects(&world, &hierarchy, &mut materials));
    assert_objects_equal(&collect_shared_view_objects(&world, &entities, &changed, Some(entities[1])), &changed[1..2]);
    drop(materials); std::fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "manual Frostbound material extraction CPU benchmark"]
fn benchmark_mesh_material_extraction() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &snapshot);
    let mut reports = Vec::new();
    for activate in [false, true] {
        if activate { for entity in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(entity, 0, true); } }
        let hierarchy = TransformHierarchy::build(&world);
        let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
        let expected = baseline_objects(&world, &hierarchy, &mut materials);
        assert_objects_equal(&expected, &collect_objects(&world, &hierarchy, &mut materials));
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..40 { black_box(if index == 0 { baseline_objects(&world, &hierarchy, &mut materials) } else { collect_objects(&world, &hierarchy, &mut materials) }); }
                if run > 1 { samples[index].push(started.elapsed().as_secs_f64() * 1000.0 / 40.0); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        reports.push(serde_json::json!({"all_pool_entities_active":activate,"objects":expected.len(),"baseline_median_ms":samples[0][4],"cached_median_ms":samples[1][4],"samples":9,"objects_equal":true}));
    }
    println!("MESH_MATERIAL_BENCHMARK={}", serde_json::json!(reports));
}

#[test]
fn shared_views_keep_order_overrides_and_camera_mutations_private() {
    let mut world = World::new();
    let root = world.spawn_empty(); world.insert_component(root, Transform::default());
    let other = world.spawn_empty(); world.insert_component(other, Transform::default());
    let meshes: Vec<_> = (0..4).map(|index| {
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform { position: [index as f32, 0.0, 0.0], ..Default::default() });
        world.insert_component(entity, MeshRenderer { mesh: format!("Assets\\Mesh{index}.glb"), ..Default::default() });
        world.set_parent(entity, Some(if index < 3 { root } else { other })); entity
    }).collect();
    world.insert_component(meshes[1], MaterialPropertyBlock { override_base_color: true, base_color: [0.0, 1.0, 0.0, 1.0], ..Default::default() });
    world.set_editor_state(meshes[2], 0, false);
    let mut materials = RuntimeMaterialCache::new(None);
    for changed in [false, true] {
        if changed { world.set_parent(meshes[1], Some(other)); world.set_editor_state(meshes[2], 0, true); }
        let hierarchy = TransformHierarchy::build(&world);
        let mut entities = Vec::new();
        let source = collect_mesh_objects(&world, &hierarchy, &mut materials, None, Some(&mut entities));
        assert_eq!(entities.len(), source.len());
        for selected in [None, Some(root), Some(other), Some(meshes[0])] {
            let mut view = collect_shared_view_objects(&world, &entities, &source, selected);
            assert_objects_equal(&view, &collect_view_objects(&world, &hierarchy, &mut materials, selected));
            assert!(!view.is_empty());
            view[0].mesh_key = "camera-specific-billboard".into(); view[0].material.base_color = [0.4; 4];
            assert!(source.iter().all(|object| object.mesh_key != "camera-specific-billboard" && object.material.base_color != [0.4; 4]));
        }
    }
}

#[test]
fn root_filter_preserves_inclusive_depth_limit_and_terminates_cycles() {
    let mut world = World::new(); let root = world.spawn_empty(); let unrelated = world.spawn_empty();
    assert!(within_render_root(&world, root, Some(root)));
    assert!(!within_render_root(&world, unrelated, Some(root)));
    let mut child = root;
    for _ in 0..128 { let next = world.spawn_empty(); world.insert_component(next, Parent { entity: child }); child = next; }
    assert!(within_render_root(&world, child, Some(root)));
    let too_deep = world.spawn_empty(); world.insert_component(too_deep, Parent { entity: child });
    assert!(!within_render_root(&world, too_deep, Some(root)));
    world.insert_component(unrelated, Parent { entity: unrelated });
    assert!(!within_render_root(&world, unrelated, Some(root)));
    assert!(within_render_root(&world, unrelated, None));
}

#[test]
fn compiled_views_match_with_main_camera_and_ui_only_frames() {
    use mengine_core::generated::{Canvas, RectTransform};
    let mut world = World::new();
    let camera = world.spawn_empty(); world.insert_component(camera, Transform::default());
    let root = world.spawn_empty(); world.insert_component(root, Transform::default());
    let mesh = world.spawn_empty(); world.insert_component(mesh, Transform::default());
    world.insert_component(mesh, MeshRenderer { mesh: "Assets\\Cube.glb".into(), ..Default::default() }); world.set_parent(mesh, Some(root));
    let other = world.spawn_empty(); world.insert_component(other, Transform::default());
    world.insert_component(other, MeshRenderer { mesh: "Assets/Other.glb".into(), ..Default::default() });
    let canvas = world.spawn_empty(); world.insert_component(canvas, Transform::default());
    world.insert_component(canvas, RectTransform::default()); world.insert_component(canvas, Canvas::default());
    for filter in [root.to_u64().to_string(), String::new()] {
        let raw = world.spawn_empty(); world.insert_component(raw, RectTransform { size_delta: [64.0, 64.0], ..Default::default() });
        world.insert_component(raw, RawImage { render_camera: camera.to_u64().to_string(), render_root: filter, ..Default::default() }); world.set_parent(raw, Some(canvas));
    }
    let mut materials = RuntimeMaterialCache::new(None); let mut textures = RuntimeTextureCache::new(None); let mut fonts = RuntimeFontCache::new(None);
    let mut particles = ParticleWorld::default(); let mut trails = TrailWorld::default();
    for primary in [true, false] {
        world.insert_component(camera, Camera3D { primary, ..Default::default() });
        let hierarchy = TransformHierarchy::build(&world);
        for include_ui in [true, false] {
            let frame = FrameCompiler { materials: &mut materials, textures: &mut textures, fonts: &mut fonts, particles: &mut particles, trails: &mut trails, ui_batch_order: None }.compile(FrameCompileRequest {
                world: &world, hierarchy: &hierarchy, viewport: [128, 128], scene_clear: Vec4::ZERO, camera_override: None, view_camera: None, include_ui, target_display: 0,
                interaction: UiInteractionState::default(), button_tints: &HashMap::new(), focused_ui: None, sorting_layers: &SortingLayers::default(), delta_seconds: 0.0,
            });
            assert_eq!(frame.objects.len(), if primary { 2 } else { 0 });
            assert_eq!(frame.scene_views.len(), if include_ui { 2 } else { 0 });
            assert_eq!(frame.view_resources.len(), if !primary && include_ui { 3 } else { 0 });
            if include_ui {
                assert_eq!(frame.scene_views[0].objects.len(), 1); assert_eq!(frame.scene_views[1].objects.len(), 2);
                assert_eq!(frame.scene_views[0].objects[0].mesh_key, "Assets/Cube.glb");
                assert_objects_equal(&frame.scene_views[0].objects, &collect_view_objects(&world, &hierarchy, &mut materials, Some(root)));
                assert_objects_equal(&frame.scene_views[1].objects, &collect_objects(&world, &hierarchy, &mut materials));
            }
        }
    }
}

#[test]
#[ignore = "manual Frostbound main and embedded-view extraction CPU benchmark"]
fn benchmark_shared_view_extraction() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &snapshot);
    let mut reports = Vec::new();
    for activate in [false, true] {
        if activate { for entity in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(entity, 0, true); } }
        let hierarchy = TransformHierarchy::build(&world);
        let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
        let selected = world.entities_with_components(&["MeshRenderer"]).find(|&entity| hierarchy.get(entity).is_some()).unwrap();
        for (views, filter) in [(0, None), (1, Some(selected)), (1, None), (8, None)] {
            let mut extract = |shared| {
                let mut entities = Vec::new();
                let main = if shared { collect_mesh_objects(&world, &hierarchy, &mut materials, None, Some(&mut entities)) } else { collect_objects(&world, &hierarchy, &mut materials) };
                let embedded: Vec<_> = (0..views).map(|_| if shared { collect_shared_view_objects(&world, &entities, &main, filter) } else { collect_view_objects(&world, &hierarchy, &mut materials, filter) }).collect();
                (main, embedded)
            };
            let expected = extract(false); let actual = extract(true);
            assert_objects_equal(&expected.0, &actual.0);
            for (left, right) in expected.1.iter().zip(&actual.1) { assert_objects_equal(left, right); }
            let mut samples = [Vec::new(), Vec::new()];
            for run in 0..11 {
                for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                    let started = Instant::now(); for _ in 0..20 { black_box(extract(index == 1)); }
                    if run > 1 { samples[index].push(started.elapsed().as_secs_f64() * 1000.0 / 20.0); }
                }
            }
            for values in &mut samples { values.sort_by(f64::total_cmp); }
            reports.push(serde_json::json!({"all_pool_entities_active":activate,"objects":expected.0.len(),"views":views,"rooted":filter.is_some(),"view_objects":expected.1.first().map_or(0, Vec::len),"baseline_median_ms":samples[0][4],"shared_median_ms":samples[1][4],"objects_equal":true}));
        }
    }
    println!("SHARED_VIEW_EXTRACTION_BENCHMARK={}", serde_json::json!(reports));
}
