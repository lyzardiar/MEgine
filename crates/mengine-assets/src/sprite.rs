use crate::AssetError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

const MAX_SPRITE_SLICES: usize = 4096;

fn sprite_import_version() -> u32 {
    1
}

fn default_pixels_per_unit() -> f32 {
    100.0
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpriteMode {
    #[default]
    Single,
    Multiple,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpriteSlice {
    pub name: String,
    /// Top-left pixel rectangle: x, y, width, height.
    pub rect: [u32; 4],
    pub pivot: [f32; 2],
}

impl Default for SpriteSlice {
    fn default() -> Self {
        Self {
            name: "Sprite".into(),
            rect: [0, 0, 1, 1],
            pivot: [0.5, 0.5],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpriteImportSettings {
    #[serde(default = "sprite_import_version")]
    pub version: u32,
    pub mode: SpriteMode,
    #[serde(default = "default_pixels_per_unit")]
    pub pixels_per_unit: f32,
    pub slices: Vec<SpriteSlice>,
}

impl Default for SpriteImportSettings {
    fn default() -> Self {
        Self {
            version: sprite_import_version(),
            mode: SpriteMode::Single,
            pixels_per_unit: default_pixels_per_unit(),
            slices: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedSpriteSlice {
    pub name: String,
    pub uv: [f32; 4],
    pub pivot: [f32; 2],
    pub pixel_size: [u32; 2],
    pub pixels_per_unit: f32,
}

impl SpriteImportSettings {
    pub fn normalized(mut self, texture_size: [u32; 2]) -> Result<Self, AssetError> {
        if self.version != 1 {
            return Err(AssetError::Invalid(format!(
                "unsupported sprite import version {}",
                self.version
            )));
        }
        if !self.pixels_per_unit.is_finite() || self.pixels_per_unit <= 0.0 {
            self.pixels_per_unit = default_pixels_per_unit();
        }
        self.pixels_per_unit = self.pixels_per_unit.clamp(0.01, 100_000.0);
        if self.slices.len() > MAX_SPRITE_SLICES {
            return Err(AssetError::Invalid(format!(
                "sprite import supports at most {MAX_SPRITE_SLICES} slices"
            )));
        }
        if self.mode == SpriteMode::Single {
            self.slices.clear();
            return Ok(self);
        }
        let mut names = HashSet::new();
        for slice in &mut self.slices {
            slice.name = slice.name.trim().to_string();
            if slice.name.is_empty()
                || slice.name.chars().count() > 64
                || slice.name.contains('#')
                || slice.name.chars().any(char::is_control)
            {
                return Err(AssetError::Invalid(format!(
                    "invalid sprite slice name '{}'",
                    slice.name
                )));
            }
            if !names.insert(slice.name.to_lowercase()) {
                return Err(AssetError::Invalid(format!(
                    "duplicate sprite slice name '{}'",
                    slice.name
                )));
            }
            let [x, y, width, height] = slice.rect;
            if width == 0
                || height == 0
                || x.checked_add(width)
                    .is_none_or(|right| right > texture_size[0])
                || y.checked_add(height)
                    .is_none_or(|bottom| bottom > texture_size[1])
            {
                return Err(AssetError::Invalid(format!(
                    "sprite slice '{}' is outside {}x{} texture bounds",
                    slice.name, texture_size[0], texture_size[1]
                )));
            }
            for part in &mut slice.pivot {
                *part = if part.is_finite() {
                    part.clamp(0.0, 1.0)
                } else {
                    0.5
                };
            }
        }
        Ok(self)
    }

    pub fn resolve(&self, name: &str, texture_size: [u32; 2]) -> Option<ResolvedSpriteSlice> {
        if self.mode != SpriteMode::Multiple || texture_size.contains(&0) {
            return None;
        }
        let slice = self
            .slices
            .iter()
            .find(|slice| slice.name.eq_ignore_ascii_case(name))?;
        Some(ResolvedSpriteSlice {
            name: slice.name.clone(),
            uv: [
                slice.rect[0] as f32 / texture_size[0] as f32,
                slice.rect[1] as f32 / texture_size[1] as f32,
                slice.rect[2] as f32 / texture_size[0] as f32,
                slice.rect[3] as f32 / texture_size[1] as f32,
            ],
            pivot: slice.pivot,
            pixel_size: [slice.rect[2], slice.rect[3]],
            pixels_per_unit: self.pixels_per_unit,
        })
    }
}

pub fn sprite_import_path(texture_path: &Path) -> PathBuf {
    let mut name = OsString::from(texture_path.as_os_str());
    name.push(".sprite.json");
    PathBuf::from(name)
}

pub fn parse_sprite_import(
    bytes: &[u8],
    texture_size: [u32; 2],
) -> Result<SpriteImportSettings, AssetError> {
    serde_json::from_slice::<SpriteImportSettings>(bytes)?.normalized(texture_size)
}

pub fn load_sprite_import(
    texture_path: &Path,
    texture_size: [u32; 2],
) -> Result<SpriteImportSettings, AssetError> {
    let path = sprite_import_path(texture_path);
    if !path.is_file() {
        return Ok(SpriteImportSettings::default());
    }
    parse_sprite_import(&std::fs::read(path)?, texture_size)
}

pub fn split_sprite_reference(reference: &str) -> (&str, Option<&str>) {
    let reference = reference.trim();
    reference
        .split_once('#')
        .map_or((reference, None), |(texture, slice)| {
            let texture = texture.trim();
            let slice = slice.trim();
            (texture, (!slice.is_empty()).then_some(slice))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multiple_sprite_import_normalizes_and_resolves_pixel_rectangles() {
        let settings = parse_sprite_import(
            br#"{
                "version":1,"mode":"multiple","pixels_per_unit":32,
                "slices":[
                    {"name":"Idle","rect":[0,0,16,32],"pivot":[0.5,0]},
                    {"name":"Run","rect":[16,0,16,32],"pivot":[0.5,2]}
                ]
            }"#,
            [64, 32],
        )
        .unwrap();
        let run = settings.resolve("run", [64, 32]).unwrap();
        assert_eq!(run.uv, [0.25, 0.0, 0.25, 1.0]);
        assert_eq!(run.pivot, [0.5, 1.0]);
        assert_eq!(run.pixel_size, [16, 32]);
        assert_eq!(run.pixels_per_unit, 32.0);
    }

    #[test]
    fn sprite_import_rejects_ambiguous_names_bounds_and_versions() {
        for json in [
            r#"{"version":2}"#,
            r#"{"mode":"multiple","slices":[{"name":"A","rect":[0,0,8,8]},{"name":"a","rect":[8,0,8,8]}]}"#,
            r#"{"mode":"multiple","slices":[{"name":"Bad#Name","rect":[0,0,8,8]}]}"#,
            r#"{"mode":"multiple","slices":[{"name":"Outside","rect":[12,0,8,8]}]}"#,
        ] {
            assert!(parse_sprite_import(json.as_bytes(), [16, 16]).is_err());
        }
    }

    #[test]
    fn sprite_reference_and_sidecar_path_preserve_legacy_texture_ids() {
        assert_eq!(
            split_sprite_reference("Assets/hero.png"),
            ("Assets/hero.png", None)
        );
        assert_eq!(
            split_sprite_reference(" Assets/sheet.png # Run "),
            ("Assets/sheet.png", Some("Run"))
        );
        assert_eq!(
            sprite_import_path(Path::new("Assets/sheet.png")),
            Path::new("Assets/sheet.png.sprite.json")
        );
    }
}
