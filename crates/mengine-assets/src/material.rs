use crate::{AssetError, AssetError::Io};
use serde::{Deserialize, Serialize};
use std::path::Path;

fn default_version() -> u32 {
    1
}

fn default_base_color() -> [f32; 4] {
    [0.8, 0.8, 0.8, 1.0]
}

fn default_roughness() -> f32 {
    0.5
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

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialShader {
    #[default]
    Pbr,
    Unlit,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialSurface {
    #[default]
    Opaque,
    Transparent,
    Cutout,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MaterialAsset {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    pub shader: MaterialShader,
    pub surface: MaterialSurface,
    #[serde(default = "default_base_color")]
    pub base_color: [f32; 4],
    pub metallic: f32,
    #[serde(default = "default_roughness")]
    pub roughness: f32,
    pub emissive: [f32; 3],
    #[serde(default = "default_emissive_strength")]
    pub emissive_strength: f32,
    pub double_sided: bool,
    #[serde(default = "default_alpha_cutoff")]
    pub alpha_cutoff: f32,
    pub base_color_texture: String,
    #[serde(default = "default_uv_scale")]
    pub uv_scale: [f32; 2],
    pub uv_offset: [f32; 2],
}

impl Default for MaterialAsset {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            shader: MaterialShader::Pbr,
            surface: MaterialSurface::Opaque,
            base_color: default_base_color(),
            metallic: 0.0,
            roughness: default_roughness(),
            emissive: [0.0; 3],
            emissive_strength: default_emissive_strength(),
            double_sided: false,
            alpha_cutoff: default_alpha_cutoff(),
            base_color_texture: String::new(),
            uv_scale: default_uv_scale(),
            uv_offset: [0.0; 2],
        }
    }
}

impl MaterialAsset {
    pub fn normalized(mut self) -> Self {
        if self.version == 0 {
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
        self.emissive_strength = finite_or(self.emissive_strength, 1.0).max(0.0);
        self.alpha_cutoff = finite_or(self.alpha_cutoff, default_alpha_cutoff()).clamp(0.0, 1.0);
        for value in &mut self.uv_scale {
            *value = finite_or(*value, 1.0);
        }
        for value in &mut self.uv_offset {
            *value = finite_or(*value, 0.0);
        }
        self.base_color_texture = self.base_color_texture.trim().replace('\\', "/");
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
    Ok(serde_json::from_slice::<MaterialAsset>(bytes)?.normalized())
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
              "base_color_texture":"Assets\\Textures\\paint.png"
            }"#,
        )
        .unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.surface, MaterialSurface::Transparent);
        assert_eq!(parsed.base_color, [1.0, 0.0, 0.5, 0.25]);
        assert_eq!(parsed.metallic, 1.0);
        assert_eq!(parsed.roughness, 0.04);
        assert_eq!(parsed.base_color_texture, "Assets/Textures/paint.png");
        assert_eq!(parsed.uv_scale, [1.0, 1.0]);
    }
}
