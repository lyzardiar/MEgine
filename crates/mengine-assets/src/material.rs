use crate::{AssetError, AssetError::Io};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

fn default_version() -> u32 {
    10
}

fn default_base_color() -> [f32; 4] {
    [0.8, 0.8, 0.8, 1.0]
}

fn default_roughness() -> f32 {
    0.5
}

fn default_clearcoat_roughness() -> f32 {
    0.1
}

fn default_ior() -> f32 {
    1.5
}

fn default_emissive_strength() -> f32 {
    1.0
}

fn default_alpha_cutoff() -> f32 {
    0.5
}

fn default_uv_scale() -> [f32; 2] {
    [1.0, 1.0]
}

fn default_one() -> f32 {
    1.0
}

fn default_render_queue() -> i32 {
    -1
}

fn default_anisotropy() -> u8 {
    1
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialShader {
    #[default]
    Pbr,
    Unlit,
    Custom,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialSurface {
    #[default]
    Opaque,
    Transparent,
    Cutout,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialBlendMode {
    #[default]
    Alpha,
    Premultiplied,
    Additive,
    Multiply,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialWrap {
    #[default]
    Repeat,
    Clamp,
    Mirror,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialFilter {
    Nearest,
    #[default]
    Linear,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MaterialAsset {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    pub shader: MaterialShader,
    #[serde(default)]
    pub custom_shader: String,
    #[serde(default)]
    pub custom_parameters: BTreeMap<String, [f32; 4]>,
    #[serde(default)]
    pub custom_keywords: BTreeMap<String, bool>,
    #[serde(default)]
    pub custom_textures: BTreeMap<String, String>,
    pub surface: MaterialSurface,
    pub blend_mode: MaterialBlendMode,
    pub transparent_depth_write: bool,
    #[serde(default = "default_render_queue")]
    pub render_queue: i32,
    #[serde(default = "default_base_color")]
    pub base_color: [f32; 4],
    pub metallic: f32,
    #[serde(default = "default_roughness")]
    pub roughness: f32,
    #[serde(default = "default_ior")]
    pub ior: f32,
    #[serde(default)]
    pub clearcoat: f32,
    #[serde(default = "default_clearcoat_roughness")]
    pub clearcoat_roughness: f32,
    pub emissive: [f32; 3],
    #[serde(default = "default_emissive_strength")]
    pub emissive_strength: f32,
    pub double_sided: bool,
    #[serde(default = "default_alpha_cutoff")]
    pub alpha_cutoff: f32,
    pub base_color_texture: String,
    #[serde(default)]
    pub normal_texture: String,
    #[serde(default = "default_one")]
    pub normal_scale: f32,
    #[serde(default)]
    pub metallic_roughness_texture: String,
    #[serde(default)]
    pub occlusion_texture: String,
    #[serde(default = "default_one")]
    pub occlusion_strength: f32,
    #[serde(default)]
    pub emissive_texture: String,
    #[serde(default = "default_uv_scale")]
    pub uv_scale: [f32; 2],
    pub uv_offset: [f32; 2],
    #[serde(default)]
    pub uv_rotation: f32,
    #[serde(default)]
    pub wrap_u: MaterialWrap,
    #[serde(default)]
    pub wrap_v: MaterialWrap,
    #[serde(default)]
    pub filter: MaterialFilter,
    #[serde(default)]
    pub mipmap_filter: MaterialFilter,
    #[serde(default = "default_anisotropy")]
    pub anisotropy: u8,
}

impl Default for MaterialAsset {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            shader: MaterialShader::Pbr,
            custom_shader: String::new(),
            custom_parameters: BTreeMap::new(),
            custom_keywords: BTreeMap::new(),
            custom_textures: BTreeMap::new(),
            surface: MaterialSurface::Opaque,
            blend_mode: MaterialBlendMode::Alpha,
            transparent_depth_write: false,
            render_queue: default_render_queue(),
            base_color: default_base_color(),
            metallic: 0.0,
            roughness: default_roughness(),
            ior: default_ior(),
            clearcoat: 0.0,
            clearcoat_roughness: default_clearcoat_roughness(),
            emissive: [0.0; 3],
            emissive_strength: default_emissive_strength(),
            double_sided: false,
            alpha_cutoff: default_alpha_cutoff(),
            base_color_texture: String::new(),
            normal_texture: String::new(),
            normal_scale: default_one(),
            metallic_roughness_texture: String::new(),
            occlusion_texture: String::new(),
            occlusion_strength: default_one(),
            emissive_texture: String::new(),
            uv_scale: default_uv_scale(),
            uv_offset: [0.0; 2],
            uv_rotation: 0.0,
            wrap_u: MaterialWrap::Repeat,
            wrap_v: MaterialWrap::Repeat,
            filter: MaterialFilter::Linear,
            mipmap_filter: MaterialFilter::Linear,
            anisotropy: default_anisotropy(),
        }
    }
}

impl MaterialAsset {
    pub fn normalized(mut self) -> Self {
        if self.version < default_version() {
            self.version = default_version();
        }
        for value in &mut self.base_color {
            *value = if value.is_finite() {
                value.clamp(0.0, 1.0)
            } else {
                1.0
            };
        }
        for value in &mut self.emissive {
            *value = if value.is_finite() {
                value.max(0.0)
            } else {
                0.0
            };
        }
        self.metallic = finite_or(self.metallic, 0.0).clamp(0.0, 1.0);
        self.roughness = finite_or(self.roughness, default_roughness()).clamp(0.04, 1.0);
        self.ior = finite_or(self.ior, default_ior()).clamp(1.0, 2.5);
        self.clearcoat = finite_or(self.clearcoat, 0.0).clamp(0.0, 1.0);
        self.clearcoat_roughness =
            finite_or(self.clearcoat_roughness, default_clearcoat_roughness()).clamp(0.04, 1.0);
        self.emissive_strength = finite_or(self.emissive_strength, 1.0).max(0.0);
        self.alpha_cutoff = finite_or(self.alpha_cutoff, default_alpha_cutoff()).clamp(0.0, 1.0);
        self.normal_scale = finite_or(self.normal_scale, default_one()).max(0.0);
        self.occlusion_strength = finite_or(self.occlusion_strength, default_one()).clamp(0.0, 1.0);
        for value in &mut self.uv_scale {
            *value = finite_or(*value, 1.0);
        }
        for value in &mut self.uv_offset {
            *value = finite_or(*value, 0.0);
        }
        self.uv_rotation = finite_or(self.uv_rotation, 0.0).rem_euclid(360.0);
        self.render_queue = self.render_queue.clamp(-1, 5000);
        self.anisotropy = self.anisotropy.clamp(1, 16);
        if self.anisotropy > 1 {
            // wgpu requires all sampler filters to be linear when anisotropy is enabled.
            self.filter = MaterialFilter::Linear;
            self.mipmap_filter = MaterialFilter::Linear;
        }
        self.custom_shader = self.custom_shader.trim().replace('\\', "/");
        for value in self.custom_parameters.values_mut().flatten() {
            *value = finite_or(*value, 0.0);
        }
        for value in self.custom_textures.values_mut() {
            *value = value.trim().replace('\\', "/");
        }
        self.base_color_texture = self.base_color_texture.trim().replace('\\', "/");
        self.normal_texture = self.normal_texture.trim().replace('\\', "/");
        self.metallic_roughness_texture = self.metallic_roughness_texture.trim().replace('\\', "/");
        self.occlusion_texture = self.occlusion_texture.trim().replace('\\', "/");
        self.emissive_texture = self.emissive_texture.trim().replace('\\', "/");
        self
    }
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

pub fn parse_material_asset(bytes: &[u8]) -> Result<MaterialAsset, AssetError> {
    let material = serde_json::from_slice::<MaterialAsset>(bytes)?;
    if material.version == 0 || material.version > default_version() {
        return Err(AssetError::Invalid(format!(
            "unsupported material version {}",
            material.version
        )));
    }
    if material.custom_parameters.len()
        > mengine_core::surface_shader::MAX_SURFACE_SHADER_PARAMETERS
    {
        return Err(AssetError::Invalid(format!(
            "material declares more than {} custom parameters",
            mengine_core::surface_shader::MAX_SURFACE_SHADER_PARAMETERS
        )));
    }
    if material.custom_keywords.len() > mengine_core::surface_shader::MAX_SURFACE_SHADER_KEYWORDS {
        return Err(AssetError::Invalid(format!(
            "material declares more than {} custom keywords",
            mengine_core::surface_shader::MAX_SURFACE_SHADER_KEYWORDS
        )));
    }
    if material.custom_textures.len() > mengine_core::surface_shader::MAX_SURFACE_SHADER_TEXTURES {
        return Err(AssetError::Invalid(format!(
            "material declares more than {} custom textures",
            mengine_core::surface_shader::MAX_SURFACE_SHADER_TEXTURES
        )));
    }
    if let Some(name) = material.custom_parameters.keys().find(|name| {
        let mut characters = name.chars();
        !matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
            || !characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
            || name.len() > 48
    }) {
        return Err(AssetError::Invalid(format!(
            "invalid custom material parameter name '{name}'"
        )));
    }
    if let Some(name) = material.custom_keywords.keys().find(|name| {
        let mut characters = name.chars();
        !matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
            || !characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
            || name.len() > 48
    }) {
        return Err(AssetError::Invalid(format!(
            "invalid custom material keyword name '{name}'"
        )));
    }
    if let Some((name, path)) = material.custom_textures.iter().find(|(name, path)| {
        let mut characters = name.chars();
        !matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
            || !characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
            || name.len() > 48
            || !valid_custom_texture_path(path)
    }) {
        return Err(AssetError::Invalid(format!(
            "invalid custom material texture '{name}': '{path}'"
        )));
    }
    if material.shader != MaterialShader::Custom
        && (!material.custom_parameters.is_empty()
            || !material.custom_keywords.is_empty()
            || !material.custom_textures.is_empty())
    {
        return Err(AssetError::Invalid(
            "only custom materials can contain custom_parameters, custom_keywords, or custom_textures".into(),
        ));
    }
    Ok(material.normalized())
}

fn valid_custom_texture_path(value: &str) -> bool {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty() {
        return true;
    }
    let lower = normalized.to_ascii_lowercase();
    normalized.starts_with("Assets/")
        && !normalized
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        && [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tga"]
            .iter()
            .any(|extension| lower.ends_with(extension))
}

pub fn load_material_asset(path: impl AsRef<Path>) -> Result<MaterialAsset, AssetError> {
    let bytes = std::fs::read(path).map_err(Io)?;
    parse_material_asset(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn material_defaults_and_invalid_values_are_normalized() {
        let parsed = parse_material_asset(
            br#"{
              "name":"Paint",
              "surface":"transparent",
              "base_color":[2,-1,0.5,0.25],
              "metallic":4,
              "roughness":0,
              "base_color_texture":"Assets\\Textures\\paint.png",
              "normal_texture":"Assets\\Textures\\paint-normal.png",
              "normal_scale":-2,
              "metallic_roughness_texture":"Assets\\Textures\\paint-orm.png",
              "occlusion_strength":5,
              "emissive_texture":"Assets\\Textures\\paint-emissive.png"
            }"#,
        )
        .unwrap();
        assert_eq!(parsed.version, 10);
        assert_eq!(parsed.surface, MaterialSurface::Transparent);
        assert_eq!(parsed.base_color, [1.0, 0.0, 0.5, 0.25]);
        assert_eq!(parsed.metallic, 1.0);
        assert_eq!(parsed.roughness, 0.04);
        assert_eq!(parsed.ior, 1.5);
        assert_eq!(parsed.base_color_texture, "Assets/Textures/paint.png");
        assert_eq!(parsed.normal_texture, "Assets/Textures/paint-normal.png");
        assert_eq!(parsed.normal_scale, 0.0);
        assert_eq!(
            parsed.metallic_roughness_texture,
            "Assets/Textures/paint-orm.png"
        );
        assert_eq!(parsed.occlusion_strength, 1.0);
        assert_eq!(
            parsed.emissive_texture,
            "Assets/Textures/paint-emissive.png"
        );
        assert_eq!(parsed.uv_scale, [1.0, 1.0]);

        let legacy = parse_material_asset(
            br#"{
              "version":1,
              "name":"Legacy",
              "shader":"pbr",
              "surface":"opaque",
              "base_color":[1,1,1,1],
              "metallic":0,
              "roughness":0.5,
              "emissive":[0,0,0],
              "emissive_strength":1,
              "double_sided":false,
              "alpha_cutoff":0.5,
              "base_color_texture":"",
              "uv_scale":[1,1],
              "uv_offset":[0,0]
            }"#,
        )
        .expect("materials authored before PBR maps were added remain loadable");
        assert_eq!(legacy.version, 10);
        assert_eq!(legacy.ior, 1.5);
        assert_eq!(legacy.clearcoat, 0.0);
        assert_eq!(legacy.clearcoat_roughness, 0.1);
        assert_eq!(legacy.blend_mode, MaterialBlendMode::Alpha);
        assert_eq!(legacy.custom_shader, "");
        assert!(!legacy.transparent_depth_write);
        assert_eq!(legacy.render_queue, -1);
        assert_eq!(legacy.normal_texture, "");
        assert_eq!(legacy.normal_scale, 1.0);
        assert_eq!(legacy.metallic_roughness_texture, "");
        assert_eq!(legacy.occlusion_texture, "");
        assert_eq!(legacy.occlusion_strength, 1.0);
        assert_eq!(legacy.emissive_texture, "");
        assert_eq!(legacy.uv_rotation, 0.0);
        assert_eq!(legacy.wrap_u, MaterialWrap::Repeat);
        assert_eq!(legacy.wrap_v, MaterialWrap::Repeat);
        assert_eq!(legacy.filter, MaterialFilter::Linear);
        assert_eq!(legacy.mipmap_filter, MaterialFilter::Linear);
        assert_eq!(legacy.anisotropy, 1);
    }

    #[test]
    fn material_pipeline_and_sampler_settings_are_normalized() {
        let parsed = parse_material_asset(
            br#"{
              "version":5,
              "shader":"custom",
              "custom_shader":" Assets\\Shaders\\toon.mshader ",
              "surface":"transparent",
              "blend_mode":"premultiplied",
              "transparent_depth_write":true,
              "render_queue":9999,
              "occlusion_texture":" Assets\\Textures\\ao.png ",
              "uv_rotation":-90,
              "wrap_u":"clamp",
              "wrap_v":"mirror",
              "filter":"nearest"
            }"#,
        )
        .unwrap();
        assert_eq!(parsed.version, 10);
        assert_eq!(parsed.shader, MaterialShader::Custom);
        assert_eq!(parsed.custom_shader, "Assets/Shaders/toon.mshader");
        assert_eq!(parsed.blend_mode, MaterialBlendMode::Premultiplied);
        assert!(parsed.transparent_depth_write);
        assert_eq!(parsed.render_queue, 5000);
        assert_eq!(parsed.occlusion_texture, "Assets/Textures/ao.png");
        assert_eq!(parsed.uv_rotation, 270.0);
        assert_eq!(parsed.wrap_u, MaterialWrap::Clamp);
        assert_eq!(parsed.wrap_v, MaterialWrap::Mirror);
        assert_eq!(parsed.filter, MaterialFilter::Nearest);
        assert_eq!(parsed.mipmap_filter, MaterialFilter::Linear);
        assert_eq!(parsed.anisotropy, 1);
        assert!(parse_material_asset(br#"{"version":11}"#).is_err());
        assert!(parse_material_asset(br#"{"version":0}"#).is_err());
    }

    #[test]
    fn clearcoat_parameters_are_bounded_and_legacy_safe() {
        let parsed =
            parse_material_asset(br#"{"version":6,"clearcoat":2.0,"clearcoat_roughness":0.0}"#)
                .unwrap();
        assert_eq!(parsed.clearcoat, 1.0);
        assert_eq!(parsed.clearcoat_roughness, 0.04);

        let legacy = parse_material_asset(br#"{"version":5}"#).unwrap();
        assert_eq!(legacy.version, 10);
        assert_eq!(legacy.clearcoat, 0.0);
        assert_eq!(legacy.clearcoat_roughness, 0.1);
    }

    #[test]
    fn index_of_refraction_is_bounded_and_legacy_safe() {
        let low = parse_material_asset(br#"{"version":7,"ior":0.5}"#).unwrap();
        let high = parse_material_asset(br#"{"version":7,"ior":4.0}"#).unwrap();
        assert_eq!(low.ior, 1.0);
        assert_eq!(high.ior, 2.5);

        let legacy = parse_material_asset(br#"{"version":6}"#).unwrap();
        assert_eq!(legacy.version, 10);
        assert_eq!(legacy.ior, 1.5);
    }

    #[test]
    fn anisotropic_sampling_is_bounded_and_forces_linear_filters() {
        let parsed = parse_material_asset(
            br#"{
              "version":5,
              "filter":"nearest",
              "mipmap_filter":"nearest",
              "anisotropy":64
            }"#,
        )
        .unwrap();
        assert_eq!(parsed.anisotropy, 16);
        assert_eq!(parsed.filter, MaterialFilter::Linear);
        assert_eq!(parsed.mipmap_filter, MaterialFilter::Linear);

        let disabled = parse_material_asset(br#"{"version":5,"anisotropy":0}"#).unwrap();
        assert_eq!(disabled.anisotropy, 1);
    }

    #[test]
    fn custom_parameter_values_are_versioned_bounded_and_shader_only() {
        let material = parse_material_asset(
            br#"{"version":8,"shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader","custom_parameters":{"rim_color":[1,0.5,0,1],"rim_power":[2,0,0,0]}}"#,
        )
        .unwrap();
        assert_eq!(
            material.custom_parameters["rim_power"],
            [2.0, 0.0, 0.0, 0.0]
        );
        assert!(parse_material_asset(
            br#"{"version":8,"shader":"pbr","custom_parameters":{"rim_power":[2,0,0,0]}}"#,
        )
        .is_err());
        assert!(parse_material_asset(
            br#"{"version":8,"shader":"custom","custom_parameters":{"bad-name":[2,0,0,0]}}"#,
        )
        .is_err());
    }

    #[test]
    fn custom_keywords_upgrade_and_require_custom_materials() {
        let material = parse_material_asset(
            br#"{"version":8,"shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader","custom_keywords":{"USE_RIM":true,"USE_DETAIL":false}}"#,
        )
        .unwrap();
        assert_eq!(material.version, 10);
        assert!(material.custom_keywords["USE_RIM"]);
        assert!(!material.custom_keywords["USE_DETAIL"]);
        assert!(parse_material_asset(
            br#"{"version":9,"shader":"pbr","custom_keywords":{"USE_RIM":true}}"#
        )
        .is_err());
        assert!(parse_material_asset(
            br#"{"version":9,"shader":"custom","custom_keywords":{"BAD-NAME":true}}"#
        )
        .is_err());
    }

    #[test]
    fn custom_textures_upgrade_normalize_and_require_custom_materials() {
        let material = parse_material_asset(
            br#"{"version":9,"shader":"custom","custom_shader":"Assets/Shaders/Detail.mshader","custom_textures":{"detail":" Assets\\Textures\\detail.png ","mask":""}}"#,
        )
        .unwrap();
        assert_eq!(material.version, 10);
        assert_eq!(
            material.custom_textures["detail"],
            "Assets/Textures/detail.png"
        );
        assert_eq!(material.custom_textures["mask"], "");
        assert!(parse_material_asset(
            br#"{"version":10,"shader":"pbr","custom_textures":{"detail":"Assets/Textures/detail.png"}}"#
        )
        .is_err());
        assert!(parse_material_asset(
            br#"{"version":10,"shader":"custom","custom_textures":{"detail":"../outside.png"}}"#
        )
        .is_err());
    }
}
