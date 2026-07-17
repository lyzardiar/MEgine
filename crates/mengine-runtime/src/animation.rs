use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_animation_clip, AnimationClip, AnimationValue, AnimationWrapMode};
use mengine_core::generated::AnimationPlayer;
use mengine_core::{Entity, Parent, World};
use serde_json::{Number, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnimationLoadFailure {
    pub entity: Entity,
    pub clip: String,
    pub error: String,
}

#[derive(Clone)]
struct CachedAnimation {
    modified: Option<SystemTime>,
    result: Result<Arc<AnimationClip>, String>,
}

#[derive(Default)]
pub struct AnimationRuntime {
    project_root: Option<PathBuf>,
    clips: HashMap<PathBuf, CachedAnimation>,
    reported_failures: HashSet<(String, String)>,
}

impl AnimationRuntime {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            clips: HashMap::new(),
            reported_failures: HashSet::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.clips.clear();
        self.reported_failures.clear();
    }

    pub fn invalidate(&mut self, clip: &str) {
        let Some(root) = self.project_root.as_deref() else {
            return;
        };
        if let Some(path) = resolve_project_asset_path(root, clip) {
            self.clips.remove(&path);
        }
    }

    pub fn update(&mut self, world: &mut World, delta_seconds: f32) -> Vec<AnimationLoadFailure> {
        if !delta_seconds.is_finite() {
            return Vec::new();
        }
        let players: Vec<_> = world
            .iter_entities()
            .filter(|entity| world.entity_active(*entity))
            .filter_map(|entity| {
                world
                    .get_component::<AnimationPlayer>(entity)
                    .cloned()
                    .map(|player| (entity, player))
            })
            .collect();
        let mut failures = Vec::new();

        for (entity, player) in players {
            let clip_key = player.clip.trim();
            if !player.playing || clip_key.is_empty() {
                continue;
            }
            let clip = match self.load_clip(clip_key) {
                Ok(clip) => {
                    self.reported_failures
                        .retain(|(reported_clip, _)| reported_clip != clip_key);
                    clip
                }
                Err(error) => {
                    if self
                        .reported_failures
                        .insert((clip_key.to_owned(), error.clone()))
                    {
                        failures.push(AnimationLoadFailure {
                            entity,
                            clip: clip_key.to_owned(),
                            error,
                        });
                    }
                    continue;
                }
            };

            let next_time = advance_player_time(
                player.time,
                delta_seconds * player.speed,
                clip.duration,
                clip.wrap_mode,
            );
            for sample in clip.sample(next_time.time) {
                let Some(target) = resolve_animation_target(world, entity, &sample.target) else {
                    continue;
                };
                let Some(mut component) = world.component_value(target, &sample.component) else {
                    continue;
                };
                if set_json_property(&mut component, &sample.property, sample.value) {
                    world.set_component_value(target, &sample.component, component);
                }
            }

            if let Some(live_player) = world.get_component_mut::<AnimationPlayer>(entity) {
                live_player.time = next_time.time;
                if next_time.finished {
                    live_player.playing = false;
                }
            }
        }

        failures
    }

    fn load_clip(&mut self, key: &str) -> Result<Arc<AnimationClip>, String> {
        let root = self.project_root.as_deref().ok_or_else(|| {
            "runtime requires --project-root to resolve Animation Clips".to_owned()
        })?;
        let path = resolve_project_asset_path(root, key).ok_or_else(|| {
            "Animation Clip path must be project-relative without '..'".to_owned()
        })?;
        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok();
        let reload = self
            .clips
            .get(&path)
            .is_none_or(|cached| cached.modified != modified);
        if reload {
            let result = load_animation_clip(&path)
                .map(Arc::new)
                .map_err(|error| error.to_string());
            self.clips
                .insert(path.clone(), CachedAnimation { modified, result });
        }
        self.clips
            .get(&path)
            .expect("animation cache inserted")
            .result
            .clone()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct PlayerTime {
    time: f32,
    finished: bool,
}

fn advance_player_time(
    current: f32,
    delta: f32,
    duration: f32,
    wrap_mode: AnimationWrapMode,
) -> PlayerTime {
    if !current.is_finite() || !delta.is_finite() || !duration.is_finite() || duration <= 0.0 {
        return PlayerTime {
            time: 0.0,
            finished: wrap_mode == AnimationWrapMode::Once,
        };
    }
    let next = current + delta;
    match wrap_mode {
        AnimationWrapMode::Once => PlayerTime {
            time: next.clamp(0.0, duration),
            finished: (delta >= 0.0 && next >= duration) || (delta < 0.0 && next <= 0.0),
        },
        AnimationWrapMode::Loop => PlayerTime {
            time: next.rem_euclid(duration),
            finished: false,
        },
        AnimationWrapMode::PingPong => PlayerTime {
            time: next.rem_euclid(duration * 2.0),
            finished: false,
        },
    }
}

fn resolve_animation_target(world: &World, root: Entity, target: &str) -> Option<Entity> {
    let target = target.trim();
    if target.is_empty() || target == "." {
        return Some(root);
    }
    if let Ok(raw) = target.parse::<u64>() {
        let entity = Entity::from_u64(raw);
        return world.is_alive(entity).then_some(entity);
    }
    let mut current = root;
    for segment in target
        .trim_start_matches("./")
        .split('/')
        .filter(|part| !part.is_empty())
    {
        current = world.iter_entities().find(|candidate| {
            world
                .get_component::<Parent>(*candidate)
                .is_some_and(|parent| parent.entity == current)
                && world.entity_name(*candidate) == Some(segment)
        })?;
    }
    Some(current)
}

fn array_index(segment: &str) -> Option<usize> {
    match segment {
        "x" | "r" => Some(0),
        "y" | "g" => Some(1),
        "z" | "b" => Some(2),
        "w" | "a" => Some(3),
        _ => segment.parse().ok(),
    }
}

fn set_json_property(root: &mut Value, property: &str, value: AnimationValue) -> bool {
    let segments: Vec<_> = property
        .split('.')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect();
    if segments.is_empty()
        || segments
            .iter()
            .any(|segment| matches!(*segment, "__proto__" | "constructor" | "prototype"))
    {
        return false;
    }
    let mut cursor = root;
    for segment in &segments[..segments.len() - 1] {
        cursor = match cursor {
            Value::Object(object) => match object.get_mut(*segment) {
                Some(value) => value,
                None => return false,
            },
            Value::Array(array) => {
                match array_index(segment).and_then(|index| array.get_mut(index)) {
                    Some(value) => value,
                    None => return false,
                }
            }
            _ => return false,
        };
    }
    let replacement = animation_value_to_json(value);
    let last = segments[segments.len() - 1];
    match cursor {
        Value::Object(object) if object.contains_key(last) => {
            object.insert(last.to_owned(), replacement);
            true
        }
        Value::Array(array) => {
            let Some(index) = array_index(last) else {
                return false;
            };
            let Some(slot) = array.get_mut(index) else {
                return false;
            };
            *slot = replacement;
            true
        }
        _ => false,
    }
}

fn animation_value_to_json(value: AnimationValue) -> Value {
    match value {
        AnimationValue::Bool(value) => Value::Bool(value),
        AnimationValue::Float(value) => Number::from_f64(value as f64)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        AnimationValue::Vector(values) => Value::Array(
            values
                .into_iter()
                .map(|value| {
                    Number::from_f64(value as f64)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                })
                .collect(),
        ),
        AnimationValue::String(value) => Value::String(value),
    }
}

pub fn infer_project_root_from_scene(scene: &Path) -> Option<PathBuf> {
    let mut current = scene.parent();
    while let Some(directory) = current {
        if directory
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("Assets"))
        {
            return directory.parent().map(Path::to_path_buf);
        }
        current = directory.parent();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::generated::{AnimationPlayer, Transform};
    use std::fs;

    fn temp_project() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("mengine-animation-{unique}"));
        fs::create_dir_all(path.join("Assets/Animations")).unwrap();
        path
    }

    #[test]
    fn advances_wrap_modes_and_reverse_once_playback() {
        assert_eq!(
            advance_player_time(0.75, 0.5, 1.0, AnimationWrapMode::Loop),
            PlayerTime {
                time: 0.25,
                finished: false
            }
        );
        assert_eq!(
            advance_player_time(0.25, -0.5, 1.0, AnimationWrapMode::Once),
            PlayerTime {
                time: 0.0,
                finished: true
            }
        );
    }

    #[test]
    fn runtime_loads_samples_and_preserves_unanimated_fields() {
        let project = temp_project();
        let clip_path = project.join("Assets/Animations/move.manim");
        fs::write(
            &clip_path,
            r#"{
              "version": 1,
              "name": "Move",
              "duration": 1,
              "frame_rate": 60,
              "wrap_mode": "once",
              "tracks": [{
                "target": ".",
                "component": "Transform",
                "property": "position.x",
                "interpolation": "linear",
                "keyframes": [{"time":0,"value":0},{"time":1,"value":10}]
              }]
            }"#,
        )
        .unwrap();

        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(
            entity,
            AnimationPlayer {
                clip: "Assets/Animations/move.manim".into(),
                playing: true,
                ..AnimationPlayer::default()
            },
        );
        let mut runtime = AnimationRuntime::new(Some(project.clone()));
        assert!(runtime.update(&mut world, 0.5).is_empty());
        let transform = world.get_component::<Transform>(entity).unwrap();
        assert!((transform.position[0] - 5.0).abs() < 0.0001);
        assert_eq!(transform.scale, [1.0, 1.0, 1.0]);

        assert!(runtime.update(&mut world, 0.5).is_empty());
        let player = world.get_component::<AnimationPlayer>(entity).unwrap();
        assert!(!player.playing);
        assert_eq!(player.time, 1.0);
        fs::remove_dir_all(project).unwrap();
    }

    #[test]
    fn relative_targets_animate_children_by_name() {
        let mut world = World::new();
        let root = world.spawn_empty();
        let child = world.spawn_empty();
        world.set_component_value(child, "Name", serde_json::json!({ "value": "Arm" }));
        world.insert_component(child, Transform::default());
        world.set_parent(child, Some(root));

        assert_eq!(resolve_animation_target(&world, root, "./Arm"), Some(child));
        let mut value = world.component_value(child, "Transform").unwrap();
        assert!(set_json_property(
            &mut value,
            "scale.y",
            AnimationValue::Float(2.0)
        ));
        world.set_component_value(child, "Transform", value);
        assert_eq!(
            world.get_component::<Transform>(child).unwrap().scale,
            [1.0, 2.0, 1.0]
        );
    }

    #[test]
    fn infers_project_root_above_assets_directory() {
        assert_eq!(
            infer_project_root_from_scene(Path::new("Demo/Assets/Scenes/Main.mscene")),
            Some(PathBuf::from("Demo"))
        );
    }
}
