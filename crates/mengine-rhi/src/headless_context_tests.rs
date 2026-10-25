// Author: MiYu. Verify concurrent viewport ownership on a shared native GPU device.
use super::*;

fn draw(renderer: &mut Renderer, color: [f32; 4], size: PhysicalSize<u32>) -> Vec<u8> {
    let target = renderer.create_offscreen_target(size);
    let vertices = [[-0.8,-0.8,0.5],[0.8,-0.8,0.5],[-0.8,0.8,0.5],[0.8,0.8,0.5]].map(|position| Vertex { position, normal:[0.,0.,1.], uv:[0.5,0.5] });
    renderer.upload_gltf_static_profiled("same-viewport-key", &vertices, &[0,1,2,2,1,3]);
    let objects = [RenderObject { mesh_key:"same-viewport-key".into(),model:Mat4::IDENTITY,material:RenderMaterial { unlit:true,base_color:color,..Default::default() }.into(),cast_shadows:false,receive_shadows:false }];
    let camera = FrameCamera { view:Mat4::IDENTITY, proj:Mat4::IDENTITY, position:Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    for _ in 0..3 { renderer.submit_frame_to(&RenderFrame { clear:ClearColor { r:0.,g:0.,b:0.,a:0. },camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&[] },RenderTarget::Offscreen(&target)).unwrap(); }
    renderer.read_offscreen_rgba8(&target).unwrap()
}

#[test]
fn shared_device_preserves_concurrent_pixels_viewport_ownership_and_last_owner_release() {
    let size = PhysicalSize::new(32,32);
    let (mut scene, mut game) = std::thread::scope(|scope| {
        let scene = scope.spawn(|| Renderer::new_shared_headless(size).unwrap());
        let game = scope.spawn(|| Renderer::new_shared_headless(size).unwrap());
        (scene.join().unwrap(), game.join().unwrap())
    });
    let context = Arc::downgrade(scene._headless_context.as_ref().unwrap());
    assert!(Arc::ptr_eq(scene._headless_context.as_ref().unwrap(), game._headless_context.as_ref().unwrap()));
    assert!(Arc::ptr_eq(&scene.poll_gate, &game.poll_gate));
    scene.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let red = [1.,0.,0.,1.]; let green = [0.,1.,0.,1.];
    let (scene_pixels, game_pixels) = std::thread::scope(|scope| {
        let scene = scope.spawn(|| draw(&mut scene, red, size));
        let game = scope.spawn(|| draw(&mut game, green, size));
        (scene.join().unwrap(), game.join().unwrap())
    });
    assert_ne!(scene_pixels, game_pixels);
    let mut isolated = pollster::block_on(Renderer::new_headless(size)).unwrap();
    assert!(!Arc::ptr_eq(&scene.poll_gate, &isolated.poll_gate));
    assert_eq!(scene_pixels, draw(&mut isolated, red, size));
    assert_eq!(game_pixels, draw(&mut isolated, green, size));
    drop(scene);
    assert!(context.upgrade().is_some());
    assert_eq!(game_pixels, draw(&mut game, green, size));
    assert!(pollster::block_on(game.device.pop_error_scope()).is_none());
    drop(game);
    assert!(context.upgrade().is_none(), "the process pool must not keep a device alive after its last viewport");
    let next = Renderer::new_shared_headless(size).unwrap();
    assert!(!context.ptr_eq(&Arc::downgrade(next._headless_context.as_ref().unwrap())));
}

#[test]
fn shared_device_separates_uniform_reference_from_indexed_object_layout() {
    let size = PhysicalSize::new(32,32);
    let mut indexed = Renderer::new_shared_headless(size).unwrap();
    let mut uniform = UNIFORM_OBJECT_REFERENCE.with(|reference| {
        let previous = reference.replace(true);
        let result = Renderer::new_shared_headless(size);
        reference.set(previous);
        result
    }).unwrap();
    assert!(!uniform.indexed_object_data());
    assert!(!Arc::ptr_eq(indexed._headless_context.as_ref().unwrap(), uniform._headless_context.as_ref().unwrap()));
    assert!(!Arc::ptr_eq(&indexed.poll_gate, &uniform.poll_gate));
    indexed.device.push_error_scope(wgpu::ErrorFilter::Validation);
    uniform.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let color = [0.2,0.4,0.8,1.];
    assert_eq!(draw(&mut indexed, color, size), draw(&mut uniform, color, size));
    assert!(pollster::block_on(indexed.device.pop_error_scope()).is_none());
    assert!(pollster::block_on(uniform.device.pop_error_scope()).is_none());
}

#[test]
fn lost_shared_device_is_not_reused_by_a_new_viewport() {
    let size = PhysicalSize::new(32,32);
    let previous = Renderer::new_shared_headless(size).unwrap();
    previous.device.destroy();
    let _ = previous.device.poll(wgpu::Maintain::Wait);
    let mut replacement = Renderer::new_shared_headless(size).unwrap();
    assert!(!Arc::ptr_eq(previous._headless_context.as_ref().unwrap(), replacement._headless_context.as_ref().unwrap()));
    replacement.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let pixels = draw(&mut replacement, [1.,0.,0.,1.], size);
    assert!(pixels.chunks_exact(4).any(|pixel| pixel[0] > 200 && pixel[3] > 200));
    assert!(pollster::block_on(replacement.device.pop_error_scope()).is_none());
}

#[test]
fn gpu_allocator_diagnostics_identify_shared_devices_and_account_live_buffers() {
    let size = PhysicalSize::new(16,16);
    let scene = Renderer::new_shared_headless(size).unwrap(); let game = Renderer::new_shared_headless(size).unwrap();
    let isolated = pollster::block_on(Renderer::new_headless(size)).unwrap();
    let (device, before) = scene.gpu_allocator_report(); assert_eq!(device, game.gpu_allocator_report().0); assert_ne!(device, isolated.gpu_allocator_report().0);
    let bytes = 8 * 1024 * 1024;
    let buffer = scene.device.create_buffer(&wgpu::BufferDescriptor { label: Some("diagnostic-live-buffer"), size: bytes, usage: wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    if let Some(before) = before {
        let live = game.gpu_allocator_report().1.unwrap(); assert!(live.allocated_bytes >= before.allocated_bytes + bytes); assert!(live.reserved_bytes >= live.allocated_bytes);
        assert!(live.allocations.iter().any(|(name, size)| name.contains("diagnostic-live-buffer") && *size >= bytes));
        println!("GPU_ALLOCATOR allocated={} reserved={} allocations={} blocks={}", live.allocated_bytes, live.reserved_bytes, live.allocations.len(), live.blocks);
    }
    drop(buffer);
}

#[test]
fn concurrent_shared_device_readbacks_complete_without_stalled_viewports() {
    let size = PhysicalSize::new(1280,720);
    let views = [Renderer::new_shared_headless(size).unwrap(), Renderer::new_shared_headless(size).unwrap()];
    let barrier = Arc::new(std::sync::Barrier::new(2)); let (sender, receiver) = std::sync::mpsc::channel();
    let jobs = views.into_iter().enumerate().map(|(index, mut view)| {
        let barrier = Arc::clone(&barrier); let sender = sender.clone();
        std::thread::spawn(move || {
            let mut expected = None;
            for frame in 0..60 {
                barrier.wait();
                let pixels = draw(&mut view, if index == 0 { [1.,0.,0.,1.] } else { [0.,1.,0.,1.] }, size);
                if let Some(expected) = &expected { assert_eq!(&pixels, expected); } else { expected = Some(pixels); }
                sender.send((index, frame)).unwrap();
            }
        })
    }).collect::<Vec<_>>();
    drop(sender);
    let mut latest = [None;2];
    for completed in 0..120 {
        let (index, frame) = receiver.recv_timeout(std::time::Duration::from_secs(5)).unwrap_or_else(|error| panic!("shared readback stalled after {completed} completions, latest={latest:?}: {error}"));
        latest[index] = Some(frame);
    }
    for job in jobs { job.join().unwrap(); }
    assert_eq!(latest, [Some(59),Some(59)]);
}
