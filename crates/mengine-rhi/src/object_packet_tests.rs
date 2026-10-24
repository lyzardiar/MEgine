// Author: MiYu. Preserve exact object-buffer images across sparse writes, resource changes and view layouts.
use super::*;

#[test]
fn packets_preserve_gpu_bytes_sparse_ranges_and_allocation_boundaries() {
    let mut cache=ObjectPacketCache::default();let stride=512;let count=64;
    let mut gpu=vec![99u8;count*stride];let mut values=vec![[1u8;496];count];
    for phase in 0..8 {
        match phase {1=>(),2=>values[3][0]=2,3=>{for index in (0..count).step_by(3) {values[index][0]=3;}},4=>cache.invalidate(),5=>values.truncate(8),6=>values.resize(count,[7u8;496]),7=>values.clear(),_=>()}
        if !cache.begin(values.len()*stride) {assert!(values.is_empty());assert_eq!(cache.capacity(),0);continue;}
        let mut expected=vec![0u8;values.len()*stride];
        for (index,value) in values.iter().enumerate() {cache.update(index*stride,value);expected[index*stride..index*stride+value.len()].copy_from_slice(value);}
        let ranges=cache.ranges().collect::<Vec<_>>();assert!(ranges.len()<=8);
        if phase==1 {assert!(ranges.is_empty());}if phase==2 {assert_eq!(ranges,vec![3*stride..3*stride+496]);}
        for range in ranges {gpu[range.clone()].copy_from_slice(&cache.bytes()[range]);}
        assert_eq!(&gpu[..expected.len()],expected);assert_eq!(cache.bytes(),expected);cache.uploaded();
    }
    assert!(!cache.begin(8*1024*1024+4));assert_eq!(cache.capacity(),0);
    assert!(cache.begin(64));cache.update(0,&[7u8;64]);
    assert!(cache.begin(64));cache.update(0,&[7u8;64]);assert_eq!(cache.ranges().collect::<Vec<_>>(),vec![0..64],"uncommitted packets force a complete upload");
}

#[test]
fn packets_coalesce_aligned_ranges_without_retaining_scene_payloads() {
    let mut cache=ObjectPacketCache::default();assert!(cache.begin(4096));cache.update(0,&[0u8;4096]);cache.uploaded();
    assert!(cache.begin(4096));cache.update(1024,&[1u8;16]);cache.update(1040,&[2u8;16]);cache.update(16,&[3u8;16]);
    assert_eq!(cache.ranges().collect::<Vec<_>>(),vec![16..1056]);cache.uploaded();
    assert!(cache.begin(8*1024*1024));assert!(cache.capacity()<=8*1024*1024);
    assert!(cache.begin(128));assert!(cache.capacity()<=16*1024);
    assert!(!cache.begin(0));assert_eq!(cache.capacity(),0);
}

#[test]
fn packet_gpu_pixels_follow_models_materials_views_and_object_slots() {
    use super::material_submission_tests::binding_test_objects;
    for uniform_reference in [false,true] {
        UNIFORM_OBJECT_REFERENCE.with(|flag|flag.set(uniform_reference));let created=pollster::block_on(Renderer::new_headless(PhysicalSize::new(128,128)));UNIFORM_OBJECT_REFERENCE.with(|flag|flag.set(false));let mut renderer=created.unwrap();
        renderer.device.push_error_scope(wgpu::ErrorFilter::Validation);
        renderer.meshes.insert("alternate-cube".into(),MeshGpu::unit_cube(&renderer.device));
        let mut target=renderer.create_offscreen_target(PhysicalSize::new(128,128));let mut objects=binding_test_objects(512,true);
        for (index,object) in objects.iter_mut().enumerate() {object.model=object.model*Mat4::from_rotation_y(index as f32*0.03)*Mat4::from_scale(Vec3::new(if index%2==0 {-1.}else {1.},0.7,1.3));}
        let mut camera=FrameCamera {view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::Z};let mut lighting=FrameLighting::default();lighting.environment.background_enabled=false;lighting.environment.tone_mapping=false;
        lighting.directional=Some(DirectionalLightData {direction:-Vec3::Z,color:[1.;3],intensity:1.,cast_shadows:true,shadow_strength:1.,shadow_bias:0.001,shadow_normal_bias:0.001,shadow_distance:10.});
        for phase in 0..11 {
            match phase {
                1=>{objects[0].material.base_color=[0.,1.,0.,1.];objects[3].receive_shadows=false;},
                2=>objects[3].model=objects[3].model*Mat4::from_cols(Vec4::X,Vec4::new(0.5,1.,0.2,0.),Vec4::Z,Vec4::W),
                3=>{objects[7].model.w_axis.x=4.;camera.position=-Vec3::Z;objects.reverse();},
                4=>{camera.view=Mat4::from_translation(Vec3::new(0.2,0.,0.));target=renderer.create_offscreen_target(PhysicalSize::new(160,96));},
                5=>objects.extend(objects.clone()),
                6=>{objects.truncate(128);lighting.directional=None;},
                7=>{let vertices=[Vertex {position:[-0.3,-0.3,0.5],normal:[0.3,0.5,0.8],uv:[0.;2]},Vertex {position:[0.3,-0.3,0.5],normal:[0.3,0.5,0.8],uv:[0.;2]},Vertex {position:[0.,0.3,0.5],normal:[0.3,0.5,0.8],uv:[0.;2]}];renderer.upload_gltf_static("alternate-cube",&vertices,&[0,1,2]);},
                8=>objects.clear(),
                9=>objects=binding_test_objects(128,true),
                _=>(),
            }
            let views=if phase==10 {
                let mut child=objects[..16].to_vec();for object in &mut child {object.model.w_axis.x+=0.1;object.material.base_color=[0.9,0.1,0.7,1.];}
                vec![SceneTextureFrame {key:"packet-preview".into(),size:[64,64],clear:ClearColor {r:0.,g:0.,b:0.,a:1.},camera,objects:child,lighting:lighting.clone()}]
            }else {vec![]};
            let mut expected=None;let mut expected_child=None;
            for repeat in [true,false,false] {
                renderer.repeat_object_packets=repeat;
                renderer.submit_frame_to(&RenderFrame {clear:ClearColor {r:0.,g:0.,b:0.,a:1.},camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&views},RenderTarget::Offscreen(&target)).unwrap();
                let pixels=renderer.read_offscreen_rgba8(&target).unwrap();if let Some(expected)=&expected {assert_eq!(&pixels,expected,"phase {phase}, uniform={uniform_reference}");}else {expected=Some(pixels);}
                if !views.is_empty() {let pixels=renderer.read_offscreen_rgba8(&renderer.scene_textures["packet-preview"].target).unwrap();if let Some(expected)=&expected_child {assert_eq!(&pixels,expected);}else {expected_child=Some(pixels);}}
            }
            if objects.is_empty() {assert_eq!(renderer.object_packets.capacity(),0);}
            if views.is_empty() {assert_eq!(renderer.object_packets.ranges().count(),0,"unchanged packets do not upload again");}
        }
        assert!(pollster::block_on(renderer.device.pop_error_scope()).is_none());
        println!("OBJECT_PACKETS_GPU indexed={} phases=11 frames=33 completePixelsEqual=true",renderer.indexed_objects);
    }
}

#[test]
#[ignore = "manual object-buffer packet uploads measured in the production GPU submission stage"]
fn benchmark_object_packets() {
    let mut renderers=[pollster::block_on(Renderer::new_headless(PhysicalSize::new(64,64))).unwrap(),pollster::block_on(Renderer::new_headless(PhysicalSize::new(64,64))).unwrap()];
    renderers[0].repeat_object_packets=true;
    let targets=renderers.each_ref().map(|renderer|renderer.create_offscreen_target(PhysicalSize::new(64,64)));
    let camera=FrameCamera {view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::Z};let mut lighting=FrameLighting::default();lighting.environment.background_enabled=false;lighting.environment.tone_mapping=false;lighting.directional=None;
    let count=5376;let material:SharedRenderMaterial=RenderMaterial {unlit:true,..Default::default()}.into();
    let initial=(0..count).map(|index|RenderObject {mesh_key:"cube".into(),model:Mat4::from_scale_rotation_translation(Vec3::splat(0.015),glam::Quat::from_rotation_y(index as f32*0.01),Vec3::new((index%84) as f32/83.*1.6-0.8,(index/84) as f32/63.*1.6-0.8,0.5)),material:material.clone(),cast_shadows:false,receive_shadows:false}).collect::<Vec<_>>();
    for workload in ["unchanged","64_models","material_only","all_models"] {
        let mut changed=initial.clone();if workload=="64_models" || workload=="all_models" {for object in changed.iter_mut().take(if workload=="64_models" {64}else {count}) {object.model.w_axis.x+=0.002;}}
        if workload=="material_only" {for object in changed.iter_mut().take(64) {object.material.base_color=[0.7,0.2,0.3,1.];object.material.uv_rotation_degrees=30.;}}
        let mut samples=[Vec::new(),Vec::new()];let mut bytes=[0usize;2];
        for run in 0..11 {
            let mut pixels=[Vec::new(),Vec::new()];
            for index in if run%2==0 {[0,1]}else {[1,0]} {
                let renderer=&mut renderers[index];let mut times=0.;let mut uploaded=0;
                for frame in 0..8 {
                    let objects=if frame%2==0 {&initial}else {&changed};
                    renderer.submit_frame_to(&RenderFrame {clear:ClearColor {r:0.,g:0.,b:0.,a:1.},camera,objects,lighting:&lighting,ui:None,scene_views:&[]},RenderTarget::Offscreen(&targets[index])).unwrap();
                    times+=renderer.submission_profile().object_uniform_ms;assert_eq!(renderer.spatial_stats.camera_visible,count);
                    uploaded+=if index==0 {renderer.object_stride as usize*count}else {renderer.object_packets.ranges().map(|range|range.len()).sum::<usize>()};
                    pixels[index].push(renderer.read_offscreen_rgba8(&targets[index]).unwrap());
                }
                if run>1 {samples[index].push(times/8.);}bytes[index]=uploaded/8;
            }
            assert_eq!(pixels[0],pixels[1]);
        }
        for values in &mut samples {values.sort_by(f64::total_cmp);}
        if workload=="unchanged" {assert_eq!(bytes[1],0);}
        println!("OBJECT_PACKETS_BENCH workload={workload} objects={count} frames=8 samples=9 baseline_ms={} cached_ms={} bytes_before={} bytes_after={} retained_bytes={}",samples[0][4],samples[1][4],bytes[0],bytes[1],renderers[1].object_packets.capacity());
    }
}
