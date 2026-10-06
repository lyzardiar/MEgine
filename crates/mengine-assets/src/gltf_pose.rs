//! MiYu: sample glTF skeletal animation into reusable posed meshes for crowds.
use crate::{AssetError, MeshData};
use glam::{Mat4, Quat, Vec3, Vec4};
use std::path::Path;

/// Legacy 12 Hz references. Use `parse_gltf_pose_sample` for an explicit rate.
pub fn parse_gltf_pose(reference: &str) -> Option<(&str, usize, u32)> {
    let (path, clip, frame, rate) = parse_gltf_pose_sample(reference)?;
    (rate == 12).then_some((path, clip, frame))
}

/// MiYu: `model.glb#pose=clip:frame@rate` selects 1–60 Hz; omitted rates use 12 Hz.
pub fn parse_gltf_pose_sample(reference: &str) -> Option<(&str, usize, u32, u32)> {
    let (path, suffix) = reference.split_once("#pose=")?;
    let (clip, frame) = suffix.split_once(':')?;
    let (frame, rate) = frame.split_once('@').map_or((frame, "12"), |v| v);
    let clip = clip.parse::<usize>().ok()?;
    let frame = frame.parse::<u32>().ok()?;
    let rate = rate.parse::<u32>().ok()?;
    if clip > 255 || !(1..=60).contains(&rate) || frame > rate*600 || !(path.ends_with(".gltf") || path.ends_with(".glb")) { return None; }
    Some((path, clip, frame, rate))
}

#[derive(Clone, Copy, Debug)]
pub struct GltfBillboardCamera { pub model: Mat4, pub look: Vec3, pub up: Vec3 }

/// MiYu: model-space node transform from the same solver used by visible geometry.
#[derive(Clone, Debug)]
pub struct GltfNodePose { pub index: usize, pub name: Option<String>, pub matrix: Mat4, pub attachment: Option<GltfAttachmentPose> }
/// Visibility belongs to the source attachment's embedded model, not arbitrary external buffs.
#[derive(Clone, Debug)]
pub struct GltfAttachmentPose { pub id: u32, pub path: String, pub visibility: f32 }

pub struct GltfPoseSource { document: gltf::Document, buffers: Vec<gltf::buffer::Data>, billboards: Vec<u32>, mdx: Option<crate::gltf_mdx::MdxAnimation> }

fn billboard_matrix(world: Mat4, flags: u32, camera: GltfBillboardCamera) -> Mat4 {
    let to_camera = -camera.look;
    let (x, y, z) = if flags & 8 != 0 {
        let x = to_camera.normalize_or_zero();
        let y = (camera.up - x*camera.up.dot(x)).normalize_or_zero();
        (x,y,x.cross(y))
    } else if flags & 0x40 != 0 {
        let y = Vec3::Y;
        let x = (to_camera - y*to_camera.dot(y)).normalize_or_zero();
        (x,y,x.cross(y))
    } else if flags & 0x20 != 0 {
        let z = Vec3::Z;
        let x = (to_camera - z*to_camera.dot(z)).normalize_or_zero();
        (x,z.cross(x),z)
    } else {
        let x = Vec3::X;
        let y = (camera.up - x*camera.up.dot(x)).normalize_or_zero();
        (x,y,x.cross(y))
    };
    if x.length_squared() < 0.5 || y.length_squared() < 0.5 || z.length_squared() < 0.5 { return world; }
    let scale = Vec3::new(world.x_axis.truncate().length(),world.y_axis.truncate().length(),world.z_axis.truncate().length());
    Mat4::from_cols((x*scale.x).extend(0.0),(y*scale.y).extend(0.0),(z*scale.z).extend(0.0),world.w_axis)
}
fn keyframe_segment(times: &[f32], time: f32, step: bool) -> (usize, usize) {
    let upper = times.partition_point(|v| *v <= time);
    let b = if step { upper.saturating_sub(1) } else { upper.min(times.len()-1) };
    (if step { b } else { b.saturating_sub(1) }, b)
}
impl GltfPoseSource {
    pub fn load(path: &Path) -> Result<Self, AssetError> {
        let (document, buffers, _) = gltf::import(path).map_err(|e| AssetError::Gltf(e.to_string()))?;
        let mut billboards = Vec::new();
        for node in document.nodes() {
            let extra: Option<serde_json::Value> = node.extras().as_ref().map(|v| serde_json::from_str(v.get()).map_err(|_| AssetError::Gltf("invalid node extras".into()))).transpose()?;
            let flags = if let Some(value) = extra.as_ref().and_then(|v| v.get("mengineBillboard")) {
                let flags = value.get("flags").and_then(|v| v.as_u64()).filter(|v| *v > 0 && *v & !0x78 == 0).ok_or_else(|| AssetError::Gltf("invalid node billboard flags".into()))?;
                flags as u32
            } else { 0 };
            billboards.push(flags);
        }
        let extra:Option<serde_json::Value>=document.as_json().extras.as_ref().map(|v|serde_json::from_str(v.get()).map_err(|_|AssetError::Gltf("invalid document extras".into()))).transpose()?;
        let mdx=extra.and_then(|v|v.get("mengineMdxAnimation").cloned()).map(|v|crate::gltf_mdx::MdxAnimation::parse(v,&document)).transpose()?;
        Ok(Self { document, buffers, billboards, mdx })
    }
    pub fn has_billboards(&self) -> bool { self.billboards.iter().any(|v| *v != 0) }
    pub fn sample(&self, clip: usize, frame: u32) -> Result<MeshData, AssetError> {
        self.sample_at_rate(clip, frame, 12)
    }
    pub fn sample_at_rate(&self, clip: usize, frame: u32, rate: u32) -> Result<MeshData, AssetError> {
        self.sample_with_camera(clip,frame,rate,None)
    }
    pub fn sample_with_camera(&self, clip: usize, frame: u32, rate: u32, camera: Option<GltfBillboardCamera>) -> Result<MeshData, AssetError> {
        let (globals,uv_matrix,_)=self.node_matrices(clip,frame,rate,camera)?;
        self.mesh_from_pose(&globals,uv_matrix)
    }
    /// Duplicate names remain distinct; indices identify the nodes. Camera rules match mesh sampling.
    pub fn sample_nodes(&self, clip: usize, frame: u32, rate: u32, camera: Option<GltfBillboardCamera>) -> Result<Vec<GltfNodePose>, AssetError> {
        let (globals,_,time)=self.node_matrices(clip,frame,rate,camera)?;
        self.document.nodes().map(|node| {
            if !globals[node.index()].is_finite() { return Err(AssetError::Gltf("non-finite node pose".into())); }
            let attachment=self.mdx.as_ref().and_then(|m|m.attachment(node.index(),clip,time)).map(|(id,path,visibility)|GltfAttachmentPose {id,path:path.into(),visibility});
            if attachment.as_ref().is_some_and(|a|!a.visibility.is_finite()) { return Err(AssetError::Gltf("non-finite attachment visibility".into())); }
            Ok(GltfNodePose { index:node.index(),name:node.name().map(str::to_owned),matrix:globals[node.index()],attachment })
        }).collect()
    }
    fn node_matrices(&self, clip: usize, frame: u32, rate: u32, camera: Option<GltfBillboardCamera>) -> Result<(Vec<Mat4>,Option<[f32;6]>,f32), AssetError> {
        let fail = |s: &str| AssetError::Gltf(s.into());
        if !(1..=60).contains(&rate) { return Err(fail("skeletal sample rate must be between 1 and 60 Hz")); }
        if camera.is_some_and(|c| !c.model.is_finite() || !c.look.is_finite() || !c.up.is_finite() || c.model.determinant().abs() < 1e-12) { return Err(fail("invalid billboard camera transform")); }
        let nodes = self.document.nodes().collect::<Vec<_>>();
        let mut trs = nodes.iter().map(|n| { let (t,r,s) = n.transform().decomposed(); (Vec3::from(t), Quat::from_array(r), Vec3::from(s)) }).collect::<Vec<_>>();
        let animation = self.document.animations().nth(clip).ok_or_else(|| fail("animation clip index out of bounds"))?;
        let duration = animation.channels().filter_map(|c| c.reader(|b| Some(&self.buffers[b.index()])).read_inputs().and_then(|v| v.last())).fold(0.0_f32, f32::max);
        let extra: Option<serde_json::Value> = animation.extras().as_ref().map(|v| serde_json::from_str(v.get()).map_err(|_| fail("invalid animation extras"))).transpose()?;
        let playback = extra.as_ref().and_then(|v| v.get("menginePlayback"));
        let (time, terminal) = if let Some(playback) = playback {
            #[derive(serde::Deserialize)]
            struct Playback { #[serde(rename="durationSeconds")] duration: f32, #[serde(rename="loop")] looped: bool }
            let playback: Playback = serde_json::from_value(playback.clone()).map_err(|_| fail("invalid animation playback"))?;
            if !playback.duration.is_finite() || playback.duration <= 0.0 || playback.duration > 600.0 { return Err(fail("invalid animation playback duration")); }
            let seconds = frame as f32 / rate as f32;
            if playback.looped { (seconds % playback.duration, false) } else { (seconds.min(playback.duration), seconds >= playback.duration) }
        } else { (if duration > 0.0 { (frame as f32 / rate as f32) % duration } else { 0.0 }, false) };
        // MiYu: UV transforms are sampled alongside each classic material layer's skeleton.
        let uv_matrix = if let Some(extra) = extra {
            if let Some(track) = extra.get("mengineUv") {
                #[derive(serde::Deserialize)]
                struct UvTrack { fps: u32, frames: Vec<[f32; 6]> }
                let track: UvTrack = serde_json::from_value(track.clone()).map_err(|_| fail("invalid UV animation track"))?;
                if !(1..=60).contains(&track.fps) || track.frames.is_empty() || track.frames.iter().flatten().any(|v| !v.is_finite()) { return Err(fail("invalid UV animation samples")); }
                let index = if terminal { track.frames.len()-1 } else { (time * track.fps as f32 + 0.0001).floor() as usize };
                Some(*track.frames.get(index).ok_or_else(|| fail("UV animation frame is missing"))?)
            } else { None }
        } else { None };
        if self.mdx.is_none() { for channel in animation.channels() {
            let reader = channel.reader(|b| Some(&self.buffers[b.index()]));
            let times = reader.read_inputs().ok_or_else(|| fail("animation has no times"))?.collect::<Vec<_>>();
            if times.is_empty() { continue; }
            let interpolation = channel.sampler().interpolation();
            let (a,b) = keyframe_segment(&times, time, interpolation == gltf::animation::Interpolation::Step);
            let alpha = if a == b || interpolation == gltf::animation::Interpolation::Step { 0.0 } else { ((time-times[a])/(times[b]-times[a]).max(0.000001)).clamp(0.0,1.0) };
            if interpolation == gltf::animation::Interpolation::CubicSpline { return Err(fail("CUBICSPLINE skeletal channels are not supported; resample as LINEAR")); }
            let target = &mut trs[channel.target().node().index()];
            match reader.read_outputs().ok_or_else(|| fail("animation has no outputs"))? {
                gltf::animation::util::ReadOutputs::Translations(v) => { let v = v.collect::<Vec<_>>(); if v.len() != times.len() { return Err(fail("translation key count mismatch")); } target.0 = Vec3::from(v[a]).lerp(Vec3::from(v[b]),alpha); }
                gltf::animation::util::ReadOutputs::Scales(v) => { let v = v.collect::<Vec<_>>(); if v.len() != times.len() { return Err(fail("scale key count mismatch")); } target.2 = Vec3::from(v[a]).lerp(Vec3::from(v[b]),alpha); }
                gltf::animation::util::ReadOutputs::Rotations(v) => { let v = v.into_f32().collect::<Vec<_>>(); if v.len() != times.len() { return Err(fail("rotation key count mismatch")); } target.1 = Quat::from_array(v[a]).normalize().slerp(Quat::from_array(v[b]).normalize(),alpha); }
                _ => return Err(fail("morph weight animation is not supported by skeletal poses")),
            }
        }
        }
        let mut parents = vec![None; nodes.len()];
        for node in &nodes { for child in node.children() { parents[child.index()] = Some(node.index()); } }
        let mut local = trs.iter().map(|(t,r,s)| Mat4::from_scale_rotation_translation(*s,*r,*t)).collect::<Vec<_>>();
        if let Some(mdx)=&self.mdx {mdx.apply(clip,time,&mut local)?;}
        let mut globals = vec![Mat4::IDENTITY;nodes.len()];
        let mut done = vec![false;nodes.len()];
        for i in 0..nodes.len() {
            let mut chain = Vec::new();let mut node = Some(i);
            while let Some(j) = node { if done[j] { break; } chain.push(j);if chain.len() > nodes.len() { return Err(fail("cyclic node hierarchy")); } node=parents[j]; }
            for j in chain.into_iter().rev() {
                let mut world = parents[j].map_or(local[j],|p| globals[p]*local[j]);
                if self.billboards[j] != 0 { if let Some(camera) = camera { world=camera.model.inverse()*billboard_matrix(camera.model*world,self.billboards[j],camera); } }
                globals[j]=world;done[j]=true;
            }
        }
        Ok((globals,uv_matrix,time))
    }
    fn mesh_from_pose(&self, globals: &[Mat4], uv_matrix: Option<[f32;6]>) -> Result<MeshData,AssetError> {
        let fail=|s: &str| AssetError::Gltf(s.into());
        let nodes=self.document.nodes().collect::<Vec<_>>();
        let mut out = MeshData { positions:vec![], normals:vec![], uvs:vec![], indices:vec![] };
        for node in &nodes {
            let Some(mesh) = node.mesh() else { continue; };
            let joints = if let Some(skin) = node.skin() {
                let inverse = skin.reader(|b| Some(&self.buffers[b.index()])).read_inverse_bind_matrices().map(|m| m.map(|v| Mat4::from_cols_array_2d(&v)).collect::<Vec<_>>()).unwrap_or_else(|| vec![Mat4::IDENTITY;skin.joints().count()]);
                if inverse.len() != skin.joints().count() { return Err(fail("inverse bind count mismatch")); }
                skin.joints().enumerate().map(|(i,j)| globals[j.index()]*inverse[i]).collect::<Vec<_>>()
            } else { vec![] };
            for primitive in mesh.primitives() {
                if primitive.mode() != gltf::mesh::Mode::Triangles { return Err(fail("skeletal mesh requires triangle primitives")); }
                let reader = primitive.reader(|b| Some(&self.buffers[b.index()]));
                let positions = reader.read_positions().ok_or_else(|| fail("mesh has no positions"))?.collect::<Vec<_>>();
                let normals = reader.read_normals().map(|v| v.collect::<Vec<_>>()).unwrap_or_else(|| vec![[0.0,1.0,0.0];positions.len()]);
                let mut influences = Vec::new();
                if !joints.is_empty() {
                    for (semantic, _) in primitive.attributes() { if let gltf::Semantic::Joints(set) = semantic {
                        let ids = reader.read_joints(set).ok_or_else(|| fail("skin is missing joint indices"))?.into_u16().collect::<Vec<_>>();
                        let weights = reader.read_weights(set).ok_or_else(|| fail("skin is missing matching weights"))?.into_f32().collect::<Vec<_>>();
                        if ids.len() != positions.len() || weights.len() != positions.len() { return Err(fail("skin is missing complete joint weights")); }
                        influences.push((ids, weights));
                    } }
                    if influences.is_empty() { return Err(fail("skin is missing complete joint weights")); }
                    for (semantic, _) in primitive.attributes() { if let gltf::Semantic::Weights(set) = semantic { if reader.read_joints(set).is_none() { return Err(fail("skin weights have no matching joint indices")); } } }
                }
                let base = out.positions.len() as u32;
                for (i,p) in positions.iter().enumerate() {
                    let matrix = if !joints.is_empty() {
                        let mut m = Mat4::ZERO; let sum: f32 = influences.iter().map(|(_, weights)| weights[i].iter().sum::<f32>()).sum();
                        if !sum.is_finite() || sum <= 0.0 { return Err(fail("invalid skin weights")); }
                        for (ids, weights) in &influences { let ws = weights[i]; let js = ids[i]; for j in 0..4 { if ws[j] < 0.0 { return Err(fail("negative skin weight")); } if ws[j] > 0.0 { m += *joints.get(js[j] as usize).ok_or_else(|| fail("skin joint index out of bounds"))? * (ws[j]/sum); } } } m
                    } else { globals[node.index()] };
                    let p = matrix * Vec4::new(p[0],p[1],p[2],1.0);
                    let normal_matrix = if matrix.determinant().abs() > 1e-12 { matrix.inverse().transpose() } else { matrix };
                    let n = normal_matrix.transform_vector3(Vec3::from(*normals.get(i).ok_or_else(|| fail("normal count mismatch"))?)).normalize_or_zero();
                    let n = if n.length_squared() > 0.0 { n } else { Vec3::Y };
                    if !p.is_finite() || !n.is_finite() { return Err(fail("non-finite skeletal vertex")); }
                    out.positions.push(p.truncate().to_array());out.normals.push(n.to_array());
                }
                let uvs = reader.read_tex_coords(0).map(|v| v.into_f32().collect::<Vec<_>>()).unwrap_or_else(|| vec![[0.0,0.0];positions.len()]);
                if uvs.len() != positions.len() { return Err(fail("UV count mismatch")); }
                out.uvs.extend(uvs.into_iter().map(|[u,v]| if let Some(m) = uv_matrix { [u*m[0]+v*m[2]+m[4],u*m[1]+v*m[3]+m[5]] } else { [u,v] }));
                let indices = reader.read_indices().map(|v| v.into_u32().collect::<Vec<_>>()).unwrap_or_else(|| (0..positions.len() as u32).collect());
                if indices.len()%3!=0 || indices.iter().any(|v| *v as usize>=positions.len()) { return Err(fail("invalid skeletal triangle indices")); }
                out.indices.extend(indices.into_iter().map(|i|i+base));
            }
        }
        if out.positions.is_empty() { return Err(fail("no skeletal geometry")); }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn billboard_keeps_pivot_and_scale_while_facing_the_camera() {
        let world=Mat4::from_scale_rotation_translation(Vec3::new(2.0,3.0,4.0),Quat::from_rotation_y(1.2),Vec3::new(7.0,9.0,-2.0));
        let camera=GltfBillboardCamera { model:Mat4::IDENTITY,look:Vec3::new(-1.0,-1.0,-1.0).normalize(),up:Vec3::Y };
        let result=billboard_matrix(world,8,camera);
        assert_eq!(result.w_axis,world.w_axis);
        assert!((result.x_axis.truncate().length()-2.0).abs()<1e-6);
        assert!((result.y_axis.truncate().length()-3.0).abs()<1e-6);
        assert!((result.z_axis.truncate().length()-4.0).abs()<1e-6);
        assert!(result.x_axis.truncate().normalize().dot(-camera.look)>0.99999);
        assert!(result.x_axis.dot(result.y_axis).abs()<1e-6);
        assert!(result.determinant()>0.0);
    }
    #[test]
    fn locked_billboards_keep_the_source_axis_and_degenerate_views_keep_the_pose() {
        let world=Mat4::from_rotation_z(0.7);
        let mut camera=GltfBillboardCamera { model:Mat4::IDENTITY,look:Vec3::new(-1.0,-2.0,-3.0).normalize(),up:Vec3::Y };
        for (flags,axis) in [(0x10,0),(0x40,1),(0x20,2)] { let m=billboard_matrix(world,flags,camera);assert!(m.col(axis).truncate().dot([Vec3::X,Vec3::Y,Vec3::Z][axis])>0.99999); }
        camera.look=Vec3::Y;assert_eq!(billboard_matrix(world,0x40,camera),world);
        camera.look=Vec3::ZERO;assert_eq!(billboard_matrix(world,8,camera),world);
    }
    #[test]
    fn pose_references_are_bounded() {
        assert_eq!(parse_gltf_pose("Assets/hero.glb#pose=2:12"),Some(("Assets/hero.glb",2,12)));
        assert_eq!(parse_gltf_pose_sample("Assets/hero.glb#pose=2:30@30"),Some(("Assets/hero.glb",2,30,30)));
        assert!(parse_gltf_pose("Assets/hero.glb#pose=2:30@30").is_none(),"legacy consumers must not interpret a 30 Hz frame at 12 Hz");
        assert_eq!(parse_gltf_pose_sample("a.gltf#pose=255:5999@60"),Some(("a.gltf",255,5999,60)));
        assert_eq!(parse_gltf_pose_sample("a.glb#pose=0:3000@30"),Some(("a.glb",0,3000,30)));
        assert_eq!(parse_gltf_pose_sample("a.glb#pose=0:18000@30"),Some(("a.glb",0,18000,30)));
        assert_eq!(parse_gltf_pose("a.glb#pose=0:7200"),Some(("a.glb",0,7200)));
        for key in ["a.glb#pose=0:18001@30","a.glb#pose=0:0@0","a.glb#pose=0:0@61","a.glb#pose=0:0@-1","a.glb#pose=0:0@NaN","a.glb#pose=0:0@30@30"] { assert!(parse_gltf_pose_sample(key).is_none()); }
        for key in ["a.glb#pose=0:7201","a.glb#pose=256:0","a.glb#pose=-1:0","a.glb#pose=0:NaN","a.png#pose=0:0"] { assert!(parse_gltf_pose(key).is_none()); }
    }
    #[test]
    fn step_channels_advance_at_the_key_and_hold_the_final_key() {
        assert_eq!(keyframe_segment(&[0.0,0.5],0.49,true),(0,0));
        assert_eq!(keyframe_segment(&[0.0,0.5],0.5,true),(1,1));
        assert_eq!(keyframe_segment(&[0.0,0.5],0.7,true),(1,1));
        assert_eq!(keyframe_segment(&[0.0,0.5],0.25,false),(0,1));
    }
    #[test]
    fn node_queries_keep_duplicate_names_parent_motion_and_authored_visibility() {
        let value=serde_json::json!({"asset":{"version":"2.0"},"nodes":[{"name":"ref","translation":[10,0,0],"children":[1]},{"name":"ref","translation":[2,0,0]}],"animations":[{"name":"birth","samplers":[],"channels":[],"extras":{"menginePlayback":{"durationSeconds":1.0,"loop":false}}}]});
        let gltf=gltf::Gltf::from_slice(&serde_json::to_vec(&value).unwrap()).unwrap();
        let metadata=serde_json::json!({"sequences":[{"name":"birth","start":1000,"end":2000}],"globalSequences":[],"nodes":[{"node":0,"restTranslation":[10,0,0]},{"node":1,"restTranslation":[2,0,0],"attachment":{"id":7,"path":"embedded.mdx","visibility":{"interpolation":0,"globalSequence":-1,"times":[1000,1500,2000],"values":[[0],[1],[0]]}}}]});
        let mdx=crate::gltf_mdx::MdxAnimation::parse(metadata,&gltf.document).unwrap();
        let source=GltfPoseSource {document:gltf.document,buffers:vec![],billboards:vec![8,0],mdx:Some(mdx)};
        let camera=GltfBillboardCamera {model:Mat4::IDENTITY,look:-Vec3::Z,up:Vec3::Y};
        for (frame,expected) in [(29,0.0),(30,1.0),(59,1.0),(60,0.0),(99,0.0)] {
            let poses=source.sample_nodes(0,frame,60,Some(camera)).unwrap();
            assert_eq!(poses[0].name,poses[1].name);assert_ne!(poses[0].index,poses[1].index);
            assert!((poses[1].matrix.w_axis.truncate()-Vec3::new(10.0,0.0,2.0)).length()<1e-6);
            let a=poses[1].attachment.as_ref().unwrap();assert_eq!(a.id,7);assert_eq!(a.path,"embedded.mdx");assert_eq!(a.visibility,expected);
        }
        assert_eq!(source.sample_nodes(0,30,60,None).unwrap()[1].matrix.w_axis.truncate(),Vec3::new(12.0,0.0,0.0));
        assert!(source.sample_nodes(1,0,60,None).is_err());assert!(source.sample_nodes(0,0,0,None).is_err());
    }
}
