// Author: MiYu. Check explicit RGBA factors, pipeline identity and depth controls required by mounted classic models.
use super::*;
use MaterialBlendFactor::{Zero,One,SourceAlpha,OneMinusSourceAlpha,SourceColor,DestinationColor};

#[test]
fn native_warcraft_material_state_cpu_explicit_rgba_factors_do_not_alias_coverage_blends() {
    let states=[(SourceAlpha,OneMinusSourceAlpha,wgpu::BlendFactor::SrcAlpha,wgpu::BlendFactor::OneMinusSrcAlpha),(SourceAlpha,One,wgpu::BlendFactor::SrcAlpha,wgpu::BlendFactor::One),(Zero,SourceColor,wgpu::BlendFactor::Zero,wgpu::BlendFactor::Src),(DestinationColor,SourceColor,wgpu::BlendFactor::Dst,wgpu::BlendFactor::Src),(One,One,wgpu::BlendFactor::One,wgpu::BlendFactor::One)];
    let mut keys=HashSet::new();
    for (source,destination,src_factor,dst_factor) in states {let material=RenderMaterial {transparent:true,blend_mode:MaterialBlendMode::Explicit {source,destination},..Default::default()}; let key=MaterialPipelineKey::from(&material); let state=material_blend_state(key.blend); let expected=wgpu::BlendComponent {src_factor,dst_factor,operation:wgpu::BlendOperation::Add}; assert_eq!(state.color,expected); assert_eq!(state.alpha,expected); assert!(keys.insert(key));
        let object=RenderObject {mesh_key:"explicit".into(),model:Mat4::IDENTITY,material:material.into(),cast_shadows:false,receive_shadows:false}; assert_eq!(make_object_uniforms(&object).map_params[3],0.);
    }
    for mode in [MaterialBlendMode::Alpha,MaterialBlendMode::Additive,MaterialBlendMode::Multiply] {let material=RenderMaterial {transparent:true,blend_mode:mode,..Default::default()}; assert!(!keys.contains(&MaterialPipelineKey::from(&material)),"legacy coverage-alpha policy must keep a separate key");}
}

#[test]
fn native_warcraft_material_state_cpu_depth_controls_preserve_disabled_writes_on_opaque_objects() {
    let default=RenderMaterial::default(); let base=MaterialPipelineKey::from(&default); assert!(base.depth_test && base.depth_write);
    let readonly=MaterialPipelineKey::from(&RenderMaterial {depth_write:false,..default.clone()}); assert!(readonly.depth_test); assert!(!readonly.depth_write); assert_ne!(base,readonly);
    for depth_equal in [false,true] {let disabled=MaterialPipelineKey::from(&RenderMaterial {depth_test:false,depth_write:true,depth_equal,..default.clone()}); assert!(!disabled.depth_test && !disabled.depth_write); assert_ne!(disabled,readonly); assert!(!error_material_pipeline_key(disabled).depth_test); assert_eq!(error_material_pipeline_key(disabled).depth_equal,depth_equal);}
}

#[test]
fn native_warcraft_material_state_cpu_legacy_alpha_and_multiply_keep_existing_factors() {
    let alpha=material_blend_state(MaterialPipelineBlend::Alpha); assert_eq!(alpha,wgpu::BlendState::ALPHA_BLENDING);
    let additive=material_blend_state(MaterialPipelineBlend::Additive); assert_eq!(additive.color.src_factor,wgpu::BlendFactor::SrcAlpha); assert_eq!(additive.alpha.src_factor,wgpu::BlendFactor::One);
    let multiply=material_blend_state(MaterialPipelineBlend::Multiply); assert_eq!(multiply.color.dst_factor,wgpu::BlendFactor::Zero); assert_eq!(multiply.alpha.dst_factor,wgpu::BlendFactor::OneMinusSrcAlpha);
}

fn gpu_setup()->(Renderer,OffscreenRenderTarget,FrameCamera,FrameLighting) {
    let mut renderer=Renderer::new_shared_headless(PhysicalSize::new(32,32)).unwrap(); renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
    let vertices=[[-0.8,-0.8,0.5],[0.8,-0.8,0.5],[-0.8,0.8,0.5],[0.8,0.8,0.5]].map(|position|Vertex {position,normal:[0.,0.,1.],uv:[0.5,0.5]}); renderer.upload_gltf_static_profiled("native-state",&vertices,&[0,1,2,2,1,3]);
    let target=renderer.create_offscreen_target(PhysicalSize::new(32,32)); let camera=FrameCamera {view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::Z}; let mut lighting=FrameLighting::default(); lighting.environment.background_enabled=false; lighting.environment.tone_mapping=false; (renderer,target,camera,lighting)
}
fn object(material:RenderMaterial,z:f32)->RenderObject {RenderObject {mesh_key:"native-state".into(),model:Mat4::from_translation(Vec3::new(0.,0.,z)),material:material.into(),cast_shadows:false,receive_shadows:false}}
fn draw(renderer:&mut Renderer,target:&OffscreenRenderTarget,camera:FrameCamera,lighting:&FrameLighting,objects:&[RenderObject],clear:ClearColor)->[u8;4] {
    renderer.submit_frame_to(&RenderFrame {clear,camera,objects,lighting,ui:None,scene_views:&[]},RenderTarget::Offscreen(target)).unwrap(); let pixels=renderer.read_offscreen_rgba8(target).unwrap(); pixels[(16*32+16)*4..(16*32+16)*4+4].try_into().unwrap()
}
fn encoded(c:f32)->u8 {let c=c.clamp(0.,1.); ((if c<=0.0031308 {c*12.92} else {1.055*c.powf(1./2.4)-0.055})*255.).round() as u8}

#[test]
fn native_warcraft_material_state_gpu_rgba_blends_match_independent_formulas() {
    let (mut renderer,target,camera,lighting)=gpu_setup(); let source=[0.2f32,0.3,0.4,0.4]; let destination=[0.3f32,0.2,0.1,0.3]; let clear=ClearColor {r:destination[0] as f64,g:destination[1] as f64,b:destination[2] as f64,a:destination[3] as f64};
    let states=[(SourceAlpha,OneMinusSourceAlpha),(SourceAlpha,One),(Zero,SourceColor),(DestinationColor,SourceColor),(One,One)];
    for (index,(source_factor,destination_factor)) in states.into_iter().enumerate() {
        let material=RenderMaterial {unlit:true,double_sided:true,transparent:true,depth_write:false,base_color:source,blend_mode:MaterialBlendMode::Explicit {source:source_factor,destination:destination_factor},..Default::default()}; let pixel=draw(&mut renderer,&target,camera,&lighting,&[object(material,0.)],clear);
        for channel in 0..4 {let (s,d)=(source[channel],destination[channel]); let expected=match index {0=>s*source[3]+d*(1.-source[3]),1=>s*source[3]+d,2=>s*d,3=>2.*s*d,_=>s+d}; let expected=if channel==3 {(expected.clamp(0.,1.)*255.).round() as u8} else {encoded(expected)}; assert!(pixel[channel].abs_diff(expected)<=2,"blend {index} channel {channel}: {} != {expected}",pixel[channel]);} println!("native RGBA state {index}: {pixel:?}");
    }
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}

#[test]
fn native_warcraft_material_state_gpu_depth_disable_and_readonly_are_observable() {
    let (mut renderer,target,camera,lighting)=gpu_setup(); let clear=ClearColor {r:0.,g:0.,b:0.,a:1.}; let material=|color|RenderMaterial {unlit:true,double_sided:true,base_color:color,..Default::default()};
    let foreground=object(material([0.,1.,0.,1.]),-0.2); let mut behind=material([1.,0.,0.,1.]); behind.render_queue=2001;
    let occluded=draw(&mut renderer,&target,camera,&lighting,&[foreground.clone(),object(behind.clone(),0.2)],clear); assert!(occluded[1]>250 && occluded[0]<2);
    behind.depth_test=false; let through=draw(&mut renderer,&target,camera,&lighting,&[foreground.clone(),object(behind.clone(),0.2)],clear); assert!(through[0]>250 && through[1]<2);
    let mut readonly=material([0.,1.,0.,1.]); readonly.depth_write=false; behind.depth_test=true; let unwritten=draw(&mut renderer,&target,camera,&lighting,&[object(readonly,-0.2),object(behind,0.2)],clear); assert!(unwritten[0]>250 && unwritten[1]<2);
    let mut untested=material([1.,0.,0.,1.]); untested.depth_test=false; let mut later=material([0.,0.,1.,1.]); later.render_queue=2002; let no_accidental_write=draw(&mut renderer,&target,camera,&lighting,&[foreground,object(untested,-0.3),object(later,-0.25)],clear); assert!(no_accidental_write[2]>250 && no_accidental_write[0]<2,"disabled depth testing cannot write a hidden depth value");
    assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
}
