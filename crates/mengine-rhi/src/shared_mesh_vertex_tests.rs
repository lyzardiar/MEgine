// Author: MiYu. Compare complete viewport pixels while sharing, replacing and releasing immutable vertex buffers.
use super::*;

fn pixels(renderer: &mut Renderer, key: &str) -> Vec<u8> {
    let target = renderer.create_offscreen_target(PhysicalSize::new(48,32));
    let objects = [RenderObject { mesh_key:key.into(), model:Mat4::IDENTITY, material:RenderMaterial { unlit:true, double_sided:true, ..Default::default() }.into(),cast_shadows:false,receive_shadows:false }];
    let camera = FrameCamera { view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    for _ in 0..3 { renderer.submit_frame_to(&RenderFrame { clear:ClearColor { r:0.,g:0.,b:0.,a:1. },camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&[] },RenderTarget::Offscreen(&target)).unwrap(); }
    renderer.read_offscreen_rgba8(&target).unwrap()
}

#[test]
fn shared_vertex_uploads_coalesce_and_preserve_replacement_topology_and_other_view_pixels() {
    let size = PhysicalSize::new(48,32); let barrier = Arc::new(std::sync::Barrier::new(2));
    let left = [[-0.9,-0.8,0.5],[-0.1,-0.8,0.5],[-0.9,0.8,0.5],[-0.1,0.8,0.5]].map(|position| Vertex { position,normal:[0.,0.,1.],uv:[0.5,0.5] });
    let indices = [0,1,2,2,1,3];
    let views = [Renderer::new_shared_headless(size).unwrap(),Renderer::new_shared_headless(size).unwrap()];
    views[0].device.push_error_scope(wgpu::ErrorFilter::Validation);
    let mut views = std::thread::scope(|scope| {
        views.into_iter().enumerate().map(|(index,mut view)| {
            let barrier = Arc::clone(&barrier);
            scope.spawn(move || { barrier.wait(); let profile = view.upload_gltf_static_profiled(&format!("source-{index}"), &left, &indices); (view,profile) })
        }).collect::<Vec<_>>().into_iter().map(|job| job.join().unwrap()).collect::<Vec<_>>()
    });
    let (mut game, second) = views.pop().unwrap(); let (mut scene, first) = views.pop().unwrap();
    assert_eq!(usize::from(first.vertex_buffer_reused)+usize::from(second.vertex_buffer_reused),1);
    let original = scene.meshes["source-0"].vertex_buffer.clone(); assert_eq!(original,game.meshes["source-1"].vertex_buffer);
    assert!(Arc::ptr_eq(scene.meshes["source-0"].shared_vertices.as_ref().unwrap(),game.meshes["source-1"].shared_vertices.as_ref().unwrap()));
    let reference = pixels(&mut game,"source-1"); assert_eq!(pixels(&mut scene,"source-0"),reference);
    let mut isolated = pollster::block_on(Renderer::new_headless(size)).unwrap(); assert!(!Arc::ptr_eq(&scene.shared_mesh_vertices,&isolated.shared_mesh_vertices));
    isolated.upload_gltf_static("independent",&left,&indices); assert_eq!(pixels(&mut isolated,"independent"),reference);

    scene.remove_mesh("source-0"); assert_eq!(scene.mesh_vertex_pool_stats().0,0,"another live viewport prevents mutable recycling");
    let right = left.map(|mut vertex| { vertex.position[0] += 1.0; vertex });
    scene.upload_gltf_static("right",&right,&indices); assert_ne!(scene.meshes["right"].vertex_buffer,original);
    let right_pixels = pixels(&mut scene,"right"); assert_ne!(right_pixels,reference); assert_eq!(pixels(&mut game,"source-1"),reference);
    game.remove_mesh("source-1"); assert_eq!(game.mesh_vertex_pool_stats().0,1);
    let mut changed = right; changed[0].normal[0] = 0.25; changed[0].uv[0] = 0.25;
    assert!(game.upload_gltf_static_profiled("changed",&changed,&indices).vertex_buffer_reused);
    assert_ne!(game.meshes["changed"].vertex_buffer,scene.meshes["right"].vertex_buffer); assert_eq!(pixels(&mut scene,"right"),right_pixels);
    assert_eq!(pixels(&mut game,"changed"),right_pixels);

    assert!(game.upload_gltf_static_profiled("topology",&right,&[0,1,2]).vertex_buffer_reused);
    assert_eq!(game.meshes["topology"].vertex_buffer,scene.meshes["right"].vertex_buffer);
    assert_ne!(game.meshes["topology"].index_count,scene.meshes["right"].index_count);
    isolated.upload_gltf_static("triangle",&right,&[0,1,2]); let triangle = pixels(&mut isolated,"triangle"); assert_ne!(triangle,right_pixels);
    let retained = Arc::downgrade(game.meshes["topology"].shared_vertices.as_ref().unwrap()); drop(scene);
    assert!(retained.upgrade().is_some()); assert_eq!(pixels(&mut game,"topology"),triangle);
    game.remove_mesh("topology"); assert!(retained.upgrade().is_none());
    assert!(pollster::block_on(game.device.pop_error_scope()).is_none());
}
