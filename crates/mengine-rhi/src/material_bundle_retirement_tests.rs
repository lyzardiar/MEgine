// Author: MiYu. Retire unreachable material bundles without requiring more viewport frames.
use super::*;
use super::material_submission_tests::binding_test_objects;

fn render_material_bundle(renderer: &mut Renderer, target: &OffscreenRenderTarget, objects: &[RenderObject]) -> Vec<u8> {
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    for _ in 0..3 { renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(target)).unwrap(); }
    let pixels = renderer.read_offscreen_rgba8(target).unwrap();
    assert!(renderer.submission_profile().world_bundle_hits > 0);
    pixels
}

fn material_gpu_allocations(renderer: &Renderer) -> Option<usize> {
    renderer.device.generate_allocator_report().map(|report| report.allocations.iter().filter(|allocation| allocation.name == "material_texture").count())
}

#[test]
fn material_changes_release_obsolete_bundle_textures_before_another_frame() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let target = renderer.create_offscreen_target(PhysicalSize::new(32, 32));
    let mut objects = binding_test_objects(128, false);
    for object in &mut objects { object.material.base_color_texture = "retirement".into(); }
    let red = [255, 20, 10, 255].repeat(256 * 256);
    let blue = [10, 20, 255, 255].repeat(256 * 256);
    renderer.upload_material_texture_rgba8("retirement", 256, 256, &red, true).unwrap();
    let first = render_material_bundle(&mut renderer, &target, &objects);
    assert!(renderer.upload_material_texture_rgba8("retirement", 256, 256, &[], true).is_err());
    assert!(!renderer.remove_material_texture("absent"));
    assert!(renderer.world_bundles.counts().0 > 0, "unchanged material bindings keep cached commands");
    renderer.upload_material_texture_rgba8("retirement", 256, 256, &blue, true).unwrap();
    renderer.device.poll(wgpu::Maintain::Wait);
    if let Some(count) = material_gpu_allocations(&renderer) { assert_eq!(count, 1, "replaced texture must be released before any new frame"); }
    assert_eq!(renderer.world_bundles.counts(), (0, 0));
    let replaced = render_material_bundle(&mut renderer, &target, &objects);
    assert_ne!(first, replaced, "replacement pixels must reach the rebuilt bundle");
    assert!(renderer.remove_material_texture_variant("retirement", true));
    renderer.device.poll(wgpu::Maintain::Wait);
    if let Some(count) = material_gpu_allocations(&renderer) { assert_eq!(count, 0, "removed variant must be released without idle viewport frames"); }
    assert_eq!(renderer.world_bundles.counts(), (0, 0));
    renderer.upload_material_texture_rgba8("retirement", 256, 256, &red, true).unwrap();
    assert_eq!(render_material_bundle(&mut renderer, &target, &objects), first);
    assert!(renderer.remove_material_texture("retirement"));
    renderer.device.poll(wgpu::Maintain::Wait);
    if let Some(count) = material_gpu_allocations(&renderer) { assert_eq!(count, 0); }
    assert_eq!(renderer.world_bundles.counts(), (0, 0));
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("MATERIAL_BUNDLE_RETIREMENT hotReloadPixels=true reloadedPixelsEqual=true postMutationViewportFrames=0 liveTextures=0");
}
