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
