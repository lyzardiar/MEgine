// Author: MiYu. Compare frame-owned GPU material bindings with repeated draw-time lookups and resource replacement.
use super::*;
use super::material_submission_tests::binding_test_objects;

fn setup() -> Renderer {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    renderer.meshes.insert("alternate-cube".into(), MeshGpu::unit_cube(&renderer.device)); renderer
}

#[test]
fn prepared_gpu_material_bindings_preserve_pixels_sources_and_resource_lifetimes() {
    let mut renderer = setup(); let mut target = renderer.create_offscreen_target(PhysicalSize::new(128, 128));
    let mut objects = binding_test_objects(512, true); let palette: Vec<_> = objects[..16].iter().map(|object| object.material.clone()).collect();
    for (index, object) in objects.iter_mut().enumerate() { object.material = palette[index % 16].clone(); }
    let mut camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    lighting.directional = Some(DirectionalLightData { direction: -Vec3::Z, color: [1.; 3], intensity: 1., cast_shadows: true, shadow_strength: 1., shadow_bias: 0.001, shadow_normal_bias: 0.001, shadow_distance: 10. });
    for phase in 0..12 {
        match phase {
            1 => { for (key, color) in [("binding-red", [255, 30, 20, 255]), ("binding-blue", [20, 30, 255, 255]), ("missing-binding-texture", [30, 255, 20, 255])] { renderer.upload_material_texture_rgba8(key, 1, 1, &color, true).unwrap(); } },
            2 => { objects[0].material.base_color = [0., 1., 0., 1.]; objects[3].model.w_axis.z = 0.3; },
            3 => { renderer.upload_material_texture_rgba8("binding-red", 2, 2, &[255, 20, 10, 0, 20, 255, 10, 255, 10, 20, 255, 255, 255, 255, 20, 255], true).unwrap(); },
            4 => { renderer.remove_material_texture("binding-blue"); objects[6].material.surface_shader = Arc::from("fn mengine_surface_hook() {}"); },
            5 => { renderer.upload_material_texture_rgba8("binding-blue", 1, 1, &[10, 255, 30, 255], true).unwrap(); objects[6].material.surface_shader = Arc::from("fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { return vec4<f32>(color.bgr, color.a); }"); },
            6 => { camera.position = -Vec3::Z; objects.reverse(); target = renderer.create_offscreen_target(PhysicalSize::new(160, 96)); },
            7 => { renderer.upload_environment_texture_rgba8("bindings-env", 1, 1, &[10, 30, 255, 255]).unwrap(); lighting.environment.texture = "bindings-env".into(); },
            8 => { objects.extend(objects.clone()); },
            9 => { objects.truncate(128); lighting.directional = None; },
            10 => {
                use crate::particle_render::{ParticleGeometry, ParticleRenderData, ParticleVertex, PARTICLE_PARAMETER_COUNT};
                let mut parameters = [[0.; 4]; PARTICLE_PARAMETER_COUNT]; parameters[3][0] = 1.; parameters[57][0] = 1.;
                for slot in 116..121 { parameters[slot] = [1., 1., 0., 0.]; }
                parameters[121] = [1.; 4]; parameters[124] = [1.; 4]; parameters[125] = [1., 1., 1., 0.];
                let particle = ParticleRenderData { geometry: Arc::new(ParticleGeometry { vertices: [[-0.2, -0.2, 0.3], [0.2, -0.2, 0.3], [0., 0.2, 0.3]].map(|position| ParticleVertex { position, uv: [0.; 2], color: [1.; 4] }).to_vec(), indices: vec![0, 1, 2] }), color: [1., 0., 0., 0.5], custom1: [0.; 4], custom2: [0.; 4], uv_transform: [1., 1., 0., 0.], parameters: Arc::new(parameters), seconds: 0., features: 0, sorting_position: [0., 0., 10.], sorting_fudge: 0., source_blend: 5, destination_blend: 10, depth_compare: 2, cull: 0, depth_write: false };
                objects[64].material.particle = Some(Arc::new(particle)); objects[64].material.transparent = true;
            },
            11 => objects.clear(),
            _ => (),
        }
        let mut reference = None;
        for mode in 0..4 {
            renderer.repeat_material_binding_lookups = mode % 2 == 0; renderer.disable_world_bundles = mode < 2;
            renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
            let pixels = renderer.read_offscreen_rgba8(&target).unwrap(); let profile = renderer.submission_profile();
            if let Some(reference) = &reference { assert_eq!(&pixels, reference, "phase {phase}, mode {mode}"); } else { reference = Some(pixels); }
            if mode % 2 == 1 { assert_eq!(profile.material_binding_resolutions, profile.material_preparations); }
            else if !objects.is_empty() { assert!(profile.material_binding_resolutions > profile.material_preparations); }
            if phase == 0 && mode % 2 == 1 { assert_eq!(profile.material_binding_resolutions, 16); }
            if phase == 11 { assert_eq!(profile.material_binding_resolutions, 0); }
        }
    }
    let prepared = renderer.prepare_object_material(&RenderMaterial::default()); let no_pipelines = HashMap::new();
    let partial = resolve_material_draw_bindings(&prepared, &no_pipelines, &no_pipelines, &renderer.material_texture_sets);
    assert!(partial.pipeline.is_none(), "shadow and particle sources require only their prepared textures");
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("MATERIAL_DRAW_BINDINGS phases=12 frames=48 completePixelsEqual=true cachedResolutionsEqualSources=true");
}

#[test]
#[ignore = "manual shared-source GPU material binding resolution comparison"]
fn benchmark_material_draw_bindings() {
    let mut renderers = [setup(), setup()];
    for renderer in &mut renderers { for (key, color) in [("binding-red", [255, 30, 20, 255]), ("binding-blue", [20, 30, 255, 255]), ("missing-binding-texture", [30, 255, 20, 255])] { renderer.upload_material_texture_rgba8(key, 1, 1, &color, true).unwrap(); } }
    let mut objects = binding_test_objects(4096, true); let palette: Vec<_> = objects[..128].iter().map(|object| object.material.clone()).collect();
    for (index, object) in objects.iter_mut().enumerate() { object.material = palette[index % 128].clone(); }
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false; lighting.directional = None;
    let targets = renderers.each_ref().map(|renderer| renderer.create_offscreen_target(PhysicalSize::new(128, 128))); let mut samples = [Vec::new(), Vec::new()]; let mut reference = None;
    for round in 0..12 {
        for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
            let renderer = &mut renderers[mode]; let target = &targets[mode]; renderer.repeat_material_binding_lookups = mode == 0; let mut times = [0.; 4];
            for _ in 0..4 {
                let started = Instant::now();
                renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(target)).unwrap();
                let submitted = started.elapsed().as_secs_f64() * 1000.; let pixels = renderer.read_offscreen_rgba8(target).unwrap(); let profile = renderer.submission_profile();
                times[0] += profile.material_prepare_ms; times[1] += profile.world_encode_ms; times[2] += submitted; times[3] += started.elapsed().as_secs_f64() * 1000.;
                assert_eq!(profile.material_preparations, 128); assert_eq!(profile.material_binding_resolutions, if mode == 0 { 4096 } else { 128 });
                if round >= 2 { assert_eq!(profile.world_bundle_hits, 1); }
                if let Some(reference) = &reference { assert_eq!(&pixels, reference); } else { reference = Some(pixels); }
            }
            if round >= 2 { samples[mode].push(times.map(|time| time / 4.)); }
        }
    }
    println!("MATERIAL_DRAW_BINDINGS_PROFILE columns=materialPrepareCpuMs,worldEncodeCpuMs,submitCpuMs,submitPlusReadbackMs samples={samples:?} rounds=12 warmupRounds=2 framesPerSample=4 scope=4096-draws-128-sources-independent-warm-renderers-full-128x128-pixel-equality-no-IPC-or-map-FPS");
    for renderer in &renderers { assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none()); }
}
