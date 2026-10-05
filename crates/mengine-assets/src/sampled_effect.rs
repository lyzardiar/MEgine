// Author: MiYu. Validated sampled billboard/ribbon/light playback assets.
use serde::Deserialize;
use std::path::{Component, Path};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampledEffectAsset {
    pub schema_version: u32,
    pub fps: u32,
    pub materials: Vec<EffectMaterial>,
    pub clips: Vec<EffectClip>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectMaterial {
    pub texture: String,
    pub blend: String,
    #[serde(default)]
    pub alpha_cutoff: f32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct EffectClip {
    pub name: String,
    pub duration: f32,
    #[serde(rename = "loop")]
    pub looping: bool,
    pub frames: Vec<EffectFrame>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct EffectFrame {
    pub seconds: f32,
    pub particles: Vec<EffectParticle>,
    pub quads: Vec<EffectQuad>,
    pub lights: Vec<EffectLight>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct EffectParticle {
    pub material: usize,
    pub position: [f32; 3],
    pub size: f32,
    pub color: [f32; 4],
    pub uv: [f32; 4],
}

#[derive(Clone, Debug, Deserialize)]
pub struct EffectQuad {
    pub material: usize,
    pub corners: Option<[[f32; 3]; 4]>,
    pub tail: Option<[[f32; 3]; 2]>,
    #[serde(default)]
    pub width: f32,
    pub color: [f32; 4],
    pub uv: [f32; 4],
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectLight {
    pub kind: String,
    pub position: [f32; 3],
    pub color: [f32; 4],
    pub intensity: f32,
    pub range: f32,
    pub ambient_color: [f32; 4],
}

pub fn effect_asset_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    let path = Path::new(&normalized);
    !normalized.is_empty() && !normalized.contains(':') && !path.is_absolute() && !path.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
}

impl SampledEffectAsset {
    pub fn load(path: &Path) -> Result<Self, String> {
        if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 64 * 1024 * 1024 { return Err("sampled effect exceeds 64 MiB".into()); }
        Self::parse(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
    }

    pub fn parse(text: &str) -> Result<Self, String> {
        let asset: Self = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if asset.schema_version != 1 || asset.fps == 0 || asset.fps > 120 || asset.clips.len() > 1024 || asset.materials.len() > 1024 { return Err("invalid sampled effect schema or limits".into()); }
        for material in &asset.materials {
            if !effect_asset_path(&material.texture) || !matches!(material.blend.as_str(), "alpha" | "additive" | "multiply") || !material.alpha_cutoff.is_finite() || !(0.0..=1.0).contains(&material.alpha_cutoff) { return Err("invalid sampled effect material".into()); }
        }
        let mut samples = 0usize;
        for clip in &asset.clips {
            if !clip.duration.is_finite() || clip.duration <= 0. || clip.duration > 600. || clip.frames.is_empty() || clip.frames.len() > 72_001 { return Err("invalid sampled effect clip".into()); }
            let mut previous = -1.;
            for frame in &clip.frames {
                samples += frame.particles.len() + frame.quads.len() + frame.lights.len();
                if samples > 2_000_000 || !frame.seconds.is_finite() || frame.seconds < 0. || frame.seconds <= previous || frame.seconds > clip.duration + 1e-4 || frame.particles.len() > 4000 || frame.quads.len() > 16000 || frame.lights.len() > 64 { return Err("invalid sampled effect frame".into()); }
                previous = frame.seconds;
                for p in &frame.particles {
                    if p.material >= asset.materials.len() || !p.position.iter().chain(&p.color).chain(&p.uv).chain([&p.size]).all(|v| v.is_finite()) || p.size < 0. { return Err("invalid sampled effect particle".into()); }
                }
                for q in &frame.quads {
                    if q.material >= asset.materials.len() || q.corners.is_some() == q.tail.is_some() || !q.corners.iter().flatten().flatten().chain(q.tail.iter().flatten().flatten()).chain(&q.color).chain(&q.uv).chain([&q.width]).all(|v| v.is_finite()) || q.width < 0. { return Err("invalid sampled effect quad".into()); }
                }
                for l in &frame.lights {
                    if !matches!(l.kind.as_str(), "omni" | "directional" | "ambient") || !l.position.iter().chain(&l.color).chain(&l.ambient_color).chain([&l.intensity, &l.range]).all(|v| v.is_finite()) { return Err("invalid sampled effect light".into()); }
                }
            }
            if clip.frames[0].seconds != 0. || (clip.frames.last().unwrap().seconds - clip.duration).abs() > 1e-4 { return Err("sampled effect must include exact clip endpoints".into()); }
        }
        Ok(asset)
    }
}

impl EffectClip {
    pub fn sample(&self, seconds: f32, looping: bool) -> &EffectFrame {
        let time = if !seconds.is_finite() { 0. } else if looping { seconds.max(0.).rem_euclid(self.duration) } else { seconds.clamp(0., self.duration) };
        let index = self.frames.partition_point(|frame| frame.seconds <= time).saturating_sub(1);
        &self.frames[index]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value { serde_json::json!({"schemaVersion":1,"fps":12,"materials":[{"texture":"Assets/spark.png","blend":"additive"}],"clips":[{"name":"Birth","duration":0.1,"loop":false,"frames":[{"seconds":0.,"particles":[],"quads":[],"lights":[]},{"seconds":0.1,"particles":[{"material":0,"position":[1.,2.,3.],"size":1.,"color":[1.,1.,1.,1.],"uv":[0.,0.,1.,1.]}],"quads":[],"lights":[]}]}]}) }
    #[test]
    fn exact_endpoints_hold_and_loop_independently_of_fps() {
        let a = SampledEffectAsset::parse(&fixture().to_string()).unwrap(); let c = &a.clips[0];
        assert!(c.sample(0.09, false).particles.is_empty());
        assert_eq!(c.sample(0.1, false).particles.len(), 1);
        assert_eq!(c.sample(5., false).particles.len(), 1);
        assert!(c.sample(0.1, true).particles.is_empty());
        assert!(c.sample(f32::NAN, false).particles.is_empty());
    }
    #[test]
    fn malformed_indices_paths_timestamps_and_quad_shapes_are_rejected() {
        for path in ["../outside.png", "C:/outside.png", "/outside.png", "Assets/../../x"] { let mut f=fixture(); f["materials"][0]["texture"]=path.into(); assert!(SampledEffectAsset::parse(&f.to_string()).is_err()); }
        let mut f=fixture(); f["clips"][0]["frames"][1]["particles"][0]["material"]=1.into(); assert!(SampledEffectAsset::parse(&f.to_string()).is_err());
        let mut f=fixture(); f["clips"][0]["frames"][1]["seconds"]=0.09.into(); assert!(SampledEffectAsset::parse(&f.to_string()).is_err());
        let mut f=fixture(); f["clips"][0]["frames"][0]["quads"]=serde_json::json!([{"material":0,"color":[1.,1.,1.,1.],"uv":[0.,0.,1.,1.]}]); assert!(SampledEffectAsset::parse(&f.to_string()).is_err());
    }
}
