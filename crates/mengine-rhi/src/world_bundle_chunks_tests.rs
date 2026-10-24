// Author: MiYu. Local resource churn must preserve static draw ranges and exact GPU output.
use super::*;
use super::material_submission_tests::binding_test_objects;

fn submit(renderer: &mut Renderer, target: &OffscreenRenderTarget, objects: &[RenderObject], camera: FrameCamera, lighting: &FrameLighting, disabled: bool) -> Vec<u8> {
    renderer.disable_world_bundles = disabled;
    renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects, lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(target)).unwrap();
    renderer.read_offscreen_rgba8(target).unwrap()
}

#[test]
fn sparse_mesh_replacements_reuse_other_world_chunks_with_exact_pixels() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    for key in ["alternate-cube", "dynamic-cube"] { renderer.meshes.insert(key.into(), MeshGpu::unit_cube(&renderer.device)); }
    renderer.upload_material_texture_rgba8("binding-red", 1, 1, &[255, 20, 10, 255], true).unwrap();
    let mut objects = binding_test_objects(1024, false);
    for (index, object) in objects.iter_mut().enumerate() { object.mesh_key = if index % 2 == 0 { "cube" } else { "alternate-cube" }.into(); }
    objects[370].mesh_key = "dynamic-cube".into();
    let mut camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false; lighting.directional = None;
    let target = renderer.create_offscreen_target(PhysicalSize::new(128, 128));
    let first = submit(&mut renderer, &target, &objects, camera, &lighting, true);
    assert!(first.chunks_exact(4).any(|pixel| pixel[..3] != [0, 0, 0]));
    for (builds, hits, covered, reused) in [(0, 0, 0, 0), (4, 0, 1024, 0), (0, 4, 1024, 1024)] {
        assert_eq!(submit(&mut renderer, &target, &objects, camera, &lighting, false), first);
        let p = renderer.submission_profile(); assert_eq!((p.world_bundle_builds, p.world_bundle_hits, p.world_bundle_draws, p.world_bundle_reused_draws), (builds, hits, covered, reused)); assert_eq!(p.world_mesh_draw_calls, 1024);
    }
    for phase in 0..6 {
        let mut mesh = MeshGpu::unit_cube(&renderer.device); if phase % 2 == 0 { mesh.index_count = 3; }
        renderer.meshes.insert("dynamic-cube".into(), mesh);
        let expected = submit(&mut renderer, &target, &objects, camera, &lighting, true);
        for (builds, hits, covered, reused) in [(0, 3, 768, 768), (1, 3, 1024, 768), (0, 4, 1024, 1024)] {
            assert_eq!(submit(&mut renderer, &target, &objects, camera, &lighting, false), expected, "replacement {phase}");
            let p = renderer.submission_profile(); assert_eq!((p.world_bundle_builds, p.world_bundle_hits, p.world_bundle_draws, p.world_bundle_reused_draws), (builds, hits, covered, reused));
        }
    }
    // Camera and per-object data keep their current slots while every bundle remains reusable.
    objects[371].model.w_axis.x += 0.01; objects[372].material.base_color = [0., 1., 0., 1.]; camera.view = Mat4::from_translation(Vec3::new(0.01, 0.02, 0.));
    let expected = submit(&mut renderer, &target, &objects, camera, &lighting, true);
    assert_ne!(expected, first); assert_eq!(submit(&mut renderer, &target, &objects, camera, &lighting, false), expected); assert_eq!(renderer.submission_profile().world_bundle_reused_draws, 1024);
    // Whole-list mode is the previous cache granularity used as a second executable reference.
    renderer.disable_world_bundle_chunks = true;
    for _ in 0..3 { assert_eq!(submit(&mut renderer, &target, &objects, camera, &lighting, false), expected); }
    assert_eq!(renderer.submission_profile().world_bundle_hits, 1); assert_eq!(renderer.submission_profile().world_bundle_reused_draws, 1024);
    renderer.meshes.insert("dynamic-cube".into(), MeshGpu::unit_cube(&renderer.device));
    let expected = submit(&mut renderer, &target, &objects, camera, &lighting, true);
    assert_eq!(submit(&mut renderer, &target, &objects, camera, &lighting, false), expected); assert_eq!(renderer.submission_profile().world_bundle_reused_draws, 0);
    renderer.disable_world_bundle_chunks = false;
    objects = binding_test_objects(1024, true);
    for index in [3, 515, 771] { objects[index].model.w_axis = Vec4::new(0., 0., 0.3 + index as f32 * 0.0005, 1.); objects[index].material.base_color = [index as f32 / 1024., 0.1, 0.5, 0.5]; }
    let mut target = target;
    for phase in 0..8 {
        match phase {
            1 => { renderer.upload_material_texture_rgba8("binding-red", 2, 1, &[255, 0, 10, 0, 0, 255, 10, 255], true).unwrap(); },
            2 => { objects[3].model.w_axis.z = 0.9; camera.position = -Vec3::Z; objects.reverse(); },
            3 => { objects[0].material.surface_shader = Arc::from("fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return vec4<f32>(color.bgr, color.a); }"); let mut mesh = MeshGpu::unit_cube(&renderer.device); mesh.index_count = 3; renderer.meshes.insert("alternate-cube".into(), mesh); },
            4 => { objects.extend(objects.clone()); },
            5 => { objects.truncate(700); target = renderer.create_offscreen_target(PhysicalSize::new(160, 96)); },
            6 => { renderer.upload_environment_texture_rgba8("chunks-env", 1, 1, &[20, 30, 255, 255]).unwrap(); lighting.environment.texture = "chunks-env".into(); },
            7 => { renderer.remove_environment_texture("chunks-env"); renderer.remove_material_texture("binding-red"); objects.truncate(63); },
            _ => {}
        }
        let expected = submit(&mut renderer, &target, &objects, camera, &lighting, true);
        for _ in 0..3 { assert_eq!(submit(&mut renderer, &target, &objects, camera, &lighting, false), expected, "mixed phase {phase}"); }
        let p = renderer.submission_profile(); assert!(p.world_bundle_reused_draws >= p.world_mesh_draw_calls.saturating_sub(63));
        if phase == 7 { assert_eq!(p.world_bundle_reused_draws, 0); }
        let counts = renderer.world_bundles.counts(); assert!(counts.0 <= 64 && counts.1 <= 32768);
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("WORLD_CHUNKS fullPixelsEqual=true sparseReplacements=6 mixedResourcePhases=8 staticReusedDraws=768 totalDraws=1024 wholeListReusedAfterReplacement=0");
}

#[test]
fn adaptive_world_chunks_bound_cache_and_preserve_other_ranges_at_budget_pressure() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let lighting = FrameLighting::default(); let target = renderer.create_offscreen_target(PhysicalSize::new(32, 32));
    submit(&mut renderer, &target, &binding_test_objects(1, false), camera, &lighting, true);
    renderer.ensure_object_capacity(32768);
    let cube = &renderer.meshes["cube"]; let alternate = MeshGpu::unit_cube(&renderer.device);
    let pipeline = renderer.material_pipelines.values().next().unwrap(); let textures = renderer.material_texture_sets.values().next().unwrap();
    let bindings = WorldBindings { globals: &renderer.bind_group, shadows: &renderer.shadow_sample_bind_group, environment: &renderer.fallback_environment_bind_group, indexed_objects: renderer.indexed_objects, object_stride: renderer.object_stride };
    for count in [17000usize, 32768] {
        let mut cache = WorldBundleCache::default();
        let mut draws: Vec<_> = (0..count).map(|index| WorldDraw { pipeline, textures, vertices: &cube.vertex_buffer, indices: &cube.index_buffer, count: cube.index_count, object_index: index as u32, instances: 1 }).collect();
        let chunk_size = 256.max(count.div_ceil(64)); let expected_chunks = count.div_ceil(chunk_size);
        for pass in 0..3 {
            let chunks = cache.prepare_chunks(&renderer.device, renderer.sample_count, bindings, &draws, 256);
            assert_eq!(chunks.len(), expected_chunks); assert_eq!(chunks.iter().map(|chunk| chunk.range.len()).sum::<usize>(), count);
            assert_eq!(chunks.iter().filter(|chunk| chunk.bundle.is_some()).count(), if pass == 0 { 0 } else { expected_chunks });
            assert_eq!(chunks.iter().filter(|chunk| chunk.reused).count(), if pass < 2 { 0 } else { expected_chunks });
            let counts = cache.counts(); assert!(counts.0 <= 64 && counts.1 <= 32768);
        }
        draws[1200].vertices = &alternate.vertex_buffer;
        let chunks = cache.prepare_chunks(&renderer.device, renderer.sample_count, bindings, &draws, 256);
        assert_eq!(chunks.iter().filter(|chunk| chunk.reused).map(|chunk| chunk.range.len()).sum::<usize>(), count - chunk_size);
        assert!(chunks[1200 / chunk_size].bundle.is_none()); let counts = cache.counts(); assert!(counts.0 <= 64 && counts.1 <= 32768);
        let chunks = cache.prepare_chunks(&renderer.device, renderer.sample_count, bindings, &draws, 256);
        assert_eq!(chunks.iter().filter(|chunk| chunk.bundle.is_some()).map(|chunk| chunk.range.len()).sum::<usize>(), count);
        for _ in 0..9 { assert!(cache.prepare_chunks(&renderer.device, renderer.sample_count, bindings, &[], 0).is_empty()); }
        assert_eq!(cache.counts(), (0, 0));
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("WORLD_CHUNKS_BUDGET adaptiveCounts=17000,32768 maxEntries=64 logicalObjectBudget=32768 idlePasses=9");
}

#[test]
#[ignore = "manual alternating sparse-resource world encoding CPU profile"]
fn benchmark_sparse_resource_world_chunks() {
    let mut renderers: Vec<_> = (0..2).map(|mode| {
        let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128))).unwrap(); renderer.disable_world_bundle_chunks = mode == 0;
        renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
        for key in ["alternate-cube", "dynamic-cube"] { renderer.meshes.insert(key.into(), MeshGpu::unit_cube(&renderer.device)); }
        renderer
    }).collect();
    let targets: Vec<_> = renderers.iter().map(|renderer| renderer.create_offscreen_target(PhysicalSize::new(128, 128))).collect();
    let mut objects = binding_test_objects(4096, false);
    for (index, object) in objects.iter_mut().enumerate() { object.mesh_key = if index % 2 == 0 { "cube" } else { "alternate-cube" }.into(); } objects[1240].mesh_key = "dynamic-cube".into();
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false; lighting.directional = None;
    let mut reference = None;
    for mode in 0..2 {
        for _ in 0..3 {
            let pixels = submit(&mut renderers[mode], &targets[mode], &objects, camera, &lighting, false);
            if let Some(reference) = &reference { assert_eq!(&pixels, reference); } else { reference = Some(pixels); }
        }
    }
    for sparse in [false, true] {
        let mut samples = [Vec::new(), Vec::new()];
        for round in 0..12 {
            for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
                let renderer = &mut renderers[mode]; let mut elapsed = 0.;
                for _ in 0..4 {
                    if sparse { let replacement = MeshGpu::unit_cube(&renderer.device); renderer.meshes.insert("dynamic-cube".into(), replacement); }
                    assert_eq!(submit(renderer, &targets[mode], &objects, camera, &lighting, false), *reference.as_ref().unwrap());
                    let p = renderer.submission_profile(); elapsed += p.world_encode_ms;
                    assert_eq!(p.world_bundle_reused_draws, if !sparse { 4096 } else if mode == 0 { 0 } else { 3840 });
                }
                samples[mode].push(elapsed / 4.);
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        println!("WORLD_CHUNKS_CPU sparse={sparse} wholeListMs={:.6} chunkedMs={:.6} commands=4096 fullPixelsEqual=true rounds=12 framesPerSample=4", (samples[0][5] + samples[0][6]) * 0.5, (samples[1][5] + samples[1][6]) * 0.5);
    }
    for renderer in &renderers { assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none()); }
}
