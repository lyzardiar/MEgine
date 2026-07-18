use crate::{AssetError, AssetError::Io};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

fn default_version() -> u32 {
    1
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AvatarMaskAsset {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    /// Relative animation target paths included by this mask.
    pub paths: Vec<String>,
}

impl Default for AvatarMaskAsset {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            paths: Vec::new(),
        }
    }
}

impl AvatarMaskAsset {
    pub fn normalized(mut self) -> Result<Self, AssetError> {
        self.version = self.version.max(default_version());
        self.name = self.name.trim().to_owned();
        let mut seen = HashSet::new();
        self.paths = self
            .paths
            .drain(..)
            .map(|path| normalize_mask_path(&path))
            .filter(|path| !path.is_empty() && seen.insert(path.clone()))
            .collect();
        if self
            .paths
            .iter()
            .any(|path| path != "*" && path.split('/').any(|segment| segment == ".."))
        {
            return Err(AssetError::Invalid(
                "Avatar Mask contains an unsafe target path".into(),
            ));
        }
        Ok(self)
    }

    pub fn includes(&self, target: &str) -> bool {
        target_matches_mask(target, &self.paths)
    }
}

fn normalize_mask_path(path: &str) -> String {
    let path = path.trim().replace('\\', "/");
    let path = path.trim_matches('/');
    if path.is_empty() || path == "." || path == "*" {
        path.to_owned()
    } else {
        path.split('/')
            .map(str::trim)
            .filter(|segment| !segment.is_empty() && *segment != ".")
            .collect::<Vec<_>>()
            .join("/")
    }
}

pub fn target_matches_mask(target: &str, paths: &[String]) -> bool {
    if paths.is_empty() || paths.iter().any(|path| path == "*") {
        return true;
    }
    let target = normalize_mask_path(target);
    paths.iter().any(|path| {
        path == "." && target.is_empty()
            || target == *path
            || target
                .strip_prefix(path)
                .is_some_and(|suffix| suffix.starts_with('/'))
    })
}

pub fn parse_avatar_mask(bytes: &[u8]) -> Result<AvatarMaskAsset, AssetError> {
    serde_json::from_slice::<AvatarMaskAsset>(bytes)?.normalized()
}

pub fn load_avatar_mask(path: impl AsRef<Path>) -> Result<AvatarMaskAsset, AssetError> {
    let bytes = std::fs::read(path).map_err(Io)?;
    parse_avatar_mask(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_matches_target_subtrees() {
        let mask = parse_avatar_mask(
            br#"{"version":0,"name":" Upper Body ","paths":[" Rig\\Spine ","Rig/Spine/","."]}"#,
        )
        .unwrap();
        assert_eq!(mask.version, 1);
        assert_eq!(mask.name, "Upper Body");
        assert_eq!(mask.paths, ["Rig/Spine", "."]);
        assert!(mask.includes("Rig/Spine/Arm"));
        assert!(mask.includes("."));
        assert!(!mask.includes("Rig/Leg"));
        assert!(parse_avatar_mask(br#"{"paths":["../Rig"]}"#).is_err());
    }
}
