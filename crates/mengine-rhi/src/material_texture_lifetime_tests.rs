// Author: MiYu. Verify GPU texture retirement after material reload and scene changes.
use super::*;
use super::material_submission_tests::binding_test_objects;

fn material_allocations(renderer: &Renderer) -> Option<(usize, u64)> {
    renderer.device.generate_allocator_report().map(|report| report.allocations.iter().filter(|allocation| allocation.name == "material_texture").fold((0, 0), |(count, bytes), allocation| (count + 1, bytes + allocation.size)))
}

#[test]
fn retired_material_textures_release_gpu_allocations() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let target = renderer.create_offscreen_target(PhysicalSize::new(32, 32));
    let camera = FrameCamera { view: Mat4::IDENTITY, proj: Mat4::IDENTITY, position: Vec3::Z };
    let lighting = FrameLighting::default();
    let mut objects = binding_test_objects(128, false);
    for object in &mut objects { object.material.base_color_texture = "lifetime".into(); }
    for cycle in 0..4 {
        renderer.upload_material_texture_rgba8("lifetime", 256, 256, &vec![255; 256 * 256 * 4], true).unwrap();
        for _ in 0..3 {
            renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &objects, lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
        }
        assert!(renderer.submission_profile().world_bundle_hits > 0, "exercise actual cached bundles before retirement");
        assert!(renderer.remove_material_texture("lifetime"));
        for _ in 0..12 {
            renderer.submit_frame_to(&RenderFrame { clear: ClearColor { r: 0., g: 0., b: 0., a: 1. }, camera, objects: &[], lighting: &lighting, ui: None, scene_views: &[] }, RenderTarget::Offscreen(&target)).unwrap();
            renderer.read_offscreen_rgba8(&target).unwrap();
        }
        renderer.device.poll(wgpu::Maintain::Wait);
        if let Some(textures) = material_allocations(&renderer) {
            println!("MATERIAL_TEXTURE_LIFETIME cycle={cycle} allocations={textures:?} bundles={:?}", renderer.world_bundles.counts());
            assert_eq!(textures, (0, 0), "removed GPU textures retained");
        }
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}

#[test]
fn cloned_material_bundle_preserves_texture_until_final_handle_release() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(32, 32))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    for srgb in [false, true] { renderer.upload_material_texture_rgba8("shared", 256, 256, &vec![255; 256 * 256 * 4], srgb).unwrap(); }
    renderer.ensure_object_capacity(128);
    let material = RenderMaterial { base_color_texture: "shared".into(), ..Default::default() };
    let prepared = renderer.prepare_object_material(&material);
    let mut cache = WorldBundleCache::default();
    let pipeline = &renderer.material_pipelines[&prepared.pipeline];
    let textures = &renderer.material_texture_sets[&prepared.textures];
    let mesh = &renderer.meshes["cube"];
    let draws = [WorldDraw { pipeline, textures, vertices: &mesh.vertex_buffer, indices: &mesh.index_buffer, count: mesh.index_count, object_index: 0, instances: 128 }];
    let bindings = WorldBindings { globals: &renderer.bind_group, shadows: &renderer.shadow_sample_bind_group, environment: &renderer.fallback_environment_bind_group, indexed_objects: renderer.indexed_objects, object_stride: renderer.object_stride };
    assert!(cache.prepare(&renderer.device, renderer.sample_count, bindings, &draws).is_none());
    let bundle = cache.prepare(&renderer.device, renderer.sample_count, bindings, &draws).unwrap().0.clone();
    let clone = bundle.clone();
    drop(cache);
    assert!(renderer.remove_material_texture("shared"));
    renderer.queue.submit([]);
    renderer.device.poll(wgpu::Maintain::Wait);
    let held = material_allocations(&renderer);
    if let Some((count, _)) = held { assert_eq!(count, 1, "only the referenced color variant stays owned"); }
    drop(bundle);
    renderer.device.poll(wgpu::Maintain::Wait);
    assert_eq!(material_allocations(&renderer), held, "one clone must keep the core bundle alive");
    std::thread::spawn(move || drop(clone)).join().unwrap();
    renderer.device.poll(wgpu::Maintain::Wait);
    if let Some(allocations) = material_allocations(&renderer) { assert_eq!(allocations, (0, 0), "final bundle release retires its texture"); }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("MATERIAL_TEXTURE_LIFETIME clonedHandles=2 finalReleaseThread=worker colorRetained=true unreferencedLinearReleased=true");
}
