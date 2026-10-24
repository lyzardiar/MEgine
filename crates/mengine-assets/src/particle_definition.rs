//! Versioned, engine-owned particle data. Unity import is an offline producer of this format.
use crate::AssetError;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleCurveKey {
    pub time: f32,
    pub value: f32,
    pub in_tangent: f32,
    pub out_tangent: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleCurve {
    pub mode: String,
    pub constant: f32,
    pub constant_min: f32,
    pub multiplier: f32,
    pub keys: Vec<ParticleCurveKey>,
    pub keys_min: Vec<ParticleCurveKey>,
}

impl Default for ParticleCurve {
    fn default() -> Self { Self::constant(0.0) }
}

impl ParticleCurve {
    pub fn constant(value: f32) -> Self {
        Self { mode: "constant".into(), constant: value, constant_min: value, multiplier: 1.0, keys: Vec::new(), keys_min: Vec::new() }
    }

    pub fn evaluate(&self, time: f32, random: f32) -> f32 {
        let random = random.clamp(0.0, 1.0);
        match self.mode.as_str() {
            "curve" => sample_particle_curve(&self.keys, time) * self.multiplier,
            "two_constants" => self.constant_min + (self.constant - self.constant_min) * random,
            "two_curves" => {
                let low = sample_particle_curve(&self.keys_min, time);
                (low + (sample_particle_curve(&self.keys, time) - low) * random) * self.multiplier
            }
            _ => self.constant,
        }
    }
}

pub fn sample_particle_curve(keys: &[ParticleCurveKey], time: f32) -> f32 {
    let Some(first) = keys.first() else { return 0.0; };
    if time <= first.time { return first.value; }
    for pair in keys.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        if time > b.time { continue; }
        let span = b.time - a.time;
        if span <= f32::EPSILON { return b.value; }
        if a.out_tangent.is_infinite() || b.in_tangent.is_infinite() { return a.value; }
        let t = (time - a.time) / span;
        let t2 = t * t;
        let t3 = t2 * t;
        return (2.0 * t3 - 3.0 * t2 + 1.0) * a.value + (t3 - 2.0 * t2 + t) * span * a.out_tangent
            + (-2.0 * t3 + 3.0 * t2) * b.value + (t3 - t2) * span * b.in_tangent;
    }
    keys.last().unwrap().value
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleGradientKey { pub time: f32, pub color: [f32; 4] }
impl Default for ParticleGradientKey { fn default() -> Self { Self { time: 0.0, color: [1.0; 4] } } }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleGradient {
    pub mode: String,
    pub color: [f32; 4],
    pub color_min: [f32; 4],
    pub keys: Vec<ParticleGradientKey>,
    pub keys_min: Vec<ParticleGradientKey>,
}
impl Default for ParticleGradient {
    fn default() -> Self { Self { mode: "color".into(), color: [1.0; 4], color_min: [1.0; 4], keys: Vec::new(), keys_min: Vec::new() } }
}
impl ParticleGradient {
    pub fn evaluate(&self, time: f32, random: f32) -> [f32; 4] {
        let sample = |keys: &[ParticleGradientKey]| {
            let Some(first) = keys.first() else { return [1.0; 4]; };
            if time <= first.time { return first.color; }
            for pair in keys.windows(2) {
                if time > pair[1].time { continue; }
                let span = pair[1].time - pair[0].time;
                let t = if span > 0.0 { (time - pair[0].time) / span } else { 1.0 };
                return std::array::from_fn(|i| pair[0].color[i] + (pair[1].color[i] - pair[0].color[i]) * t);
            }
            keys.last().unwrap().color
        };
        let (a, b, t) = match self.mode.as_str() {
            "gradient" => return sample(&self.keys),
            "two_gradients" => (sample(&self.keys_min), sample(&self.keys), random.clamp(0.0, 1.0)),
            "two_colors" => (self.color_min, self.color, random.clamp(0.0, 1.0)),
            _ => return self.color,
        };
        std::array::from_fn(|i| a[i] + (b[i] - a[i]) * t)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleBurst { pub time: f32, pub count: ParticleCurve, pub cycles: u32, pub interval: f32, pub probability: f32 }
impl Default for ParticleBurst {
    fn default() -> Self { Self { time: 0.0, count: ParticleCurve::constant(1.0), cycles: 1, interval: 0.0, probability: 1.0 } }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleShape {
    pub kind: String,
    pub radius: f32,
    pub radius_thickness: f32,
    pub angle_degrees: f32,
    pub arc_degrees: f32,
    pub length: f32,
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub scale: [f32; 3],
    pub random_direction: f32,
    pub spherical_direction: f32,
    pub align_to_direction: bool,
}
impl Default for ParticleShape {
    fn default() -> Self { Self { kind: "point".into(), radius: 1.0, radius_thickness: 1.0, angle_degrees: 25.0, arc_degrees: 360.0, length: 0.0, position: [0.0; 3], rotation: [0.0; 3], scale: [1.0; 3], random_direction: 0.0, spherical_direction: 0.0, align_to_direction: false } }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleVelocityLimit { pub limit: ParticleCurve, pub dampen: f32, pub drag: ParticleCurve }
impl Default for ParticleVelocityLimit {
    fn default() -> Self { Self { limit: ParticleCurve::constant(1.0), dampen: 0.0, drag: ParticleCurve::default() } }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleTextureSheet {
    pub tiles: [u32; 2],
    pub frame_over_time: ParticleCurve,
    pub start_frame: ParticleCurve,
    pub cycles: f32,
    pub row: Option<u32>,
    pub random_row: bool,
}
impl Default for ParticleTextureSheet {
    fn default() -> Self { Self { tiles: [1, 1], frame_over_time: ParticleCurve::default(), start_frame: ParticleCurve::default(), cycles: 1.0, row: None, random_row: false } }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleRenderer {
    pub mode: String,
    pub mesh: String,
    pub mesh_basis: String,
    pub alignment: String,
    pub pivot: [f32; 3],
    pub length_scale: f32,
    pub velocity_scale: f32,
    pub sorting_fudge: f32,
}
impl Default for ParticleRenderer {
    fn default() -> Self { Self { mode: "billboard".into(), mesh: String::new(), mesh_basis: "gltf".into(), alignment: "view".into(), pivot: [0.0; 3], length_scale: 2.0, velocity_scale: 0.0, sorting_fudge: 0.0 } }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleTexture { pub path: String, pub scale: [f32; 2], pub offset: [f32; 2], pub srgb: bool, pub wrap_u: String, pub wrap_v: String, pub filter: String }
impl Default for ParticleTexture { fn default() -> Self { Self { path: String::new(), scale: [1.0; 2], offset: [0.0; 2], srgb: true, wrap_u: "repeat".into(), wrap_v: "repeat".into(), filter: "bilinear".into() } } }

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleMaterial {
    pub shader: String,
    pub source_guid: String,
    pub keywords: Vec<String>,
    pub floats: BTreeMap<String, f32>,
    pub colors: BTreeMap<String, [f32; 4]>,
    pub textures: BTreeMap<String, ParticleTexture>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ParticleDefinition {
    pub version: u32,
    pub name: String,
    pub coordinate_space: String,
    pub scaling_mode: String,
    pub seed: u32,
    pub duration: f32,
    pub simulation_speed: f32,
    pub looping: bool,
    pub start_delay: ParticleCurve,
    pub max_particles: u32,
    pub simulation_space: String,
    pub start_lifetime: ParticleCurve,
    pub start_speed: ParticleCurve,
    pub start_size: [ParticleCurve; 3],
    pub start_rotation: [ParticleCurve; 3],
    pub start_color: ParticleGradient,
    pub gravity: [f32; 3],
    pub rate_over_time: ParticleCurve,
    pub bursts: Vec<ParticleBurst>,
    pub shape: ParticleShape,
    pub size_over_lifetime: Option<[ParticleCurve; 3]>,
    pub color_over_lifetime: Option<ParticleGradient>,
    pub rotation_over_lifetime: Option<[ParticleCurve; 3]>,
    pub velocity_over_lifetime: Option<[ParticleCurve; 3]>,
    pub limit_velocity: Option<ParticleVelocityLimit>,
    pub texture_sheet: Option<ParticleTextureSheet>,
    pub custom_data1: Option<[ParticleCurve; 4]>,
    pub custom_data2: Option<[ParticleCurve; 4]>,
    pub renderer: ParticleRenderer,
    pub material: ParticleMaterial,
}
impl Default for ParticleDefinition {
    fn default() -> Self {
        Self { version: 1, name: String::new(), coordinate_space: "engine".into(), scaling_mode: "hierarchy".into(), seed: 1, duration: 5.0, simulation_speed: 1.0, looping: true, start_delay: ParticleCurve::default(), max_particles: 1000, simulation_space: "local".into(), start_lifetime: ParticleCurve::constant(5.0), start_speed: ParticleCurve::constant(5.0), start_size: std::array::from_fn(|_| ParticleCurve::constant(1.0)), start_rotation: std::array::from_fn(|_| ParticleCurve::default()), start_color: ParticleGradient::default(), gravity: [0.0; 3], rate_over_time: ParticleCurve::constant(10.0), bursts: Vec::new(), shape: ParticleShape::default(), size_over_lifetime: None, color_over_lifetime: None, rotation_over_lifetime: None, velocity_over_lifetime: None, limit_velocity: None, texture_sheet: None, custom_data1: None, custom_data2: None, renderer: ParticleRenderer::default(), material: ParticleMaterial::default() }
    }
}

pub fn parse_particle_definition(text: &str) -> Result<ParticleDefinition, AssetError> {
    let definition: ParticleDefinition = serde_json::from_str(text).map_err(|e| AssetError::Invalid(format!("particle definition: {e}")))?;
    if definition.version != 1 || !definition.duration.is_finite() || definition.duration <= 0.0 || definition.max_particles > 100_000 || !definition.simulation_speed.is_finite() || definition.simulation_speed < 0.0 {
        return Err(AssetError::Invalid("unsupported particle version, duration or capacity".into()));
    }
    validate_particle_definition(&definition).map_err(AssetError::Invalid)?;
    Ok(definition)
}

fn validate_particle_definition(d: &ParticleDefinition) -> Result<(), String> {
    let enum_value = |value: &str, allowed: &[&str]| allowed.contains(&value);
    let finite = |values: &[f32]| values.iter().all(|value| value.is_finite());
    if !enum_value(&d.coordinate_space, &["engine", "unity"]) || !enum_value(&d.simulation_space, &["local", "world"]) || d.scaling_mode != "hierarchy" {
        return Err("unsupported particle coordinate or simulation space".into());
    }
    let r = &d.renderer;
    if !enum_value(&r.mode, &["mesh", "billboard", "stretch"]) || !enum_value(&r.alignment, &["view", "world", "local"]) || !enum_value(&r.mesh_basis, &["gltf", "unity_shared_mesh_fbx2gltf"]) || !finite(&r.pivot) || !finite(&[r.length_scale, r.velocity_scale, r.sorting_fudge]) {
        return Err("unsupported or invalid particle renderer".into());
    }
    let s = &d.shape;
    if !enum_value(&s.kind, &["point", "cone", "cone_volume", "box", "sphere", "hemisphere", "circle", "edge"]) || !finite(&s.position) || !finite(&s.rotation) || !finite(&s.scale) || !finite(&[s.radius, s.radius_thickness, s.angle_degrees, s.arc_degrees, s.length, s.random_direction, s.spherical_direction]) || !finite(&d.gravity) {
        return Err("unsupported or invalid particle shape".into());
    }
    let mut curves = vec![&d.start_delay, &d.start_lifetime, &d.start_speed, &d.rate_over_time];
    curves.extend(d.start_size.iter());
    curves.extend(d.start_rotation.iter());
    for optional in [&d.size_over_lifetime, &d.rotation_over_lifetime, &d.velocity_over_lifetime] { if let Some(values) = optional { curves.extend(values.iter()); } }
    for optional in [&d.custom_data1, &d.custom_data2] { if let Some(values) = optional { curves.extend(values.iter()); } }
    for burst in &d.bursts {
        if !finite(&[burst.time, burst.interval, burst.probability]) || burst.time < 0.0 || burst.interval < 0.0 || !(0.0..=1.0).contains(&burst.probability) || burst.cycles > 100_000 { return Err("invalid particle burst".into()); }
        curves.push(&burst.count);
    }
    if let Some(limit) = &d.limit_velocity {
        if !limit.dampen.is_finite() || !(0.0..=1.0).contains(&limit.dampen) { return Err("invalid particle velocity damping".into()); }
        curves.extend([&limit.limit, &limit.drag]);
    }
    if let Some(sheet) = &d.texture_sheet {
        if sheet.tiles.iter().any(|value| *value == 0 || *value > 4096) || !sheet.cycles.is_finite() || sheet.cycles < 0.0 { return Err("invalid particle texture sheet".into()); }
        curves.extend([&sheet.frame_over_time, &sheet.start_frame]);
    }
    for curve in curves {
        let keys_valid = |keys: &[ParticleCurveKey]| keys.iter().all(|key| finite(&[key.time, key.value, key.in_tangent, key.out_tangent])) && keys.windows(2).all(|pair| pair[0].time <= pair[1].time);
        if !enum_value(&curve.mode, &["constant", "curve", "two_constants", "two_curves"]) || !finite(&[curve.constant, curve.constant_min, curve.multiplier]) || !keys_valid(&curve.keys) || !keys_valid(&curve.keys_min) || (matches!(curve.mode.as_str(), "curve" | "two_curves") && curve.keys.is_empty()) || (curve.mode == "two_curves" && curve.keys_min.is_empty()) {
            return Err("unsupported, nonfinite or unordered particle curve".into());
        }
    }
    for gradient in std::iter::once(&d.start_color).chain(d.color_over_lifetime.iter()) {
        let keys_valid = |keys: &[ParticleGradientKey]| keys.iter().all(|key| key.time.is_finite() && finite(&key.color)) && keys.windows(2).all(|pair| pair[0].time <= pair[1].time);
        if !enum_value(&gradient.mode, &["color", "gradient", "two_colors", "two_gradients"]) || !finite(&gradient.color) || !finite(&gradient.color_min) || !keys_valid(&gradient.keys) || !keys_valid(&gradient.keys_min) || (matches!(gradient.mode.as_str(), "gradient" | "two_gradients") && gradient.keys.is_empty()) || (gradient.mode == "two_gradients" && gradient.keys_min.is_empty()) {
            return Err("unsupported, nonfinite or unordered particle gradient".into());
        }
    }
    if !d.material.floats.values().all(|value| value.is_finite()) || !d.material.colors.values().all(|color| finite(color)) { return Err("nonfinite particle material property".into()); }
    for texture in d.material.textures.values() {
        if !finite(&texture.scale) || !finite(&texture.offset) || !enum_value(&texture.wrap_u, &["repeat", "clamp", "mirror", "mirror_once"]) || !enum_value(&texture.wrap_v, &["repeat", "clamp", "mirror", "mirror_once"]) || !enum_value(&texture.filter, &["point", "bilinear", "trilinear"]) {
            return Err("unsupported or invalid particle texture sampler".into());
        }
    }
    Ok(())
}

pub fn load_particle_definition(path: &Path) -> Result<ParticleDefinition, AssetError> {
    let text = std::fs::read_to_string(path).map_err(AssetError::Io)?;
    parse_particle_definition(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hermite_and_two_curve_sampling() {
        let keys = vec![ParticleCurveKey { time: 0.0, value: 0.0, out_tangent: 1.0, ..Default::default() }, ParticleCurveKey { time: 1.0, value: 1.0, in_tangent: 1.0, ..Default::default() }];
        assert!((sample_particle_curve(&keys, 0.25) - 0.25).abs() < 1e-6);
        assert_eq!(sample_particle_curve(&keys, 2.0), 1.0);
        let curve = ParticleCurve { mode: "two_curves".into(), keys, keys_min: vec![ParticleCurveKey::default()], multiplier: 2.0, ..Default::default() };
        assert!((curve.evaluate(0.5, 0.5) - 0.5).abs() < 1e-6);
    }
    #[test]
    fn version_and_defaults_round_trip() {
        let value = parse_particle_definition("{}").unwrap();
        assert_eq!(parse_particle_definition(&serde_json::to_string(&value).unwrap()).unwrap(), value);
        assert!(parse_particle_definition("{\"version\":2}").is_err());
    }
    #[test]
    fn invalid_enums_and_nonfinite_or_unordered_curves_are_rejected() {
        assert!(parse_particle_definition("{\"renderer\":{\"mode\":\"unsupported\"}}").is_err());
        assert!(parse_particle_definition("{\"start_speed\":{\"constant\":1e100}}").is_err());
        assert!(parse_particle_definition("{\"start_speed\":{\"mode\":\"curve\",\"keys\":[{\"time\":1},{\"time\":0}]}}").is_err());
        assert!(parse_particle_definition("{\"texture_sheet\":{\"tiles\":[0,2]}}").is_err());
        assert!(parse_particle_definition("{\"material\":{\"textures\":{\"_MainTex\":{\"wrap_u\":\"unknown\"}}}}").is_err());
    }
}
