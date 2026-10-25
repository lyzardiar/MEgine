// Author: MiYu. Evaluate native source tracks, pivot hierarchies and matrix groups into engine mesh data.
use super::*;

impl Track {
    fn sample(&self, model: &MdxModel, sequence: Option<&MdxSequence>, time: i64, wall: u64, rest: Vec4, rotation: bool) -> Vec4 {
        if self.keys.is_empty() {return rest;}
        let (lo,hi,time)=if self.global>=0 {let period=model.globals[self.global as usize] as u64; (0,self.keys.len(),if period>0 {(wall%period) as i64} else {0})} else if let Some(sequence)=sequence {(self.keys.partition_point(|k|k.time<sequence.start_ms),self.keys.partition_point(|k|k.time<=sequence.end_ms),time)} else {return rest;};
        if lo>=hi {return rest;} if time<=self.keys[lo].time {return self.keys[lo].value;} if time>=self.keys[hi-1].time {return self.keys[hi-1].value;}
        let a=lo+self.keys[lo..hi].partition_point(|k|k.time<=time)-1; let b=a+1; let t=(time-self.keys[a].time) as f32/(self.keys[b].time-self.keys[a].time) as f32;
        let (x,y)=(self.keys[a].value,self.keys[b].value);
        match self.interpolation {
            0=>x,
            1=>if rotation {slerp(x,y,t)} else {x.lerp(y,t)},
            _=>{let (out,input)=(self.keys[a].outgoing,self.keys[b].incoming); if rotation {slerp(slerp(x,y,t),slerp(out,input,t),2.*t*(1.-t))} else if self.interpolation==2 {let t2=t*t; let t3=t2*t; x*(2.*t3-3.*t2+1.)+y*(-2.*t3+3.*t2)+out*(t3-2.*t2+t)+input*(t3-t2)} else {let u=1.-t; x*(u*u*u)+out*(3.*u*u*t)+input*(3.*u*t*t)+y*(t*t*t)}},
        }
    }
}

fn slerp(a: Vec4, mut b: Vec4, t: f32) -> Vec4 { let mut dot=a.dot(b); if dot<0. {dot=-dot; b=-b;} if dot>1.-1e-6 {return a.lerp(b,t);} let angle=dot.clamp(-1.,1.).acos(); (a*((1.-t)*angle).sin()+b*(t*angle).sin())/angle.sin() }

fn transform(t: Vec3, q: Vec4, s: Vec3) -> Mat4 {
    let (x,y,z,w)=(q.x,q.y,q.z,q.w);
    Mat4::from_cols(Vec4::new(1.-2.*(y*y+z*z),2.*(x*y+w*z),2.*(x*z-w*y),0.)*s.x,Vec4::new(2.*(x*y-w*z),1.-2.*(x*x+z*z),2.*(y*z+w*x),0.)*s.y,Vec4::new(2.*(x*z+w*y),2.*(y*z-w*x),1.-2.*(x*x+y*y),0.)*s.z,t.extend(1.))
}

fn engine(v: Vec3) -> Vec3 { Vec3::new(v.x,v.z,-v.y)/128. }
fn direction(v: Vec3) -> Vec3 { Vec3::new(v.x,v.z,-v.y) }
fn source(v: Vec3) -> Vec3 { Vec3::new(v.x,-v.z,v.y) }

fn billboard(node: &Node, world: Mat4, camera: MdxBillboardCamera) -> Mat4 {
    let inverse=camera.model.inverse(); let view=source(-inverse.transform_vector3(camera.look)).normalize_or_zero(); let up=source(inverse.transform_vector3(camera.up)).normalize_or_zero();
    let (x,y,z)=if node.flags&8!=0 {let x=view; let z=(up-x*up.dot(x)).normalize_or_zero(); (x,z.cross(x),z)} else if node.flags&0x40!=0 {let z=Vec3::Z; let x=(view-z*view.dot(z)).normalize_or_zero(); (x,z.cross(x),z)} else if node.flags&0x20!=0 {let y=Vec3::Y; let x=(view-y*view.dot(y)).normalize_or_zero(); (x,y,x.cross(y))} else {let x=Vec3::X; let z=(up-x*up.dot(x)).normalize_or_zero(); (x,z.cross(x),z)};
    if x.length_squared()<0.5 || y.length_squared()<0.5 || z.length_squared()<0.5 {return world;}
    let scale=Vec3::new(world.x_axis.truncate().length(),world.y_axis.truncate().length(),world.z_axis.truncate().length()); let position=world.transform_point3(node.pivot);
    Mat4::from_cols((x*scale.x).extend(0.),(y*scale.y).extend(0.),(z*scale.z).extend(0.),position.extend(1.))*Mat4::from_translation(-node.pivot)
}

fn collapse_scale(track: &Track, sequence: Option<&MdxSequence>) -> bool {
    track.collapse_outside && sequence.is_some_and(|s|track.keys.partition_point(|k|k.time<s.start_ms)>=track.keys.partition_point(|k|k.time<=s.end_ms))
}

fn check_pose_budget(model: &MdxModel) -> Result<(),AssetError> {
    let mut total=0usize; let mut add=|count:usize,stride:usize|->Result<(),AssetError> {total=total.checked_add(count.checked_mul(stride).ok_or_else(||invalid("pose allocation overflow"))?).filter(|n|*n<=model.max_pose_bytes).ok_or_else(||invalid("sampled pose exceeds byte budget"))?; Ok(())};
    add(model.nodes.len(),std::mem::size_of::<Mat4>()*2)?; add(model.geosets.len(),std::mem::size_of::<MdxGeosetPose>())?; add(model.materials.len(),std::mem::size_of::<Option<Arc<[MdxLayerPose]>>>()+1)?;
    let mut used=vec![false;model.materials.len()]; let mut max_groups=0; let mut max_normals=0;
    for g in &model.geosets {
        add(g.positions.len(),32)?; add(g.indices.len(),4)?; max_groups=max_groups.max(g.groups.len()); if g.normals.is_empty() {max_normals=max_normals.max(g.positions.len());}
        if !used[g.material] {used[g.material]=true; add(model.materials[g.material].layers.len(),std::mem::size_of::<MdxLayerPose>()*2)?; add(1,32)?;}
    }
    add(max_groups,std::mem::size_of::<Mat4>())?; add(max_normals,std::mem::size_of::<Vec3>())?;
    for node in &model.nodes {if let Some((_,path,_))=&node.attachment {add(1,std::mem::size_of::<MdxAttachmentPose>()*2)?; add(path.len(),1)?;}}
    Ok(())
}

pub(super) fn sample(model: &MdxModel, sequence: Option<usize>, elapsed: u64, camera: Option<MdxBillboardCamera>) -> Result<MdxPose,AssetError> {
    check_pose_budget(model)?;
    let sequence=sequence.map(|i|model.sequences.get(i).ok_or_else(||invalid("sequence index is missing"))).transpose()?;
    let time=sequence.map_or(0,|s|{let duration=(s.end_ms-s.start_ms) as u64; s.start_ms+if duration==0 {0} else if s.non_looping {elapsed.min(duration) as i64} else {(elapsed%duration) as i64}});
    if camera.is_some_and(|c|!c.model.is_finite() || !c.look.is_finite() || !c.up.is_finite() || c.model.determinant().abs()<1e-12) {return Err(invalid("invalid billboard camera"));}
    // These source behaviors need a session/world origin and complete inheritance solver before game use.
    if model.nodes.iter().any(|n|n.flags&(7|0x80)!=0) {return Err(invalid("node non-inheritance or camera-anchoring requires the runtime node solver"));}
    let value=|track:&Option<Track>,rest,rotation|track.as_ref().map_or(rest,|t|t.sample(model,sequence,time,elapsed,rest,rotation));
    let mut world=vec![Mat4::IDENTITY;model.nodes.len()];
    for &index in &model.order {
        let node=&model.nodes[index]; let t=value(&node.translation,Vec4::ZERO,false).truncate(); let q=value(&node.rotation,Vec4::W,true); let mut s=value(&node.scale,Vec4::ONE,false).truncate();
        if node.scale.as_ref().is_some_and(|t|collapse_scale(t,sequence)) {s=Vec3::ZERO;}
        let local=transform(node.pivot+t,q,s)*Mat4::from_translation(-node.pivot); let mut matrix=model.parents[index].map_or(local,|p|world[p]*local);
        if let Some(camera)=camera {if node.flags&0x78!=0 {matrix=billboard(node,matrix,camera);}}
        if !matrix.is_finite() {return Err(invalid("non-finite sampled node"));} world[index]=matrix;
    }
    let mut geosets=Vec::with_capacity(model.geosets.len()); let mut layer_states:Vec<Option<Arc<[MdxLayerPose]>>>=vec![None;model.materials.len()];
    for (index,g) in model.geosets.iter().enumerate() {
        let matrices=g.groups.iter().map(|group|group.iter().fold(Mat4::ZERO,|m,n|m+world[*n])/group.len() as f32).collect::<Vec<_>>();
        let mut mesh=MeshData {positions:Vec::with_capacity(g.positions.len()),normals:Vec::with_capacity(g.positions.len()),uvs:Vec::with_capacity(g.positions.len()),indices:g.indices.clone()};
        for (v,position) in g.positions.iter().enumerate() {
            let matrix=if matrices.is_empty() {Mat4::IDENTITY} else {matrices[g.vertex_groups[v] as usize]}; let p=engine(matrix.transform_point3(Vec3::from_array(*position)));
            let n=direction(matrix.transform_vector3(g.normals.get(v).copied().map(Vec3::from_array).unwrap_or(Vec3::Z))).normalize_or_zero();
            if !p.is_finite() || !n.is_finite() {return Err(invalid("non-finite sampled vertex"));} mesh.positions.push(p.to_array()); mesh.normals.push(if n.length_squared()>0. {n.to_array()} else {Vec3::Y.to_array()});
        }
        if g.normals.is_empty() {let mut normals=vec![Vec3::ZERO;g.positions.len()]; for tri in mesh.indices.chunks_exact(3) {let (a,b,c)=(tri[0] as usize,tri[1] as usize,tri[2] as usize); let p=Vec3::from_array(mesh.positions[a]); let n=(Vec3::from_array(mesh.positions[b])-p).cross(Vec3::from_array(mesh.positions[c])-p); for v in [a,b,c] {normals[v]+=n;}} for (out,n) in mesh.normals.iter_mut().zip(normals) {let n=n.normalize_or_zero(); *out=if n.length_squared()>0. {n.to_array()} else {Vec3::Y.to_array()};}}
        // Each material layer retains its own UV set/transform; mesh carries set0 for simple consumers.
        if let Some(uvs)=g.uvs.first() {mesh.uvs.extend(uvs.iter().copied());} else {mesh.uvs.resize(g.positions.len(),[0.,0.]);}
        let animation=g.animation.map(|i|&model.geoset_animations[i]);
        let alpha=animation.map_or(1.,|a|value(&a.alpha_track,Vec4::new(if a.alpha_track.is_some() {1.} else {a.alpha},0.,0.,0.),false).x).clamp(0.,1.);
        let color=animation.map_or(Vec3::ONE,|a|{if let Some(t)=&a.color_track {let bgr=t.sample(model,sequence,time,elapsed,Vec4::ONE,false); Vec3::new(bgr.z,bgr.y,bgr.x)} else {a.color}});
        if !color.is_finite() {return Err(invalid("non-finite sampled geoset color"));}
        let layers=if let Some(layers)=&layer_states[g.material] {layers.clone()} else {let material=&model.materials[g.material]; let mut layers=Vec::with_capacity(material.layers.len());
        for layer in &material.layers {
            let texture=value(&layer.texture_track,Vec4::new(layer.texture as f32,0.,0.,0.),false).x as usize;
            let uv=if layer.texture_animation<0 {[1.,0.,0.,1.,0.,0.]} else {let a=&model.texture_animations[layer.texture_animation as usize]; let pivot=Vec3::new(0.5,0.5,0.); let matrix=transform(pivot+value(&a.translation,Vec4::ZERO,false).truncate(),value(&a.rotation,Vec4::W,true),value(&a.scale,Vec4::ONE,false).truncate())*Mat4::from_translation(-pivot); [matrix.x_axis.x,matrix.x_axis.y,matrix.y_axis.x,matrix.y_axis.y,matrix.w_axis.x,matrix.w_axis.y]};
            let alpha=value(&layer.alpha_track,Vec4::new(layer.alpha,0.,0.,0.),false).x.clamp(0.,1.);
            if !alpha.is_finite() || uv.iter().any(|n|!n.is_finite()) {return Err(invalid("non-finite sampled material"));}
            layers.push(MdxLayerPose {texture,filter:layer.filter,flags:layer.flags,texture_flags:model.textures[texture].flags,material_flags:material.flags,priority:material.priority,alpha,uv_set:layer.coord,uv});
        }
        let layers:Arc<[MdxLayerPose]>=layers.into(); layer_states[g.material]=Some(layers.clone()); layers};
        if !alpha.is_finite() {return Err(invalid("non-finite sampled geoset alpha"));}
        geosets.push(MdxGeosetPose {mesh,geoset:index,material:g.material,alpha,color:color.to_array(),layers});
    }
    let basis=Mat4::from_cols(Vec4::new(1./128.,0.,0.,0.),Vec4::new(0.,0.,-1./128.,0.),Vec4::new(0.,1./128.,0.,0.),Vec4::W); let inverse=basis.inverse();
    let node_matrices=model.nodes.iter().zip(&world).map(|(n,m)|{let matrix=basis*(*m)*Mat4::from_translation(n.pivot)*inverse; if !matrix.is_finite() {return Err(invalid("non-finite sampled node output"));} Ok(matrix)}).collect::<Result<Vec<_>,AssetError>>()?;
    let mut attachments=Vec::new();
    for (node,n) in model.nodes.iter().enumerate() {if let Some((id,path,visibility))=&n.attachment {let visibility=value(visibility,Vec4::X,false).x; if !visibility.is_finite() {return Err(invalid("non-finite attachment visibility"));} attachments.push(MdxAttachmentPose {node,id:*id,path:path.clone(),visibility});}}
    Ok(MdxPose {geosets,node_matrices,attachments})
}
