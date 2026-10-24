// Author: MiYu. Compare bounded parallel source validation against sequential metadata checks.
use super::*;
use super::tests::PoseFixture;

#[test]
fn polling_preserves_pixels_buffer_refresh_failures_and_recovery_across_views() {
    let fixture=PoseFixture::new();let original=std::fs::read(fixture.0.join("pose.gltf")).unwrap();
    for index in 0..64 {let mut doc:serde_json::Value=serde_json::from_slice(&original).unwrap();if index%2==1 {doc["images"]=serde_json::json!([{"uri":"render-only-missing.png"}]);}std::fs::write(fixture.0.join(format!("pose{index}.gltf")),doc.to_string()).unwrap();}
    let objects=(0..64).map(|index|RenderObject {mesh_key:format!("pose{index}.gltf#pose=0:0@30"),model:glam::Mat4::from_translation(Vec3::new((index%8) as f32*0.1,(index/8) as f32*0.1,0.)),material:mengine_rhi::RenderMaterial {unlit:true,..Default::default()}.into(),cast_shadows:false,receive_shadows:false}).collect::<Vec<_>>();
    let camera=FrameCamera {view:glam::Mat4::IDENTITY,proj:glam::Mat4::IDENTITY,position:Vec3::Z};
    let mut renderer=pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(64,64))).unwrap();
    let target=renderer.create_offscreen_target(winit::dpi::PhysicalSize::new(64,64));
    let mut previous=RuntimeMeshCache::new(Some(fixture.0.clone()));previous.sequential_source_checks=true;let mut current=RuntimeMeshCache::new(Some(fixture.0.clone()));
    for phase in 0..9 {
        match phase {3=>fixture.buffer(2.,true),4=>std::fs::remove_file(fixture.0.join("pose3.gltf")).unwrap(),5=>std::fs::write(fixture.0.join("pose3.gltf"),&original).unwrap(),6=>std::fs::remove_file(fixture.0.join("pose.bin")).unwrap(),7=>fixture.buffer(0.,false),_=>()}
        let nonpoll=phase==2 || phase==8;let mut output=Vec::new();
        for cache in [&mut previous,&mut current] {
            cache.last_poll=if nonpoll {Some(Instant::now())}else {None};
            let clear=mengine_rhi::ClearColor {r:0.,g:0.,b:0.,a:1.};
            let mut frame=CompiledFrame {profile_stages:vec![],clear,camera,objects:objects[..32].to_vec(),lighting:Default::default(),ui:mengine_rhi::UiBatchPlan::build(vec![]),controls:vec![],texture_failures:vec![],font_failures:vec![],has_authored_camera:true,scene_views:vec![mengine_rhi::SceneTextureFrame {key:"validation-view".into(),size:[32,32],clear,camera,objects:objects[16..].to_vec(),lighting:Default::default()}],view_resources:vec![]};
            if phase==8 {for object in frame.objects.iter_mut().chain(frame.scene_views.iter_mut().flat_map(|view| &mut view.objects)) {object.mesh_key=object.mesh_key.replace(":0@30",":1@30");}}
            let failures=cache.sync_frame(&mut renderer,&mut frame);let profile=cache.sync_profile();
            renderer.submit_frame_to(&frame.render_frame(),mengine_rhi::RenderTarget::Offscreen(&target)).unwrap();
            output.push((failures,renderer.read_offscreen_rgba8(&target).unwrap(),profile));
        }
        assert_eq!(output[0].0,output[1].0,"phase {phase}");assert_eq!(output[0].1,output[1].1,"phase {phase}");assert_eq!(previous.attempted,current.attempted);assert_eq!(previous.poses.keys().collect::<HashSet<_>>(),current.poses.keys().collect::<HashSet<_>>());
        assert_eq!((previous.pose_bytes,previous.uploads,previous.evictions),(current.pose_bytes,current.uploads,current.evictions));
        for (key,(_,source)) in &previous.poses {assert_eq!(source.sample_at_rate(0,0,30).unwrap().positions,current.poses[key].1.sample_at_rate(0,0,30).unwrap().positions);}
        if phase==1 || phase==8 {assert_eq!((output[0].2.source_checks,output[1].2.source_checks),(64,64));}
        if phase==2 {assert_eq!((output[1].2.source_checks,output[1].2.file_checks),(0,0));}
        if phase==0 {assert_eq!(current.poses.values().filter(|(_,source)|matches!(source,CachedPoseSource::Legacy {..})).count(),32);}
    }
    let CachedPoseSource::Shared(source)=&current.poses["pose0.gltf"].1 else {panic!("validated source expected")};let weak=Arc::downgrade(source);drop(current);drop(previous);assert!(weak.upgrade().is_none(),"completed jobs retain no source owners");
}

#[test]
#[ignore = "manual source validation comparison using a preserved map file list"]
fn benchmark_parallel_source_validation() {
    let paths=PathBuf::from(std::env::var_os("MENGINE_METADATA_PATHS").expect("Set MENGINE_METADATA_PATHS"));
    let root=PathBuf::from(std::env::var_os("MENGINE_METADATA_PROJECT").expect("Set MENGINE_METADATA_PROJECT"));
    let sources=std::fs::read_to_string(paths).unwrap().lines().map(|path| {let path=PathBuf::from(path);let source=load_pose_source(&path,&root,&mut MeshSyncProfile::default()).unwrap();(path,source)}).collect::<Vec<_>>();
    assert_eq!(sources.len(),196);assert!(sources.iter().all(|(_,source)|matches!(source,CachedPoseSource::Shared(_))));
    let mut cache=RuntimeMeshCache::new(Some(root.clone()));let mut keys=Vec::new();
    for (path,source) in sources {let asset=path.strip_prefix(&root).unwrap().to_string_lossy().replace('\\',"/");keys.push(format!("{asset}#pose=0:0@30"));cache.poses.insert(asset,(file_stamp(&path),source));}
    let objects=keys.iter().cycle().take(5376).map(|key|RenderObject {mesh_key:key.clone(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false}).collect::<Vec<_>>();
    let mut run=|parallel: bool| {
        cache.profile=MeshSyncProfile::default();cache.sequential_source_checks=!parallel;let mut checks=FrameSourceChecks::default();cache.validate_polled_sources(objects.iter(),&mut checks);
        let mut frame=objects.clone();cache.prepare_billboards(FrameCamera {view:glam::Mat4::IDENTITY,proj:glam::Mat4::IDENTITY,position:Vec3::Z},&mut frame,&mut checks);
        assert_eq!(cache.profile.source_checks,196);(checks.stamps,frame.into_iter().map(|object|object.mesh_key).collect::<Vec<_>>())
    };
    let expected=run(false);assert_eq!(expected.0.len(),196);assert_eq!(run(true),expected);
    let mut samples=[Vec::new(),Vec::new()];
    for sample in 0..11 {
        for mode in [sample%2,1-sample%2] {
            let started=Instant::now();let values=(0..20).map(|_|run(mode==1)).collect::<Vec<_>>();let elapsed=started.elapsed().as_secs_f64()*1000./20.;
            for value in values {assert_eq!(value,expected);}if sample>1 {samples[mode].push(elapsed);}
        }
    }
    for values in &mut samples {values.sort_by(f64::total_cmp);}
    println!("PARALLEL_SOURCE_VALIDATION sources=196 objects=5376 samples=9 iterations=20 sequential_ms={} parallel_ms={}",samples[0][4],samples[1][4]);
}
