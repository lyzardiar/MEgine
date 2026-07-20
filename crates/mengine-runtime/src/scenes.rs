use mengine_core::World;
use mengine_scene::{load_scene, SceneError};
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SceneSelector {
    Index(usize),
    PathOrName(String),
    Reload,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoadedScene {
    pub name: String,
    pub path: PathBuf,
    pub build_index: Option<usize>,
    pub build_scene_count: usize,
}

#[derive(Debug, Error)]
pub enum SceneManagerError {
    #[error("no scene is currently loaded")]
    NoCurrentScene,
    #[error("scene index {index} is outside Scenes In Build (count: {count})")]
    IndexOutOfRange { index: usize, count: usize },
    #[error("scene reference must be project-relative and cannot escape the project: {0}")]
    UnsafePath(String),
    #[error("scene '{0}' is not present in Scenes In Build")]
    NotInBuild(String),
    #[error("scene name '{0}' is ambiguous; use its project-relative path")]
    AmbiguousName(String),
    #[error("failed to load scene {path}: {source}")]
    Load { path: PathBuf, source: SceneError },
}

pub struct SceneManager {
    project_root: Option<PathBuf>,
    build_scenes: Vec<PathBuf>,
    packaged: bool,
    current: Option<PathBuf>,
    /// Additively loaded scenes and their spawned entity IDs.
    additive_scenes: Vec<AdditiveScene>,
}

#[derive(Clone, Debug)]
struct AdditiveScene {
    name: String,
    path: PathBuf,
    entities: Vec<mengine_core::Entity>,
}

impl SceneManager {
    pub fn new(project_root: Option<PathBuf>, build_scenes: Vec<PathBuf>, packaged: bool) -> Self {
        Self {
            project_root,
            build_scenes: build_scenes
                .into_iter()
                .map(|path| normalize_path(&path))
                .collect(),
            packaged,
            current: None,
            additive_scenes: Vec::new(),
        }
    }

    pub fn build_scenes(&self) -> &[PathBuf] {
        &self.build_scenes
    }

    pub fn current(&self) -> Option<&Path> {
        self.current.as_deref()
    }

    pub fn load_initial(
        &mut self,
        scene: &Path,
        world: &mut World,
    ) -> Result<LoadedScene, SceneManagerError> {
        let relative = if scene.is_absolute() {
            self.project_root
                .as_deref()
                .and_then(|root| scene.strip_prefix(root).ok())
                .map(normalize_path)
        } else {
            Some(normalize_path(scene))
        };
        if self.packaged {
            let reference = relative
                .as_deref()
                .and_then(|path| path.to_str())
                .unwrap_or_default();
            let Some(index) = relative
                .as_ref()
                .and_then(|path| self.build_scenes.iter().position(|entry| entry == path))
            else {
                return Err(SceneManagerError::NotInBuild(reference.to_owned()));
            };
            return self.load_relative(self.build_scenes[index].clone(), world);
        }

        if let Some(relative) = relative {
            self.load_relative(relative, world)
        } else {
            self.load_absolute(scene.to_owned(), world)
        }
    }

    pub fn load(
        &mut self,
        selector: SceneSelector,
        world: &mut World,
    ) -> Result<LoadedScene, SceneManagerError> {
        let relative =
            match selector {
                SceneSelector::Index(index) => self.build_scenes.get(index).cloned().ok_or(
                    SceneManagerError::IndexOutOfRange {
                        index,
                        count: self.build_scenes.len(),
                    },
                )?,
                SceneSelector::Reload => self
                    .current
                    .clone()
                    .ok_or(SceneManagerError::NoCurrentScene)?,
                SceneSelector::PathOrName(reference) => self.resolve_reference(&reference)?,
            };
        self.load_relative(relative, world)
    }

    fn resolve_reference(&self, reference: &str) -> Result<PathBuf, SceneManagerError> {
        let trimmed = reference.trim().replace('\\', "/");
        if trimmed.is_empty() {
            return Err(SceneManagerError::UnsafePath(reference.to_owned()));
        }
        let raw = PathBuf::from(&trimmed);
        if raw.is_absolute()
            || raw.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(SceneManagerError::UnsafePath(reference.to_owned()));
        }
        let normalized = normalize_path(&raw);
        if let Some(exact) = self
            .build_scenes
            .iter()
            .find(|scene| scene.eq_ignore_ascii_case(&normalized))
        {
            return Ok(exact.clone());
        }

        let requested_name = normalized
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&trimmed);
        let named: Vec<_> = self
            .build_scenes
            .iter()
            .filter(|scene| {
                scene
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| name.eq_ignore_ascii_case(requested_name))
            })
            .collect();
        match named.as_slice() {
            [scene] => return Ok((*scene).clone()),
            [_, _, ..] => return Err(SceneManagerError::AmbiguousName(trimmed)),
            [] => {}
        }
        if self.packaged {
            return Err(SceneManagerError::NotInBuild(trimmed));
        }

        let has_scene_extension = normalized
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("mscene"));
        if normalized.starts_with("Assets") {
            Ok(if has_scene_extension {
                normalized
            } else {
                normalized.with_extension("mscene")
            })
        } else {
            let file = if has_scene_extension {
                normalized
            } else {
                normalized.with_extension("mscene")
            };
            Ok(PathBuf::from("Assets/Scenes").join(file))
        }
    }

    fn load_relative(
        &mut self,
        relative: PathBuf,
        world: &mut World,
    ) -> Result<LoadedScene, SceneManagerError> {
        let absolute = self
            .project_root
            .as_deref()
            .map(|root| root.join(&relative))
            .unwrap_or_else(|| relative.clone());
        self.load_from_paths(relative, absolute, world)
    }

    fn load_absolute(
        &mut self,
        absolute: PathBuf,
        world: &mut World,
    ) -> Result<LoadedScene, SceneManagerError> {
        self.load_from_paths(absolute.clone(), absolute, world)
    }

    fn load_from_paths(
        &mut self,
        logical_path: PathBuf,
        absolute_path: PathBuf,
        world: &mut World,
    ) -> Result<LoadedScene, SceneManagerError> {
        let mut next_world = World::new();
        let scene = load_scene(&absolute_path, &mut next_world).map_err(|source| {
            SceneManagerError::Load {
                path: absolute_path,
                source,
            }
        })?;
        *world = next_world;
        self.current = Some(logical_path.clone());
        // Clear additive scenes when loading a new base scene.
        self.additive_scenes.clear();
        Ok(LoadedScene {
            name: scene.name,
            build_index: self
                .build_scenes
                .iter()
                .position(|entry| entry == &logical_path),
            build_scene_count: self.build_scenes.len(),
            path: logical_path,
        })
    }

    /// Loads a scene additively: spawns its entities into the existing world
    /// without clearing current entities. Returns the loaded scene info.
    pub fn load_additive(
        &mut self,
        selector: SceneSelector,
        world: &mut World,
    ) -> Result<LoadedScene, SceneManagerError> {
        let relative = match selector {
            SceneSelector::Index(index) => self.build_scenes.get(index).cloned().ok_or(
                SceneManagerError::IndexOutOfRange {
                    index,
                    count: self.build_scenes.len(),
                },
            )?,
            SceneSelector::Reload => self
                .current
                .clone()
                .ok_or(SceneManagerError::NoCurrentScene)?,
            SceneSelector::PathOrName(reference) => self.resolve_reference(&reference)?,
        };
        let absolute = self
            .project_root
            .as_deref()
            .map(|root| root.join(&relative))
            .unwrap_or_else(|| relative.clone());

        // Load the scene file into a temporary world to get the snapshot.
        let mut temp_world = World::new();
        let scene = load_scene(&absolute, &mut temp_world).map_err(|source| {
            SceneManagerError::Load {
                path: absolute,
                source,
            }
        })?;

        // Apply the snapshot additively to the real world.
        let snapshot = mengine_core::WorldSnapshot::from_world(&temp_world);
        let spawned = mengine_scene::apply_snapshot_additive(world, &snapshot);

        self.additive_scenes.push(AdditiveScene {
            name: scene.name.clone(),
            path: relative.clone(),
            entities: spawned,
        });

        Ok(LoadedScene {
            name: scene.name,
            build_index: self
                .build_scenes
                .iter()
                .position(|entry| entry == &relative),
            build_scene_count: self.build_scenes.len(),
            path: relative,
        })
    }

    /// Unloads an additively loaded scene by despawning all its entities.
    /// Returns true if the scene was found and unloaded.
    pub fn unload_additive(&mut self, name_or_path: &str, world: &mut World) -> bool {
        let normalized = name_or_path.trim().replace('\\', "/");
        let index = self.additive_scenes.iter().position(|scene| {
            scene.name.eq_ignore_ascii_case(&normalized)
                || scene.path.to_string_lossy().eq_ignore_ascii_case(&normalized)
        });
        let Some(index) = index else {
            return false;
        };
        let scene = self.additive_scenes.remove(index);
        for entity in scene.entities {
            world.despawn(entity);
        }
        true
    }

    /// Returns the names of all additively loaded scenes.
    pub fn additive_scene_names(&self) -> Vec<&str> {
        self.additive_scenes.iter().map(|s| s.name.as_str()).collect()
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    PathBuf::from(path.to_string_lossy().replace('\\', "/"))
}

trait PathEqIgnoreAsciiCase {
    fn eq_ignore_ascii_case(&self, other: &Path) -> bool;
}

impl PathEqIgnoreAsciiCase for Path {
    fn eq_ignore_ascii_case(&self, other: &Path) -> bool {
        self.to_string_lossy()
            .eq_ignore_ascii_case(&other.to_string_lossy())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_scene::save_scene;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_project(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mengine-scenes-{name}-{nonce}"))
    }

    fn make_scene(root: &Path, path: &str, name: &str, entity_count: usize) {
        let mut world = World::new();
        for _ in 0..entity_count {
            world.spawn_empty();
        }
        save_scene(&root.join(path), name, &world).unwrap();
    }

    #[test]
    fn packaged_scenes_load_by_index_name_and_path_only_from_the_build_list() {
        let root = temp_project("packaged");
        make_scene(&root, "Assets/Scenes/Main.mscene", "Main", 1);
        make_scene(&root, "Assets/Scenes/Level2.mscene", "Level 2", 2);
        make_scene(&root, "Assets/Scenes/Hidden.mscene", "Hidden", 3);
        let mut manager = SceneManager::new(
            Some(root.clone()),
            vec![
                "Assets/Scenes/Main.mscene".into(),
                "Assets/Scenes/Level2.mscene".into(),
            ],
            true,
        );
        let mut world = World::new();

        let main = manager.load(SceneSelector::Index(0), &mut world).unwrap();
        assert_eq!(main.name, "Main");
        assert_eq!(main.build_index, Some(0));
        assert_eq!(world.iter_entities().count(), 1);
        let level = manager
            .load(SceneSelector::PathOrName("Level2".into()), &mut world)
            .unwrap();
        assert_eq!(level.build_index, Some(1));
        assert_eq!(world.iter_entities().count(), 2);
        assert!(matches!(
            manager.load(
                SceneSelector::PathOrName("Assets/Scenes/Hidden.mscene".into()),
                &mut world,
            ),
            Err(SceneManagerError::NotInBuild(_))
        ));
        assert!(matches!(
            manager.load(SceneSelector::Index(2), &mut world),
            Err(SceneManagerError::IndexOutOfRange { .. })
        ));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_scene_load_is_atomic_and_reload_uses_the_current_scene() {
        let root = temp_project("atomic");
        make_scene(&root, "Assets/Scenes/Main.mscene", "Main", 2);
        std::fs::create_dir_all(root.join("Assets/Scenes")).unwrap();
        std::fs::write(root.join("Assets/Scenes/Broken.mscene"), "not json").unwrap();
        let mut manager = SceneManager::new(Some(root.clone()), Vec::new(), false);
        let mut world = World::new();
        manager
            .load(SceneSelector::PathOrName("Main".into()), &mut world)
            .unwrap();
        assert!(manager
            .load(SceneSelector::PathOrName("Broken".into()), &mut world)
            .is_err());
        assert_eq!(
            manager.current(),
            Some(Path::new("Assets/Scenes/Main.mscene"))
        );
        assert_eq!(world.iter_entities().count(), 2);
        manager.load(SceneSelector::Reload, &mut world).unwrap();
        assert_eq!(world.iter_entities().count(), 2);
        assert!(matches!(
            manager.load(SceneSelector::PathOrName("../Escape".into()), &mut world),
            Err(SceneManagerError::UnsafePath(_))
        ));
        std::fs::remove_dir_all(root).unwrap();
    }
}
