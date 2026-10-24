// Author: MiYu. Read per-draw object data by instance index while retaining material hook names and flat fragment ownership.
use std::borrow::Cow;

#[derive(Clone, Copy)]
pub(super) enum Pass { Forward, Shadow }

pub(super) fn shader(source: &str, indexed: bool, pass: Pass) -> Cow<'_, str> {
    if !indexed { return Cow::Borrowed(source); }
    let mut source = source.replacen("@group(0) @binding(1) var<uniform> object: ObjectUniforms;", "@group(0) @binding(1) var<storage, read> mengine_objects: array<ObjectUniforms>;\nvar<private> object: ObjectUniforms;", 1);
    if matches!(pass, Pass::Shadow) {
        source = source.replacen("    @location(0) uv: vec2<f32>,", "    @location(0) uv: vec2<f32>,\n    @location(1) @interpolate(flat) object_index: u32,", 1);
        source = source.replacen("fn vs_shadow(v: VsIn)", "fn vs_shadow(v: VsIn, @builtin(instance_index) object_index: u32)", 1);
        source = source.replacen("    var output: ShadowOut;", "    var output: ShadowOut;\n    object = mengine_objects[object_index];\n    output.object_index = object_index;", 1);
        source = source.replacen("fn fs_shadow(input: ShadowOut) {", "fn fs_shadow(input: ShadowOut) {\n    object = mengine_objects[input.object_index];", 1);
    } else {
        source = source.replacen("    @location(2) @interpolate(perspective, centroid) uv: vec2<f32>,", "    @location(2) @interpolate(perspective, centroid) uv: vec2<f32>,\n    @location(3) @interpolate(flat) object_index: u32,", 1);
        source = source.replacen("fn vs_main(v: VsIn)", "fn vs_main(v: VsIn, @builtin(instance_index) object_index: u32)", 1);
        source = source.replacen("    var o: VsOut;", "    var o: VsOut;\n    object = mengine_objects[object_index];\n    o.object_index = object_index;", 1);
        source = source.replacen("fn fs_main(i: VsOut, @builtin(front_facing) front_facing: bool) -> @location(0) vec4<f32> {", "fn fs_main(i: VsOut, @builtin(front_facing) front_facing: bool) -> @location(0) vec4<f32> {\n    object = mengine_objects[i.object_index];", 1);
    }
    Cow::Owned(source)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::{FORWARD_WGSL, SHADOW_WGSL, compose_surface_shader, ObjectUniforms};
    use super::super::{material_submission_tests::binding_test_objects, *};

    fn renderer(uniform_reference: bool) -> Renderer {
        UNIFORM_OBJECT_REFERENCE.with(|flag| flag.set(uniform_reference));
        let renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128, 128)));
        UNIFORM_OBJECT_REFERENCE.with(|flag| flag.set(false)); let mut renderer = renderer.unwrap();
        assert_eq!(renderer.indexed_objects, !uniform_reference, "GPU comparison requires the full object-array binding range");
        renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
        renderer.meshes.insert("alternate-cube".into(), MeshGpu::unit_cube(&renderer.device));
        for (key, pixel) in [("binding-red", [255, 20, 10, 255]), ("binding-blue", [10, 20, 255, 255]), ("missing-binding-texture", [20, 255, 10, 255])] { renderer.upload_material_texture_rgba8(key, 1, 1, &pixel, true).unwrap(); }
        renderer
    }

    #[test]
    fn indexed_object_pixels_match_uniform_draws_through_changes_shadows_and_particles() {
        let mut renderers = [renderer(true), renderer(false)];
        let mut targets = renderers.each_ref().map(|renderer| renderer.create_offscreen_target(PhysicalSize::new(128, 128)));
        let mut objects = binding_test_objects(128, true);
        let mut camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
        let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
        lighting.directional = Some(DirectionalLightData { direction: -Vec3::Z, color: [1.; 3], intensity: 1., cast_shadows: true, shadow_strength: 1., shadow_bias: 0.001, shadow_normal_bias: 0.001, shadow_distance: 10. });
        let hook = "fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { if object.custom_parameters[0].x > 0.5 { return color * textureSample(base_color_texture, material_sampler, uv); } return color; }";
        objects[17].material.surface_shader = Arc::from(hook); objects[17].material.custom_parameters[0][0] = 1.;
        objects[19].material.surface_shader = Arc::from("fn mengine_surface_hook() {}");
        let mut visible_pixels = false;
        for phase in 0..12 {
            match phase {
                1 => { objects[0].model.w_axis.x = 100.; objects[5].model.w_axis.z = 0.7; objects[7].model = Mat4::from_scale_rotation_translation(Vec3::new(-0.15, 0.12, 0.2), glam::Quat::from_rotation_y(0.3), Vec3::new(0.1, 0.1, 0.6)); },
                2 => { objects[1].material.base_color = [0., 1., 0., 1.]; objects[17].material.custom_parameters[0][0] = 0.; objects[11].material.alpha_cutoff = 0.7; },
                3 => { camera.position = -Vec3::Z; camera.view = Mat4::from_translation(Vec3::new(0.1, 0., 0.)); },
                4 => objects.reverse(),
                5 => { for renderer in &mut renderers { renderer.upload_material_texture_rgba8("binding-red", 2, 2, &[255, 20, 10, 0, 20, 255, 10, 255, 10, 20, 255, 255, 255, 255, 20, 255], true).unwrap(); } },
                6 => { for renderer in &mut renderers { let vertices = [[-0.4, -0.4, 0.], [0.6, -0.4, 0.], [0.1, 0.6, 0.]].map(|position| Vertex { position, normal: [0., 0., 1.], uv: [0.; 2] }); renderer.upload_gltf_static("alternate-cube", &vertices, &[0, 1, 2]); } },
                7 => objects.extend(binding_test_objects(256, true)),
                8 => { camera.view = Mat4::from_translation(Vec3::splat(100.)); },
                9 => { camera.view = Mat4::IDENTITY; lighting.directional = None; },
                10 => { for (renderer, target) in renderers.iter_mut().zip(&mut targets) { *target = renderer.create_offscreen_target(PhysicalSize::new(160, 96)); renderer.upload_environment_texture_rgba8("indexed-env", 1, 1, &[10, 20, 255, 255]).unwrap(); } lighting.environment.texture = "indexed-env".into(); },
                11 => {
                    use crate::particle_render::{ParticleGeometry, ParticleRenderData, ParticleVertex, PARTICLE_PARAMETER_COUNT};
                    let mut parameters = [[0.; 4]; PARTICLE_PARAMETER_COUNT]; parameters[3][0] = 1.; parameters[57][0] = 1.;
                    for slot in 116..121 { parameters[slot] = [1., 1., 0., 0.]; }
                    parameters[121] = [1.; 4]; parameters[124] = [1.; 4]; parameters[125] = [1., 1., 1., 0.];
                    let particle = ParticleRenderData { geometry: Arc::new(ParticleGeometry { vertices: [[-0.2, -0.2, 0.3], [0.2, -0.2, 0.3], [0., 0.2, 0.3]].map(|position| ParticleVertex { position, uv: [0.; 2], color: [1.; 4] }).to_vec(), indices: vec![0, 1, 2] }), color: [1., 0., 0., 0.5], custom1: [0.; 4], custom2: [0.; 4], uv_transform: [1., 1., 0., 0.], parameters: Arc::new(parameters), seconds: 0., features: 0, sorting_position: [0., 0., 10.], sorting_fudge: 0., source_blend: 5, destination_blend: 10, depth_compare: 2, cull: 0, depth_write: false };
                    objects[64].material.particle = Some(Arc::new(particle)); objects[64].material.transparent = true;
                    let order = sorted_render_indices(&objects, camera.position); let particle = order.iter().position(|&index| index == 64).unwrap();
                    assert!(order[particle + 1..].iter().any(|&index| objects[index].material.particle.is_none()), "meshes following particles must restore object-array bindings");
                },
                _ => (),
            }
            let mut reference = None;
            for (renderer, target) in renderers.iter_mut().zip(&targets) {
                for bundles_disabled in [true, false, false, false] {
                    renderer.disable_world_bundles = bundles_disabled;
                    renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(target)).unwrap();
                    let pixels = renderer.read_offscreen_rgba8(target).unwrap(); visible_pixels |= pixels.chunks_exact(4).any(|pixel| pixel[..3] != [0, 0, 0]);
                    if let Some(reference) = &reference { assert_eq!(&pixels, reference, "phase {phase}; indexed={}", renderer.indexed_objects); } else { reference = Some(pixels); }
                }
            }
        }
        assert!(visible_pixels);
        for renderer in &renderers { assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none()); }
        println!("INDEXED_OBJECTS_PIXEL_COMPARISON phases=12 modes=2 frames=96 identical=true storage_array=true");
    }

    #[test]
    #[ignore = "manual alternating object buffer GPU submission and readback comparison"]
    fn benchmark_indexed_object_submission() {
        let mut renderers = [renderer(true), renderer(false)];
        let targets = renderers.each_ref().map(|renderer| renderer.create_offscreen_target(PhysicalSize::new(128, 128)));
        let mut objects = binding_test_objects(4096, true); let palette: Vec<_> = objects[..8].iter().map(|object| object.material.clone()).collect();
        for (index, object) in objects.iter_mut().enumerate() { object.material = palette[index % 8].clone(); }
        let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
        let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false; lighting.directional = None;
        let mut samples = [Vec::new(), Vec::new()]; let mut reference = None;
        for round in 0..12 {
            for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
                let renderer = &mut renderers[mode]; let target = &targets[mode]; let mut times = [0.; 3];
                for _ in 0..4 {
                    let started = std::time::Instant::now();
                    renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(target)).unwrap();
                    let submitted = started.elapsed().as_secs_f64() * 1000.; let pixels = renderer.read_offscreen_rgba8(target).unwrap();
                    times[0] += renderer.submission_profile().world_encode_ms; times[1] += submitted; times[2] += started.elapsed().as_secs_f64() * 1000.;
                    if let Some(reference) = &reference { assert_eq!(&pixels, reference); } else { reference = Some(pixels); }
                }
                if round >= 2 { samples[mode].push(times.map(|time| time / 4.)); }
            }
        }
        println!("INDEXED_OBJECTS_PROFILE columns=worldEncodeCpuMs,submitCpuMs,submitPlusReadbackMs samples={samples:?} rounds=12 warmupRounds=2 framesPerSample=4 scope=4096-mixed-material-draws-cached-bundles-full-128x128-readback-equality-no-IPC-or-gameplay-FPS");
        for renderer in &renderers { assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none()); }
    }
    #[test]
    fn indexed_object_shader_layout_and_stage_ownership_validate() {
        let hook = "fn mengine_surface_hook(color: vec4<f32>, uv: vec2<f32>, position: vec3<f32>, normal: vec3<f32>) -> vec4<f32> { if object.custom_parameters[0].x > 0.5 { return color * textureSample(base_color_texture, material_sampler, uv); } return color; }";
        let custom = compose_surface_shader(&format!("{hook} fn vs_shadow() -> f32 {{ return 0.; }} fn mesh_preview() -> VsOut {{ var o: VsOut; return o; }}"), None).unwrap();
        for (original, pass) in [(FORWARD_WGSL, Pass::Forward), (SHADOW_WGSL, Pass::Shadow), (custom.as_str(), Pass::Forward)] {
            assert_eq!(shader(original, false, pass), original);
            let source = shader(original, true, pass); assert!(source.contains("var<storage, read> mengine_objects"));
            assert!(source.contains("@builtin(instance_index) object_index")); assert!(source.contains("@interpolate(flat) object_index"));
            assert_eq!(source.matches("object = mengine_objects[object_index];").count(), 1);
            let module = naga::front::wgsl::parse_str(&source).expect("indexed shader parses");
            naga::valid::Validator::new(naga::valid::ValidationFlags::all(), naga::valid::Capabilities::all()).validate(&module).unwrap();
            let object = module.types.iter().find(|(_, ty)| ty.name.as_deref() == Some("ObjectUniforms")).unwrap().1;
            let naga::TypeInner::Struct { span, .. } = object.inner else { panic!("object payload must be a struct"); };
            assert_eq!(span as usize, std::mem::size_of::<ObjectUniforms>());
        }
    }
}
