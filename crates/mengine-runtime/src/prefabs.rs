use mengine_core::{Children, Entity, World};
use mengine_scene::{instantiate_prefab, load_prefab, PrefabInstance, SceneError};
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RuntimePrefabError {
    #[error("dynamic prefabs require a project root")]
    MissingProjectRoot,
    #[error("prefab path must be project-relative and under Assets: {0}")]
    UnsafePath(String),
    #[error("cannot resolve prefab path {path}: {source}")]
    Resolve {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("cannot load prefab {path}: {source}")]
    Load { path: PathBuf, source: SceneError },
    #[error("prefab parent entity is not alive: {0}")]
    InvalidParent(u64),
}

fn resolve_prefab_path(
    project_root: Option<&Path>,
    reference: &str,
) -> Result<PathBuf, RuntimePrefabError> {
    let root = project_root.ok_or(RuntimePrefabError::MissingProjectRoot)?;
    let normalized = reference.trim().replace('\\', "/");
    let relative = PathBuf::from(&normalized);
    if normalized.is_empty()
        || relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || relative.components().next() != Some(Component::Normal("Assets".as_ref()))
        || !relative
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("prefab"))
    {
        return Err(RuntimePrefabError::UnsafePath(reference.to_owned()));
    }

    let canonical_root =
        std::fs::canonicalize(root).map_err(|source| RuntimePrefabError::Resolve {
            path: root.to_owned(),
            source,
        })?;
    let candidate = root.join(relative);
    let canonical =
        std::fs::canonicalize(&candidate).map_err(|source| RuntimePrefabError::Resolve {
            path: candidate,
            source,
        })?;
    if !canonical.starts_with(&canonical_root) {
        return Err(RuntimePrefabError::UnsafePath(reference.to_owned()));
    }
    Ok(canonical)
}

pub fn instantiate_project_prefab(
    project_root: Option<&Path>,
    reference: &str,
    parent: Option<u64>,
    world: &mut World,
) -> Result<PrefabInstance, RuntimePrefabError> {
    let path = resolve_prefab_path(project_root, reference)?;
    let prefab = load_prefab(&path).map_err(|source| RuntimePrefabError::Load {
        path: path.clone(),
        source,
    })?;
    let parent = parent
        .map(Entity::from_u64)
        .map(|entity| {
            world
                .is_alive(entity)
                .then_some(entity)
                .ok_or(RuntimePrefabError::InvalidParent(entity.to_u64()))
        })
        .transpose()?;
    let sibling_index = parent
        .and_then(|entity| world.get_component::<Children>(entity))
        .map(|children| children.entities.len() as i32)
        .unwrap_or_else(|| {
            world
                .iter_entities()
                .filter(|entity| {
                    world
                        .get_component::<mengine_core::Parent>(*entity)
                        .is_none()
                })
                .count() as i32
        });
    let instance = instantiate_prefab(&prefab, world)
        .map_err(|source| RuntimePrefabError::Load { path, source })?;
    let root = Entity::from_u64(instance.root);
    world.set_editor_state(root, sibling_index, world.entity_active(root));
    if let Some(parent) = parent {
        world.set_parent(root, Some(parent));
    }
    Ok(instance)
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::snapshot::WorldSnapshot;
    use mengine_scene::{save_prefab, Prefab, PrefabNode, PREFAB_VERSION};
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn instantiates_project_prefabs_under_an_optional_live_parent() {
        let root = std::env::temp_dir().join(format!("mengine-runtime-prefab-{}", Uuid::new_v4()));
        let path = root.join("Assets/Prefabs/Enemy.prefab");
        save_prefab(
            &path,
            &Prefab {
                version: PREFAB_VERSION,
                name: "Enemy".into(),
                root: PrefabNode {
                    id: "root".into(),
                    name: "Enemy".into(),
                    active: true,
                    components: json!({ "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } }),
                    children: Vec::new(),
                },
            },
        )
        .unwrap();
        let mut world = World::new();
        world.commands.push(mengine_core::WorldCommand::Spawn {
            name: Some("Container".into()),
            components: json!({}),
        });
        let parent = world.commit()[0];
        let instance = instantiate_project_prefab(
            Some(&root),
            "Assets/Prefabs/Enemy.prefab",
            Some(parent.to_u64()),
            &mut world,
        )
        .unwrap();
        let snapshot = WorldSnapshot::from_world(&world);
        let enemy = snapshot
            .entities
            .iter()
            .find(|entity| entity.entity == instance.root)
            .unwrap();
        assert_eq!(enemy.parent, Some(parent.to_u64()));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_paths_outside_assets_and_stale_parents() {
        let root = std::env::temp_dir().join(format!("mengine-runtime-prefab-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        assert!(matches!(
            instantiate_project_prefab(Some(&root), "../Enemy.prefab", None, &mut World::new()),
            Err(RuntimePrefabError::UnsafePath(_))
        ));
        std::fs::remove_dir_all(root).unwrap();
    }
}
