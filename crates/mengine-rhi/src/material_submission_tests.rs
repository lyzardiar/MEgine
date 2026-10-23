// Author: MiYu. Validate material preparation across passes and measure actual submission CPU work.
use super::*;

fn binding_test_objects(count: usize, mixed: bool) -> Vec<RenderObject> {
    let side = (count as f32).sqrt().ceil() as usize;
    (0..count).map(|index| {
        let step = 1.8 / side as f32;
        let mut material = RenderMaterial { base_color_texture: "binding-red".into(), double_sided: true, roughness: 0.8, ..Default::default() };
        if mixed {
            match index % 8 {
                2 => { material.base_color_texture = "binding-blue".into(); material.wrap_u = MaterialWrap::Clamp; }
                3 => { material.transparent = true; material.base_color[3] = 0.5; material.depth_write = false; }
                4 => { material.transparent = true; material.blend_mode = MaterialBlendMode::Additive; material.depth_write = false; }
                5 => { material.base_color_texture = "missing-binding-texture".into(); }
                6 => { material.surface_shader = Arc::from("fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return vec4<f32>(color.rgb * vec3<f32>(0.5, 1.0, 0.5), color.a); }"); }
                7 => { material.alpha_cutoff = 0.5; }
                _ => {}
            }
        }
        RenderObject { mesh_key: if mixed && index % 3 == 2 { "alternate-cube" } else { "cube" }.into(), model: Mat4::from_scale_rotation_translation(Vec3::splat(step * 0.45), glam::Quat::IDENTITY, Vec3::new(-0.9 + (index % side) as f32 * step, -0.9 + (index / side) as f32 * step, 0.5)), material, cast_shadows: true, receive_shadows: true }
    }).collect()
}

#[test]
fn reused_draw_bindings_match_repeated_bindings_across_passes_and_resource_changes() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    renderer.meshes.insert("alternate-cube".into(), MeshGpu::unit_cube(&renderer.device));
    renderer.upload_material_texture_rgba8("binding-red", 1, 1, &[255, 20, 10, 255], true).unwrap();
    renderer.upload_material_texture_rgba8("binding-blue", 1, 1, &[10, 20, 255, 255], true).unwrap();
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    lighting.directional = Some(DirectionalLightData { direction: -Vec3::Z, color: [1.0; 3], intensity: 1.0, cast_shadows: true, shadow_strength: 1.0, shadow_bias: 0.001, shadow_normal_bias: 0.001, shadow_distance: 10.0 });
    let target = renderer.create_offscreen_target(PhysicalSize::new(128, 128));
    let mut objects = binding_test_objects(64, true);
    // Culled/missing meshes must not disturb the state remembered for the next actual draw.
    let mut culled = objects[0].clone(); culled.model = Mat4::from_translation(Vec3::splat(100.0)); objects.insert(1, culled);
    let mut missing = objects[0].clone(); missing.mesh_key = "missing-mesh".into(); objects.insert(3, missing);
    let render = |renderer: &mut Renderer, objects: &[RenderObject], repeat: bool| {
        renderer.repeat_draw_bindings = repeat;
        renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, camera, objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
        renderer.read_offscreen_rgba8(&target).unwrap()
    };
    let first = render(&mut renderer, &objects, true);
    assert_eq!(render(&mut renderer, &objects, false), first);
    assert!(first.chunks_exact(4).any(|pixel| pixel[..3] != [0, 0, 0]), "comparison must include visible geometry");
    renderer.upload_material_texture_rgba8("binding-red", 1, 1, &[20, 255, 10, 255], true).unwrap();
    renderer.meshes.insert("alternate-cube".into(), MeshGpu::unit_cube(&renderer.device));
    let changed = render(&mut renderer, &objects, false); assert_ne!(changed, first);
    assert_eq!(render(&mut renderer, &objects, true), changed);
    objects.reverse(); assert_eq!(render(&mut renderer, &objects, true), render(&mut renderer, &objects, false));
    assert_eq!(render(&mut renderer, &[], true), render(&mut renderer, &[], false));
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}

#[test]
#[ignore = "manual alternating draw binding GPU submission benchmark"]
fn benchmark_reused_draw_bindings() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    renderer.meshes.insert("alternate-cube".into(), MeshGpu::unit_cube(&renderer.device));
    renderer.upload_material_texture_rgba8("binding-red", 1, 1, &[220, 180, 100, 255], true).unwrap();
    renderer.upload_material_texture_rgba8("binding-blue", 1, 1, &[10, 20, 255, 255], true).unwrap();
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false;
    lighting.directional = Some(DirectionalLightData { direction: -Vec3::Z, color: [1.0; 3], intensity: 1.0, cast_shadows: true, shadow_strength: 1.0, shadow_bias: 0.001, shadow_normal_bias: 0.001, shadow_distance: 10.0 });
    let target = renderer.create_offscreen_target(PhysicalSize::new(128, 128));
    let mixed = std::env::var_os("MENGINE_DRAW_BINDING_MIXED").is_some();
    let counts: &[usize] = if mixed { &[4096] } else { &[64, 1024, 4096] };
    for &count in counts {
        let objects = binding_test_objects(count, mixed);
        let frame = RenderFrame { clear: ClearColor { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] };
        let mut samples = [Vec::new(), Vec::new()]; let mut reference = None;
        for round in 0..11 {
            for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
                renderer.repeat_draw_bindings = mode == 0; let mut times = [0.0; 2];
                for _ in 0..4 {
                    renderer.submit_frame_to(&frame, RenderTarget::Offscreen(&target)).unwrap();
                    let profile = renderer.submission_profile(); times[0] += profile.shadow_encode_ms; times[1] += profile.world_encode_ms;
                    let pixels = renderer.read_offscreen_rgba8(&target).unwrap();
                    if let Some(reference) = &reference { assert_eq!(&pixels, reference); } else { reference = Some(pixels); }
                }
                if round >= 2 { samples[mode].push(times.map(|ms| ms / 4.0)); }
            }
        }
        let medians = samples.map(|values| std::array::from_fn::<_, 2, _>(|stage| { let mut times: Vec<_> = values.iter().map(|sample| sample[stage]).collect(); times.sort_by(f64::total_cmp); times[4] }));
        println!("DRAW_BINDINGS count={count} mixed={mixed} repeated_shadow_ms={:.6} reused_shadow_ms={:.6} repeated_world_ms={:.6} reused_world_ms={:.6}", medians[0][0], medians[1][0], medians[0][1], medians[1][1]);
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}

#[test]
fn prepared_materials_refresh_textures_shader_errors_and_pass_state() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let mut material = RenderMaterial { base_color: [1.0; 4], base_color_texture: " Assets/Color.png ".into(), metallic_roughness_texture: " Assets/Data.png ".into(), unlit: true, double_sided: true, ..Default::default() };
    let missing = renderer.prepare_object_material(&material);
    assert!(missing.use_error_pipeline);
    assert_eq!(missing.textures.base_color, "Assets/Color.png");
    assert_eq!(missing.textures.occlusion, "Assets/Data.png");
    renderer.upload_material_texture_rgba8("Assets/Color.png", 1, 1, &[255, 0, 0, 255], false).unwrap();
    renderer.upload_material_texture_rgba8("Assets/Data.png", 1, 1, &[255; 4], false).unwrap();
    assert!(renderer.prepare_object_material(&material).use_error_pipeline, "wrong color space must not satisfy a color texture");
    renderer.upload_material_texture_rgba8("Assets/Color.png", 1, 1, &[255, 0, 0, 255], true).unwrap();
    let valid = renderer.prepare_object_material(&material);
    assert!(!valid.use_error_pipeline);
    assert_eq!(valid.textures, missing.textures);
    assert_eq!(valid.pipeline, missing.pipeline);

    let target = renderer.create_offscreen_target(PhysicalSize::new(32, 32));
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    let render = |renderer: &mut Renderer, material: &RenderMaterial| {
        // The visible object is slot 1 in the input but slot 0 after culling.
        let objects = [
            RenderObject { mesh_key: "cube".into(), model: Mat4::from_translation(Vec3::splat(100.0)), material: RenderMaterial::error(), cast_shadows: false, receive_shadows: false },
            RenderObject { mesh_key: "cube".into(), model: Mat4::from_scale_rotation_translation(Vec3::splat(0.8), glam::Quat::IDENTITY, Vec3::new(0.0, 0.0, 0.5)), material: material.clone(), cast_shadows: false, receive_shadows: false },
        ];
        renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
        assert_eq!(renderer.spatial_stats.submitted, 1);
        renderer.read_offscreen_rgba8(&target).unwrap()
    };
    let red = render(&mut renderer, &material);
    let center = (16 * 32 + 16) * 4;
    assert_eq!(&red[center..center + 3], &[255, 0, 0]);
    renderer.upload_material_texture_rgba8("Assets/Color.png", 1, 1, &[0, 0, 255, 255], true).unwrap();
    let blue = render(&mut renderer, &material);
    assert_eq!(&blue[center..center + 3], &[0, 0, 255]);
    renderer.remove_material_texture("Assets/Color.png");
    assert!(renderer.prepare_object_material(&material).use_error_pipeline);
    let missing_pixels = render(&mut renderer, &material);
    let mut explicit_error = material.clone(); explicit_error.is_error = true;
    assert_eq!(missing_pixels, render(&mut renderer, &explicit_error));
    renderer.upload_material_texture_rgba8("Assets/Color.png", 1, 1, &[255, 0, 0, 255], true).unwrap();
    assert_eq!(red, render(&mut renderer, &material));

    material.surface_shader = Arc::from("fn mengine_surface_hook() {}");
    assert!(renderer.prepare_object_material(&material).use_error_pipeline);
    assert_eq!(missing_pixels, render(&mut renderer, &material));
    material.surface_shader = Arc::from("fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return color; }");
    assert!(!renderer.prepare_object_material(&material).use_error_pipeline);
    assert_eq!(red, render(&mut renderer, &material));
    material.transparent = true; material.blend_mode = MaterialBlendMode::Additive; material.depth_write = false; material.depth_equal = true; material.double_sided = false;
    material.wrap_u = MaterialWrap::Clamp; material.anisotropy = 0;
    let changed = renderer.prepare_object_material(&material);
    assert_ne!(changed.pipeline, valid.pipeline); assert_ne!(changed.textures, valid.textures);
    assert_eq!(changed.pipeline.blend, MaterialPipelineBlend::Additive); assert!(changed.pipeline.depth_equal); assert!(!changed.pipeline.depth_write); assert!(!changed.pipeline.double_sided);
    assert_eq!(changed.textures.sampler.anisotropy, 1);
    material.custom_textures[0] = " Assets/Custom.png ".into(); material.custom_texture_srgb[0] = false;
    assert!(renderer.prepare_object_material(&material).use_error_pipeline);
    renderer.upload_material_texture_rgba8("Assets/Custom.png", 1, 1, &[255; 4], false).unwrap();
    assert!(!renderer.prepare_object_material(&material).use_error_pipeline);
    material.custom_texture_srgb[0] = true;
    assert!(renderer.prepare_object_material(&material).use_error_pipeline);
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}

#[test]
#[ignore = "manual material submission GPU benchmark; serialize with other GPU tests"]
fn benchmark_material_submission() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(256, 256))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    renderer.upload_material_texture_rgba8("Assets/Textures/Shared.png", 1, 1, &[220, 180, 100, 255], true).unwrap();
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default();
    lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    lighting.directional = Some(DirectionalLightData { direction: -Vec3::Z, color: [1.0; 3], intensity: 1.0, cast_shadows: true, shadow_strength: 1.0, shadow_bias: 0.001, shadow_normal_bias: 0.001, shadow_distance: 10.0 });
    let target = renderer.create_offscreen_target(PhysicalSize::new(256, 256));
    let label = std::env::var("MENGINE_PERFORMANCE_LABEL").unwrap_or_else(|_| "manual".into());
    assert!(label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    let output = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp/docs-artifacts/editor-performance-risk");
    std::fs::create_dir_all(&output).unwrap();
    for count in [64, 1024] {
        let objects: Vec<_> = (0..count).map(|index| {
            let side = (count as f32).sqrt() as usize;
            let step = 1.8 / side as f32;
            RenderObject { mesh_key: "cube".into(), model: Mat4::from_scale_rotation_translation(Vec3::splat(step * 0.4), glam::Quat::IDENTITY, Vec3::new(-0.9 + (index % side) as f32 * step, -0.9 + (index / side) as f32 * step, 0.5)), material: RenderMaterial { base_color_texture: "Assets/Textures/Shared.png".into(), unlit: true, double_sided: true, transparent: index % 4 == 0, base_color: [1.0, 1.0, 1.0, if index % 4 == 0 { 0.5 } else { 1.0 }], ..Default::default() }, cast_shadows: true, receive_shadows: true }
        }).collect();
        let frame = RenderFrame { clear: ClearColor { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] };
        let mut samples = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
        let mut reference = None;
        for group in 0..11 {
            let mut times = [0.0; 4];
            for _ in 0..20 {
                let started = Instant::now();
                renderer.submit_frame_to(&frame, RenderTarget::Offscreen(&target)).unwrap();
                times[3] += started.elapsed().as_secs_f64() * 1000.0;
                let profile = renderer.submission_profile();
                times[0] += profile.material_prepare_ms; times[1] += profile.shadow_encode_ms; times[2] += profile.world_encode_ms;
                let pixels = renderer.read_offscreen_rgba8(&target).unwrap();
                if let Some(reference) = &reference { assert_eq!(&pixels, reference); } else { reference = Some(pixels); }
            }
            if group > 1 { for index in 0..4 { samples[index].push(times[index] / 20.0); } }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        std::fs::write(output.join(format!("{label}-submission-{count}.rgba")), reference.unwrap()).unwrap();
        println!("MATERIAL_SUBMISSION count={count} camera={} shadow={} preparation_ms={:.6} shadow_ms={:.6} world_ms={:.6} submission_ms={:.6}", renderer.spatial_stats.camera_visible, renderer.spatial_stats.shadow_visible, samples[0][4], samples[1][4], samples[2][4], samples[3][4]);
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}
