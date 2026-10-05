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

pub struct GltfPoseSource { document: gltf::Document, buffers: Vec<gltf::buffer::Data> }
fn keyframe_segment(times: &[f32], time: f32, step: bool) -> (usize, usize) {
    let upper = times.partition_point(|v| *v <= time);
    let b = if step { upper.saturating_sub(1) } else { upper.min(times.len()-1) };
    (if step { b } else { b.saturating_sub(1) }, b)
}
impl GltfPoseSource {
    pub fn load(path: &Path) -> Result<Self, AssetError> {
        let (document, buffers, _) = gltf::import(path).map_err(|e| AssetError::Gltf(e.to_string()))?;
        Ok(Self { document, buffers })
    }
    pub fn sample(&self, clip: usize, frame: u32) -> Result<MeshData, AssetError> {
        self.sample_at_rate(clip, frame, 12)
    }
    pub fn sample_at_rate(&self, clip: usize, frame: u32, rate: u32) -> Result<MeshData, AssetError> {
        let fail = |s: &str| AssetError::Gltf(s.into());
        if !(1..=60).contains(&rate) { return Err(fail("skeletal sample rate must be between 1 and 60 Hz")); }
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
        for channel in animation.channels() {
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
        let mut parents = vec![None; nodes.len()];
        for node in &nodes { for child in node.children() { parents[child.index()] = Some(node.index()); } }
        let local = trs.iter().map(|(t,r,s)| Mat4::from_scale_rotation_translation(*s,*r,*t)).collect::<Vec<_>>();
        let mut globals = Vec::with_capacity(nodes.len());
        for i in 0..nodes.len() { let mut m = local[i]; let mut p = parents[i]; let mut depth = 0; while let Some(j) = p { depth += 1; if depth > nodes.len() { return Err(fail("cyclic node hierarchy")); } m = local[j]*m; p=parents[j]; } globals.push(m); }
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
}
