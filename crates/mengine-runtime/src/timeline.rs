use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_timeline_asset, TimelineAsset, TimelineTrack};
use mengine_core::generated::TimelineDirector;
use mengine_core::{Entity, World};
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

#[derive(Default)]
pub struct TimelineRuntime {
    project_root: Option<PathBuf>,
    assets: HashMap<PathBuf, CachedTimeline>,
    initialized: HashSet<Entity>,
    active: HashSet<Entity>,
    reported_failures: HashSet<(String, String)>,
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
        if !delta_seconds.is_finite() {
            return Vec::new();
        }
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
            if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                live.time = next;
                if finished {
                    live.playing = false;
                    self.active.remove(&entity);
                }
            }
        }
        failures
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
        } = track;
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
        } = track;
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
}
