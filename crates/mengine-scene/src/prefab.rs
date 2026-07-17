use crate::{scene_file::atomic_write, SceneError};
use mengine_core::command::WorldCommand;
use mengine_core::World;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

pub const PREFAB_VERSION: u32 = 1;
const MAX_PREFAB_NODES: usize = 65_536;
const MAX_PREFAB_DEPTH: usize = 256;

/// Versioned prefab asset stored in `Assets/Prefabs/*.prefab`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Prefab {
    pub version: u32,
    pub name: String,
    pub root: PrefabNode,
}

/// A stable prefab node. `id` survives Apply/Revert and is not a runtime entity id.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PrefabNode {
    pub id: String,
    pub name: String,
    #[serde(default = "default_active")]
    pub active: bool,
    #[serde(default = "empty_components")]
    pub components: Value,
    #[serde(default)]
    pub children: Vec<PrefabNode>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrefabInstance {
    pub root: u64,
    /// Runtime entities in prefab pre-order, matching the asset node order.
    pub entities: Vec<u64>,
}

#[derive(Deserialize)]
struct LegacyPrefabNode {
    name: String,
    #[serde(default)]
    version: Option<u32>,
    #[serde(default = "empty_components")]
    components: Value,
    #[serde(default)]
    children: Vec<LegacyPrefabNode>,
}

fn default_active() -> bool {
    true
}

fn empty_components() -> Value {
    Value::Object(Default::default())
}

impl LegacyPrefabNode {
    fn into_node(self, path: &mut Vec<usize>) -> PrefabNode {
        let id = if path.is_empty() {
            "root".to_owned()
        } else {
            format!(
                "node-{}",
                path.iter()
                    .map(usize::to_string)
                    .collect::<Vec<_>>()
                    .join("-")
            )
        };
        let children = self
            .children
            .into_iter()
            .enumerate()
            .map(|(index, child)| {
                path.push(index);
                let child = child.into_node(path);
                path.pop();
                child
            })
            .collect();
        PrefabNode {
            id,
            name: self.name,
            active: true,
            components: self.components,
            children,
        }
    }
}

impl Prefab {
    pub fn validate(&self) -> Result<(), SceneError> {
        if self.version != PREFAB_VERSION {
            return Err(SceneError::Version(self.version));
        }
        if self.name.trim().is_empty() {
            return Err(SceneError::InvalidPrefab("asset name is empty".into()));
        }

        fn visit(
            node: &PrefabNode,
            depth: usize,
            count: &mut usize,
            ids: &mut HashSet<String>,
        ) -> Result<(), SceneError> {
            if depth > MAX_PREFAB_DEPTH {
                return Err(SceneError::InvalidPrefab(format!(
                    "hierarchy exceeds {MAX_PREFAB_DEPTH} levels"
                )));
            }
            *count += 1;
            if *count > MAX_PREFAB_NODES {
                return Err(SceneError::InvalidPrefab(format!(
                    "hierarchy exceeds {MAX_PREFAB_NODES} nodes"
                )));
            }
            if node.id.trim().is_empty() {
                return Err(SceneError::InvalidPrefab("node id is empty".into()));
            }
            if !ids.insert(node.id.clone()) {
                return Err(SceneError::InvalidPrefab(format!(
                    "duplicate node id: {}",
                    node.id
                )));
            }
            if node.name.trim().is_empty() {
                return Err(SceneError::InvalidPrefab(format!(
                    "node {} has an empty name",
                    node.id
                )));
            }
            if !node.components.is_object() {
                return Err(SceneError::InvalidPrefab(format!(
                    "node {} components must be an object",
                    node.id
                )));
            }
            for child in &node.children {
                visit(child, depth + 1, count, ids)?;
            }
            Ok(())
        }

        visit(&self.root, 0, &mut 0, &mut HashSet::new())
    }
}

pub fn load_prefab(path: &Path) -> Result<Prefab, SceneError> {
    let text = std::fs::read_to_string(path)?;
    let value: Value = serde_json::from_str(&text)?;
    let prefab = if value.get("root").is_some() {
        serde_json::from_value(value)?
    } else {
        let legacy: LegacyPrefabNode = serde_json::from_value(value)?;
        let version = legacy.version.unwrap_or(PREFAB_VERSION);
        let name = legacy.name.clone();
        Prefab {
            version,
            name,
            root: legacy.into_node(&mut Vec::new()),
        }
    };
    prefab.validate()?;
    Ok(prefab)
}

pub fn save_prefab(path: &Path, prefab: &Prefab) -> Result<(), SceneError> {
    prefab.validate()?;
    let json = serde_json::to_string_pretty(prefab)?;
    atomic_write(path, json.as_bytes())?;
    Ok(())
}

/// Instantiate the complete hierarchy as a single spawn batch, then restore parent/order/active.
pub fn instantiate_prefab(
    prefab: &Prefab,
    world: &mut World,
) -> Result<PrefabInstance, SceneError> {
    prefab.validate()?;

    struct Pending<'a> {
        node: &'a PrefabNode,
        parent: Option<usize>,
        sibling_index: i32,
    }

    fn flatten<'a>(
        node: &'a PrefabNode,
        parent: Option<usize>,
        sibling_index: i32,
        out: &mut Vec<Pending<'a>>,
    ) {
        let index = out.len();
        out.push(Pending {
            node,
            parent,
            sibling_index,
        });
        for (child_index, child) in node.children.iter().enumerate() {
            flatten(child, Some(index), child_index as i32, out);
        }
    }

    let mut pending = Vec::new();
    flatten(&prefab.root, None, 0, &mut pending);
    for entry in &pending {
        world.commands.push(WorldCommand::Spawn {
            name: Some(entry.node.name.clone()),
            components: entry.node.components.clone(),
        });
    }
    let spawned = world.commit();
    for (index, entry) in pending.iter().enumerate() {
        let entity = spawned[index];
        world.set_editor_state(entity, entry.sibling_index, entry.node.active);
        if let Some(parent) = entry.parent {
            world.set_parent(entity, Some(spawned[parent]));
        }
    }
    let entities = spawned
        .iter()
        .map(|entity| entity.to_u64())
        .collect::<Vec<_>>();
    Ok(PrefabInstance {
        root: entities[0],
        entities,
    })
}

/// Backward-compatible convenience for callers that do not need the instance mapping.
pub fn expand_prefab(prefab: &Prefab, world: &mut World) {
    instantiate_prefab(prefab, world).expect("prefab must be valid");
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::snapshot::WorldSnapshot;
    use serde_json::json;
    use uuid::Uuid;

    fn sample_prefab() -> Prefab {
        Prefab {
            version: PREFAB_VERSION,
            name: "Button".into(),
            root: PrefabNode {
                id: "root".into(),
                name: "Button".into(),
                active: true,
                components: json!({ "RectTransform": { "size_delta": [160, 40] } }),
                children: vec![PrefabNode {
                    id: "label".into(),
                    name: "Label".into(),
                    active: false,
                    components: json!({ "Text": { "text": "Play" } }),
                    children: Vec::new(),
                }],
            },
        }
    }

    #[test]
    fn round_trips_and_instantiates_hierarchy() {
        let dir = std::env::temp_dir().join(format!("mengine-prefab-{}", Uuid::new_v4()));
        let path = dir.join("button.prefab");
        let prefab = sample_prefab();
        save_prefab(&path, &prefab).unwrap();
        let loaded = load_prefab(&path).unwrap();
        assert_eq!(loaded, prefab);

        let mut world = World::new();
        let instance = instantiate_prefab(&loaded, &mut world).unwrap();
        assert_eq!(instance.entities.len(), 2);
        let snapshot = WorldSnapshot::from_world(&world);
        let root = snapshot
            .entities
            .iter()
            .find(|entity| entity.entity == instance.root)
            .unwrap();
        let label = snapshot
            .entities
            .iter()
            .find(|entity| entity.name.as_deref() == Some("Label"))
            .unwrap();
        assert_eq!(label.parent, Some(root.entity));
        assert!(!label.active);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn upgrades_legacy_recursive_assets_and_rejects_duplicate_ids() {
        let dir = std::env::temp_dir().join(format!("mengine-prefab-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("legacy.prefab");
        std::fs::write(
            &path,
            r#"{"version":1,"name":"Root","components":{},"children":[{"name":"Child","components":{}}]}"#,
        )
        .unwrap();
        let legacy = load_prefab(&path).unwrap();
        assert_eq!(legacy.root.id, "root");
        assert_eq!(legacy.root.children[0].id, "node-0");

        let mut invalid = sample_prefab();
        invalid.root.children[0].id = "root".into();
        assert!(matches!(
            invalid.validate(),
            Err(SceneError::InvalidPrefab(_))
        ));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
