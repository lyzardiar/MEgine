// Author: MiYu. Verify warm mesh traversal against the same parser path and retain active geometry.
use super::*;
use super::tests::PoseFixture;

fn object(key: &str) -> RenderObject { RenderObject { mesh_key:key.into(), model:glam::Mat4::IDENTITY, material:mengine_rhi::RenderMaterial { unlit:true, ..Default::default() }.into(), cast_shadows:false, receive_shadows:false } }

fn assert_caches_equal(previous: &RuntimeMeshCache, current: &RuntimeMeshCache) {
    assert_eq!(previous.attempted, current.attempted);
    assert_eq!((previous.frame, previous.pose_bytes, previous.uploads, previous.evictions), (current.frame, current.pose_bytes, current.uploads, current.evictions));
    let usage = |cache: &RuntimeMeshCache| cache.pose_usage.iter().map(|(key, used)| (key.clone(), (used.frame, used.bytes))).collect::<std::collections::BTreeMap<_, _>>();
    assert_eq!(usage(previous), usage(current));
    assert_eq!(previous.poses.keys().collect::<HashSet<_>>(), current.poses.keys().collect::<HashSet<_>>());
    assert_eq!(previous.patches.keys().collect::<HashSet<_>>(), current.patches.keys().collect::<HashSet<_>>());
    assert_eq!(previous.billboard_views.keys().collect::<HashSet<_>>(), current.billboard_views.keys().collect::<HashSet<_>>());
}

#[test]
fn warm_keys_preserve_pixels_new_poses_invalidation_and_source_recovery() {
    let fixture = PoseFixture::new(); let path = fixture.0.join("pose.gltf");
    let mut doc: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    doc["nodes"][0]["extras"] = serde_json::json!({"mengineBillboard":{"flags":8}});
    std::fs::write(fixture.0.join("billboard.gltf"), doc.to_string()).unwrap();
    let patch = serde_json::json!({"schemaVersion":1,"columns":1,"rows":1,"cellSize":[1,1],"scale":1,"heightStep":1,"origin":[0,0],"templateOffset":[0,0,0],"templates":[{"positions":[[-1,-1,0],[1,-1,0],[0,1,0]],"normals":[[0,0,1],[0,0,1],[0,0,1]],"uvs":[[0,0],[1,0],[0,1]],"indices":[0,1,2]}]});
    std::fs::write(fixture.0.join("test.mpatch"), patch.to_string()).unwrap();
    let keys = ["pose.gltf#pose=0:0@30", "billboard.gltf#pose=0:0@30", "pose.gltf", "meshpatch:test.mpatch#00080", "terrain4:0000000000000000000000000000000000000000000000000000000000000000", "meshpatch:invalid", "terrain4:invalid", "pose.gltf#pose=bad", "missing.gltf", "cube", ""];
    let camera = FrameCamera { view:glam::Mat4::IDENTITY, proj:glam::Mat4::IDENTITY, position:Vec3::Z };
    let clear = mengine_rhi::ClearColor { r:0., g:0., b:0., a:1. };
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(32, 32))).unwrap();
    let target = renderer.create_offscreen_target(winit::dpi::PhysicalSize::new(32, 32));
    let mut previous = RuntimeMeshCache::new(Some(fixture.0.clone())); previous.parse_cached_mesh_keys = true;
    let mut current = RuntimeMeshCache::new(Some(fixture.0.clone()));
    for phase in 0..10 {
        match phase { 3 => { previous.invalidate("test.mpatch"); current.invalidate("test.mpatch"); previous.invalidate("pose.gltf"); current.invalidate("pose.gltf"); }, 4 => fixture.buffer(0.1, true), 5 => std::fs::remove_file(fixture.0.join("pose.bin")).unwrap(), 6 => fixture.buffer(0., false), 7 => { previous.invalidate_uploaded_geometry(); current.invalidate_uploaded_geometry(); }, 8 => { previous.set_project_root(None); current.set_project_root(None); }, 9 => { previous.set_project_root(Some(fixture.0.clone())); current.set_project_root(Some(fixture.0.clone())); }, _ => () }
        let warm = matches!(phase, 1..=3 | 7);
        let mut output = Vec::new();
        for cache in [&mut previous, &mut current] {
            cache.last_poll = warm.then(Instant::now);
            let mut objects = keys.iter().cycle().take(keys.len() * 3).map(|key| object(&format!("  {key}  "))).collect::<Vec<_>>();
            if phase >= 2 { objects.push(object("pose.gltf#pose=0:1@30")); }
            let mut frame = CompiledFrame { profile_stages:vec![], clear, camera, objects:objects.clone(), lighting:Default::default(), ui:mengine_rhi::UiBatchPlan::build(vec![]), controls:vec![], texture_failures:vec![], font_failures:vec![], has_authored_camera:true, scene_views:vec![mengine_rhi::SceneTextureFrame { key:"warm-key-view".into(), size:[16,16], clear, camera:FrameCamera { view:glam::Mat4::from_rotation_y(0.5), ..camera }, objects, lighting:Default::default() }], view_resources:vec![] };
            let failures = cache.sync_frame(&mut renderer, &mut frame);
            renderer.submit_frame_to(&frame.render_frame(), mengine_rhi::RenderTarget::Offscreen(&target)).unwrap();
            let profile = cache.sync_profile();
            output.push((failures, renderer.read_offscreen_rgba8(&target).unwrap(), (profile.file_checks, profile.source_checks, profile.geometry_builds, profile.uploads)));
        }
        assert_eq!(output[0], output[1], "phase {phase}"); assert_caches_equal(&previous, &current);
        if phase == 1 { assert_eq!(output[1].2, (0, 0, 0, 0)); assert!(current.pose_usage.values().all(|used| used.frame == current.frame)); }
        if phase == 2 { assert!(output[1].2.3 > 0, "new sampling keys still upload before periodic polling"); }
        if phase == 5 { assert!(!output[1].0.is_empty()); }
        if phase == 6 { assert!(output[1].0.is_empty()); }
    }
}

#[test]
fn warm_active_keys_survive_budget_pruning_and_absent_keys_retire() {
    let fixture = PoseFixture::new();
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16, 16))).unwrap();
    let mut previous = RuntimeMeshCache::new(Some(fixture.0.clone())); previous.parse_cached_mesh_keys = true;
    let mut current = RuntimeMeshCache::new(Some(fixture.0.clone()));
    let active = "pose.gltf#pose=0:0@30"; let absent = "pose.gltf#pose=0:1@30";
    for cache in [&mut previous, &mut current] {
        assert!(cache.sync(&mut renderer, &[object(active), object(absent)]).is_empty());
        let used = cache.pose_usage.get_mut(active).unwrap(); used.bytes = POSE_CACHE_BYTES + 1;
        cache.pose_bytes = cache.pose_usage.values().map(|used| used.bytes).sum();
        cache.last_poll = Some(Instant::now());
        assert!(cache.sync(&mut renderer, &[object(active), object(active)]).is_empty());
        assert!(cache.pose_usage.contains_key(active)); assert!(!cache.pose_usage.contains_key(absent));
        assert_eq!((cache.stats().uploads, cache.stats().evictions), (0, 1));
        cache.last_poll = Some(Instant::now()); assert!(cache.sync(&mut renderer, &[]).is_empty());
        assert_eq!(cache.pose_bytes, 0); assert!(cache.attempted.is_empty()); assert!(cache.poses.is_empty());
    }
    assert_caches_equal(&previous, &current);
}

#[test]
#[ignore = "manual same-version warm traversal comparison using authored map objects"]
fn benchmark_cached_mesh_key_traversal() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16, 16))).unwrap();
    let mut inputs = vec![(root.clone(), "Assets/Maps/amazonia/Scenes/Main.mscene"), (root, "Assets/Scenes/Main.mscene")];
    let preserved_scene = std::env::var("MENGINE_CACHED_KEY_SCENE").unwrap_or_else(|_| "Assets/Scenes/Main.mscene".into());
    if let Some(root) = std::env::var_os("MENGINE_CACHED_KEY_PROJECT") { inputs.push((PathBuf::from(root), preserved_scene.as_str())); }
    for (root, scene) in inputs {
        let mut world = mengine_core::World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = mengine_core::TransformHierarchy::build(&world);
        let objects = crate::frame_compiler::collect_objects(&world, &hierarchy, &mut crate::materials::RuntimeMaterialCache::new(Some(root.clone())));
        let mut previous = RuntimeMeshCache::new(Some(root.clone())); previous.parse_cached_mesh_keys = true;
        let mut current = RuntimeMeshCache::new(Some(root.clone()));
        // Seed only already-attempted keys and their existing residency records; do not load map geometry.
        for cache in [&mut previous, &mut current] { for object in &objects {
            if object.material.particle.is_some() { continue; }
            let key = object.mesh_key.trim(); let lower = key.to_ascii_lowercase();
            if !key.starts_with("meshpatch:") && !key.starts_with("terrain4") && !key.contains("#pose=") && !lower.ends_with(".gltf") && !lower.ends_with(".glb") { continue; }
            cache.attempted.insert(key.into(), FileStamp::default());
            if parse_gltf_pose_sample(key).is_some() || key.starts_with("terrain4") || key.starts_with("meshpatch:") { cache.pose_usage.insert(key.into(), PoseUsage { frame:0, bytes:0 }); }
        }}
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 { for mode in [run % 2, 1 - run % 2] {
            let cache = if mode == 0 { &mut previous } else { &mut current }; let started = Instant::now();
            for _ in 0..200 {
                cache.last_poll = Some(Instant::now());
                assert!(std::hint::black_box(cache.sync_objects(&mut renderer, objects.iter(), &mut FrameSourceChecks::default())).is_empty());
            }
            if run >= 2 { samples[mode].push(started.elapsed().as_secs_f64() * 1000. / 200.); }
        }}
        assert_caches_equal(&previous, &current);
        println!("CACHED_MESH_KEYS={}", serde_json::json!({"project":root,"scene":scene,"objects":objects.len(),"keys":current.attempted.len(),"samples":samples,"iterations":200,"warmups":2,"scope":"same production sync with cached-key branch disabled or enabled; warm non-polling traversal; excludes billboard preparation, source validation, loading, uploads, IPC and FPS"}));
    }
}
