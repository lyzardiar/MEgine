// Author: MiYu. Release expired Scene picking geometries without accepting late publishers or clearing newer frames.
use super::*;

fn owner(window: &str, generation: u64) -> Owner { Owner {project:"project-a".into(),window:window.into(),generation} }
fn empty() -> MeshPickFrame { MeshPickFrame {camera:mengine_rhi::FrameCamera {view:Default::default(),proj:Default::default(),position:Default::default()},objects:vec![]} }

#[test]
fn retirement_releases_idle_frames_preserves_live_readers_and_new_geometry() {
    let mut renderer=pollster::block_on(mengine_rhi::Renderer::new_headless((32,32).into())).unwrap();renderer.enable_mesh_picking();let target=renderer.create_offscreen_target((32,32).into());
    let vertices=[mengine_rhi::Vertex {position:[-0.4,-0.4,0.5],normal:[0.,0.,1.],uv:[0.;2]},mengine_rhi::Vertex {position:[0.4,-0.4,0.5],normal:[0.,0.,1.],uv:[0.;2]},mengine_rhi::Vertex {position:[0.,0.4,0.5],normal:[0.,0.,1.],uv:[0.;2]}];
    let camera=empty().camera;
    let object=mengine_rhi::RenderObject {mesh_key:"retained-pick".into(),model:Default::default(),material:mengine_rhi::RenderMaterial {double_sided:true,unlit:true,..Default::default()}.into(),cast_shadows:false,receive_shadows:false};
    let capture=|renderer:&mut mengine_rhi::Renderer,entity| {
        renderer.upload_gltf_static("retained-pick",&vertices,&[0,1,2]);renderer.submit_frame_to(&mengine_rhi::RenderFrame {clear:mengine_rhi::ClearColor {r:0.,g:0.,b:0.,a:1.},camera,objects:std::slice::from_ref(&object),lighting:&Default::default(),ui:None,scene_views:&[]},mengine_rhi::RenderTarget::Offscreen(&target)).unwrap();
        let frame=renderer.capture_mesh_pick_frame(camera,std::slice::from_ref(&object),&[entity]).unwrap();assert_eq!(frame.pick([0.5,0.5],|_|true).unwrap().entity,entity);renderer.remove_mesh("retained-pick");frame
    };
    let mut frames=Frames::default();let old=owner("main",1);let frame=capture(&mut renderer,73);let weak_geometry=Arc::downgrade(&frame.objects[0].geometry);
    let token=frames.insert(old.clone(),frame).unwrap();let reader=frames.get(&old,&token).unwrap();let weak_frame=Arc::downgrade(&reader);let before=frames.bytes;assert!(before>0);
    frames.retire_before(2);assert_eq!(frames.bytes,0);assert!(frames.get(&old,&token).is_none());assert!(weak_geometry.upgrade().is_some());assert_eq!(reader.pick([0.5,0.5],|_|true).unwrap().entity,73);
    drop(reader);assert!(weak_geometry.upgrade().is_none());assert!(weak_frame.upgrade().is_none());
    let new=owner("main",2);let frame=capture(&mut renderer,91);let weak_geometry=Arc::downgrade(&frame.objects[0].geometry);let token=frames.insert(new.clone(),frame).unwrap();
    frames.retire_before(1);assert!(frames.insert(old,empty()).is_none());assert_eq!(frames.get(&new,&token).unwrap().pick([0.5,0.5],|_|true).unwrap().entity,91);
    frames.retire_before(3);assert!(weak_geometry.upgrade().is_none());assert_eq!(frames.bytes,0);
    println!("PICK_FRAME_RETIRE retained_bytes={before} retired_bytes=0 old_reader_stable=true restarted_entity=91");
}

#[test]
fn late_publish_and_late_stop_preserve_all_current_windows() {
    let frames=Arc::new(Mutex::new(Frames::default()));let old=owner("main",1);
    for window in ["main","detached","preview"] {frames.lock().insert(owner(window,1),empty()).unwrap();}
    let (ready,started)=std::sync::mpsc::channel();let (release,resume)=std::sync::mpsc::channel();let pending=frames.clone();
    let worker=std::thread::spawn(move || {ready.send(()).unwrap();resume.recv_timeout(std::time::Duration::from_secs(5)).unwrap();pending.lock().insert(old,empty())});
    started.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
    let current={let mut frames=frames.lock();frames.retire_before(2);assert_eq!(frames.bytes,0);["main","detached","preview"].map(|window| {let owner=owner(window,2);let token=frames.insert(owner.clone(),empty()).unwrap();(owner,token)})};
    release.send(()).unwrap();assert!(worker.join().unwrap().is_none());let mut frames=frames.lock();frames.retire_before(1);
    for (owner,token) in current {assert!(frames.get(&owner,&token).is_some());}assert_eq!(frames.entries.len(),3);assert_eq!(frames.generation,2);
    frames.retire_before(3);assert!(frames.entries.is_empty());assert_eq!(frames.bytes,0);
}
