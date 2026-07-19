use crate::{AssetError, AssetError::Io, MaterialAsset, MaterialShader};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

const MATERIAL_INSTANCE_VERSION: u32 = 2;

fn default_version() -> u32 {
    MATERIAL_INSTANCE_VERSION
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MaterialInstanceOverrides {
    pub base_color: Option<[f32; 4]>,
    pub metallic: Option<f32>,
    pub roughness: Option<f32>,
    pub ior: Option<f32>,
    pub clearcoat: Option<f32>,
    pub clearcoat_roughness: Option<f32>,
    pub emissive: Option<[f32; 3]>,
    pub emissive_strength: Option<f32>,
    pub custom_parameters: BTreeMap<String, [f32; 4]>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MaterialInstanceAsset {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    pub parent: String,
    pub overrides: MaterialInstanceOverrides,
}

impl Default for MaterialInstanceAsset {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            parent: String::new(),
            overrides: MaterialInstanceOverrides::default(),
        }
    }
}

impl MaterialInstanceAsset {
    pub fn normalized(mut self) -> Result<Self, AssetError> {
        self.version = MATERIAL_INSTANCE_VERSION;
        self.parent = self.parent.trim().replace('\\', "/");
        if self.parent.is_empty() {
            return Err(AssetError::Invalid(
                "material instance parent must not be empty".into(),
            ));
        }
        if !self.parent.starts_with("Assets/")
            || !self.parent.to_ascii_lowercase().ends_with(".mmat")
                && !self.parent.to_ascii_lowercase().ends_with(".mat")
                && !self.parent.to_ascii_lowercase().ends_with(".minst")
        {
            return Err(AssetError::Invalid(
                "material instance parent must reference an Assets .mmat, .mat, or .minst file"
                    .into(),
            ));
        }
        if self
            .parent
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        {
            return Err(AssetError::Invalid(
                "material instance parent contains an unsafe path segment".into(),
            ));
        }
        if self.overrides.custom_parameters.len()
            > mengine_core::surface_shader::MAX_SURFACE_SHADER_PARAMETERS
        {
            return Err(AssetError::Invalid(format!(
                "material instance declares more than {} custom parameters",
                mengine_core::surface_shader::MAX_SURFACE_SHADER_PARAMETERS
            )));
        }
        for (name, value) in &self.overrides.custom_parameters {
            let mut characters = name.chars();
            if !matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
                || !characters
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
                || name.len() > 48
                || value.iter().any(|part| !part.is_finite())
            {
                return Err(AssetError::Invalid(format!(
                    "invalid custom material instance parameter '{name}'"
                )));
            }
        }
        Ok(self)
    }

    pub fn apply_to(&self, mut parent: MaterialAsset) -> Result<MaterialAsset, AssetError> {
        parent.name = self.name.clone();
        if let Some(value) = self.overrides.base_color {
            parent.base_color = value;
        }
        if let Some(value) = self.overrides.metallic {
            parent.metallic = value;
        }
        if let Some(value) = self.overrides.roughness {
            parent.roughness = value;
        }
        if let Some(value) = self.overrides.ior {
            parent.ior = value;
        }
        if let Some(value) = self.overrides.clearcoat {
            parent.clearcoat = value;
        }
        if let Some(value) = self.overrides.clearcoat_roughness {
            parent.clearcoat_roughness = value;
        }
        if let Some(value) = self.overrides.emissive {
            parent.emissive = value;
        }
        if let Some(value) = self.overrides.emissive_strength {
            parent.emissive_strength = value;
        }
        if !self.overrides.custom_parameters.is_empty() {
            if parent.shader != MaterialShader::Custom {
                return Err(AssetError::Invalid(
                    "custom material instance parameters require a custom parent material".into(),
                ));
            }
            parent.custom_parameters.extend(
                self.overrides
                    .custom_parameters
                    .iter()
                    .map(|(name, value)| (name.clone(), *value)),
            );
        }
        Ok(parent.normalized())
    }
}

pub fn parse_material_instance_asset(bytes: &[u8]) -> Result<MaterialInstanceAsset, AssetError> {
    let instance = serde_json::from_slice::<MaterialInstanceAsset>(bytes)?;
    if instance.version == 0 || instance.version > MATERIAL_INSTANCE_VERSION {
        return Err(AssetError::Invalid(format!(
            "unsupported material instance version {}",
            instance.version
        )));
    }
    instance.normalized()
}

pub fn load_material_instance_asset(
    path: impl AsRef<Path>,
) -> Result<MaterialInstanceAsset, AssetError> {
    let bytes = std::fs::read(path).map_err(Io)?;
    parse_material_instance_asset(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_normalizes_parent_and_applies_bounded_pbr_overrides() {
        let instance = parse_material_instance_asset(
            br#"{
              "version":1,
              "name":"Ocean Glass",
              "parent":" Assets\\Materials\\Glass.mmat ",
              "overrides":{
                "base_color":[0.1,0.3,2.0,0.8],
                "roughness":0,
                "ior":1.33,
                "clearcoat":2,
                "emissive_strength":-1
              }
            }"#,
        )
        .unwrap();
        assert_eq!(instance.parent, "Assets/Materials/Glass.mmat");
        assert_eq!(instance.version, 2);
        let material = instance.apply_to(MaterialAsset::default()).unwrap();
        assert_eq!(material.name, "Ocean Glass");
        assert_eq!(material.base_color, [0.1, 0.3, 1.0, 0.8]);
        assert_eq!(material.roughness, 0.04);
        assert_eq!(material.ior, 1.33);
        assert_eq!(material.clearcoat, 1.0);
        assert_eq!(material.emissive_strength, 0.0);
    }

    #[test]
    fn instance_rejects_future_versions_and_unsafe_or_missing_parents() {
        assert!(
            parse_material_instance_asset(br#"{"version":3,"parent":"Assets/A.mmat"}"#).is_err()
        );
        assert!(parse_material_instance_asset(br#"{"version":1}"#).is_err());
        assert!(
            parse_material_instance_asset(br#"{"version":1,"parent":"Assets/../A.mmat"}"#).is_err()
        );
        assert!(
            parse_material_instance_asset(br#"{"version":1,"parent":"Assets/A.png"}"#).is_err()
        );
        assert_eq!(
            parse_material_instance_asset(br#"{"parent":"Assets/A.mmat"}"#)
                .unwrap()
                .version,
            2
        );
    }

    #[test]
    fn instance_custom_parameters_upgrade_merge_and_require_a_custom_parent() {
        let instance = parse_material_instance_asset(
            br#"{"version":1,"parent":"Assets/Base.mmat","overrides":{"custom_parameters":{"rim_power":[3,0,0,0]}}}"#,
        )
        .unwrap();
        assert_eq!(instance.version, 2);
        let mut parent = MaterialAsset {
            shader: MaterialShader::Custom,
            ..MaterialAsset::default()
        };
        parent
            .custom_parameters
            .insert("rim_color".into(), [1.0, 0.5, 0.0, 1.0]);
        let resolved = instance.apply_to(parent).unwrap();
        assert_eq!(resolved.custom_parameters["rim_power"][0], 3.0);
        assert_eq!(resolved.custom_parameters["rim_color"][1], 0.5);
        assert!(instance.apply_to(MaterialAsset::default()).is_err());
    }
}
