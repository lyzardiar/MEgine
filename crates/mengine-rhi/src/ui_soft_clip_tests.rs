// Author: MiYu. Soft-clip GPU transitions, allocation bounds and preparation benchmarks.
use super::*;
use crate::{ClearColor, FrameCamera, FrameLighting, RenderFrame, RenderTarget, Renderer};
use glam::{Mat4, Vec3};
use winit::dpi::PhysicalSize;

fn gpu() -> Renderer {
    pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).expect("GPU for soft-clip validation")
}

fn pixels(renderer: &mut Renderer, plan: &UiBatchPlan, size: u32) -> Vec<u8> {
    let target = renderer.create_offscreen_target(PhysicalSize::new(size, size));
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0.1, g: 0.2, b: 0.3, a: 1.0 }, camera, objects: &[], lighting: &lighting, ui: Some(plan), scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
    renderer.read_offscreen_rgba8(&target).unwrap()
}

fn pixel_cases() -> Vec<Vec<UiPrimitive>> {
    let plain = UiPrimitive::solid([0., 0., 32., 32.], [0.7, 0.3, 0.2, 0.8]);
    let mut sparse = plain.clone();
    sparse.soft_clips[0] = Some(UiSoftClip { rect: [2., 2., 28., 28.], softness: [5., 7.] });
    sparse.soft_clips[7] = Some(UiSoftClip { rect: [6., 4., 22., 24.], softness: [0., 0.] });
    let mut nested = plain.clone();
    for (index, clip) in nested.soft_clips.iter_mut().enumerate() { let inset = index as f32; *clip = Some(UiSoftClip { rect: [inset, inset, 32. - inset * 2., 32. - inset * 2.], softness: [2., 3.] }); }
    let mut custom = sparse.clone();
    custom.render_material = Some(Arc::new(UiRenderMaterial { shader: "fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> { return input.vertex_color; }".into(), ..Default::default() }));
    let mut error = sparse.clone(); error.render_material = Some(Arc::new(UiRenderMaterial { is_error: true, ..Default::default() }));
    let mut push = UiPrimitive::solid([4., 4., 24., 24.], [1.; 4]); push.key.stencil = UiStencilMode::Push { reference: 0 };
    let mut pop = push.clone(); pop.key.stencil = UiStencilMode::Pop { reference: 1 };
    let mut child = sparse.clone(); child.key.stencil = UiStencilMode::Test { reference: 1 };
    let mut projected = custom.clone(); projected.key.depth_test = true;
    projected.clip_corners = Some([[-1.,1.,0.5,1.],[1.,1.,0.5,1.],[1.,-1.,0.5,1.],[-1.,-1.,0.5,1.]]);
    projected.shader_channel_data = Some(Arc::new(UiShaderChannelData::default()));
    vec![vec![plain.clone(); 513], vec![plain.clone()], vec![sparse.clone()], vec![plain.clone()], vec![], vec![nested], vec![custom], vec![error], vec![plain.clone(), sparse], vec![push, child, pop], vec![projected], vec![plain]]
}

#[test]
fn soft_clip_transitions_match_explicit_full_viewport_clips_on_gpu() {
    let mut renderer = gpu(); let mut reference = gpu();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation); reference.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let mut evidence = Vec::new();
    for (index, primitives) in pixel_cases().into_iter().enumerate() {
        let forced: Vec<_> = primitives.iter().cloned().map(|mut p| { if p.soft_clips.iter().all(Option::is_none) { p.soft_clips[0] = Some(UiSoftClip { rect: [0., 0., 64., 64.], softness: [0., 0.] }); } p }).collect();
        for size in [32, 48] {
            let actual = pixels(&mut renderer, &UiBatchPlan::build(primitives.clone()), size);
            let expected = pixels(&mut reference, &UiBatchPlan::build(forced.clone()), size);
            assert!(actual == expected, "GPU pixel mismatch case={index}, size={size}");
            evidence.extend(actual);
        }
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    assert!(pollster::block_on(reference.device.pop_error_scope()).is_none());
    if let Ok(label) = std::env::var("MENGINE_PERFORMANCE_LABEL") {
        assert!(label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../../tmp/docs-artifacts/editor-performance-risk/{label}-soft-clip.rgba"));
        std::fs::write(path, evidence).unwrap();
    }
}

#[test]
#[ignore = "manual UI soft-clip preparation CPU benchmark"]
fn benchmark_ui_soft_clip_preparation() {
    let gpu = gpu();
    let mut renderer = UiRenderer::new(&gpu.device, &gpu.queue, wgpu::TextureFormat::Bgra8UnormSrgb, 32, 32, false, 1);
    let mut reports = Vec::new();
    for (count, clipped) in [(1103, false), (77824, false), (1103, true), (77824, true)] {
        let mut primitive = UiPrimitive::solid([0., 0., 1., 1.], [0.7, 0.3, 0.2, 0.8]);
        if clipped { primitive.soft_clips[0] = Some(UiSoftClip { rect: [0., 0., 32., 32.], softness: [2., 2.] }); }
        let plan = UiBatchPlan::build(vec![primitive; count]);
        let mut times = Vec::new(); let mut packing = Vec::new(); let mut writes = Vec::new();
        for group in 0..11 {
            let mut elapsed = 0.; let mut pack = 0.; let mut write = 0.;
            for _ in 0..12 {
                let started = std::time::Instant::now(); renderer.prepare(&gpu.device, &gpu.queue, &plan); elapsed += started.elapsed().as_secs_f64() * 1000.;
                let profile = renderer.prepare_profile(); pack += profile.packing_ms; write += profile.buffer_write_ms;
                gpu.queue.submit([]); gpu.device.poll(wgpu::Maintain::Wait);
            }
            if group > 1 { times.push(elapsed / 12.); packing.push(pack / 12.); writes.push(write / 12.); }
        }
        times.sort_by(f64::total_cmp); packing.sort_by(f64::total_cmp); writes.sort_by(f64::total_cmp);
        reports.push(format!("{{\"primitives\":{count},\"clipped\":{clipped},\"median_ms\":{},\"packing_ms\":{},\"write_ms\":{},\"samples\":9,\"iterations\":12}}", times[4], packing[4], writes[4]));
    }
    println!("UI_SOFT_CLIP_BENCHMARK=[{}]", reports.join(","));
}

// Storage assertions require the independent soft-clip capacity introduced in this change.
#[test]
fn soft_clip_storage_follows_enabled_frames() {
    let gpu = gpu();
    let mut renderer = UiRenderer::new(&gpu.device, &gpu.queue, wgpu::TextureFormat::Bgra8UnormSrgb, 32, 32, false, 1);
    let mut plan = UiBatchPlan::build(vec![UiPrimitive::solid([0., 0., 1., 1.], [1.; 4]); 513]);
    renderer.prepare(&gpu.device, &gpu.queue, &plan);
    assert_eq!(renderer.instance_capacity, 1024); assert_eq!(renderer.soft_clip_capacity, 1); assert_eq!(renderer.soft_clip_count, 0);
    assert_eq!(renderer.prepare_profile().buffer_allocations, 1);
    plan.primitives[512].soft_clips[7] = Some(UiSoftClip { rect: [0., 0., 1., 1.], softness: [0., 0.] });
    renderer.prepare(&gpu.device, &gpu.queue, &plan);
    assert_eq!(renderer.soft_clip_capacity, 1024); assert_eq!(renderer.soft_clip_count, 8); assert_eq!(renderer.prepare_profile().buffer_allocations, 1);
    plan.primitives[512].soft_clips[7] = None;
    plan.primitives.resize(2049, plan.primitives[0].clone());
    renderer.prepare(&gpu.device, &gpu.queue, &plan);
    assert_eq!(renderer.instance_capacity, 4096); assert_eq!(renderer.soft_clip_capacity, 1024); assert_eq!(renderer.soft_clip_count, 0);
    assert_eq!(renderer.prepare_profile().buffer_allocations, 1);
    renderer.prepare(&gpu.device, &gpu.queue, &UiBatchPlan::default());
    assert_eq!(renderer.soft_clip_count, 0); assert_eq!(renderer.prepare_profile().buffer_allocations, 0);
    plan.primitives[2048].soft_clips[0] = Some(UiSoftClip { rect: [0., 0., 1., 1.], softness: [1., 1.] });
    renderer.prepare(&gpu.device, &gpu.queue, &plan);
    assert_eq!(renderer.soft_clip_capacity, 4096); assert_eq!(renderer.soft_clip_count, 8); assert_eq!(renderer.prepare_profile().buffer_allocations, 1);
    gpu.queue.submit([]); gpu.device.poll(wgpu::Maintain::Wait);
}
