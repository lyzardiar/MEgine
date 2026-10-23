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
            out.push(RenderObject { mesh_key: mesh.mesh.trim().replace('\\', "/"), model: transform.matrix, cast_shadows: mesh.cast_shadows, receive_shadows: mesh.receive_shadows, material: material.into() });
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
#[ignore = "manual large-map material extraction stage profile"]
fn benchmark_large_map_material_steps() {
    let root = std::path::PathBuf::from(std::env::var_os("MENGINE_MATERIAL_PROJECT").expect("Set MENGINE_MATERIAL_PROJECT to a preserved map project"));
    let mut world = World::new(); mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world).unwrap();
    let hierarchy = TransformHierarchy::build(&world);
    let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
    let expected = collect_objects(&world, &hierarchy, &mut materials);
    let mut samples = vec![Vec::new(); 7];
    for run in 0..11 {
        let mut times = [0.; 7];
        for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
            let total = Instant::now();
            for _ in 0..5 {
                if index == 0 { black_box(collect_objects(&world, &hierarchy, &mut materials)); continue; }
                let start = Instant::now();
                let inputs: Vec<_> = world.entities_with_components(&["MeshRenderer"]).filter_map(|entity| Some((hierarchy.get(entity)?, world.get_component::<MeshRenderer>(entity)?, world.get_component::<PbrMaterial>(entity), world.get_component::<MaterialPropertyBlock>(entity)))).collect();
                times[2] += start.elapsed().as_secs_f64();
                let start = Instant::now(); let mut resolved = HashMap::<&str, RenderMaterial>::new();
                let values: Vec<_> = inputs.iter().map(|(_, mesh, pbr, _)| pbr.map(render_material_from_component).unwrap_or_else(|| resolved.entry(&mesh.material).or_insert_with(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material))).clone())).collect();
                times[3] += start.elapsed().as_secs_f64();
                let start = Instant::now();
                let values: Vec<_> = values.into_iter().zip(&inputs).map(|(material, (_, _, _, block))| if let Some(block) = block { apply_material_property_block(material, block) } else { material }).collect();
                times[4] += start.elapsed().as_secs_f64();
                let start = Instant::now();
                let out: Vec<_> = values.into_iter().zip(&inputs).map(|(material, (transform, mesh, _, _))| RenderObject { mesh_key: mesh.mesh.trim().replace('\\', "/"), model: transform.matrix, cast_shadows: mesh.cast_shadows, receive_shadows: mesh.receive_shadows, material: material.into() }).collect();
                times[5] += start.elapsed().as_secs_f64();
                if run == 0 { assert_objects_equal(&out, &expected); }
                let start = Instant::now(); drop(black_box(out)); drop(resolved); drop(inputs); times[6] += start.elapsed().as_secs_f64();
            }
            times[index] = total.elapsed().as_secs_f64();
        }
        if run > 1 { for (samples, value) in samples.iter_mut().zip(times) { samples.push(value * 1000. / 5.); } }
    }
    for sample in &mut samples { sample.sort_by(f64::total_cmp); }
    println!("MATERIAL_STAGES={}", serde_json::json!({"project":root,"objects":expected.len(),"samples":9,"iterations_per_sample":5,"baseline_ms":samples[0][4],"batched_profile_ms":samples[1][4],"lookup_ms":samples[2][4],"material_ms":samples[3][4],"overrides_ms":samples[4][4],"objects_ms":samples[5][4],"drop_ms":samples[6][4]}));
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
fn cached_root_filter_matches_depth_cutoffs_in_every_query_order() {
    let mut world = World::new();let root = world.spawn_empty();let unrelated = world.spawn_empty();
    let mut chain = vec![root];
    for _ in 0..260 { let child = world.spawn_empty();world.insert_component(child, Parent { entity: *chain.last().unwrap() });chain.push(child); }
    let cycle_a = world.spawn_empty();let cycle_b = world.spawn_empty();
    world.insert_component(cycle_a, Parent { entity: cycle_b });world.insert_component(cycle_b, Parent { entity: cycle_a });
    let removed = world.spawn_empty();world.despawn(removed);let replacement = world.spawn_empty();
    let stale_child = world.spawn_empty();world.insert_component(stale_child, Parent { entity: removed });
    let mut candidates = chain.clone();candidates.extend([unrelated,cycle_a,cycle_b,stale_child,replacement]);
    for selected in [None,Some(root),Some(chain[64]),Some(unrelated),Some(cycle_a),Some(replacement)] {
        for reverse in [true,false] {
            let mut filter = RenderRootFilter::new(selected);
            let mut ordered = candidates.clone();if reverse { ordered.reverse(); }
            for entity in ordered.iter().chain(ordered.iter().rev()) {
                assert_eq!(filter.contains(&world,*entity),within_render_root(&world,*entity,selected),"root={selected:?} entity={entity:?}");
            }
        }
    }
    // The first truncated query cannot poison the shorter suffix used by the next mesh.
    let mut filter = RenderRootFilter::new(Some(root));
    assert!(!filter.contains(&world,chain[129]));assert!(filter.contains(&world,chain[128]));assert!(!filter.contains(&world,chain[130]));
}

#[test]
fn cached_root_filter_retains_shared_ancestors_without_caching_flat_leaves() {
    let mut world = World::new();let root = world.spawn_empty();let parent = world.spawn_empty();world.insert_component(parent,Parent {entity:root});
    let direct = world.spawn_empty();world.insert_component(direct,Parent {entity:root});
    let children: Vec<_> = (0..64).map(|_| {let child=world.spawn_empty();world.insert_component(child,Parent {entity:parent});child}).collect();
    let mut filter = RenderRootFilter::new(Some(root));assert!(filter.contains(&world,direct));assert!(filter.distances.is_empty());assert!(filter.path.is_empty());
    for child in &children {assert!(filter.contains(&world,*child));}
    assert_eq!(filter.distances.len(),1);assert_eq!(filter.distances[&parent],Some(1));
    world.insert_component(parent,Parent {entity:direct});
    let mut next_view = RenderRootFilter::new(Some(direct));
    for child in &children {assert!(next_view.contains(&world,*child));}
    world.remove_component_by_name(parent,"Parent");
    let mut next_view = RenderRootFilter::new(Some(root));
    for child in children {assert!(!next_view.contains(&world,child));}
}

#[test]
#[ignore = "manual shared-ancestor view filter benchmark for the integration batch"]
fn benchmark_cached_render_root_filter() {
    let mut reports = Vec::new();
    for depth in [1,16,64] {
        let mut world=World::new();let root=world.spawn_empty();let outside=world.spawn_empty();let mut parents=[root,outside];
        for _ in 1..depth {for parent in &mut parents {let child=world.spawn_empty();world.insert_component(child,Parent {entity:*parent});*parent=child;}}
        let entities: Vec<_>=(0..4096).map(|index| {let child=world.spawn_empty();world.insert_component(child,Parent {entity:parents[index%2]});child}).collect();
        let baseline=|| entities.iter().map(|entity|within_render_root(&world,*entity,Some(root))).collect::<Vec<_>>();
        let cached=|| {let mut filter=RenderRootFilter::new(Some(root));let result=entities.iter().map(|entity|filter.contains(&world,*entity)).collect::<Vec<_>>();(result,filter.distances.len())};
        let expected=baseline();let (actual,ancestors)=cached();assert_eq!(expected,actual);assert_eq!(actual.iter().filter(|value|**value).count(),2048);
        let mut samples=[Vec::new(),Vec::new()];
        for sample in 0..11 {for mode in [sample%2,(sample+1)%2] {
            let started=std::time::Instant::now();
            for _ in 0..30 {if mode==0 {std::hint::black_box(baseline());}else {std::hint::black_box(cached());}}
            if sample>=2 {samples[mode].push(started.elapsed().as_secs_f64()*1000.0/30.0);}
        }}
        for values in &mut samples {values.sort_by(f64::total_cmp);}
        reports.push(serde_json::json!({"depth":depth,"candidates":entities.len(),"cached_ancestors":ancestors,"baseline_ms":samples[0][4],"cached_ms":samples[1][4],"results_equal":true}));
    }
    println!("RENDER_ROOT_FILTER_BENCHMARK={}",serde_json::json!(reports));
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

#[test]
#[ignore = "manual Frostbound transform hierarchy CPU benchmark"]
fn benchmark_transform_hierarchy_build() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let scene: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let mut inputs = vec![("authored", scene["world"].clone(), false), ("all-pools", scene["world"].clone(), true)];
    if let Ok(path) = std::env::var("MENGINE_PERFORMANCE_WORLD") { inputs.push(("paused-game", serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap(), false)); }
    let mut reports = Vec::new();
    for (name, value, activate) in inputs {
        let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &serde_json::from_value(value).unwrap());
        if activate { for entity in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(entity, 0, true); } }
        let entities: Vec<_> = world.iter_entities().collect();
        let expected = TransformHierarchy::build(&world);
        let subset: Vec<_> = entities.iter().copied().filter(|&entity| expected.get(entity).is_some()).take(16).collect();
        let partial = TransformHierarchy::build_for_entities(&world, subset.iter().copied());
        for &entity in &subset { assert_eq!(partial.get(entity), expected.get(entity)); assert_eq!(partial.parent_world(&world, entity), expected.parent_world(&world, entity)); }
        for partial in [false, true] {
            let mut samples = Vec::new();
            for group in 0..11 {
                let started = Instant::now();
                for _ in 0..100 { black_box(if partial { TransformHierarchy::build_for_entities(&world, subset.iter().copied()) } else { TransformHierarchy::build(&world) }); }
                if group >= 2 { samples.push(started.elapsed().as_secs_f64() * 1000.0 / 100.0); }
            }
            samples.sort_by(f64::total_cmp);
            reports.push(serde_json::json!({"scene":name,"entities":entities.len(),"active_transforms":entities.iter().filter(|&&entity| expected.get(entity).is_some()).count(),"subset":partial,"requested":if partial { subset.len() } else { entities.len() },"median_ms":samples[4],"samples":9,"iterations":100}));
        }
    }
    println!("TRANSFORM_HIERARCHY_BENCHMARK={}", serde_json::json!(reports));
}

// Reference extraction retains the existing growable output allocation.
fn growable_output_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache, root: Option<Entity>, mut entities: Option<&mut Vec<Entity>>) -> Vec<RenderObject> {
    let mut out = Vec::new();
    let mut root_filter = RenderRootFilter::new(root);
    // MiYu: resolve a shared authored material once per extraction; each object's overrides stay private.
    let mut resolved_materials = HashMap::<&str, RenderMaterial>::new();
    for entity in world.entities_with_components(&["MeshRenderer"]) {
        // MiYu: resolve eligibility before reading pooled renderer components.
        let Some(transform) = hierarchy.get(entity) else { continue; };
        if !root_filter.contains(world, entity) { continue; }
        if let Some(mesh) = world.get_component::<MeshRenderer>(entity) {
            let mut material = world
                .get_component::<PbrMaterial>(entity)
                .map(render_material_from_component)
                .unwrap_or_else(|| {
                    resolved_materials.entry(&mesh.material).or_insert_with(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material))).clone()
                });
            if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) {
                material = apply_material_property_block(material, block);
            }
            if let Some(entities) = entities.as_deref_mut() { entities.push(entity); }
            out.push(RenderObject {
                mesh_key: mesh.mesh.trim().replace('\\', "/"),
                model: transform.matrix,
                cast_shadows: mesh.cast_shadows,
                receive_shadows: mesh.receive_shadows,
                material: material.into(),
            });
        }
    }
    out
}


#[test]
#[ignore = "manual original-map output allocation comparison"]
fn benchmark_mesh_output_allocation() {
    let root = std::path::PathBuf::from(std::env::var_os("MENGINE_MATERIAL_PROJECT").expect("Set MENGINE_MATERIAL_PROJECT to a preserved map project"));
    let mut world = World::new(); mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world).unwrap();
    let hierarchy = TransformHierarchy::build(&world); let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
    let expected = growable_output_objects(&world, &hierarchy, &mut materials, None, None);
    let reserved = collect_objects(&world, &hierarchy, &mut materials); assert_objects_equal(&expected, &reserved);
    let mut samples = [Vec::new(), Vec::new()];
    for run in 0..11 { for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
        let start = Instant::now();
        for _ in 0..20 { black_box(if index == 0 { growable_output_objects(&world, &hierarchy, &mut materials, None, None) } else { collect_objects(&world, &hierarchy, &mut materials) }); }
        if run > 1 { samples[index].push(start.elapsed().as_secs_f64() * 1000. / 20.); }
    }}
    for sample in &mut samples { sample.sort_by(f64::total_cmp); }
    println!("MESH_OUTPUT_ALLOCATION={}", serde_json::json!({"project":root,"objects":expected.len(),"baseline_capacity":expected.capacity(),"reserved_capacity":reserved.capacity(),"object_bytes":std::mem::size_of::<RenderObject>(),"samples":9,"iterations_per_sample":20,"baseline_ms":samples[0][4],"reserved_ms":samples[1][4],"all_samples":samples}));
}


#[test]
#[ignore = "manual borrowed hierarchy transforms in mesh extraction"]
fn benchmark_mesh_transform_borrows() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut reports = Vec::new();
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let mut world = World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = TransformHierarchy::build(&world);
        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let expected = aggregate_mesh_objects(&world, &hierarchy, &mut cache, None, None);
        assert_objects_equal(&expected, &collect_objects(&world, &hierarchy, &mut cache));
        let mut samples = [Vec::new(), Vec::new()];
        for group in 0..11 {
            for index in if group % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..20 { black_box(if index == 0 { aggregate_mesh_objects(&world, &hierarchy, &mut cache, None, None) } else { collect_objects(&world, &hierarchy, &mut cache) }); }
                if group >= 2 { samples[index].push(started.elapsed().as_secs_f64() * 1000. / 20.); }
            }
        }
        let raw = samples.clone(); for values in &mut samples { values.sort_by(f64::total_cmp); }
        assert_objects_equal(&expected, &collect_objects(&world, &hierarchy, &mut cache));
        reports.push(serde_json::json!({"scene":scene,"objects":expected.len(),"aggregate_ms":samples[0][4],"borrowed_ms":samples[1][4],"samples_ms":raw,"iterations_per_sample":20,"equal":true,"aggregate_input_bytes":std::mem::size_of::<(Entity,mengine_core::WorldTransform,&MeshRenderer)>()*expected.len(),"borrowed_input_bytes":std::mem::size_of::<(Entity,&mengine_core::WorldTransform,&MeshRenderer)>()*expected.len()}));
    }
    println!("MESH_TRANSFORM_BORROWS={}", serde_json::json!(reports));
}

fn aggregate_mesh_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache, root: Option<Entity>, mut entities: Option<&mut Vec<Entity>>) -> Vec<RenderObject> {
    let mut root_filter = RenderRootFilter::new(root);
    // Compact borrowed inputs size the large owned RenderObject buffer once, without copying materials during growth.
    let inputs: Vec<_> = world.entities_with_components(&["MeshRenderer"]).filter_map(|entity| {
        let transform = hierarchy.get(entity)?;
        if !root_filter.contains(world, entity) { return None; }
        Some((entity, transform, world.get_component::<MeshRenderer>(entity)?))
    }).collect();
    let mut out = Vec::with_capacity(inputs.len());
    // MiYu: resolve a shared authored material once per extraction; each object's overrides stay private.
    let mut resolved_materials = HashMap::<&str, RenderMaterial>::new();
    for (entity, transform, mesh) in inputs {
        let mut material = world
            .get_component::<PbrMaterial>(entity)
            .map(render_material_from_component)
            .unwrap_or_else(|| {
                resolved_materials.entry(&mesh.material).or_insert_with(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material))).clone()
            });
        if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) {
            material = apply_material_property_block(material, block);
        }
        if let Some(entities) = entities.as_deref_mut() { entities.push(entity); }
        out.push(RenderObject {
            mesh_key: mesh.mesh.trim().replace('\\', "/"),
            model: transform.matrix,
            cast_shadows: mesh.cast_shadows,
            receive_shadows: mesh.receive_shadows,
            material: material.into(),
        });
    }
    out
}

#[test]
#[ignore = "manual in-place material override extraction comparison"]
fn benchmark_material_override_moves() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut reports = Vec::new();
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let mut world = World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = TransformHierarchy::build(&world);
        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let expected = value_override_mesh_objects(&world, &hierarchy, &mut cache, None, None);
        assert_objects_equal(&expected, &collect_objects(&world, &hierarchy, &mut cache));
        let mut samples = [Vec::new(), Vec::new()];
        for group in 0..11 {
            for index in if group % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..20 { black_box(if index == 0 { value_override_mesh_objects(&world, &hierarchy, &mut cache, None, None) } else { collect_objects(&world, &hierarchy, &mut cache) }); }
                if group >= 2 { samples[index].push(started.elapsed().as_secs_f64() * 1000. / 20.); }
            }
        }
        let raw = samples.clone(); for values in &mut samples { values.sort_by(f64::total_cmp); }
        assert_objects_equal(&expected, &collect_objects(&world, &hierarchy, &mut cache));
        reports.push(serde_json::json!({"scene":scene,"objects":expected.len(),"value_ms":samples[0][4],"in_place_ms":samples[1][4],"samples_ms":raw,"iterations_per_sample":20,"equal":true,"render_material_bytes":std::mem::size_of::<RenderMaterial>()}));
    }
    println!("MATERIAL_OVERRIDE_MOVES={}", serde_json::json!(reports));
}

fn value_override_mesh_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache, root: Option<Entity>, mut entities: Option<&mut Vec<Entity>>) -> Vec<RenderObject> {
    let mut root_filter = RenderRootFilter::new(root);
    // Compact borrowed inputs size the large owned RenderObject buffer once, without copying materials during growth.
    let inputs: Vec<_> = world.entities_with_components(&["MeshRenderer"]).filter_map(|entity| {
        let transform = hierarchy.get_ref(entity)?;
        if !root_filter.contains(world, entity) { return None; }
        Some((entity, transform, world.get_component::<MeshRenderer>(entity)?))
    }).collect();
    let mut out = Vec::with_capacity(inputs.len());
    // MiYu: resolve a shared authored material once per extraction; each object's overrides stay private.
    let mut resolved_materials = HashMap::<&str, RenderMaterial>::new();
    for (entity, transform, mesh) in inputs {
        let mut material = world
            .get_component::<PbrMaterial>(entity)
            .map(render_material_from_component)
            .unwrap_or_else(|| {
                resolved_materials.entry(&mesh.material).or_insert_with(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material))).clone()
            });
        if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) {
            material = apply_material_property_block(material, block);
        }
        if let Some(entities) = entities.as_deref_mut() { entities.push(entity); }
        out.push(RenderObject {
            mesh_key: mesh.mesh.trim().replace('\\', "/"),
            model: transform.matrix,
            cast_shadows: mesh.cast_shadows,
            receive_shadows: mesh.receive_shadows,
            material: material.into(),
        });
    }
    out
}


#[test]
fn shared_render_materials_detach_for_object_and_view_edits() {
    let mut world = World::new();
    let ids: Vec<_> = (0..4).map(|_| { let entity = world.spawn_empty(); world.insert_component(entity, Transform::default()); world.insert_component(entity, MeshRenderer { mesh: "cube".into(), material: "default".into(), ..Default::default() }); entity }).collect();
    for &entity in &ids[..3] { world.insert_component(entity, MaterialPropertyBlock { override_base_color: true, base_color: [0.3, 0.4, 0.5, 1.0], ..Default::default() }); }
    world.get_component_mut::<MaterialPropertyBlock>(ids[2]).unwrap().override_metallic = true;
    world.get_component_mut::<MaterialPropertyBlock>(ids[2]).unwrap().metallic = 0.7;
    let hierarchy = TransformHierarchy::build(&world); let mut materials = RuntimeMaterialCache::new(None);
    let mut objects = collect_objects(&world, &hierarchy, &mut materials);
    assert_objects_equal(&objects, &baseline_objects(&world, &hierarchy, &mut materials));
    assert!(std::ptr::eq(&*objects[0].material, &*objects[1].material));
    assert!(!std::ptr::eq(&*objects[0].material, &*objects[2].material));
    assert_eq!(objects[2].material.metallic, 0.7);
    let mut view = collect_shared_view_objects(&world, &ids, &objects, None);
    assert!(std::ptr::eq(&*view[0].material, &*objects[0].material));
    view[0].material.base_color = [0.0, 1.0, 0.0, 1.0];
    assert_eq!(objects[0].material.base_color, [0.3, 0.4, 0.5, 1.0]);
    objects[0].material.base_color_texture = "local.png".into();
    assert_ne!(objects[1].material.base_color_texture, "local.png");
    world.get_component_mut::<MaterialPropertyBlock>(ids[1]).unwrap().base_color[0] = 0.8;
    let next = collect_objects(&world, &hierarchy, &mut materials);
    assert_eq!(next[1].material.base_color[0], 0.8); assert_eq!(objects[1].material.base_color[0], 0.3);
    assert_objects_equal(&next, &baseline_objects(&world, &hierarchy, &mut materials));
}

#[derive(Debug)]
struct OwnedMaterialObject { mesh_key: String, model: glam::Mat4, material: RenderMaterial, cast_shadows: bool, receive_shadows: bool }
fn owned_material_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache, root: Option<Entity>, mut entities: Option<&mut Vec<Entity>>) -> Vec<OwnedMaterialObject> {
    let mut root_filter = RenderRootFilter::new(root);
    // Compact borrowed inputs size the large owned RenderObject buffer once, without copying materials during growth.
    let inputs: Vec<_> = world.entities_with_components(&["MeshRenderer"]).filter_map(|entity| {
        let transform = hierarchy.get_ref(entity)?;
        if !root_filter.contains(world, entity) { return None; }
        Some((entity, transform, world.get_component::<MeshRenderer>(entity)?))
    }).collect();
    let mut out = Vec::with_capacity(inputs.len());
    // MiYu: resolve a shared authored material once per extraction; each object's overrides stay private.
    let mut resolved_materials = HashMap::<&str, RenderMaterial>::new();
    for (entity, transform, mesh) in inputs {
        let mut material = world
            .get_component::<PbrMaterial>(entity)
            .map(render_material_from_component)
            .unwrap_or_else(|| {
                resolved_materials.entry(&mesh.material).or_insert_with(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material))).clone()
            });
        if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) {
            apply_material_property_block_in_place(&mut material, block);
        }
        if let Some(entities) = entities.as_deref_mut() { entities.push(entity); }
        out.push(OwnedMaterialObject {
            mesh_key: mesh.mesh.trim().replace('\\', "/"),
            model: transform.matrix,
            cast_shadows: mesh.cast_shadows,
            receive_shadows: mesh.receive_shadows,
            material,
        });
    }
    out
}

#[test]
#[ignore = "manual material ownership comparison on authored Amazonia and menu scenes"]
fn benchmark_shared_render_materials() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let mut world = World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = TransformHierarchy::build(&world); let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
        let previous = owned_material_objects(&world, &hierarchy, &mut materials, None, None);
        let current = collect_objects(&world, &hierarchy, &mut materials);
        assert_eq!(previous.len(), current.len());
        for (old, new) in previous.iter().zip(&current) {
            assert_eq!(old.mesh_key, new.mesh_key); assert_eq!(old.model, new.model); assert_eq!(old.cast_shadows, new.cast_shadows); assert_eq!(old.receive_shadows, new.receive_shadows);
            assert_eq!(format!("{:?}", old.material), format!("{:?}", *new.material));
        }
        let unique_materials = current.iter().map(|object| (&*object.material) as *const RenderMaterial).collect::<std::collections::HashSet<_>>().len();
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for mode in [run % 2, 1 - run % 2] {
                let started = Instant::now();
                for _ in 0..20 { if mode == 0 { black_box(owned_material_objects(&world, &hierarchy, &mut materials, None, None)); } else { black_box(collect_objects(&world, &hierarchy, &mut materials)); } }
                if run >= 2 { samples[mode].push(started.elapsed().as_secs_f64() * 1000.0 / 20.0); }
            }
        }
        println!("SHARED_RENDER_MATERIAL {}", serde_json::json!({"scene":scene,"objects":current.len(),"uniqueMaterials":unique_materials,"ownedObjectBytes":std::mem::size_of::<OwnedMaterialObject>(),"sharedObjectBytes":std::mem::size_of::<RenderObject>(),"materialBytes":std::mem::size_of::<RenderMaterial>(),"samples":samples,"iterations":20,"warmups":2,"scope":"Previous production extraction with inline owned materials versus shared per-extraction materials; excludes renderer and IPC"}));
    }
}

// Previous production extraction from 9d3e983 paired with the unchanged material resolver.
fn uncached_render_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache, root: Option<Entity>, mut entities: Option<&mut Vec<Entity>>) -> Vec<RenderObject> {
    let mut root_filter = RenderRootFilter::new(root);
    // Compact borrowed inputs size the large owned RenderObject buffer once, without copying materials during growth.
    let inputs: Vec<_> = world.entities_with_components(&["MeshRenderer"]).filter_map(|entity| {
        let transform = hierarchy.get_ref(entity)?;
        if !root_filter.contains(world, entity) { return None; }
        Some((entity, transform, world.get_component::<MeshRenderer>(entity)?))
    }).collect();
    let mut out = Vec::with_capacity(inputs.len());
    // MiYu: resolve a shared authored material once per extraction; each object's overrides stay private.
    let mut resolved_materials = HashMap::<&str, SharedRenderMaterial>::new();
    let mut tinted_materials = HashMap::<(&str, [u32; 4]), SharedRenderMaterial>::new();
    for (entity, transform, mesh) in inputs {
        let block = world.get_component::<MaterialPropertyBlock>(entity);
        let material = if let Some(pbr) = world.get_component::<PbrMaterial>(entity) {
            let mut material = render_material_from_component(pbr);
            if let Some(block) = block { apply_material_property_block_in_place(&mut material, block); }
            material.into()
        } else {
            let base = resolved_materials.entry(&mesh.material).or_insert_with(|| materials.resolve_without_render_cache(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material)).into());
            match block {
                None => base.clone(),
                Some(block) if material_block_is_tint_only(block) => {
                    if !block.override_base_color { base.clone() }
                    else { tinted_materials.entry((&mesh.material, block.base_color.map(f32::to_bits))).or_insert_with(|| {
                        let mut material = base.clone(); apply_material_property_block_in_place(&mut material, block); material
                    }).clone() }
                }
                Some(block) => { let mut material = base.clone(); apply_material_property_block_in_place(&mut material, block); material }
            }
        };
        if let Some(entities) = entities.as_deref_mut() { entities.push(entity); }
        out.push(RenderObject {
            mesh_key: mesh.mesh.trim().replace('\\', "/"),
            model: transform.matrix,
            cast_shadows: mesh.cast_shadows,
            receive_shadows: mesh.receive_shadows,
            material,
        });
    }
    out
}

#[test]
#[ignore = "manual prepared material comparison on authored Amazonia and menu scenes"]
fn benchmark_prepared_render_materials() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let mut world = World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = TransformHierarchy::build(&world); let mut old_cache = RuntimeMaterialCache::new(Some(root.clone())); let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let previous = uncached_render_objects(&world, &hierarchy, &mut old_cache, None, None); let current = collect_objects(&world, &hierarchy, &mut cache); assert_objects_equal(&previous, &current);
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for mode in [run % 2, 1 - run % 2] {
                let started = Instant::now();
                for _ in 0..20 { black_box(if mode == 0 { uncached_render_objects(&world, &hierarchy, &mut old_cache, None, None) } else { collect_objects(&world, &hierarchy, &mut cache) }); }
                if run >= 2 { samples[mode].push(started.elapsed().as_secs_f64() * 1000.0 / 20.0); }
            }
        }
        assert_objects_equal(&uncached_render_objects(&world, &hierarchy, &mut old_cache, None, None), &collect_objects(&world, &hierarchy, &mut cache));
        println!("PREPARED_RENDER_MATERIAL {}", serde_json::json!({"scene":scene,"objects":current.len(),"samples":samples,"iterations":20,"warmups":2,"scope":"Previous production extraction versus prepared built-in materials; both use normal source polling; excludes renderer and IPC"}));
    }
}


#[test]
fn tint_payloads_share_only_equal_sanitized_colors_and_preserve_signed_zero() {
    let root = std::env::temp_dir().join(format!("mengine-tint-payloads-{}", uuid::Uuid::new_v4())); std::fs::create_dir_all(root.join("Assets")).unwrap();
    std::fs::write(root.join("Assets/White.mmat"), r#"{"version":10,"base_color":[1,1,1,1]}"#).unwrap();
    std::fs::write(root.join("Assets/Other.mmat"), r#"{"version":10,"base_color":[1,1,1,1],"roughness":0.2}"#).unwrap();
    let mut world = World::new(); let colors = [[1.0; 4], [1.0; 4], [f32::NAN, 2.0, f32::INFINITY, 1.0], [-1.0, 0.5, 1.0, 1.0], [-2.0, 0.5, 1.0, 1.0], [-0.0, 0.5, 1.0, 1.0], [1.0; 4], [-1.0, 0.5, 1.0, 1.0]];
    let ids: Vec<_> = colors.iter().enumerate().map(|(index, color)| {
        let entity = world.spawn_empty(); world.insert_component(entity, Transform::default()); world.insert_component(entity, MeshRenderer { mesh: "cube".into(), material: if index == 7 { "Assets/Other.mmat" } else { "Assets/White.mmat" }.into(), ..Default::default() });
        if index != 0 { world.insert_component(entity, MaterialPropertyBlock { override_base_color: true, base_color: *color, override_metallic: index == 6, metallic: 0.7, ..Default::default() }); }
        entity
    }).collect();
    let hierarchy = TransformHierarchy::build(&world); let mut cache = RuntimeMaterialCache::new(Some(root.clone())); let objects = collect_objects(&world, &hierarchy, &mut cache);
    assert_objects_equal(&objects, &uncached_render_objects(&world, &hierarchy, &mut cache, None, None));
    assert!(std::ptr::eq(&*objects[0].material, &*objects[1].material)); assert!(std::ptr::eq(&*objects[0].material, &*objects[2].material)); assert!(std::ptr::eq(&*objects[3].material, &*objects[4].material));
    assert!(!std::ptr::eq(&*objects[3].material, &*objects[5].material)); assert_eq!(objects[5].material.base_color[0].to_bits(), (-0.0f32).to_bits()); assert_eq!(objects[3].material.base_color[0].to_bits(), 0.0f32.to_bits());
    assert_eq!(objects[6].material.metallic, 0.7); assert!(!std::ptr::eq(&*objects[3].material, &*objects[7].material)); assert_eq!(objects[7].material.roughness, 0.2);
    world.get_component_mut::<MaterialPropertyBlock>(ids[1]).unwrap().base_color = [0.0; 4]; let next = collect_objects(&world, &hierarchy, &mut cache); assert_eq!(next[1].material.base_color, [0.0; 4]); assert_eq!(objects[1].material.base_color, [1.0; 4]);
    drop(cache); std::fs::remove_dir_all(root).unwrap();
}
