use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_timeline_asset, TimelineAsset, TimelineTrack};
use mengine_core::generated::TimelineDirector;
use mengine_core::{Entity, Parent, World};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

const MAX_SIGNALS_PER_UPDATE: usize = 4096;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TimelineLoadFailure {
    pub entity: Entity,
    pub asset: String,
    pub error: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeTimelineSignal {
    pub entity: Entity,
    pub track: String,
    pub signal: String,
    pub time: f32,
    pub payload: Option<Value>,
}

#[derive(Clone)]
struct CachedTimeline {
    modified: Option<SystemTime>,
    result: Result<Arc<TimelineAsset>, String>,
}

#[derive(Clone, Copy)]
struct ActivationOverride {
    target: Entity,
    original_active: bool,
    sibling_index: i32,
}

#[derive(Default)]
pub struct TimelineRuntime {
    project_root: Option<PathBuf>,
    assets: HashMap<PathBuf, CachedTimeline>,
    initialized: HashSet<Entity>,
    active: HashSet<Entity>,
    reported_failures: HashSet<(String, String)>,
    reported_activation_failures: HashSet<(Entity, String)>,
    activation_overrides: HashMap<(Entity, String), ActivationOverride>,
    pending_signals: Vec<RuntimeTimelineSignal>,
}

impl TimelineRuntime {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            ..Self::default()
        }
    }

    pub fn update(&mut self, world: &mut World, delta_seconds: f32) -> Vec<TimelineLoadFailure> {
        self.pending_signals.clear();
        let delta_seconds = if delta_seconds.is_finite() {
            delta_seconds
        } else {
            0.0
        };
        let all_entities: HashSet<_> = world
            .iter_entities()
            .filter(|entity| world.get_component::<TimelineDirector>(*entity).is_some())
            .collect();
        self.initialized
            .retain(|entity| all_entities.contains(entity) && world.is_alive(*entity));
        let entities: Vec<_> = all_entities
            .iter()
            .copied()
            .filter(|entity| world.entity_active(*entity))
            .filter_map(|entity| {
                world
                    .get_component::<TimelineDirector>(entity)
                    .cloned()
                    .map(|director| (entity, director))
            })
            .collect();
        let active_entities: HashSet<_> = entities.iter().map(|(entity, _)| *entity).collect();
        self.active
            .retain(|entity| active_entities.contains(entity) && world.is_alive(*entity));

        let mut failures = Vec::new();
        let mut applied_activation_overrides = HashSet::new();
        for (entity, mut director) in entities {
            if self.initialized.insert(entity) && !director.play_on_awake {
                director.playing = false;
                if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                    live.playing = false;
                }
            }
            let asset_key = director.asset.trim();
            if !director.playing || asset_key.is_empty() {
                self.active.remove(&entity);
                continue;
            }
            let asset = match self.load(asset_key) {
                Ok(asset) => {
                    self.reported_failures
                        .retain(|(reported, _)| reported != asset_key);
                    asset
                }
                Err(error) => {
                    if self
                        .reported_failures
                        .insert((asset_key.to_owned(), error.clone()))
                    {
                        failures.push(TimelineLoadFailure {
                            entity,
                            asset: asset_key.to_owned(),
                            error,
                        });
                    }
                    continue;
                }
            };

            let looped = director.wrap_mode.eq_ignore_ascii_case("loop");
            let just_started = self.active.insert(entity);
            let start = director.time.clamp(0.0, asset.duration);
            if just_started {
                collect_signals_at(&asset, entity, start, &mut self.pending_signals);
            }
            let delta = delta_seconds * director.speed;
            collect_crossed_signals(
                &asset,
                entity,
                start,
                delta,
                looped,
                &mut self.pending_signals,
            );
            let raw_next = start + delta;
            let (next, finished) = if looped {
                (raw_next.rem_euclid(asset.duration), false)
            } else {
                let next = raw_next.clamp(0.0, asset.duration);
                let finished =
                    delta > 0.0 && raw_next >= asset.duration || delta < 0.0 && raw_next <= 0.0;
                (next, finished)
            };
            if !finished {
                let (applied, mut activation_failures) =
                    self.apply_activation_tracks(world, entity, asset_key, &asset, next);
                applied_activation_overrides.extend(applied);
                failures.append(&mut activation_failures);
            }
            if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                live.time = next;
                if finished {
                    live.playing = false;
                    self.active.remove(&entity);
                }
            }
        }
        self.restore_unused_activation_overrides(world, &applied_activation_overrides);
        self.reported_activation_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        failures
    }

    /// Re-enters a director on its next playing update so time-zero signals fire once.
    pub fn reset_director(&mut self, entity: Entity) {
        self.active.remove(&entity);
    }

    pub fn take_signals(&mut self) -> Vec<RuntimeTimelineSignal> {
        std::mem::take(&mut self.pending_signals)
    }

    fn load(&mut self, key: &str) -> Result<Arc<TimelineAsset>, String> {
        let root = self
            .project_root
            .as_deref()
            .ok_or_else(|| "project root is not configured".to_owned())?;
        let path = resolve_project_asset_path(root, key)
            .ok_or_else(|| "asset path must be under Assets".to_owned())?;
        let modified = path.metadata().and_then(|value| value.modified()).ok();
        let reload = self
            .assets
            .get(&path)
            .is_none_or(|cached| cached.modified != modified);
        if reload {
            let result = load_timeline_asset(&path)
                .map(Arc::new)
                .map_err(|error| error.to_string());
            self.assets
                .insert(path.clone(), CachedTimeline { modified, result });
        }
        self.assets[&path].result.clone()
    }

    fn apply_activation_tracks(
        &mut self,
        world: &mut World,
        director: Entity,
        asset_key: &str,
        asset: &TimelineAsset,
        time: f32,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        for track in &asset.tracks {
            let TimelineTrack::Activation {
                id,
                name,
                muted,
                target,
                clips,
            } = track
            else {
                continue;
            };
            let key = (director, id.clone());
            if *muted {
                self.reported_activation_failures.remove(&key);
                continue;
            }
            let Some(clip) = clips
                .iter()
                .find(|clip| time >= clip.start && time < clip.start + clip.duration)
            else {
                self.reported_activation_failures.remove(&key);
                continue;
            };
            let Some(target_entity) = resolve_activation_target(world, director, target) else {
                if self.reported_activation_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: director,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "activation track '{name}' target '{target}' was not found below the Director entity"
                        ),
                    });
                }
                continue;
            };
            self.reported_activation_failures.remove(&key);
            if let Some(previous) = self.activation_overrides.get(&key).copied() {
                if previous.target != target_entity {
                    self.restore_activation_override(world, &key);
                }
            }
            self.activation_overrides
                .entry(key.clone())
                .or_insert_with(|| ActivationOverride {
                    target: target_entity,
                    original_active: world.entity_active(target_entity),
                    sibling_index: world.sibling_index(target_entity),
                });
            world.set_editor_state(
                target_entity,
                world.sibling_index(target_entity),
                clip.active,
            );
            applied.insert(key);
        }
        (applied, failures)
    }

    fn restore_unused_activation_overrides(
        &mut self,
        world: &mut World,
        applied: &HashSet<(Entity, String)>,
    ) {
        let stale: Vec<_> = self
            .activation_overrides
            .keys()
            .filter(|key| !applied.contains(*key))
            .cloned()
            .collect();
        for key in stale {
            self.restore_activation_override(world, &key);
        }
    }

    fn restore_activation_override(&mut self, world: &mut World, key: &(Entity, String)) {
        let Some(previous) = self.activation_overrides.remove(key) else {
            return;
        };
        if world.is_alive(previous.target) {
            world.set_editor_state(
                previous.target,
                previous.sibling_index,
                previous.original_active,
            );
        }
    }
}

fn resolve_activation_target(world: &World, root: Entity, target: &str) -> Option<Entity> {
    let mut current = root;
    for segment in target.split('/') {
        current = world.iter_entities().find(|candidate| {
            world
                .get_component::<Parent>(*candidate)
                .is_some_and(|parent| parent.entity == current)
                && world.entity_name(*candidate) == Some(segment)
        })?;
    }
    Some(current)
}

fn collect_signals_at(
    asset: &TimelineAsset,
    entity: Entity,
    time: f32,
    output: &mut Vec<RuntimeTimelineSignal>,
) {
    for track in &asset.tracks {
        let TimelineTrack::Signal {
            name,
            muted,
            markers,
            ..
        } = track
        else {
            continue;
        };
        if *muted {
            continue;
        }
        for marker in markers {
            if (marker.time - time).abs() <= f32::EPSILON {
                output.push(RuntimeTimelineSignal {
                    entity,
                    track: name.clone(),
                    signal: marker.name.clone(),
                    time: marker.time,
                    payload: marker.payload.clone(),
                });
            }
        }
    }
}

fn collect_crossed_signals(
    asset: &TimelineAsset,
    entity: Entity,
    start: f32,
    delta: f32,
    looped: bool,
    output: &mut Vec<RuntimeTimelineSignal>,
) {
    if delta.abs() <= f32::EPSILON || output.len() >= MAX_SIGNALS_PER_UPDATE {
        return;
    }
    let end = if looped {
        start + delta
    } else {
        (start + delta).clamp(0.0, asset.duration)
    };
    let mut crossed = Vec::new();
    for track in &asset.tracks {
        let TimelineTrack::Signal {
            name,
            muted,
            markers,
            ..
        } = track
        else {
            continue;
        };
        if *muted {
            continue;
        }
        for marker in markers {
            if looped {
                let first = if delta > 0.0 {
                    ((start - marker.time) / asset.duration).floor() as i64 + 1
                } else {
                    ((end - marker.time) / asset.duration).ceil() as i64
                };
                let last = if delta > 0.0 {
                    ((end - marker.time) / asset.duration).floor() as i64
                } else {
                    ((start - marker.time) / asset.duration).ceil() as i64 - 1
                };
                for cycle in first..=last {
                    let phase = marker.time + cycle as f32 * asset.duration;
                    crossed.push((phase, name, marker));
                    if crossed.len() + output.len() >= MAX_SIGNALS_PER_UPDATE {
                        break;
                    }
                }
            } else if delta > 0.0 && marker.time > start && marker.time <= end
                || delta < 0.0 && marker.time < start && marker.time >= end
            {
                crossed.push((marker.time, name, marker));
            }
        }
    }
    crossed.sort_by(|left, right| {
        let order = left.0.total_cmp(&right.0);
        if delta > 0.0 {
            order
        } else {
            order.reverse()
        }
    });
    output.extend(
        crossed
            .into_iter()
            .take(MAX_SIGNALS_PER_UPDATE - output.len())
            .map(|(_, track, marker)| RuntimeTimelineSignal {
                entity,
                track: track.clone(),
                signal: marker.name.clone(),
                time: marker.time,
                payload: marker.payload.clone(),
            }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn project_asset() -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("mengine-timeline-{}", uuid::Uuid::new_v4()));
        let relative = "Assets/Timelines/intro.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            r#"{"version":1,"name":"Intro","duration":2,"tracks":[{"type":"signal","id":"signals","name":"Signals","markers":[{"time":0,"name":"Start"},{"time":0.5,"name":"Beat","payload":3},{"time":1.5,"name":"End"}]}]}"#,
        )
        .unwrap();
        (root, relative)
    }

    fn activation_project_asset(target: &str) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("mengine-timeline-{}", uuid::Uuid::new_v4()));
        let relative = "Assets/Timelines/activation.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            format!(
                r#"{{"version":1,"duration":2,"tracks":[{{"type":"activation","id":"visibility","name":"Visibility","target":"{target}","clips":[{{"start":0,"duration":0.5,"active":false}},{{"start":1,"duration":0.5,"active":false}}]}}]}}"#
            ),
        )
        .unwrap();
        (root, relative)
    }

    #[test]
    fn plays_signals_and_stops_hold_directors() {
        let (root, relative) = project_asset();
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            TimelineDirector {
                asset: relative,
                wrap_mode: "Hold".into(),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));
        assert!(runtime.update(&mut world, 0.75).is_empty());
        let signals = runtime.take_signals();
        assert_eq!(
            signals
                .iter()
                .map(|event| event.signal.as_str())
                .collect::<Vec<_>>(),
            ["Start", "Beat"]
        );
        assert_eq!(signals[1].payload, Some(serde_json::json!(3)));
        runtime.update(&mut world, 2.0);
        assert_eq!(runtime.take_signals()[0].signal, "End");
        assert!(
            !world
                .get_component::<TimelineDirector>(entity)
                .unwrap()
                .playing
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn loop_and_reverse_cross_boundaries_in_playback_order() {
        let (root, relative) = project_asset();
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            TimelineDirector {
                asset: relative,
                time: 1.75,
                wrap_mode: "Loop".into(),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));
        runtime.update(&mut world, 1.0);
        assert_eq!(
            runtime
                .take_signals()
                .iter()
                .map(|event| event.signal.as_str())
                .collect::<Vec<_>>(),
            ["Start", "Beat"]
        );
        world
            .get_component_mut::<TimelineDirector>(entity)
            .unwrap()
            .speed = -1.0;
        runtime.update(&mut world, 1.5);
        assert_eq!(
            runtime
                .take_signals()
                .iter()
                .map(|event| event.signal.as_str())
                .collect::<Vec<_>>(),
            ["Beat", "Start", "End"]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reactivation_does_not_repeat_play_on_awake() {
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            TimelineDirector {
                play_on_awake: false,
                playing: true,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(None);
        runtime.update(&mut world, 0.0);
        world
            .get_component_mut::<TimelineDirector>(entity)
            .unwrap()
            .playing = true;
        world.set_editor_state(entity, 0, false);
        runtime.update(&mut world, 0.0);
        world.set_editor_state(entity, 0, true);
        runtime.update(&mut world, 0.0);
        assert!(
            world
                .get_component::<TimelineDirector>(entity)
                .unwrap()
                .playing
        );
    }

    #[test]
    fn delayed_activation_honors_play_on_awake_once() {
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            TimelineDirector {
                play_on_awake: false,
                playing: true,
                ..TimelineDirector::default()
            },
        );
        world.set_editor_state(entity, 0, false);
        let mut runtime = TimelineRuntime::new(None);
        runtime.update(&mut world, 0.0);
        assert!(
            world
                .get_component::<TimelineDirector>(entity)
                .unwrap()
                .playing
        );
        world.set_editor_state(entity, 0, true);
        runtime.update(&mut world, 0.0);
        assert!(
            !world
                .get_component::<TimelineDirector>(entity)
                .unwrap()
                .playing
        );
    }

    #[test]
    fn reset_director_rearms_zero_time_signals() {
        let (root, relative) = project_asset();
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        runtime.update(&mut world, 0.0);
        assert_eq!(runtime.take_signals()[0].signal, "Start");
        runtime.update(&mut world, 0.0);
        assert!(runtime.take_signals().is_empty());

        runtime.reset_director(entity);
        runtime.update(&mut world, 0.0);
        assert_eq!(runtime.take_signals()[0].signal, "Start");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn activation_tracks_apply_and_restore_authored_state() {
        let (root, relative) = activation_project_asset("Panel");
        let mut world = World::new();
        let director = world.spawn_empty();
        let panel = world.spawn_empty();
        world.set_component_value(panel, "Name", serde_json::json!({ "value": "Panel" }));
        world.set_parent(panel, Some(director));
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(!world.entity_active(panel));
        runtime.update(&mut world, 0.75);
        assert!(world.entity_active(panel));
        runtime.update(&mut world, 0.3);
        assert!(!world.entity_active(panel));
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        runtime.update(&mut world, 0.0);
        assert!(world.entity_active(panel));

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = true;
            live.speed = -1.0;
            live.time = 0.25;
        }
        runtime.update(&mut world, 0.0);
        assert!(!world.entity_active(panel));
        runtime.update(&mut world, 0.5);
        assert!(world.entity_active(panel));
        assert!(
            !world
                .get_component::<TimelineDirector>(director)
                .unwrap()
                .playing
        );

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = true;
            live.speed = 1.0;
            live.time = 0.0;
        }
        runtime.reset_director(director);
        runtime.update(&mut world, 0.0);
        assert!(!world.entity_active(panel));
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        runtime.update(&mut world, f32::NAN);
        assert!(world.entity_active(panel));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_activation_target_is_reported_once() {
        let (root, relative) = activation_project_asset("Missing");
        let mut world = World::new();
        let director = world.spawn_empty();
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        let failures = runtime.update(&mut world, 0.0);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("Missing"));
        assert!(runtime.update(&mut world, 0.0).is_empty());
        let _ = fs::remove_dir_all(root);
    }
}
