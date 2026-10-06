//! MiYu: evaluate original MDX transform tracks retained in converted glTF extras.
use crate::AssetError;
use glam::{Mat4, Vec3, Vec4};
use serde::Deserialize;

fn fail(message: &str) -> AssetError { AssetError::Gltf(format!("MDX transform metadata: {message}")) }

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Track {
    interpolation: u32,
    global_sequence: i32,
    times: Vec<u32>,
    values: Vec<Vec<f32>>,
    in_tangents: Option<Vec<Vec<f32>>>,
    out_tangents: Option<Vec<Vec<f32>>>,
    #[serde(default)] collapse_outside: bool,
}
#[derive(Deserialize)]
struct Sequence { name: String, start: u32, end: u32 }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Node {
    node: usize,
    rest_translation: [f32;3],
    translation: Option<Track>,
    rotation: Option<Track>,
    scale: Option<Track>,
    #[serde(default)] attachment: Option<Attachment>,
}
#[derive(Deserialize)]
pub(crate) struct Attachment { pub id: u32, pub path: String, visibility: Option<Track> }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct MdxAnimation { sequences: Vec<Sequence>, global_sequences: Vec<u32>, nodes: Vec<Node> }

impl Track {
    fn validate(&self, width: usize, globals: usize) -> Result<(),AssetError> {
        let values_valid=|values: &[Vec<f32>]| values.len()==self.times.len() && values.iter().all(|v|v.len()==width && v.iter().all(|n|n.is_finite()));
        if self.interpolation>3 || self.global_sequence < -1 || self.global_sequence>=0 && self.global_sequence as usize>=globals || self.times.windows(2).any(|w|w[0]>w[1]) || !values_valid(&self.values) { return Err(fail("invalid key values, times or global sequence")); }
        if self.interpolation>=2 && (!self.in_tangents.as_deref().is_some_and(values_valid) || !self.out_tangents.as_deref().is_some_and(values_valid)) { return Err(fail("missing or invalid cubic tangents")); }
        Ok(())
    }
    fn value(values: &[Vec<f32>], index: usize) -> Vec4 {
        let v=&values[index];Vec4::new(v[0],v.get(1).copied().unwrap_or(0.0),v.get(2).copied().unwrap_or(0.0),if v.len()==4 {v[3]} else {0.0})
    }
    fn sample(&self, sequence: &Sequence, wall: u32, globals: &[u32], rest: Vec4, rotation: bool) -> Vec4 {
        if self.times.is_empty() { return rest; }
        let (lo,hi,time)=if self.global_sequence>=0 {
            let period=globals[self.global_sequence as usize];(0,self.times.len(),if period>0 {wall%period} else {0})
        } else {
            (self.times.partition_point(|t|*t<sequence.start),self.times.partition_point(|t|*t<=sequence.end),sequence.start+wall)
        };
        if lo>=hi { return if self.collapse_outside {Vec4::ZERO} else {rest}; }
        if time<=self.times[lo] { return Self::value(&self.values,lo); }
        if time>=self.times[hi-1] { return Self::value(&self.values,hi-1); }
        let a=lo+self.times[lo..hi].partition_point(|t|*t<=time)-1;let b=a+1;
        let t=(time-self.times[a]) as f32/(self.times[b]-self.times[a]) as f32;
        let x=Self::value(&self.values,a);let y=Self::value(&self.values,b);
        if self.interpolation==0 { return x; }
        if self.interpolation==1 { return if rotation {slerp(x,y,t)} else {x.lerp(y,t)}; }
        let out=Self::value(self.out_tangents.as_ref().unwrap(),a);let input=Self::value(self.in_tangents.as_ref().unwrap(),b);
        if rotation { return slerp(slerp(x,y,t),slerp(out,input,t),2.0*t*(1.0-t)); }
        if self.interpolation==2 { let t2=t*t;let t3=t2*t;x*(2.0*t3-3.0*t2+1.0)+y*(-2.0*t3+3.0*t2)+out*(t3-2.0*t2+t)+input*(t3-t2) }
        else { let u=1.0-t;x*(u*u*u)+out*(3.0*u*u*t)+input*(3.0*u*t*t)+y*(t*t*t) }
    }
}

// MiYu: source spherical interpolation keeps the original control quaternions.
fn slerp(a: Vec4, mut b: Vec4, t: f32) -> Vec4 {
    let mut dot=a.dot(b);
    if dot<0.0 { dot=-dot;b=-b; }
    if dot>1.0-1e-6 { return a.lerp(b,t); }
    let angle=dot.clamp(-1.0,1.0).acos();let inverse=1.0/angle.sin();
    a*((1.0-t)*angle).sin()*inverse+b*(t*angle).sin()*inverse
}
fn transform(translation: Vec3, q: Vec4, scale: Vec3) -> Mat4 {
    let (x,y,z,w)=(q.x,q.y,q.z,q.w);
    Mat4::from_cols(Vec4::new(1.0-2.0*(y*y+z*z),2.0*(x*y+w*z),2.0*(x*z-w*y),0.0)*scale.x,Vec4::new(2.0*(x*y-w*z),1.0-2.0*(x*x+z*z),2.0*(y*z+w*x),0.0)*scale.y,Vec4::new(2.0*(x*z+w*y),2.0*(y*z-w*x),1.0-2.0*(x*x+y*y),0.0)*scale.z,translation.extend(1.0))
}

impl MdxAnimation {
    pub(crate) fn parse(value: serde_json::Value, document: &gltf::Document) -> Result<Self,AssetError> {
        let result:Self=serde_json::from_value(value).map_err(|e|fail(&e.to_string()))?;
        let animations=document.animations().collect::<Vec<_>>();let nodes=document.nodes().collect::<Vec<_>>();
        if result.sequences.len()!=animations.len() { return Err(fail("sequence count differs from glTF")); }
        for (sequence,animation) in result.sequences.iter().zip(animations) {
            if sequence.end<=sequence.start || sequence.end-sequence.start>600_000 || sequence.name!=animation.name().unwrap_or("") { return Err(fail("invalid source sequence")); }
        }
        let mut seen=vec![false;nodes.len()];
        for node in &result.nodes {
            if node.node>=nodes.len() || seen[node.node] || node.rest_translation.iter().any(|v|!v.is_finite()) { return Err(fail("invalid source node")); }
            seen[node.node]=true;
            let (rest,_,_)=nodes[node.node].transform().decomposed();
            if rest.iter().zip(node.rest_translation).any(|(a,b)|(*a-b).abs()>1e-6) { return Err(fail("source pivot differs from glTF")); }
            for (track,width) in [(&node.translation,3),(&node.rotation,4),(&node.scale,3)] { if let Some(track)=track {track.validate(width,result.global_sequences.len())?;} }
            if let Some(attachment)=&node.attachment {
                if attachment.path.len()>260 || attachment.path.contains('\0') { return Err(fail("invalid attachment path")); }
                if let Some(track)=&attachment.visibility { track.validate(1,result.global_sequences.len())?; }
            }
        }
        if document.skins().flat_map(|s|s.joints()).any(|j|!seen[j.index()]) { return Err(fail("source joint is missing")); }
        Ok(result)
    }
    pub(crate) fn apply(&self, clip: usize, time: f32, matrices: &mut [Mat4]) -> Result<(),AssetError> {
        let sequence=self.sequences.get(clip).ok_or_else(||fail("source clip is missing"))?;
        let wall=((time*1000.0).round_ties_even() as u32).min(sequence.end-sequence.start);
        for node in &self.nodes {
            let sample=|track: &Option<Track>, rest, rotation| track.as_ref().map_or(rest,|t|t.sample(sequence,wall,&self.global_sequences,rest,rotation));
            let translation=Vec3::from_array(node.rest_translation)+sample(&node.translation,Vec4::ZERO,false).truncate();
            let rotation=sample(&node.rotation,Vec4::W,true);let scale=sample(&node.scale,Vec4::ONE,false).truncate();
            let matrix=transform(translation,rotation,scale);
            if !matrix.is_finite() { return Err(fail("non-finite source transform")); }
            matrices[node.node]=matrix;
        }
        Ok(())
    }
    pub(crate) fn attachment(&self, node: usize, clip: usize, time: f32) -> Option<(u32,&str,f32)> {
        let attachment=self.nodes.get(node).filter(|n|n.node==node).or_else(||self.nodes.iter().find(|n|n.node==node))?.attachment.as_ref()?;
        let sequence=self.sequences.get(clip)?;
        let wall=((time*1000.0).round_ties_even() as u32).min(sequence.end-sequence.start);
        let visibility=attachment.visibility.as_ref().map_or(1.0,|t|t.sample(sequence,wall,&self.global_sequences,Vec4::X,false).x);
        Some((attachment.id,&attachment.path,visibility))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn track(mode: u32, global: i32, times: Vec<u32>, values: Vec<Vec<f32>>) -> Track { Track {interpolation:mode,global_sequence:global,times,values,in_tangents:None,out_tangents:None,collapse_outside:false} }
    fn sequence() -> Sequence { Sequence {name:"walk".into(),start:1000,end:2134} }
    #[test]
    fn exact_keys_keep_motion_at_fractional_loop_boundaries() {
        let t=track(1,-1,vec![1000,1033,1083],vec![vec![0.0,0.0,0.0],vec![1.0,0.0,0.0],vec![0.0,0.0,0.0]]);
        assert!(t.sample(&sequence(),33,&[],Vec4::ZERO,false).x>0.9999);
        assert_eq!(t.sample(&sequence(),0,&[],Vec4::ZERO,false),Vec4::ZERO);
        assert_eq!(t.sample(&sequence(),1134,&[],Vec4::ZERO,false),Vec4::ZERO);
    }
    #[test]
    fn empty_sequence_windows_and_global_tracks_have_source_defaults() {
        let mut t=track(1,-1,vec![0,100],vec![vec![0.0;3],vec![1.0;3]]);
        assert_eq!(t.sample(&sequence(),50,&[],Vec4::ONE,false),Vec4::ONE);
        t.collapse_outside=true;assert_eq!(t.sample(&sequence(),50,&[],Vec4::ONE,false),Vec4::ZERO);
        t.global_sequence=0;assert!((t.sample(&sequence(),250,&[200],Vec4::ONE,false).x-0.5).abs()<1e-6);
        assert_eq!(t.sample(&sequence(),250,&[0],Vec4::ONE,false),Vec4::ZERO);
    }
    #[test]
    fn source_cubic_tangents_and_quaternion_curves_are_preserved() {
        let mut t=track(2,-1,vec![1000,1100],vec![vec![0.0;3],vec![1.0;3]]);
        t.in_tangents=Some(vec![vec![0.0;3],vec![0.0;3]]);t.out_tangents=Some(vec![vec![2.0;3],vec![0.0;3]]);
        assert!((t.sample(&sequence(),50,&[],Vec4::ZERO,false).x-0.75).abs()<1e-6);
        t.interpolation=3;assert!((t.sample(&sequence(),50,&[],Vec4::ZERO,false).x-0.875).abs()<1e-6);
        let a=Vec4::W;let b=Vec4::new(0.0,1.0,0.0,0.0);assert!((slerp(a,b,0.5).y-std::f32::consts::FRAC_1_SQRT_2).abs()<1e-6);
        assert_eq!(slerp(a,-a,0.5),a);
    }
    #[test]
    fn malformed_tracks_are_rejected_before_sampling() {
        assert!(track(1,-1,vec![10,0],vec![vec![0.0;3];2]).validate(3,0).is_err());
        assert!(track(1,0,vec![0],vec![vec![0.0;3]]).validate(3,0).is_err());
        assert!(track(2,-1,vec![0],vec![vec![0.0;3]]).validate(3,0).is_err());
        assert!(track(1,-1,vec![0],vec![vec![f32::NAN;3]]).validate(3,0).is_err());
    }
    #[test]
    fn source_matrix_keeps_nonuniform_and_collapsed_scales() {
        let matrix=transform(Vec3::new(2.0,3.0,4.0),Vec4::new(0.0,std::f32::consts::FRAC_1_SQRT_2,0.0,std::f32::consts::FRAC_1_SQRT_2),Vec3::new(2.0,3.0,4.0));
        assert!((matrix.transform_point3(Vec3::X)-Vec3::new(2.0,3.0,2.0)).length()<1e-5);
        let collapsed=transform(Vec3::Y,Vec4::W,Vec3::ZERO);assert_eq!(collapsed.transform_point3(Vec3::ONE),Vec3::Y);
    }
    #[test]
    fn scalar_attachment_visibility_supports_cubic_global_and_empty_tracks() {
        let mut t=track(0,-1,vec![1000,1050],vec![vec![0.0],vec![1.0]]);
        assert!(t.validate(1,0).is_ok());assert_eq!(t.sample(&sequence(),49,&[],Vec4::X,false).x,0.0);assert_eq!(t.sample(&sequence(),50,&[],Vec4::X,false).x,1.0);
        t.interpolation=1;assert_eq!(t.sample(&sequence(),25,&[],Vec4::X,false).x,0.5);
        t.interpolation=2;t.in_tangents=Some(vec![vec![0.0];2]);t.out_tangents=Some(vec![vec![2.0],vec![0.0]]);
        assert!(t.validate(1,0).is_ok());assert_eq!(t.sample(&sequence(),25,&[],Vec4::X,false).x,0.75);
        t.interpolation=3;assert_eq!(t.sample(&sequence(),25,&[],Vec4::X,false).x,0.875);
        t.global_sequence=0;t.times=vec![0,100];t.interpolation=1;assert_eq!(t.sample(&sequence(),250,&[200],Vec4::X,false).x,0.5);
        t.times.clear();t.values.clear();assert_eq!(t.sample(&sequence(),10,&[200],Vec4::X,false).x,1.0);
    }
}
