// Author: MiYu. Exercise native MPQ/MDX/BLP on the existing GPU renderer; validation captures stay under tmp.
use mengine_assets::{AssetByteCache,WarcraftArchives};
use mengine_editor_host::MountedWarcraftModel;
use mengine_rhi::{look_at,perspective,ClearColor,FrameCamera,FrameLighting,RenderFrame,RenderObject,Renderer,RenderTarget};
use glam::Vec3;
use std::{path::PathBuf,sync::Arc};
use winit::dpi::PhysicalSize;

fn draw(renderer: &mut Renderer, objects: &[RenderObject], camera: FrameCamera, lighting: &FrameLighting, target: &mengine_rhi::OffscreenRenderTarget) -> anyhow::Result<Vec<u8>> {
    renderer.submit_frame_to(&RenderFrame {clear:ClearColor {r:0.02,g:0.03,b:0.04,a:1.},camera,objects,lighting,ui:None,scene_views:&[]},RenderTarget::Offscreen(target))?;
    Ok(renderer.read_offscreen_rgba8(target)?)
}

fn main() -> anyhow::Result<()> {
    let mut args=std::env::args_os().skip(1); let game=PathBuf::from(args.next().ok_or_else(||anyhow::anyhow!("Provide game directory, map path and MDX member"))?);
    let map=PathBuf::from(args.next().ok_or_else(||anyhow::anyhow!("Provide map path"))?); let member=args.next().ok_or_else(||anyhow::anyhow!("Provide MDX member"))?.into_string().map_err(|_|anyhow::anyhow!("Member must be Unicode"))?;
    let output=args.next().map(PathBuf::from).unwrap_or_else(||PathBuf::from("tmp/docs-artifacts/warcraft-archives/native-render")); anyhow::ensure!(args.next().is_none(),"Unexpected argument");
    let cache=Arc::new(AssetByteCache::default()); let archives=WarcraftArchives::open(&game,0,cache.clone(),128*1024*1024)?; let mounts=archives.mount_map(&map)?;
    anyhow::ensure!(MountedWarcraftModel::load(&mounts,&member,0,1).is_err(),"A model must honor its aggregate RGBA texture budget");
    let model=MountedWarcraftModel::load(&mounts,&member,0,128*1024*1024)?; let shared=model.clone(); anyhow::ensure!(Arc::ptr_eq(&model,&shared),"Views must share immutable parsed resources");
    let mut renderer=Renderer::new_shared_headless(PhysicalSize::new(640,480))?; model.upload_textures(&mut renderer)?;
    let eye=Vec3::new(2.4,1.9,3.1); let camera=FrameCamera {view:look_at(eye,Vec3::new(0.,0.55,0.),Vec3::Y),proj:perspective(35.,640./480.,0.05,100.),position:eye};
    let mut lighting=FrameLighting::default(); lighting.environment.background_enabled=false; lighting.environment.tone_mapping=false;
    let target=renderer.create_offscreen_target(PhysicalSize::new(640,480)); let blank=draw(&mut renderer,&[],camera,&lighting,&target)?;
    let sequence=model.model().sequences().iter().position(|s|s.name.eq_ignore_ascii_case("Walk")).or_else(||model.model().sequences().iter().position(|s|s.name.eq_ignore_ascii_case("Stand")));
    let objects=model.upload_pose(&mut renderer,17,sequence,0,None)?; let first=draw(&mut renderer,&objects,camera,&lighting,&target)?;
    let objects=model.upload_pose(&mut renderer,17,sequence,250,None)?; let moved=draw(&mut renderer,&objects,camera,&lighting,&target)?;
    let visible=first.chunks_exact(4).zip(blank.chunks_exact(4)).filter(|(a,b)|a!=b).count(); let changed=first.chunks_exact(4).zip(moved.chunks_exact(4)).filter(|(a,b)|a!=b).count();
    anyhow::ensure!(visible>100,"Native model did not produce sufficient visible GPU pixels"); anyhow::ensure!(changed>10,"Native animation did not change GPU pixels");
    let other_objects=model.upload_pose(&mut renderer,18,sequence,0,None)?; let other_pixels=draw(&mut renderer,&other_objects,camera,&lighting,&target)?; anyhow::ensure!(other_pixels==first,"A second instance slot must retain the same pose");
    let stats=renderer.material_texture_stats(); model.release_pose(&mut renderer,17); let cleared=draw(&mut renderer,&objects,camera,&lighting,&target)?; anyhow::ensure!(cleared==blank,"Released mesh keys must no longer draw even through the old object list");
    anyhow::ensure!(draw(&mut renderer,&other_objects,camera,&lighting,&target)?==first,"Releasing one slot must retain another instance"); model.release_pose(&mut renderer,18); anyhow::ensure!(draw(&mut renderer,&other_objects,camera,&lighting,&target)?==blank,"The last released slot must also stop drawing");
    let second=archives.mount_map(&map)?; let common_reused=mounts.read(&member)?; let remounted=second.read(&member)?; let shared_raw=Arc::ptr_eq(&common_reused.bytes,&remounted.bytes);
    std::fs::create_dir_all(&output)?; image::save_buffer(output.join("pose0.png"),&first,640,480,image::ColorType::Rgba8)?; image::save_buffer(output.join("pose250.png"),&moved,640,480,image::ColorType::Rgba8)?;
    let report=serde_json::json!({"scope":"One native archive model through Rust GPU rendering. Not complete map, original Warcraft visual equivalence or FPS acceptance.","model":model.model().name(),"member":member,"source":format!("{:?}",model.location()),"nodes":model.model().node_count(),"geosets":model.model().geoset_count(),"objects":objects.len(),"visiblePixels":visible,"animatedPixels":changed,"rgbaTextureBytes":model.decoded_texture_bytes(),"rendererColorTextures":stats.color,"sharedRawAfterRemount":shared_raw,"slotReleased":true,"diagnostics":model.model().diagnostics(),"output":output});
    std::fs::write(output.join("receipt.json"),serde_json::to_vec_pretty(&report)?)?; println!("{report}"); Ok(())
}
