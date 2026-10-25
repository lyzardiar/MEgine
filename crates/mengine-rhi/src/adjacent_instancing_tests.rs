// Author: MiYu. Consecutive instances preserve sorted primitives, sparse parameter slots and cached range ownership.
use super::*;
use super::material_submission_tests::binding_test_objects;

fn setup() -> Renderer {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128))).unwrap();
    assert!(renderer.indexed_objects, "GPU comparison requires indexed object data");
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    renderer.meshes.insert("alternate-cube".into(), MeshGpu::unit_cube(&renderer.device));
    for (key, color) in [("binding-red", [255, 30, 20, 255]), ("binding-blue", [20, 30, 255, 255])] { renderer.upload_material_texture_rgba8(key, 1, 1, &color, true).unwrap(); }
    renderer
}

#[test]
fn adjacent_instances_match_individual_draws_and_keep_cache_range_limits() {
    let mut renderer = setup(); let target = renderer.create_offscreen_target(PhysicalSize::new(128, 128));
    for (key, flip) in [("instance-a", 1.), ("instance-b", -1.)] {
        let vertices = [[-0.5, -0.5, 0.], [0.5, -0.5, 0.], [0., 0.5, 0.]].map(|mut position| { position[1] *= flip; Vertex { position, normal: [0., 0., 1.], uv: [0.; 2] } });
        renderer.upload_gltf_static(key, &vertices, &[0, 1, 2]);
    }
    assert_eq!(renderer.meshes["instance-a"].index_buffer, renderer.meshes["instance-b"].index_buffer);
    assert_ne!(renderer.meshes["instance-a"].vertex_buffer, renderer.meshes["instance-b"].vertex_buffer);
    let mut objects = binding_test_objects(128, false);
    for (index, object) in objects.iter_mut().enumerate() { object.mesh_key = "instance-a".into(); object.material.base_color = [(index % 5) as f32 / 5., (index % 7) as f32 / 7., 0.8, 1.]; }
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    for phase in 0..11 {
        match phase {
            1 => { objects[64].model.w_axis.z = -0.25; lighting.directional = Some(DirectionalLightData { direction: -Vec3::Z, color: [1.; 3], intensity: 1., cast_shadows: true, shadow_strength: 1., shadow_bias: 0.001, shadow_normal_bias: 0.001, shadow_distance: 10. }); },
            2 => objects[32].material.base_color_texture = "binding-blue".into(),
            3 => objects[95].mesh_key = "instance-b".into(),
            4 => objects[16].material.surface_shader = Arc::from("fn mengine_surface_hook() {}"),
            5 => objects.rotate_left(7),
            6 => { for object in &mut objects { object.material.transparent = true; object.material.base_color[3] = 0.25; object.material.depth_write = false; } },
            7 => { for object in &mut objects { object.model = Mat4::from_scale_rotation_translation(Vec3::splat(0.5), glam::Quat::IDENTITY, Vec3::new(0., 0., 0.5)); } },
            8 => { for object in &mut objects { object.material.transparent = false; object.material.base_color[3] = 1.; object.material.depth_write = true; object.material.alpha_cutoff = 0.5; } renderer.upload_material_texture_rgba8("binding-red", 2, 2, &[255, 20, 10, 0, 20, 255, 10, 255, 10, 20, 255, 255, 255, 255, 20, 255], true).unwrap(); },
            9 => { let mut extra = binding_test_objects(128, false); for (index, object) in extra.iter_mut().enumerate() { object.material.base_color = [0.1, (index % 7) as f32 / 7., 1., 1.]; } objects.extend(extra); },
            10 => objects.truncate(192),
            _ => (),
        }
        let mut reference = None; let mut reference_calls = 0;
        for mode in 0..4 {
            renderer.disable_world_bundles = mode == 0; renderer.disable_world_instancing = mode == 0;
            renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
            let pixels = renderer.read_offscreen_rgba8(&target).unwrap(); let profile = renderer.submission_profile();
            if let Some(reference) = &reference { assert_eq!(&pixels, reference, "phase {phase}, mode {mode}"); assert!(profile.world_mesh_draw_calls <= reference_calls); }
            else { reference = Some(pixels); reference_calls = profile.world_mesh_draw_calls; }
            if phase == 0 && mode > 0 { assert_eq!(profile.world_mesh_draw_calls, 1); assert_eq!(profile.world_instanced_objects, 128); }
            if phase == 0 && mode == 1 { assert_eq!(profile.world_bundle_builds, 1); assert_eq!(profile.world_bundle_hits, 0); }
            if phase == 1 && mode > 0 { assert_eq!(renderer.spatial_stats.camera_visible, 127); assert_eq!(renderer.spatial_stats.submitted, 128); assert_eq!(profile.world_mesh_draw_calls, 2); assert_eq!(profile.world_instanced_objects, 127); }
            if phase == 10 && mode == 1 { assert_eq!(profile.world_bundle_hits, 0, "a shorter range must not reuse the previous instance count"); }
        }
    }
    renderer.ensure_object_capacity(8196);
    let cube = &renderer.meshes["cube"]; let pipeline = renderer.material_pipelines.values().next().unwrap(); let textures = renderer.material_texture_sets.values().next().unwrap();
    let mut cache = WorldBundleCache::default();
    for object_index in 0..5 {
        for _ in 0..2 {
            cache.prepare(&renderer.device, renderer.sample_count, WorldBindings { globals: &renderer.bind_group, shadows: &renderer.shadow_sample_bind_group, environment: &renderer.fallback_environment_bind_group, indexed_objects: true, object_stride: renderer.object_stride }, &[WorldDraw { pipeline, textures, vertices: &cube.vertex_buffer, indices: &cube.index_buffer, count: cube.index_count, object_index, instances: 8192 }]);
        }
    }
    assert_eq!(cache.counts(), (4, 32768), "cache budget counts logical instances after command compaction");
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("ADJACENT_INSTANCING phases=11 frames=44 fullPixelsEqual=true firstAdmissionDraws=1 sourceObjects=128 sparseSlotsDraws=2 budgetInstances=32768");
}

#[test]
#[ignore = "manual draw submission profile with authored source-group distribution and proxy geometry"]
fn benchmark_adjacent_instancing() {
    let groups: Vec<usize> = std::env::var_os("MENGINE_DRAW_GROUPS").map(|path| std::fs::read_to_string(path).unwrap().lines().map(|line| line.parse().unwrap()).collect()).unwrap_or_else(|| (0..4096).map(|index| index / 32 % 8).collect());
    let expected_groups = groups.iter().enumerate().filter(|(index, group)| *index == 0 || groups[*index - 1] != **group).count();
    let mut renderers = [setup(), setup()];
    for renderer in &mut renderers { for group in groups.iter().copied().collect::<HashSet<_>>() { renderer.meshes.insert(format!("group-{group}"), MeshGpu::unit_cube(&renderer.device)); } }
    let mut objects = binding_test_objects(groups.len(), false);
    for (index, (object, group)) in objects.iter_mut().zip(&groups).enumerate() { object.mesh_key = format!("group-{group}"); object.material.base_color = [(index % 5) as f32 / 5., (index % 7) as f32 / 7., 0.8, 1.]; }
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false; lighting.directional = None;
    let targets = renderers.each_ref().map(|renderer| renderer.create_offscreen_target(PhysicalSize::new(128, 128))); let mut samples = [Vec::new(), Vec::new()]; let mut reference = None;
    for round in 0..12 {
        for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
            let renderer = &mut renderers[mode]; let target = &targets[mode]; renderer.disable_world_instancing = mode == 0; let mut times = [0.; 3];
            for _ in 0..4 {
                let started = std::time::Instant::now();
                renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(target)).unwrap();
                let submitted = started.elapsed().as_secs_f64() * 1000.; let pixels = renderer.read_offscreen_rgba8(target).unwrap(); let profile = renderer.submission_profile();
                times[0] += profile.world_encode_ms; times[1] += submitted; times[2] += started.elapsed().as_secs_f64() * 1000.;
                if round >= 2 { assert!(profile.world_bundle_reused_draws >= profile.world_mesh_draw_calls.saturating_sub(63), "each independent renderer remains warm across alternating samples"); }
                assert_eq!(profile.world_mesh_draw_calls, if mode == 0 { groups.len() } else { expected_groups });
                if let Some(reference) = &reference { assert_eq!(&pixels, reference); } else { assert!(pixels.chunks_exact(4).any(|pixel| pixel[..3] != [0, 0, 0])); reference = Some(pixels); }
            }
            if round >= 2 { samples[mode].push(times.map(|time| time / 4.)); }
        }
    }
    println!("ADJACENT_INSTANCING_PROFILE objects={} groups={} columns=worldEncodeCpuMs,submitCpuMs,submitPlusReadbackMs samples={samples:?} rounds=12 warmupRounds=2 framesPerSample=4 scope=source-group-distribution-with-proxy-cube-geometry-and-colors-full-128x128-readback-equality-no-IPC-or-map-FPS", groups.len(), expected_groups);
    for renderer in &renderers { assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none()); }
}
