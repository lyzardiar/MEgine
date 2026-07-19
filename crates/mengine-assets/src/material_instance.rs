use crate::{AssetError, AssetError::Io, MaterialAsset};
use serde::{Deserialize, Serialize};
use std::path::Path;

const MATERIAL_INSTANCE_VERSION: u32 = 1;

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
        Ok(self)
    }

    pub fn apply_to(&self, mut parent: MaterialAsset) -> MaterialAsset {
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
        parent.normalized()
    }
}

pub fn parse_material_instance_asset(bytes: &[u8]) -> Result<MaterialInstanceAsset, AssetError> {
    let instance = serde_json::from_slice::<MaterialInstanceAsset>(bytes)?;
    if instance.version != MATERIAL_INSTANCE_VERSION {
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
        let material = instance.apply_to(MaterialAsset::default());
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
            parse_material_instance_asset(br#"{"version":2,"parent":"Assets/A.mmat"}"#).is_err()
        );
        assert!(parse_material_instance_asset(br#"{"version":1}"#).is_err());
        assert!(
            parse_material_instance_asset(br#"{"version":1,"parent":"Assets/../A.mmat"}"#).is_err()
        );
        assert!(
            parse_material_instance_asset(br#"{"version":1,"parent":"Assets/A.png"}"#).is_err()
        );
    }
}
