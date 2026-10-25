// Author: MiYu. Compare complete material pixels through shared uploads, replacement, descriptor variants and viewport closure.
use super::*;

fn pixels(renderer: &mut Renderer, key: &str) -> Vec<u8> {
    let target = renderer.create_offscreen_target(PhysicalSize::new(32,32));
    let objects = [RenderObject { mesh_key:"cube".into(),model:Mat4::IDENTITY,material:RenderMaterial { unlit:true,double_sided:true,base_color_texture:key.into(),..Default::default() }.into(),cast_shadows:false,receive_shadows:false }];
    let camera = FrameCamera { view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::Z };
    let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    for _ in 0..3 { renderer.submit_frame_to(&RenderFrame { clear:ClearColor { r:0.,g:0.,b:0.,a:1. },camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&[] },RenderTarget::Offscreen(&target)).unwrap(); }
    renderer.read_offscreen_rgba8(&target).unwrap()
}

#[test]
fn shared_material_textures_coalesce_and_preserve_hot_reload_formats_pixels_and_last_owner() {
    let size = PhysicalSize::new(32,32); let red = [255,0,0,255].repeat(16); let blue = [0,0,255,255].repeat(16);
    let views = [Renderer::new_shared_headless(size).unwrap(),Renderer::new_shared_headless(size).unwrap()];
    views[0].device.push_error_scope(wgpu::ErrorFilter::Validation);
    let barrier = Arc::new(std::sync::Barrier::new(2));
    let mut views = std::thread::scope(|scope| {
        views.into_iter().enumerate().map(|(index,mut view)| {
            let barrier = Arc::clone(&barrier); let red = &red;
            scope.spawn(move || { barrier.wait(); view.upload_material_texture_rgba8(&format!("source-{index}"),4,4,red,true).unwrap(); view })
        }).collect::<Vec<_>>().into_iter().map(|job| job.join().unwrap()).collect::<Vec<_>>()
    });
    let mut game = views.pop().unwrap(); let mut scene = views.pop().unwrap();
    assert!(Arc::ptr_eq(&scene.material_color_textures["source-0"],&game.material_color_textures["source-1"]));
    let red_pixels = pixels(&mut scene,"source-0"); assert_eq!(pixels(&mut game,"source-1"),red_pixels);
    let mut isolated = pollster::block_on(Renderer::new_headless(size)).unwrap(); assert!(!Arc::ptr_eq(&scene.shared_material_textures,&isolated.shared_material_textures));
    isolated.upload_material_texture_rgba8("reference",4,4,&red,true).unwrap(); assert_eq!(pixels(&mut isolated,"reference"),red_pixels);

    scene.upload_material_texture_rgba8("source-0",4,4,&blue,true).unwrap(); assert!(!Arc::ptr_eq(&scene.material_color_textures["source-0"],&game.material_color_textures["source-1"]));
    let blue_pixels = pixels(&mut scene,"source-0"); assert_ne!(blue_pixels,red_pixels); assert_eq!(pixels(&mut game,"source-1"),red_pixels);
    assert!(scene.upload_material_texture_rgba8("source-0",4,4,&[0;3],true).is_err()); assert_eq!(pixels(&mut scene,"source-0"),blue_pixels);
    game.upload_material_texture_rgba8("shape",2,8,&red,true).unwrap(); game.upload_material_texture_rgba8("linear",4,4,&red,false).unwrap();
    assert!(!Arc::ptr_eq(&game.material_color_textures["shape"],&game.material_color_textures["source-1"]));
    assert_eq!(game.material_color_textures["shape"]._texture.size().height,8);
    assert_eq!(game.material_data_textures["linear"]._texture.format(),wgpu::TextureFormat::Rgba8Unorm);
    assert_eq!(game.material_color_textures["source-1"]._texture.format(),wgpu::TextureFormat::Rgba8UnormSrgb);
    let red_weak = Arc::downgrade(&game.material_color_textures["source-1"]); game.remove_material_texture("source-1"); assert!(red_weak.upgrade().is_none());
    game.upload_material_texture_rgba8("blue",4,4,&blue,true).unwrap(); assert!(Arc::ptr_eq(&game.material_color_textures["blue"],&scene.material_color_textures["source-0"]));
    let blue_weak = Arc::downgrade(&game.material_color_textures["blue"]); drop(scene); assert!(blue_weak.upgrade().is_some()); assert_eq!(pixels(&mut game,"blue"),blue_pixels);
    isolated.upload_material_texture_rgba8("reference",4,4,&blue,true).unwrap(); assert_eq!(pixels(&mut isolated,"reference"),blue_pixels);
    game.remove_material_texture("blue"); assert!(blue_weak.upgrade().is_none());
    assert!(pollster::block_on(game.device.pop_error_scope()).is_none());
}

#[test]
fn shared_resource_aliases_preserve_512_object_instancing_bundle_and_direct_draw_pixels() {
    let mut renderer = pollster::block_on(Renderer::new_headless(PhysicalSize::new(128,128))).unwrap();
    renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let vertices = [[-0.8,-0.8,0.5],[0.8,-0.8,0.5],[-0.8,0.8,0.5],[0.8,0.8,0.5]].map(|position| Vertex { position,normal:[0.,0.,1.],uv:[0.5,0.5] });
    for index in 0..32 { renderer.upload_gltf_static(&format!("alias-{index}"),&vertices,&[0,1,2,2,1,3]); }
    let white = [255;64]; for key in ["a","b"] { renderer.upload_material_texture_rgba8(key,4,4,&white,true).unwrap(); }
    assert_eq!(renderer.meshes["alias-0"].vertex_buffer,renderer.meshes["alias-31"].vertex_buffer);
    assert!(Arc::ptr_eq(&renderer.material_color_textures["a"],&renderer.material_color_textures["b"]));
    let objects = (0..512).map(|index| RenderObject { mesh_key:format!("alias-{}",index%32),model:Mat4::from_scale_rotation_translation(Vec3::splat(0.03),glam::Quat::IDENTITY,Vec3::new((index%32) as f32*0.06-0.93,(index/32) as f32*0.11-0.825,0.)),material:RenderMaterial { unlit:true,double_sided:true,base_color:[0.1+(index%7) as f32*0.12,0.1+(index%5) as f32*0.15,0.9,1.],base_color_texture:if index<256 { "a".into() } else { "b".into() },..Default::default() }.into(),cast_shadows:false,receive_shadows:false }).collect::<Vec<_>>();
    let target = renderer.create_offscreen_target(PhysicalSize::new(128,128));
    let camera = FrameCamera { view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::Z }; let mut lighting = FrameLighting::default(); lighting.environment.background_enabled = false; lighting.environment.tone_mapping = false;
    let capture = |renderer: &mut Renderer| {
        for _ in 0..3 { renderer.submit_frame_to(&RenderFrame { clear:ClearColor { r:0.,g:0.,b:0.,a:1. },camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&[] },RenderTarget::Offscreen(&target)).unwrap(); }
        renderer.read_offscreen_rgba8(&target).unwrap()
    };
    let cached = capture(&mut renderer); let profile = renderer.submission_profile();
    if renderer.indexed_objects { assert!(profile.world_mesh_draw_calls<objects.len()); assert!(profile.world_instanced_objects>0); assert!(profile.world_bundle_hits>0); }
    renderer.disable_world_instancing = true; renderer.disable_world_bundles = true; assert_eq!(capture(&mut renderer),cached);
    renderer.upload_material_texture_rgba8("b",4,4,&[0,0,255,255].repeat(16),true).unwrap();
    assert!(!Arc::ptr_eq(&renderer.material_color_textures["a"],&renderer.material_color_textures["b"]));
    renderer.disable_world_instancing = false; renderer.disable_world_bundles = false; let changed = capture(&mut renderer); assert_ne!(changed,cached);
    renderer.disable_world_instancing = true; renderer.disable_world_bundles = true; assert_eq!(capture(&mut renderer),changed);
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
    println!("SHARED_ALIAS_PIXELS objects=512 draws={} instanced={} bundleHits={}",profile.world_mesh_draw_calls,profile.world_instanced_objects,profile.world_bundle_hits);
}
