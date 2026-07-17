use mengine_rhi::UiPrimitive;
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;

pub const DEFAULT_SORTING_LAYER_ID: &str = "default";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct SortingLayer {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize)]
struct SortingLayerFile {
    #[serde(default = "sorting_layer_file_version")]
    version: u32,
    #[serde(default)]
    layers: Vec<SortingLayer>,
}

const fn sorting_layer_file_version() -> u32 {
    1
}

#[derive(Clone, Debug)]
pub struct SortingLayers {
    layers: Vec<SortingLayer>,
}

impl Default for SortingLayers {
    fn default() -> Self {
        Self {
            layers: vec![SortingLayer {
                id: DEFAULT_SORTING_LAYER_ID.into(),
                name: "Default".into(),
            }],
        }
    }
}

impl SortingLayers {
    pub fn load(project_root: Option<&Path>) -> Result<Self, String> {
        let Some(root) = project_root else {
            return Ok(Self::default());
        };
        let path = root.join("ProjectSettings/sorting-layers.json");
        if !path.is_file() {
            return Ok(Self::default());
        }
        let bytes = std::fs::read(&path)
            .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
        let file: SortingLayerFile = serde_json::from_slice(&bytes)
            .map_err(|error| format!("cannot parse {}: {error}", path.display()))?;
        if file.version != 1 {
            return Err(format!(
                "unsupported sorting layer version {} in {}",
                file.version,
                path.display()
            ));
        }
        Self::from_layers(file.layers)
    }

    pub fn from_layers(layers: Vec<SortingLayer>) -> Result<Self, String> {
        if layers.len() > 64 {
            return Err("at most 64 sorting layers are supported".into());
        }
        let mut normalized = Vec::with_capacity(layers.len().max(1));
        let mut ids = HashSet::new();
        let mut names = HashSet::new();
        for layer in layers {
            let id = layer.id.trim().to_string();
            let mut name = layer.name.trim().to_string();
            if id.is_empty()
                || id.len() > 64
                || !id
                    .bytes()
                    .all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b'_')
            {
                return Err(format!("invalid sorting layer id '{id}'"));
            }
            if name.is_empty() || name.chars().count() > 64 {
                return Err(format!("invalid sorting layer name '{name}'"));
            }
            let id_key = id.to_ascii_lowercase();
            if id_key == DEFAULT_SORTING_LAYER_ID {
                name = "Default".into();
            }
            if !ids.insert(id_key.clone()) {
                return Err(format!("duplicate sorting layer id '{id}'"));
            }
            if !names.insert(name.to_lowercase()) {
                return Err(format!("duplicate sorting layer name '{name}'"));
            }
            normalized.push(SortingLayer { id, name });
        }
        if !ids.contains(DEFAULT_SORTING_LAYER_ID) {
            normalized.insert(
                0,
                SortingLayer {
                    id: DEFAULT_SORTING_LAYER_ID.into(),
                    name: "Default".into(),
                },
            );
        }
        Ok(Self { layers: normalized })
    }

    pub fn layers(&self) -> &[SortingLayer] {
        &self.layers
    }

    pub fn rank(&self, id: &str) -> usize {
        self.layers
            .iter()
            .position(|layer| layer.id.eq_ignore_ascii_case(id))
            .or_else(|| {
                self.layers
                    .iter()
                    .position(|layer| layer.id.eq_ignore_ascii_case(DEFAULT_SORTING_LAYER_ID))
            })
            .unwrap_or(0)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorldPrimitiveKind {
    ThreeD,
    TwoD,
}

#[derive(Clone, Debug)]
pub struct WorldPrimitive {
    pub kind: WorldPrimitiveKind,
    pub sorting_layer: String,
    pub sorting_order: i32,
    pub depth: f32,
    pub primitive: UiPrimitive,
}

pub fn sort_world_primitives(primitives: &mut [WorldPrimitive], layers: &SortingLayers) {
    primitives.sort_by(|left, right| {
        let kind_rank = |kind: WorldPrimitiveKind| match kind {
            WorldPrimitiveKind::ThreeD => 0,
            WorldPrimitiveKind::TwoD => 1,
        };
        kind_rank(left.kind)
            .cmp(&kind_rank(right.kind))
            .then_with(|| match (left.kind, right.kind) {
                (WorldPrimitiveKind::TwoD, WorldPrimitiveKind::TwoD) => layers
                    .rank(&left.sorting_layer)
                    .cmp(&layers.rank(&right.sorting_layer))
                    .then_with(|| left.sorting_order.cmp(&right.sorting_order))
                    .then_with(|| right.depth.total_cmp(&left.depth)),
                _ => right.depth.total_cmp(&left.depth),
            })
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_rhi::{UiBatchKey, UiBlendMode};

    fn primitive(
        name: &str,
        kind: WorldPrimitiveKind,
        layer: &str,
        order: i32,
        depth: f32,
    ) -> WorldPrimitive {
        WorldPrimitive {
            kind,
            sorting_layer: layer.into(),
            sorting_order: order,
            depth,
            primitive: UiPrimitive {
                rect: [0.0; 4],
                color: [1.0; 4],
                pivot: [0.5; 2],
                rotation_radians: 0.0,
                uv: [0.0, 0.0, 1.0, 1.0],
                key: UiBatchKey {
                    material: name.into(),
                    texture: "white".into(),
                    clip: None,
                    blend: UiBlendMode::Alpha,
                },
            },
        }
    }

    #[test]
    fn stable_layer_order_interleaves_different_2d_renderer_sources() {
        let layers = SortingLayers::from_layers(vec![
            SortingLayer {
                id: "background".into(),
                name: "Background".into(),
            },
            SortingLayer {
                id: "default".into(),
                name: "Default".into(),
            },
            SortingLayer {
                id: "effects".into(),
                name: "Effects".into(),
            },
        ])
        .unwrap();
        let mut values = vec![
            primitive("particle", WorldPrimitiveKind::TwoD, "effects", -10, 0.9),
            primitive("sprite", WorldPrimitiveKind::TwoD, "default", 20, 0.2),
            primitive(
                "mesh-particle",
                WorldPrimitiveKind::ThreeD,
                "default",
                0,
                0.1,
            ),
            primitive("line", WorldPrimitiveKind::TwoD, "background", 999, 0.5),
        ];
        sort_world_primitives(&mut values, &layers);
        assert_eq!(
            values
                .iter()
                .map(|value| value.primitive.key.material.as_str())
                .collect::<Vec<_>>(),
            vec!["mesh-particle", "line", "sprite", "particle"]
        );
    }

    #[test]
    fn unknown_layers_fall_back_to_default_rank_and_missing_file_is_compatible() {
        let layers = SortingLayers::default();
        assert_eq!(layers.rank("missing"), layers.rank("default"));
        assert_eq!(SortingLayers::load(None).unwrap().layers(), layers.layers());
    }

    #[test]
    fn loads_packaged_project_settings_and_rejects_ambiguous_ids() {
        let root = std::env::temp_dir().join(format!(
            "mengine-runtime-sorting-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("ProjectSettings")).unwrap();
        std::fs::write(
            root.join("ProjectSettings/sorting-layers.json"),
            r#"{"version":1,"layers":[{"id":"background","name":"Background"},{"id":"default","name":"Default"},{"id":"effects","name":"Effects"}]}"#,
        )
        .unwrap();
        let layers = SortingLayers::load(Some(&root)).unwrap();
        assert_eq!(layers.rank("background"), 0);
        assert_eq!(layers.rank("effects"), 2);

        std::fs::write(
            root.join("ProjectSettings/sorting-layers.json"),
            r#"{"version":1,"layers":[{"id":"default","name":"Default"},{"id":"DEFAULT","name":"Other"}]}"#,
        )
        .unwrap();
        assert!(SortingLayers::load(Some(&root))
            .unwrap_err()
            .contains("duplicate sorting layer id"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
