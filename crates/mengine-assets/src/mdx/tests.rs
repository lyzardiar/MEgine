// Author: MiYu. Native MDX boundary and pose regression fixtures are built from small authored records.
use super::*;

fn word(value: u32) -> Vec<u8> {value.to_le_bytes().to_vec()}
fn floats(values: &[f32]) -> Vec<u8> {values.iter().flat_map(|n|n.to_le_bytes()).collect()}
fn fixed(value: &str, len: usize) -> Vec<u8> {let mut out=vec![0;len]; out[..value.len()].copy_from_slice(value.as_bytes()); out}
fn chunk(tag: &[u8;4], body: &[u8]) -> Vec<u8> {[tag.as_slice(),&word(body.len() as u32),body].concat()}
fn record(body: &[u8]) -> Vec<u8> {[&word(body.len() as u32+4),body].concat()}
fn array(tag: &[u8;4], count: usize, bytes: &[u8]) -> Vec<u8> {[tag.as_slice(),&word(count as u32),bytes].concat()}
fn sequence(name: &str, start: u32, end: u32, flags: u32) -> Vec<u8> {[fixed(name,80),word(start),word(end),floats(&[0.]),word(flags),vec![0;36]].concat()}
fn translation(mode: u32, global: i32, keys: &[(u32,[f32;3])]) -> Vec<u8> {
    let mut body=[word(keys.len() as u32),word(mode),word(global as u32)].concat(); for (time,value) in keys {body.extend(word(*time)); body.extend(floats(value)); if mode>1 {body.extend(floats(&[0.,0.,0.])); body.extend(floats(&[0.,0.,0.]));}} [b"KGTR".as_slice(),&body].concat()
}
fn node(id: u32, parent: i32, flags: u32, tracks: &[u8]) -> Vec<u8> {record(&[fixed("node",80),word(id),word(parent as u32),word(flags),tracks.to_vec()].concat())}
fn bone(id: u32, parent: i32, tracks: &[u8]) -> Vec<u8> {[node(id,parent,0x100,tracks),word(u32::MAX),word(u32::MAX)].concat()}
fn geometry(groups: &[u32], material: u32, uv_sets: usize) -> Vec<u8> {
    let positions=floats(&[128.,0.,0.,0.,128.,0.,0.,0.,128.]); let normals=floats(&[0.,0.,1.].repeat(3)); let group_size=word(groups.len() as u32);
    let mut body=[array(b"VRTX",3,&positions),array(b"NRMS",3,&normals),array(b"PTYP",1,&word(4)),array(b"PCNT",1,&word(3)),array(b"PVTX",3,&[0,0,1,0,2,0]),array(b"GNDX",if groups.is_empty() {0} else {3},if groups.is_empty() {&[]} else {&[0,0,0]}),array(b"MTGC",if groups.is_empty() {0} else {1},if groups.is_empty() {&[]} else {&group_size}),array(b"MATS",groups.len(),&groups.iter().flat_map(|n|n.to_le_bytes()).collect::<Vec<_>>()),word(material),vec![0;8+28],word(0),b"UVAS".to_vec(),word(uv_sets as u32)].concat();
    for _ in 0..uv_sets {body.extend(array(b"UVBS",3,&floats(&[0.,0.,1.,0.,0.,1.])));} record(&body)
}
fn material(layers: usize, coord: u32, extra_track: &[u8]) -> Vec<u8> {
    let layer=record(&[word(0),word(0),word(0),word(u32::MAX),word(coord),floats(&[1.]),extra_track.to_vec()].concat());
    record(&[word(0),word(0),b"LAYS".to_vec(),word(layers as u32),layer.repeat(layers)].concat())
}
fn model_with(nodes: &[u8], geosets: &[u8], layers: &[u8], seqs: &[u8], extras: &[u8]) -> Vec<u8> {
    [b"MDLX".to_vec(),chunk(b"VERS",&word(800)),chunk(b"SEQS",seqs),chunk(b"TEXS",&[word(0),fixed("Textures/fixture.blp",260),word(0)].concat()),chunk(b"MTLS",layers),chunk(b"GEOS",geosets),chunk(b"BONE",nodes),extras.to_vec()].concat()
}
pub(crate) fn fixture() -> Vec<u8> {model_with(&bone(0,-1,&translation(1,-1,&[(0,[0.;3]),(1000,[128.,0.,0.])])),&geometry(&[0],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&[])}
fn parse(bytes: &[u8]) -> MdxModel {MdxModel::parse(bytes).unwrap()}
fn first_x(model: &MdxModel, time: u64) -> f32 {model.sample(Some(0),time,None).unwrap().geosets[0].mesh.positions[0][0]}
fn offset(bytes: &[u8], tag: &[u8;4]) -> usize {bytes.windows(4).position(|v|v==tag).unwrap()}

#[test]
fn native_mdx_rejects_empty_or_unbounded_sources() {
    assert!(MdxModel::parse(b"MDLX").is_err()); assert!(MdxModel::parse(b"MDL ").is_err());
    assert!(MdxModel::parse_with_limits(b"MDLX",MdxReadLimits {max_input_bytes:3,..Default::default()}).is_err());
}

#[test]
fn native_mdx_static_consumer_detects_node_material_and_uv_tracks() {
    let mut model=parse(&model_with(&bone(0,-1,&[]),&geometry(&[0],0,1),&material(1,0,&[]),&[],&[])); assert!(!model.requires_dynamic_pose()); assert!(parse(&fixture()).requires_dynamic_pose());
    let track=Track {interpolation:0,global:-1,keys:vec![Key {time:0,value:Vec4::ONE,incoming:Vec4::ZERO,outgoing:Vec4::ZERO}],collapse_outside:false};
    for mode in 0..11 {let mut model=parse(&model_with(&bone(0,-1,&[]),&geometry(&[0],0,1),&material(1,0,&[]),&[],&[])); match mode {0=>model.nodes[0].translation=Some(track.clone()),1=>model.nodes[0].rotation=Some(track.clone()),2=>model.nodes[0].scale=Some(track.clone()),3=>model.materials[0].layers[0].alpha_track=Some(track.clone()),4=>model.materials[0].layers[0].texture_track=Some(track.clone()),5=>model.texture_animations.push(TextureAnimation {translation:Some(track.clone()),rotation:None,scale:None}),6=>model.geoset_animations.push(GeosetAnimation {geoset:0,alpha:1.,color:Vec3::ONE,alpha_track:Some(track.clone()),color_track:None}),7=>model.geoset_animations.push(GeosetAnimation {geoset:0,alpha:1.,color:Vec3::ONE,alpha_track:None,color_track:Some(track.clone())}),8=>model.nodes[0].flags|=0x8,9=>model.texture_animations.push(TextureAnimation {translation:None,rotation:Some(track.clone()),scale:None}),10=>model.texture_animations.push(TextureAnimation {translation:None,rotation:None,scale:Some(track.clone())}),_=>unreachable!()} assert!(model.requires_dynamic_pose());}
    model.nodes[0].translation=Some(Track {keys:vec![],..track}); assert!(!model.requires_dynamic_pose());
}

#[test]
fn native_mdx_source_tracks_loop_clamp_axes_and_equal_matrix_groups() {
    let model=parse(&fixture()); assert!((first_x(&model,500)-1.5).abs()<1e-6); assert!((first_x(&model,1500)-1.5).abs()<1e-6);
    let pose=model.sample(Some(0),500,None).unwrap(); assert_eq!(pose.geosets[0].mesh.positions[1],[0.5,0.,-1.]); assert_eq!(pose.geosets[0].mesh.normals[0],[0.,1.,0.]);
    let raw=model_with(&[bone(2,0,&[]),bone(0,-1,&translation(1,-1,&[(0,[0.;3]),(1000,[128.,0.,0.])]))].concat(),&geometry(&[0,2],0,1),&material(1,0,&[]),&sequence("Death",0,1000,1),&[]);
    let model=parse(&raw); assert_eq!(model.order,[1,0]); assert!((first_x(&model,1500)-2.).abs()<1e-6);
}

#[test]
fn native_mdx_global_tracks_use_unwrapped_wall_and_zero_period() {
    for (period,expected) in [(2000,2.),(0,1.)] {
        let raw=model_with(&bone(0,-1,&translation(1,0,&[(0,[0.;3]),(1000,[128.,0.,0.])])),&geometry(&[0],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&chunk(b"GLBS",&word(period)));
        assert!((first_x(&parse(&raw),1250)-expected).abs()<1e-6);
    }
}

#[test]
fn native_mdx_step_cubic_and_duplicate_times_keep_source_values() {
    for (mode,expected) in [(0,1.),(1,1.5),(2,1.5),(3,1.125)] {
        let raw=model_with(&bone(0,-1,&translation(mode,-1,&[(0,[0.;3]),(1000,[128.,0.,0.])])),&geometry(&[0],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&[]);
        assert!((first_x(&parse(&raw),500)-expected).abs()<1e-6,"mode={mode}");
    }
    let raw=model_with(&bone(0,-1,&translation(1,-1,&[(0,[0.;3]),(500,[64.,0.,0.]),(500,[128.,0.,0.]),(1000,[128.,0.,0.])])),&geometry(&[0],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&[]);
    assert!((first_x(&parse(&raw),500)-2.).abs()<1e-6);
}

#[test]
fn native_mdx_quaternions_rotate_about_original_pivot() {
    let track=[b"KGRT".to_vec(),word(2),word(1),word(u32::MAX),word(0),floats(&[0.,0.,0.,1.]),word(1000),floats(&[0.,0.,1.,0.])].concat();
    let raw=model_with(&bone(0,-1,&track),&geometry(&[0],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&chunk(b"PIVT",&floats(&[128.,0.,0.])));
    let model=parse(&raw); let pose=model.sample(Some(0),500,None).unwrap(); let p=Vec3::from_array(pose.geosets[0].mesh.positions[1]); assert!((p-Vec3::new(0.,0.,1.)).length()<1e-5); assert!((Vec3::from_array(pose.geosets[0].mesh.positions[0])-Vec3::X).length()<1e-5);
}

#[test]
fn native_mdx_geoset_color_alpha_and_precompiled_target() {
    let geo=record(&[floats(&[0.25]),word(2),floats(&[0.1,0.2,0.3]),word(0)].concat());
    let raw=model_with(&bone(0,-1,&[]),&geometry(&[0],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&chunk(b"GEOA",&geo)); let model=parse(&raw);
    assert_eq!(model.geosets[0].animation,Some(0)); let pose=model.sample(Some(0),0,None).unwrap(); assert_eq!(pose.geosets[0].alpha,0.25); assert_eq!(pose.geosets[0].color,[0.3,0.2,0.1]);
}

#[test]
fn native_mdx_shared_material_layers_are_evaluated_once_per_pose() {
    let raw=model_with(&[],&geometry(&[],0,0).repeat(64),&material(64,0,&[]),&[],&[]); let model=parse(&raw); let a=model.sample(None,0,None).unwrap(); let b=model.sample(None,0,None).unwrap();
    assert_eq!(a.geosets.len(),64); assert_eq!(a.geosets[0].layers.len(),64); assert!(a.geosets.iter().all(|g|Arc::ptr_eq(&g.layers,&a.geosets[0].layers))); assert!(!Arc::ptr_eq(&a.geosets[0].layers,&b.geosets[0].layers));
    let mut limited=parse(&fixture()); limited.max_pose_bytes=1; assert!(limited.sample(Some(0),0,None).is_err());
}

#[test]
fn native_mdx_collapsed_scale_eligibility_is_compiled_once() {
    let scale=[b"KGSC".to_vec(),word(2),word(1),word(u32::MAX),word(0),floats(&[0.,0.,0.]),word(1000),floats(&[0.,0.,0.])].concat();
    let seqs=[sequence("Birth",0,1000,1),sequence("Stand",2000,3000,0)].concat(); let raw=model_with(&bone(0,-1,&scale),&geometry(&[0],0,1),&material(1,0,&[]),&seqs,&[]); let model=parse(&raw);
    assert!(model.nodes[0].scale.as_ref().unwrap().collapse_outside); assert!(model.sample(Some(1),0,None).unwrap().geosets[0].mesh.positions.iter().all(|p|*p==[0.;3]));
}

#[test]
fn native_mdx_uv_references_and_texture_animation_are_preserved() {
    let bad=model_with(&[],&geometry(&[],0,0),&material(1,1,&[]),&[],&[]); assert!(MdxModel::parse(&bad).is_err());
    let raw=model_with(&[],&geometry(&[],0,2),&material(1,1,&[]),&[],&[]); let model=parse(&raw); let pose=model.sample(None,0,None).unwrap(); assert_eq!(pose.geosets[0].layers[0].uv_set,1); assert_eq!(model.geoset_uvs(0,1).unwrap().len(),3);
    let mut raw=fixture(); let at=offset(&raw,b"LAYS")+8+16; raw[at..at+4].copy_from_slice(&0u32.to_le_bytes());
    let uv=[b"KTAT".to_vec(),word(1),word(0),word(u32::MAX),word(0),floats(&[0.25,0.5,0.])].concat(); raw.extend(chunk(b"TXAN",&record(&uv))); let model=parse(&raw);
    assert_eq!(model.sample(Some(0),0,None).unwrap().geosets[0].layers[0].uv,[1.,0.,0.,1.,0.25,0.5]);
}

#[test]
fn native_mdx_bare_event_and_collision_objects_keep_node_boundaries() {
    let events=[node(1,-1,0x400,&[]),b"KEVT".to_vec(),word(1),word(u32::MAX),word(100)].concat(); let collision=[node(2,-1,0x2000,&[]),word(2),floats(&[0.,0.,0.,128.])].concat();
    let raw=model_with(&[],&geometry(&[],0,0),&material(1,0,&[]),&[],&[chunk(b"EVTS",&events),chunk(b"CLID",&collision)].concat()); assert_eq!(parse(&raw).node_count(),2);
}

#[test]
fn native_mdx_rejects_bad_counts_ranges_references_and_cycles() {
    let good=fixture();
    for (tag,delta,value) in [(b"VERS",8,1200),(b"VRTX",4,u32::MAX),(b"PVTX",4,u32::MAX),(b"GNDX",8,9),(b"MTGC",8,2),(b"MATS",8,99),(b"KGTR",4,u32::MAX),(b"KGTR",12,0)] {
        let mut bytes=good.clone(); let at=offset(&bytes,tag)+delta; bytes[at..at+4].copy_from_slice(&word(value)); assert!(MdxModel::parse(&bytes).is_err(),"{tag:?} + {delta}");
    }
    for nodes in [[bone(0,1,&[]),bone(1,0,&[])].concat(),[bone(0,-1,&[]),bone(0,-1,&[])].concat(),bone(0,9,&[])] {assert!(MdxModel::parse(&model_with(&nodes,&geometry(&[0],0,1),&material(1,0,&[]),&[],&[])).is_err());}
    let mut truncated=good.clone(); truncated.pop(); assert!(MdxModel::parse(&truncated).is_err()); let mut duplicate=good; duplicate.extend(chunk(b"VERS",&word(800))); assert!(MdxModel::parse(&duplicate).is_err());
}

#[test]
fn native_mdx_allocation_limits_and_nonfinite_values_reject() {
    let good=fixture(); for limits in [MdxReadLimits {max_decoded_bytes:1,..Default::default()},MdxReadLimits {max_vertices:2,..Default::default()},MdxReadLimits {max_indices:2,..Default::default()},MdxReadLimits {max_keys:1,..Default::default()},MdxReadLimits {max_nodes:0,..Default::default()}] {assert!(MdxModel::parse_with_limits(&good,limits).is_err());}
    let mut bad=good.clone(); let at=offset(&bad,b"VRTX")+8; bad[at..at+4].copy_from_slice(&f32::NAN.to_le_bytes()); assert!(MdxModel::parse(&bad).is_err());
    let static_raw=model_with(&bone(0,-1,&[]),&geometry(&[0],0,1),&material(1,0,&[]),&[],&chunk(b"PIVT",&floats(&[f32::NAN,0.,0.]))); assert_eq!(parse(&static_raw).diagnostics().len(),1);
    let mut animated=good; animated.extend(chunk(b"PIVT",&floats(&[f32::NAN,0.,0.]))); assert!(MdxModel::parse(&animated).is_err());
}

#[test]
fn native_mdx_shared_material_does_not_hide_nonfinite_geoset_color() {
    let max=[f32::MAX;3]; let negative=[-f32::MAX;3];
    let color=[b"KGAC".to_vec(),word(2),word(2),word(u32::MAX),word(0),floats(&max),floats(&[0.;3]),floats(&max),word(1000),floats(&max),floats(&negative),floats(&[0.;3])].concat();
    let animation=record(&[floats(&[1.]),word(2),floats(&[1.;3]),word(1),color].concat());
    for layers in [0,1] {let raw=model_with(&bone(0,-1,&[]),&geometry(&[0],0,1).repeat(2),&material(layers,0,&[]),&sequence("Stand",0,1000,0),&chunk(b"GEOA",&animation)); assert!(parse(&raw).sample(Some(0),500,None).is_err());}
}

#[test]
fn native_mdx_checks_node_output_even_without_geometry() {
    let scale=[b"KGSC".to_vec(),word(1),word(0),word(u32::MAX),word(0),floats(&[f32::MAX;3])].concat(); let translation=translation(0,-1,&[(0,[f32::MAX,0.,0.])]);
    let nodes=[bone(0,-1,&[scale,translation].concat()),bone(1,0,&[])].concat(); let pivots=chunk(b"PIVT",&floats(&[0.,0.,0.,256.,0.,0.]));
    let raw=model_with(&nodes,&[],&[],&sequence("Stand",0,1000,0),&pivots); assert!(parse(&raw).sample(Some(0),0,None).is_err());
}

fn rotation_track(q:Quat)->Vec<u8> {[b"KGRT".to_vec(),word(1),word(0),word(u32::MAX),word(0),floats(&q.to_array())].concat()}
fn scale_track(s:[f32;3])->Vec<u8> {[b"KGSC".to_vec(),word(1),word(0),word(u32::MAX),word(0),floats(&s)].concat()}
fn near(actual:Vec3,expected:Vec3) {assert!((actual-expected).length()<2e-5,"{actual:?} != {expected:?}");}

#[test]
fn native_mdx_rotation_noninherit_keeps_parent_displacement_and_nonuniform_scale() {
    let parent=[rotation_track(Quat::from_rotation_z(std::f32::consts::FRAC_PI_2)),scale_track([2.,3.,4.]),translation(0,-1,&[(0,[256.,128.,64.])])].concat();
    let child=[rotation_track(Quat::from_rotation_x(std::f32::consts::FRAC_PI_2)),translation(0,-1,&[(0,[16.,32.,8.])])].concat();
    let nodes=[bone(1,0,&child),bone(0,-1,&parent)].concat(); let raw=model_with(&nodes,&geometry(&[1],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&chunk(b"PIVT",&floats(&[0.,0.,0.,128.,0.,0.])));
    let mut model=parse(&raw); model.nodes[0].flags|=4; let pose=model.sample(Some(0),0,None).unwrap(); let matrix=pose.node_matrices[0];
    near(matrix.w_axis.truncate(),Vec3::new(1.25,0.75,-3.25)); near(matrix.x_axis.truncate(),Vec3::new(3.,0.,0.)); near(matrix.y_axis.truncate(),Vec3::new(0.,0.,2.)); near(matrix.z_axis.truncate(),Vec3::new(0.,-4.,0.));
    for (p,expected) in pose.geosets[0].mesh.positions.iter().zip([[1.25,0.75,-3.25],[-1.75,4.75,-3.25],[-1.75,0.75,-1.25]]) {near(Vec3::from_array(*p),Vec3::from_array(expected));}
    model.nodes[0].flags&=!4; let inherited=model.sample(Some(0),0,None).unwrap(); near(inherited.node_matrices[0].w_axis.truncate(),matrix.w_axis.truncate()); assert!((inherited.node_matrices[0].x_axis-matrix.x_axis).length()>1.);
}

#[test]
fn native_mdx_rotation_noninherit_uses_accumulated_parent_rotation_and_corrects_descendants() {
    let root=bone(0,-1,&rotation_track(Quat::from_rotation_z(0.7))); let parent=bone(1,0,&rotation_track(Quat::from_rotation_y(-0.6))); let child=bone(2,1,&rotation_track(Quat::from_rotation_x(0.4))); let leaf=bone(3,2,&rotation_track(Quat::from_rotation_y(0.2)));
    let raw=model_with(&[leaf,child,parent,root].concat(),&geometry(&[2],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&[]); let mut model=parse(&raw); model.nodes[1].flags|=4;
    let pose=model.sample(Some(0),500,None).unwrap(); let source_vector=Vec3::new(0.3,-0.5,0.7); let input=Vec3::new(source_vector.x,source_vector.z,-source_vector.y);
    let child=Quat::from_rotation_x(0.4)*source_vector; near(pose.node_matrices[1].transform_vector3(input),Vec3::new(child.x,child.z,-child.y));
    let leaf=Quat::from_rotation_x(0.4)*Quat::from_rotation_y(0.2)*source_vector; near(pose.node_matrices[0].transform_vector3(input),Vec3::new(leaf.x,leaf.z,-leaf.y));
}

#[test]
fn native_mdx_rotation_noninherit_is_stateless_across_animation_samples_and_roots() {
    let root_track=[b"KGRT".to_vec(),word(2),word(1),word(u32::MAX),word(0),floats(&[0.,0.,0.,1.]),word(1000),floats(&[0.,0.,1.,0.])].concat();
    let child=rotation_track(Quat::from_rotation_x(0.4)); let raw=model_with(&[bone(0,-1,&root_track),bone(1,0,&child),bone(2,-1,&child)].concat(),&geometry(&[1],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&[]); let mut model=parse(&raw); model.nodes[1].flags|=4; model.nodes[2].flags|=4;
    let base=model.sample(Some(0),0,None).unwrap(); for time in [999,500,1,2000,500] {let pose=model.sample(Some(0),time,None).unwrap(); for index in [1,2] {for (a,b) in pose.node_matrices[index].to_cols_array().chunks_exact(4).zip(base.node_matrices[index].to_cols_array().chunks_exact(4)) {for (a,b) in a.iter().zip(b) {assert!((a-b).abs()<1e-5);}}}}
    let rest=model.sample(None,0,None).unwrap(); assert_eq!(rest.node_matrices[1],Mat4::IDENTITY);
}

#[test]
fn native_mdx_rotation_noninherit_cancels_billboard_parent_even_when_collapsed() {
    for collapsed in [false,true] {let raw=model_with(&[bone(0,-1,&scale_track(if collapsed {[0.;3]} else {[1.;3]})),bone(1,0,&[])].concat(),&geometry(&[1],0,1),&material(1,0,&[]),&sequence("Stand",0,1000,0),&[]); let mut model=parse(&raw); model.nodes[0].flags|=8; model.nodes[1].flags|=4;
        let camera=MdxBillboardCamera {model:Mat4::IDENTITY,look:-Vec3::Z,up:Vec3::Y}; let pose=model.sample(Some(0),0,Some(camera)).unwrap(); near(pose.node_matrices[1].x_axis.truncate(),if collapsed {Vec3::ZERO} else {Vec3::X}); near(pose.node_matrices[1].y_axis.truncate(),if collapsed {Vec3::ZERO} else {Vec3::Y}); near(pose.node_matrices[1].z_axis.truncate(),if collapsed {Vec3::ZERO} else {Vec3::Z});
    }
}

#[test]
fn native_mdx_rotation_noninherit_plans_scratch_only_for_models_that_need_it() {
    let mut model=parse(&fixture()); let baseline=model.pose_allocation_bytes().unwrap(); model.nodes[0].flags|=4; let planned=model.pose_allocation_bytes().unwrap(); assert_eq!(planned-baseline,model.nodes.len()*std::mem::size_of::<Quat>()); model.max_pose_bytes=planned-1; assert!(model.sample(Some(0),0,None).is_err()); model.max_pose_bytes=planned; assert!(model.sample(Some(0),0,None).is_ok());
}

#[test]
fn native_mdx_rotation_noninherit_keeps_unsupported_node_rules_explicit() {
    for flags in [1,2,3,0x80,0x84] {let mut model=parse(&fixture()); model.nodes[0].flags|=flags; assert!(model.sample(Some(0),0,None).unwrap_err().to_string().contains("translation/scale non-inheritance or camera-anchoring"));}
    for flags in [0x0c,0x14,0x24,0x44] {let mut model=parse(&fixture()); model.nodes[0].flags|=flags; assert!(model.sample(Some(0),0,None).unwrap_err().to_string().contains("combined node billboarding and rotation non-inheritance"));}
}

fn sorted_material(priority:i32,filters:&[u32])->Vec<u8> {let mut m=material(filters.len(),0,&[]); m[4..8].copy_from_slice(&priority.to_le_bytes()); for (i,filter) in filters.iter().enumerate() {let at=24+i*28; m[at..at+4].copy_from_slice(&filter.to_le_bytes());} m}
#[test]
fn native_mdx_draw_order_preserves_opaque_source_and_signed_translucent_priority() {
    let entries=[(6,0),(1,50),(4,-1),(0,-90),(3,0),(2,0),(3,0),(2,i32::MIN),(6,i32::MAX)]; let materials=entries.iter().flat_map(|(filter,priority)|sorted_material(*priority,&[*filter])).collect::<Vec<_>>(); let geometry=entries.iter().enumerate().flat_map(|(i,_)|geometry(&[],i as u32,1)).collect::<Vec<_>>(); let model=parse(&model_with(&[],&geometry,&materials,&[],&[]));
    assert_eq!(model.draw_order(),[(1,0),(3,0),(7,0),(2,0),(5,0),(4,0),(6,0),(0,0),(8,0)]);
}
#[test]
fn native_mdx_draw_order_is_static_and_keeps_source_ties_without_sample_allocations() {
    let raw=model_with(&[],&geometry(&[],0,1).repeat(2),&sorted_material(0,&[4,2,2]),&[],&[]); let model=parse(&raw); let address=model.draw_order().as_ptr(); assert_eq!(model.draw_order(),[(0,1),(0,2),(1,1),(1,2),(0,0),(1,0)]);
    for time in [0,500,1000] {model.sample(None,time,None).unwrap(); assert_eq!(model.draw_order().as_ptr(),address);}
    assert!(model.decoded_bytes()>=6*std::mem::size_of::<(usize,usize)>()); let limits=MdxReadLimits {max_decoded_bytes:model.decoded_bytes()-1,..Default::default()}; assert!(MdxModel::parse_with_limits(&raw,limits).is_err());
}
