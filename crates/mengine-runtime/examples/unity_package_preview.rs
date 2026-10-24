// Author: MiYu. Reproducible native GPU capture of an imported prefab without an editor window.
use std::{path::PathBuf, sync::Arc};
use glam::{Vec3, Vec4};
use mengine_core::{TransformHierarchy, World, generated::ParticleEmitter3D};
use mengine_rhi::{Renderer, RenderFrame, RenderTarget, FrameCamera, FrameLighting, ClearColor, look_at, perspective};
use mengine_runtime::{imported_particle_world::ImportedParticleWorld, prefabs::instantiate_project_prefab, textures::RuntimeTextureCache};
use serde_json::json;
use winit::dpi::PhysicalSize;

fn main() -> anyhow::Result<()> {
    env_logger::init();
    let args:Vec<_>=std::env::args().collect();
    anyhow::ensure!(args.len()>=4,"usage: unity_package_preview PROJECT PREFAB OUTPUT [UNITY_REFERENCE_MANIFEST]");
    let root=PathBuf::from(&args[1]).canonicalize()?;let output=PathBuf::from(&args[3]);std::fs::create_dir_all(&output)?;
    let reference:Option<serde_json::Value>=args.get(4).map(|p|std::fs::read_to_string(p).map(|s|serde_json::from_str(&s))).transpose()?.transpose()?;
    let mut world=World::new();instantiate_project_prefab(Some(&root),&args[2],None,&mut world)?;
    let hierarchy=TransformHierarchy::build(&world);
    let mut particles=ImportedParticleWorld::default();let mut textures=RuntimeTextureCache::new(Some(root.clone()));
    let mut renderer=pollster::block_on(Renderer::new_headless(PhysicalSize::new(960,720)))?;
    let target=renderer.create_offscreen_target(PhysicalSize::new(960,720));
    let position=Vec3::new(8.,6.,-10.);let camera=FrameCamera {view:look_at(position,Vec3::new(0.,0.5,0.),Vec3::Y),proj:perspective(45.,960./720.,0.1,100.),position};
    let mut lighting=FrameLighting::default();lighting.environment.background_enabled=false;lighting.environment.tone_mapping=false;lighting.environment.exposure=0.;
    let clear=ClearColor::from(Vec4::new(0.035,0.045,0.06,1.));let mut reports=Vec::new();
    for (index,seconds) in [0.1,0.3,0.6,1.0,1.5,3.0].into_iter().enumerate() {
        for entity in world.entities_with_components(&["ParticleEmitter3D"]) {particles.seek_entity(entity,seconds);}
        let mut objects=particles.collect(&world,&hierarchy,camera,0.,Some(&root));
        anyhow::ensure!(particles.diagnostics().is_empty(),"particle load failures: {:?}",particles.diagnostics());
        let shader_time=reference.as_ref().and_then(|v|v.pointer(&format!("/data/result/frames/{index}/shaderTime"))).and_then(|v|v.as_f64()).unwrap_or(seconds as f64) as f32;
        for object in &mut objects {if let Some(data)=object.material.particle.as_mut(){Arc::make_mut(data).seconds=shader_time;}}
        let failures=textures.sync_materials(&mut renderer,&objects);anyhow::ensure!(failures.is_empty(),"texture errors: {failures:?}");
        renderer.submit_frame_to(&RenderFrame {clear,camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&[]},RenderTarget::Offscreen(&target))?;
        let (pixels,_)=renderer.read_offscreen_rgba8_profiled(&target)?;
        let file=output.join(format!("frame-{seconds:.1}.png"));image::save_buffer(&file,&pixels,960,720,image::ColorType::Rgba8)?;
        reports.push(json!({"time":seconds,"shaderTime":shader_time,"draws":objects.len(),"path":file}));
    }
    let report=json!({"frames":reports,"entities":world.iter_entities().count(),"emitters":world.entities_with_components(&["ParticleEmitter3D"]).filter(|e|world.get_component::<ParticleEmitter3D>(*e).is_some()).count(),"status":"rendered; visual comparison is separate"});
    std::fs::write(output.join("manifest.json"),serde_json::to_string_pretty(&report)?)?;println!("{report}");Ok(())
}
