use crate::animation::RuntimeAnimationBlend;
use crate::particles::MAX_INCREMENTAL_DELTA;
use crate::prefabs::instantiate_project_prefab;
use crate::textures::resolve_project_asset_path;
use mengine_assets::{
    load_timeline_asset, parse_timeline_binding_table, TimelineAsset, TimelineAudioClip,
    TimelineBindingTable, TimelineControlClip, TimelineEntityBinding, TimelineTrack,
};
use mengine_core::generated::{
    AnimationPlayer, Animator, AudioSource, Camera2D, Camera3D, ParticleEmitter2D,
    ParticleEmitter3D, TimelineDirector,
};
use mengine_core::{Entity, Parent, World};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

const MAX_SIGNALS_PER_UPDATE: usize = 4096;
const MAX_CONTROL_TIMELINE_DEPTH: usize = 8;

fn audio_fade_curve_factor(curve: &str, value: f32) -> f32 {
    let value = value.clamp(0.0, 1.0);
    if curve == "ease_in_out" {
        value * value * (3.0 - 2.0 * value)
    } else {
        value
    }
}

fn timeline_audio_gain(clip: &TimelineAudioClip, time: f32) -> f32 {
    let elapsed = (time - clip.start).clamp(0.0, clip.duration);
    let fade_in = if clip.fade_in > 0.0 {
        audio_fade_curve_factor(&clip.fade_curve, elapsed / clip.fade_in)
    } else {
        1.0
    };
    let fade_out = if clip.fade_out > 0.0 {
        audio_fade_curve_factor(&clip.fade_curve, (clip.duration - elapsed) / clip.fade_out)
    } else {
        1.0
    };
    fade_in.min(fade_out).clamp(0.0, 1.0)
}

fn timeline_animation_blend_factor(curve: &str, value: f32) -> f32 {
    let value = value.clamp(0.0, 1.0);
    if curve == "ease_in_out" {
        value * value * (3.0 - 2.0 * value)
    } else {
        value
    }
}

fn outgoing_animation_sample_time(clip: &mengine_assets::TimelineAnimationClip) -> f32 {
    let epsilon = (clip.duration.abs() * f32::EPSILON)
        .max(f32::EPSILON)
        .min(clip.duration);
    (clip.clip_in + (clip.duration - epsilon).max(0.0) * clip.speed).max(0.0)
}

fn timeline_end_sample(duration: f32) -> f32 {
    let epsilon = (duration.abs() * f32::EPSILON)
        .max(f32::EPSILON)
        .min(duration);
    (duration - epsilon).max(0.0)
}

fn control_raw_time(clip: &TimelineControlClip, parent_time: f32) -> f32 {
    clip.clip_in + (parent_time - clip.start) * clip.speed
}

fn control_sample_time(clip: &TimelineControlClip, child_duration: f32, parent_time: f32) -> f32 {
    let raw = control_raw_time(clip, parent_time);
    match clip.extrapolation.as_str() {
        "loop" => raw.rem_euclid(child_duration),
        "hold" if raw >= child_duration => timeline_end_sample(child_duration),
        _ => raw.clamp(0.0, child_duration),
    }
}

fn control_source_window_is_valid(clip: &TimelineControlClip, child_duration: f32) -> bool {
    if clip.clip_in < -f32::EPSILON || clip.clip_in > child_duration + f32::EPSILON {
        return false;
    }
    if clip.extrapolation != "none" {
        return true;
    }
    let source_end = clip.clip_in + clip.duration * clip.speed;
    source_end >= -f32::EPSILON && source_end <= child_duration + f32::EPSILON
}

fn control_clip_source<'a>(clip: &'a TimelineControlClip, legacy_track_target: &'a str) -> &'a str {
    if clip.source.is_empty() {
        legacy_track_target
    } else {
        &clip.source
    }
}

fn control_loop_crossed(raw_from: f32, raw_to: f32, duration: f32) -> bool {
    (raw_from / duration).floor() != (raw_to / duration).floor()
}

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

#[derive(Clone, Debug)]
struct OrderedTimelineSignal {
    traversal: f32,
    sequence: usize,
    signal: RuntimeTimelineSignal,
}

#[derive(Clone, Copy, Debug)]
struct ControlSignalSegment {
    from: f32,
    to: f32,
    include_start: bool,
    traversal_start: f32,
    traversal_duration: f32,
}

fn control_signal_segments(
    clip: &TimelineControlClip,
    child_duration: f32,
    parent_from: f32,
    parent_to: f32,
    entered: bool,
    traversal_start: f32,
    traversal_duration: f32,
) -> Vec<ControlSignalSegment> {
    let raw_from = control_raw_time(clip, parent_from);
    let raw_to = control_raw_time(clip, parent_to);
    let raw_delta = raw_to - raw_from;
    if clip.extrapolation == "none" {
        return vec![ControlSignalSegment {
            from: raw_from,
            to: raw_to,
            include_start: entered,
            traversal_start,
            traversal_duration,
        }];
    }
    if clip.extrapolation == "hold" {
        let mut segments = Vec::with_capacity(2);
        if entered {
            segments.push(ControlSignalSegment {
                from: raw_from.clamp(0.0, child_duration),
                to: raw_from.clamp(0.0, child_duration),
                include_start: true,
                traversal_start,
                traversal_duration: 0.0,
            });
        }
        if raw_delta.abs() <= f32::EPSILON {
            return segments;
        }
        let zero_progress = (0.0 - raw_from) / raw_delta;
        let end_progress = (child_duration - raw_from) / raw_delta;
        let active_start = zero_progress.min(end_progress).clamp(0.0, 1.0);
        let active_end = zero_progress.max(end_progress).clamp(0.0, 1.0);
        if active_end - active_start > f32::EPSILON {
            segments.push(ControlSignalSegment {
                from: (raw_from + raw_delta * active_start).clamp(0.0, child_duration),
                to: (raw_from + raw_delta * active_end).clamp(0.0, child_duration),
                include_start: false,
                traversal_start: traversal_start + traversal_duration * active_start,
                traversal_duration: traversal_duration * (active_end - active_start),
            });
        }
        return segments;
    }

    let mut segments = Vec::with_capacity(8);
    let mut cursor = raw_from.rem_euclid(child_duration);
    if entered {
        segments.push(ControlSignalSegment {
            from: cursor,
            to: cursor,
            include_start: true,
            traversal_start,
            traversal_duration: 0.0,
        });
    }
    if raw_delta.abs() <= f32::EPSILON {
        return segments;
    }
    let total = raw_delta.abs();
    let mut remaining = raw_delta;
    let mut consumed = 0.0;
    let mut include_start = false;
    let mut segment_count = 0usize;
    while remaining.abs() > f32::EPSILON && segment_count < MAX_SIGNALS_PER_UPDATE {
        if remaining > 0.0 && cursor >= child_duration - f32::EPSILON {
            cursor = 0.0;
            include_start = true;
        } else if remaining < 0.0 && cursor <= f32::EPSILON {
            cursor = child_duration;
            include_start = true;
        }
        let step = if remaining > 0.0 {
            remaining.min(child_duration - cursor)
        } else {
            remaining.max(-cursor)
        };
        if step.abs() <= f32::EPSILON {
            break;
        }
        let end = cursor + step;
        segments.push(ControlSignalSegment {
            from: cursor,
            to: end,
            include_start,
            traversal_start: traversal_start + traversal_duration * (consumed / total),
            traversal_duration: traversal_duration * (step.abs() / total),
        });
        consumed += step.abs();
        remaining -= step;
        cursor = end;
        include_start = false;
        segment_count += 1;
    }
    if remaining.abs() <= f32::EPSILON && segments.len() < MAX_SIGNALS_PER_UPDATE {
        let wrapped_boundary = if raw_delta > 0.0 && cursor >= child_duration - f32::EPSILON {
            Some(0.0)
        } else if raw_delta < 0.0 && cursor <= f32::EPSILON {
            Some(child_duration)
        } else {
            None
        };
        if let Some(boundary) = wrapped_boundary {
            segments.push(ControlSignalSegment {
                from: boundary,
                to: boundary,
                include_start: true,
                traversal_start: traversal_start + traversal_duration,
                traversal_duration: 0.0,
            });
        }
    }
    segments
}

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeParticleCommand {
    Seek { entity: Entity, time: f32 },
    Reset { entity: Entity },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RuntimeCameraOverride {
    pub director: Entity,
    pub source: Option<Entity>,
    pub target: Entity,
    pub weight: f32,
}

#[derive(Clone)]
struct CachedTimeline {
    modified: Option<SystemTime>,
    result: Result<Arc<TimelineAsset>, String>,
}

#[derive(Clone)]
struct ActivationOverride {
    target: Entity,
    original_active: bool,
    post_playback: String,
}

#[derive(Clone)]
struct AudioOverride {
    target: Entity,
    original: AudioSource,
    last_timeline_time: f32,
    clip_start: f32,
    clip_path: String,
    clip_in: f32,
    clip_pitch: f32,
}

#[derive(Clone)]
struct AnimationOverride {
    target: Entity,
    original: AnimationPlayer,
}

#[derive(Clone)]
enum AuthoredParticleEmitter {
    Two(ParticleEmitter2D),
    Three(ParticleEmitter3D),
}

#[derive(Clone)]
struct ParticleOverride {
    target: Entity,
    original: AuthoredParticleEmitter,
    last_timeline_time: f32,
    clip_start: f32,
    clip_in: f32,
}

#[derive(Default)]
struct AppliedTimelineOverrides {
    activation: HashSet<(Entity, String)>,
    audio: HashSet<(Entity, String)>,
    animation: HashSet<(Entity, String)>,
    particle: HashSet<(Entity, String)>,
    camera: HashSet<(Entity, String)>,
    control_prefabs_known: HashSet<(Entity, String)>,
    control_prefabs_active: HashSet<(Entity, String)>,
}

struct ControlPrefabInstance {
    source: String,
    parent: Entity,
    root: Entity,
    entities: Vec<Entity>,
}

#[derive(Default)]
pub struct TimelineRuntime {
    project_root: Option<PathBuf>,
    assets: HashMap<PathBuf, CachedTimeline>,
    initialized: HashSet<Entity>,
    active: HashSet<Entity>,
    evaluated_directors: HashMap<Entity, (String, String, f32)>,
    reported_failures: HashSet<(String, String)>,
    reported_binding_failures: HashSet<(Entity, String)>,
    reported_activation_failures: HashSet<(Entity, String)>,
    reported_audio_failures: HashSet<(Entity, String)>,
    reported_animation_failures: HashSet<(Entity, String)>,
    reported_particle_failures: HashSet<(Entity, String)>,
    reported_camera_failures: HashSet<(Entity, String)>,
    reported_control_failures: HashSet<(Entity, String)>,
    activation_overrides: HashMap<(Entity, String), ActivationOverride>,
    audio_overrides: HashMap<(Entity, String), AudioOverride>,
    animation_overrides: HashMap<(Entity, String), AnimationOverride>,
    particle_overrides: HashMap<(Entity, String), ParticleOverride>,
    camera_overrides: HashMap<(Entity, String), RuntimeCameraOverride>,
    control_prefabs: HashMap<(Entity, String), ControlPrefabInstance>,
    animation_blends: HashMap<(Entity, String), RuntimeAnimationBlend>,
    pending_signals: Vec<RuntimeTimelineSignal>,
    pending_particle_commands: Vec<RuntimeParticleCommand>,
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
        self.pending_particle_commands.clear();
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
        let mut post_playback_owners: HashSet<_> =
            self.active.difference(&active_entities).copied().collect();
        self.evaluated_directors
            .retain(|entity, _| active_entities.contains(entity) && world.is_alive(*entity));
        self.active
            .retain(|entity| active_entities.contains(entity) && world.is_alive(*entity));

        let mut failures = Vec::new();
        let mut applied = AppliedTimelineOverrides::default();
        for (entity, mut director) in entities {
            if self.initialized.insert(entity) && !director.play_on_awake {
                director.playing = false;
                if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                    live.playing = false;
                }
            }
            let asset_key = director.asset.trim();
            if asset_key.is_empty() {
                if self.active.remove(&entity) {
                    post_playback_owners.insert(entity);
                }
                self.evaluated_directors.remove(&entity);
                continue;
            }
            let bindings = match parse_timeline_binding_table(&director.bindings_json) {
                Ok(bindings) => {
                    self.reported_binding_failures
                        .retain(|(owner, _)| *owner != entity);
                    bindings
                }
                Err(error) => {
                    self.active.remove(&entity);
                    self.evaluated_directors.remove(&entity);
                    let error = format!("invalid TimelineDirector bindings_json: {error}");
                    if self
                        .reported_binding_failures
                        .insert((entity, error.clone()))
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
            if !director.playing {
                if director.time <= 0.0 {
                    if self.active.remove(&entity) {
                        post_playback_owners.insert(entity);
                    }
                    self.evaluated_directors.remove(&entity);
                    continue;
                }
                let Some((evaluated_asset, evaluated_bindings, evaluated_time)) =
                    self.evaluated_directors.get(&entity)
                else {
                    self.active.remove(&entity);
                    continue;
                };
                let unchanged = evaluated_asset == asset_key
                    && evaluated_bindings == &director.bindings_json
                    && (director.time - *evaluated_time).abs() <= 0.001;
                if unchanged {
                    self.retain_paused_overrides(
                        world,
                        entity,
                        &mut applied.activation,
                        &mut applied.audio,
                        &mut applied.animation,
                        &mut applied.particle,
                        &mut applied.camera,
                        &mut applied.control_prefabs_known,
                        &mut applied.control_prefabs_active,
                    );
                    continue;
                }
            }
            let asset = match self.load(asset_key) {
                Ok(asset) => {
                    self.reported_failures
                        .retain(|(reported, _)| reported != asset_key);
                    asset
                }
                Err(error) => {
                    self.active.remove(&entity);
                    self.evaluated_directors.remove(&entity);
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

            if !director.playing {
                let paused_time = director.time.clamp(0.0, asset.duration);
                self.active.insert(entity);
                self.apply_timeline_layers(
                    world,
                    entity,
                    entity,
                    "",
                    asset_key,
                    &asset,
                    &bindings,
                    paused_time,
                    paused_time,
                    0.0,
                    true,
                    0,
                    &[asset_key.trim().replace('\\', "/").to_ascii_lowercase()],
                    &mut applied,
                    &mut failures,
                );
                self.evaluated_directors.insert(
                    entity,
                    (
                        asset_key.to_owned(),
                        director.bindings_json.clone(),
                        paused_time,
                    ),
                );
                if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                    live.time = paused_time;
                }
                continue;
            }

            let looped = director.wrap_mode.eq_ignore_ascii_case("loop");
            let just_started = self.active.insert(entity);
            let start = director.time.clamp(0.0, asset.duration);
            let delta = delta_seconds * director.speed;
            let raw_next = start + delta;
            let (next, finished) = if looped {
                (raw_next.rem_euclid(asset.duration), false)
            } else {
                let next = raw_next.clamp(0.0, asset.duration);
                let finished =
                    delta > 0.0 && raw_next >= asset.duration || delta < 0.0 && raw_next <= 0.0;
                (next, finished)
            };
            let root_stack = [asset_key.trim().replace('\\', "/").to_ascii_lowercase()];
            let mut ordered_signals = Vec::with_capacity(32);
            let mut traversal = 0.0;
            if just_started {
                self.collect_timeline_signals_segment(
                    world,
                    entity,
                    entity,
                    "",
                    asset_key,
                    &asset,
                    &bindings,
                    start,
                    start,
                    true,
                    0.0,
                    0.0,
                    0,
                    &root_stack,
                    &mut ordered_signals,
                    &mut failures,
                );
            }
            if looped && delta.abs() > f32::EPSILON {
                let mut cursor = start;
                let mut remaining = delta;
                let mut include_start = false;
                let mut segments = 0usize;
                while remaining.abs() > f32::EPSILON
                    && segments < MAX_SIGNALS_PER_UPDATE
                    && self.pending_signals.len() + ordered_signals.len() < MAX_SIGNALS_PER_UPDATE
                {
                    if remaining > 0.0 && cursor >= asset.duration - f32::EPSILON {
                        cursor = 0.0;
                        include_start = true;
                    } else if remaining < 0.0 && cursor <= f32::EPSILON {
                        cursor = asset.duration;
                        include_start = true;
                    }
                    let step = if remaining > 0.0 {
                        remaining.min(asset.duration - cursor)
                    } else {
                        remaining.max(-cursor)
                    };
                    let segment_end = cursor + step;
                    self.collect_timeline_signals_segment(
                        world,
                        entity,
                        entity,
                        "",
                        asset_key,
                        &asset,
                        &bindings,
                        cursor,
                        segment_end,
                        include_start,
                        traversal,
                        step.abs(),
                        0,
                        &root_stack,
                        &mut ordered_signals,
                        &mut failures,
                    );
                    traversal += step.abs();
                    remaining -= step;
                    cursor = segment_end;
                    include_start = false;
                    if remaining.abs() <= f32::EPSILON && step.abs() > f32::EPSILON {
                        let wrapped_boundary =
                            if delta > 0.0 && cursor >= asset.duration - f32::EPSILON {
                                Some(0.0)
                            } else if delta < 0.0 && cursor <= f32::EPSILON {
                                Some(asset.duration)
                            } else {
                                None
                            };
                        if let Some(boundary) = wrapped_boundary {
                            self.collect_timeline_signals_segment(
                                world,
                                entity,
                                entity,
                                "",
                                asset_key,
                                &asset,
                                &bindings,
                                boundary,
                                boundary,
                                true,
                                traversal,
                                0.0,
                                0,
                                &root_stack,
                                &mut ordered_signals,
                                &mut failures,
                            );
                        }
                    }
                    segments += 1;
                }
            } else {
                self.collect_timeline_signals_segment(
                    world,
                    entity,
                    entity,
                    "",
                    asset_key,
                    &asset,
                    &bindings,
                    start,
                    next,
                    false,
                    0.0,
                    (next - start).abs(),
                    0,
                    &root_stack,
                    &mut ordered_signals,
                    &mut failures,
                );
            }
            ordered_signals.sort_by(|left, right| {
                left.traversal
                    .total_cmp(&right.traversal)
                    .then_with(|| left.sequence.cmp(&right.sequence))
            });
            self.pending_signals.extend(
                ordered_signals
                    .into_iter()
                    .take(MAX_SIGNALS_PER_UPDATE.saturating_sub(self.pending_signals.len()))
                    .map(|ordered| ordered.signal),
            );
            if !finished {
                let wrapped = looped
                    && (director.speed > 0.0 && next < start
                        || director.speed < 0.0 && next > start);
                self.apply_timeline_layers(
                    world,
                    entity,
                    entity,
                    "",
                    asset_key,
                    &asset,
                    &bindings,
                    if wrapped { next } else { start },
                    next,
                    director.speed,
                    just_started || wrapped,
                    0,
                    &[asset_key.trim().replace('\\', "/").to_ascii_lowercase()],
                    &mut applied,
                    &mut failures,
                );
            } else {
                // A short Timeline can cross its terminal boundary on the first update. Sample
                // the last representable in-range time before tearing overrides down so
                // Activation Post Playback is still defined (including Leave As Is), without
                // treating the exclusive duration endpoint as an authored gap.
                let terminal_time = if director.speed < 0.0 {
                    0.0
                } else {
                    f32::from_bits(asset.duration.to_bits().saturating_sub(1))
                };
                let mut terminal_applied = AppliedTimelineOverrides::default();
                self.apply_timeline_layers(
                    world,
                    entity,
                    entity,
                    "",
                    asset_key,
                    &asset,
                    &bindings,
                    terminal_time,
                    terminal_time,
                    director.speed,
                    false,
                    0,
                    &[asset_key.trim().replace('\\', "/").to_ascii_lowercase()],
                    &mut terminal_applied,
                    &mut failures,
                );
            }
            if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                live.time = next;
                if finished {
                    live.playing = false;
                    self.active.remove(&entity);
                    post_playback_owners.insert(entity);
                }
            }
            self.evaluated_directors.insert(
                entity,
                (asset_key.to_owned(), director.bindings_json.clone(), next),
            );
        }
        self.restore_unused_activation_overrides(world, &applied.activation, &post_playback_owners);
        self.restore_unused_audio_overrides(world, &applied.audio);
        self.restore_unused_animation_overrides(world, &applied.animation);
        self.restore_unused_particle_overrides(world, &applied.particle);
        self.restore_unused_camera_overrides(&applied.camera);
        self.restore_unused_control_prefabs(
            world,
            &applied.control_prefabs_known,
            &applied.control_prefabs_active,
        );
        self.reported_activation_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_binding_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_audio_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_animation_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_particle_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_camera_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_control_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        failures
    }

    /// Re-enters a director on its next playing update so time-zero signals fire once.
    pub fn reset_director(&mut self, entity: Entity) {
        self.active.remove(&entity);
        self.evaluated_directors.remove(&entity);
    }

    pub fn seek_director(&mut self, entity: Entity) {
        self.active.remove(&entity);
        self.evaluated_directors
            .insert(entity, (String::new(), String::new(), f32::NAN));
    }

    pub fn take_signals(&mut self) -> Vec<RuntimeTimelineSignal> {
        std::mem::take(&mut self.pending_signals)
    }

    pub fn animation_blends(&self) -> Vec<RuntimeAnimationBlend> {
        let mut blends = self.animation_blends.values().cloned().collect::<Vec<_>>();
        blends.sort_by(|left, right| {
            left.entity
                .to_u64()
                .cmp(&right.entity.to_u64())
                .then_with(|| left.destination_clip.cmp(&right.destination_clip))
                .then_with(|| left.source_clip.cmp(&right.source_clip))
        });
        blends
    }

    pub fn take_particle_commands(&mut self) -> Vec<RuntimeParticleCommand> {
        std::mem::take(&mut self.pending_particle_commands)
    }

    pub fn camera_override(&self) -> Option<RuntimeCameraOverride> {
        self.camera_overrides
            .values()
            .copied()
            .min_by_key(|value| value.director.to_u64())
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

    #[allow(clippy::too_many_arguments)]
    fn apply_timeline_layers(
        &mut self,
        world: &mut World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        start: f32,
        time: f32,
        speed: f32,
        just_started: bool,
        depth: usize,
        stack: &[String],
        applied: &mut AppliedTimelineOverrides,
        failures: &mut Vec<TimelineLoadFailure>,
    ) {
        let (keys, mut layer_failures) = self.apply_activation_tracks(
            world, owner, root, key_prefix, asset_key, asset, bindings, time,
        );
        applied.activation.extend(keys);
        failures.append(&mut layer_failures);
        let (keys, mut layer_failures) = self.apply_audio_tracks(
            world,
            owner,
            root,
            key_prefix,
            asset_key,
            asset,
            bindings,
            start,
            time,
            speed,
            just_started,
        );
        applied.audio.extend(keys);
        failures.append(&mut layer_failures);
        let (keys, mut layer_failures) = self.apply_animation_tracks(
            world, owner, root, key_prefix, asset_key, asset, bindings, time,
        );
        applied.animation.extend(keys);
        failures.append(&mut layer_failures);
        let (keys, mut layer_failures) = self.apply_particle_tracks(
            world,
            owner,
            root,
            key_prefix,
            asset_key,
            asset,
            bindings,
            start,
            time,
            speed,
            just_started,
        );
        applied.particle.extend(keys);
        failures.append(&mut layer_failures);
        let (keys, mut layer_failures) = self.apply_camera_tracks(
            world, owner, root, key_prefix, asset_key, asset, bindings, time,
        );
        applied.camera.extend(keys);
        failures.append(&mut layer_failures);

        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Control {
                id,
                name,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let report_key = (owner, format!("{key_prefix}{id}"));
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_control_failures.remove(&report_key);
                continue;
            }
            let active_clip = clips
                .iter()
                .enumerate()
                .find(|(_, clip)| time >= clip.start && time < clip.start + clip.duration);
            let control_scope = format!("{key_prefix}{id}:");
            let mut source_targets = Vec::new();
            for clip in clips
                .iter()
                .filter(|clip| clip.control_activation && clip.prefab.is_empty())
            {
                let source = control_clip_source(clip, target);
                if !source_targets.contains(&source) {
                    source_targets.push(source);
                }
            }
            for source_target in source_targets {
                let source_clip = clips
                    .iter()
                    .filter(|clip| {
                        clip.control_activation
                            && clip.prefab.is_empty()
                            && control_clip_source(clip, target) == source_target
                    })
                    .rev()
                    .find(|clip| time >= clip.start)
                    .or_else(|| {
                        clips.iter().find(|clip| {
                            clip.control_activation
                                && clip.prefab.is_empty()
                                && control_clip_source(clip, target) == source_target
                        })
                    })
                    .expect("source target was collected from one control clip");
                let source = match resolve_timeline_target(world, root, source_target, bindings) {
                    Ok(entity) => entity,
                    Err(error) => {
                        if self.reported_control_failures.insert(report_key.clone()) {
                            failures.push(TimelineLoadFailure {
                                entity: owner,
                                asset: asset_key.to_owned(),
                                error: format!(
                                    "control track '{name}' source '{source_target}' {error}"
                                ),
                            });
                        }
                        continue;
                    }
                };
                let source_key = (
                    owner,
                    format!("{key_prefix}{id}#source-activation:{source_target}"),
                );
                let source_active = active_clip.as_ref().is_some_and(|(_, clip)| {
                    clip.control_activation
                        && clip.prefab.is_empty()
                        && control_clip_source(clip, target) == source_target
                });
                self.apply_activation_override(
                    world,
                    &source_key,
                    source,
                    &source_clip.post_playback,
                    source_active,
                );
                applied.activation.insert(source_key);
            }
            for (clip_index, clip) in clips.iter().enumerate() {
                if !clip.prefab.is_empty() {
                    applied
                        .control_prefabs_known
                        .insert((owner, format!("{control_scope}{clip_index}/")));
                }
            }
            let active_scope = active_clip
                .as_ref()
                .map(|(clip_index, _)| format!("{control_scope}{clip_index}/"));
            self.finish_inactive_control_activation_overrides(
                world,
                owner,
                &control_scope,
                active_scope.as_deref(),
            );
            let Some((clip_index, clip)) = active_clip else {
                self.reported_control_failures.remove(&report_key);
                continue;
            };
            let clip_source = control_clip_source(clip, target);
            let control_parent = match resolve_timeline_target(world, root, clip_source, bindings) {
                Ok(entity) => entity,
                Err(error) => {
                    if self.reported_control_failures.insert(report_key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!("control track '{name}' source '{clip_source}' {error}"),
                        });
                    }
                    continue;
                }
            };
            let clip_scope = format!("{control_scope}{clip_index}/");
            let mut nested_root = control_parent;
            if !clip.prefab.is_empty() {
                let prefab_key = (owner, clip_scope.clone());
                match self.activate_control_prefab(world, &prefab_key, &clip.prefab, control_parent)
                {
                    Ok(root) => {
                        nested_root = root;
                        applied.control_prefabs_active.insert(prefab_key);
                    }
                    Err(error) => {
                        if self.reported_control_failures.insert(report_key) {
                            failures.push(TimelineLoadFailure {
                                entity: owner,
                                asset: asset_key.to_owned(),
                                error: format!(
                                    "control track '{name}' failed to instantiate Prefab '{}': {error}",
                                    clip.prefab
                                ),
                            });
                        }
                        continue;
                    }
                }
            }
            if clip.timeline.is_empty() {
                self.reported_control_failures.remove(&report_key);
                continue;
            }
            let child_key = clip.timeline.trim().replace('\\', "/");
            let normalized_child_key = child_key.to_ascii_lowercase();
            if depth >= MAX_CONTROL_TIMELINE_DEPTH {
                if self.reported_control_failures.insert(report_key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "control track '{name}' exceeds the {MAX_CONTROL_TIMELINE_DEPTH}-level nesting limit"
                        ),
                    });
                }
                continue;
            }
            if stack.contains(&normalized_child_key) {
                if self.reported_control_failures.insert(report_key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "control track '{name}' introduces a Timeline dependency cycle through '{}'",
                            clip.timeline
                        ),
                    });
                }
                continue;
            }
            let child = match self.load(&child_key) {
                Ok(child) => child,
                Err(error) => {
                    if self.reported_control_failures.insert(report_key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "control track '{name}' failed to load '{}': {error}",
                                clip.timeline
                            ),
                        });
                    }
                    continue;
                }
            };
            if let Some(unknown) = clip
                .binding_overrides
                .keys()
                .find(|target| !child.requires_binding_target(target))
            {
                if self.reported_control_failures.insert(report_key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "control track '{name}' overrides unknown binding target '{unknown}' in '{}'",
                            clip.timeline
                        ),
                    });
                }
                continue;
            }
            if !control_source_window_is_valid(clip, child.duration) {
                if self.reported_control_failures.insert(report_key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "control track '{name}' source window is outside '{}' duration {:.3}s",
                            clip.timeline, child.duration
                        ),
                    });
                }
                continue;
            }
            self.reported_control_failures.remove(&report_key);
            let parent_end = clip.start + clip.duration;
            let was_active = start >= clip.start && start < parent_end;
            let child_time = control_sample_time(clip, child.duration, time);
            let child_parent_start = if was_active {
                start
            } else {
                start.clamp(clip.start, parent_end)
            };
            let child_start = control_sample_time(clip, child.duration, child_parent_start);
            let raw_start = control_raw_time(clip, child_parent_start);
            let raw_time = control_raw_time(clip, time);
            let loop_wrapped = clip.extrapolation == "loop"
                && control_loop_crossed(raw_start, raw_time, child.duration);
            let child_just_started = just_started || !was_active || loop_wrapped;
            let source_is_held =
                clip.extrapolation == "hold" && (raw_time <= 0.0 || raw_time >= child.duration);
            let child_speed = if source_is_held {
                0.0
            } else {
                speed * clip.speed
            };
            let child_bindings = control_binding_table(world, root, bindings, clip);
            let mut child_stack = stack.to_vec();
            child_stack.push(normalized_child_key);
            self.apply_timeline_layers(
                world,
                owner,
                nested_root,
                &clip_scope,
                &child_key,
                &child,
                &child_bindings,
                child_start,
                child_time,
                child_speed,
                child_just_started,
                depth + 1,
                &child_stack,
                applied,
                failures,
            );
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn collect_timeline_signals_segment(
        &mut self,
        world: &mut World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        from: f32,
        to: f32,
        include_start: bool,
        traversal_start: f32,
        traversal_duration: f32,
        depth: usize,
        stack: &[String],
        output: &mut Vec<OrderedTimelineSignal>,
        failures: &mut Vec<TimelineLoadFailure>,
    ) {
        if self.pending_signals.len() + output.len() >= MAX_SIGNALS_PER_UPDATE {
            return;
        }
        collect_ordered_signals_segment(
            asset,
            owner,
            from,
            to,
            include_start,
            traversal_start,
            traversal_duration,
            output,
            MAX_SIGNALS_PER_UPDATE.saturating_sub(self.pending_signals.len()),
        );
        let forward = to >= from;
        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Control {
                id,
                name,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let report_key = (owner, format!("{key_prefix}{id}"));
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_control_failures.remove(&report_key);
                continue;
            }
            for (clip_index, clip) in clips.iter().enumerate() {
                if self.pending_signals.len() + output.len() >= MAX_SIGNALS_PER_UPDATE {
                    return;
                }
                let clip_end = clip.start + clip.duration;
                let (parent_from, parent_to, entered) = if forward {
                    let entered = include_start && from >= clip.start && from < clip_end
                        || from < clip.start && to >= clip.start;
                    (from.max(clip.start), to.min(clip_end), entered)
                } else {
                    let entered = include_start && from >= clip.start && from < clip_end
                        || from >= clip_end && to < clip_end;
                    (from.min(clip_end), to.max(clip.start), entered)
                };
                let crosses_clip = if forward {
                    parent_to >= parent_from && parent_from <= clip_end && parent_to >= clip.start
                } else {
                    parent_to <= parent_from && parent_from >= clip.start && parent_to <= clip_end
                };
                if !crosses_clip || (parent_to - parent_from).abs() <= f32::EPSILON && !entered {
                    continue;
                }
                if clip.timeline.is_empty() {
                    continue;
                }
                let clip_source = control_clip_source(clip, target);
                let control_parent =
                    match resolve_timeline_target(world, root, clip_source, bindings) {
                        Ok(entity) => entity,
                        Err(error) => {
                            if self.reported_control_failures.insert(report_key.clone()) {
                                failures.push(TimelineLoadFailure {
                                    entity: owner,
                                    asset: asset_key.to_owned(),
                                    error: format!(
                                        "control track '{name}' source '{clip_source}' {error}"
                                    ),
                                });
                            }
                            continue;
                        }
                    };
                let prefab_key = (owner, format!("{key_prefix}{id}:{clip_index}/"));
                let nested_root = if clip.prefab.is_empty() {
                    control_parent
                } else {
                    match self.activate_control_prefab(
                        world,
                        &prefab_key,
                        &clip.prefab,
                        control_parent,
                    ) {
                        Ok(root) => root,
                        Err(error) => {
                            if self.reported_control_failures.insert(report_key.clone()) {
                                failures.push(TimelineLoadFailure {
                                    entity: owner,
                                    asset: asset_key.to_owned(),
                                    error: format!(
                                        "control track '{name}' failed to instantiate Prefab '{}': {error}",
                                        clip.prefab
                                    ),
                                });
                            }
                            continue;
                        }
                    }
                };
                let child_key = clip.timeline.trim().replace('\\', "/");
                let normalized_child_key = child_key.to_ascii_lowercase();
                if depth >= MAX_CONTROL_TIMELINE_DEPTH {
                    if self.reported_control_failures.insert(report_key.clone()) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "control track '{name}' exceeds the {MAX_CONTROL_TIMELINE_DEPTH}-level nesting limit"
                            ),
                        });
                    }
                    continue;
                }
                if stack.contains(&normalized_child_key) {
                    if self.reported_control_failures.insert(report_key.clone()) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "control track '{name}' introduces a Timeline dependency cycle through '{}'",
                                clip.timeline
                            ),
                        });
                    }
                    continue;
                }
                let child = match self.load(&child_key) {
                    Ok(child) => child,
                    Err(error) => {
                        if self.reported_control_failures.insert(report_key.clone()) {
                            failures.push(TimelineLoadFailure {
                                entity: owner,
                                asset: asset_key.to_owned(),
                                error: format!(
                                    "control track '{name}' failed to load '{}': {error}",
                                    clip.timeline
                                ),
                            });
                        }
                        continue;
                    }
                };
                if let Some(unknown) = clip
                    .binding_overrides
                    .keys()
                    .find(|target| !child.requires_binding_target(target))
                {
                    if self.reported_control_failures.insert(report_key.clone()) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "control track '{name}' overrides unknown binding target '{unknown}' in '{}'",
                                clip.timeline
                            ),
                        });
                    }
                    continue;
                }
                if !control_source_window_is_valid(clip, child.duration) {
                    if self.reported_control_failures.insert(report_key.clone()) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "control track '{name}' source window is outside '{}' duration {:.3}s",
                                clip.timeline, child.duration
                            ),
                        });
                    }
                    continue;
                }
                self.reported_control_failures.remove(&report_key);
                let segment_delta = to - from;
                let start_progress = if segment_delta.abs() <= f32::EPSILON {
                    0.0
                } else {
                    ((parent_from - from) / segment_delta).clamp(0.0, 1.0)
                };
                let end_progress = if segment_delta.abs() <= f32::EPSILON {
                    start_progress
                } else {
                    ((parent_to - from) / segment_delta).clamp(0.0, 1.0)
                };
                let child_traversal_start = traversal_start + traversal_duration * start_progress;
                let child_traversal_duration =
                    traversal_duration * (end_progress - start_progress).max(0.0);
                let child_bindings = control_binding_table(world, root, bindings, clip);
                let mut child_stack = stack.to_vec();
                child_stack.push(normalized_child_key);
                for segment in control_signal_segments(
                    clip,
                    child.duration,
                    parent_from,
                    parent_to,
                    entered,
                    child_traversal_start,
                    child_traversal_duration,
                ) {
                    if self.pending_signals.len() + output.len() >= MAX_SIGNALS_PER_UPDATE {
                        return;
                    }
                    self.collect_timeline_signals_segment(
                        world,
                        owner,
                        nested_root,
                        &format!("{key_prefix}{id}:{clip_index}/"),
                        &child_key,
                        &child,
                        &child_bindings,
                        segment.from,
                        segment.to,
                        segment.include_start,
                        segment.traversal_start,
                        segment.traversal_duration,
                        depth + 1,
                        &child_stack,
                        output,
                        failures,
                    );
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_activation_tracks(
        &mut self,
        world: &mut World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        time: f32,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Activation {
                id,
                name,
                target,
                post_playback,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (owner, format!("{key_prefix}{id}"));
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_activation_failures.remove(&key);
                continue;
            }
            let target_entity = match resolve_timeline_target(world, root, target, bindings) {
                Ok(entity) => entity,
                Err(error) => {
                    if self.reported_activation_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!("activation track '{name}' target '{target}' {error}"),
                        });
                    }
                    continue;
                }
            };
            self.reported_activation_failures.remove(&key);
            if self
                .activation_overrides
                .get(&key)
                .is_some_and(|previous| previous.target != target_entity)
            {
                self.restore_activation_override(world, &key, false);
            }
            let original_active = self.activation_overrides.get(&key).map_or_else(
                || world.entity_active(target_entity),
                |state| state.original_active,
            );
            let active = clips
                .iter()
                .find(|clip| time >= clip.start && time < clip.start + clip.duration)
                .map_or(original_active, |clip| clip.active);
            self.apply_activation_override(world, &key, target_entity, post_playback, active);
            applied.insert(key);
        }
        (applied, failures)
    }

    fn apply_activation_override(
        &mut self,
        world: &mut World,
        key: &(Entity, String),
        target: Entity,
        post_playback: &str,
        active: bool,
    ) {
        if self
            .activation_overrides
            .get(key)
            .is_some_and(|previous| previous.target != target)
        {
            self.restore_activation_override(world, key, false);
        }
        let state = self
            .activation_overrides
            .entry(key.clone())
            .or_insert_with(|| ActivationOverride {
                target,
                original_active: world.entity_active(target),
                post_playback: post_playback.to_owned(),
            });
        state.post_playback.clear();
        state.post_playback.push_str(post_playback);
        world.set_editor_state(target, world.sibling_index(target), active);
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_audio_tracks(
        &mut self,
        world: &mut World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        start: f32,
        time: f32,
        director_speed: f32,
        just_started: bool,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Audio {
                id,
                name,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (owner, format!("{key_prefix}{id}"));
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_audio_failures.remove(&key);
                continue;
            }
            let Some(clip) = clips
                .iter()
                .find(|clip| time >= clip.start && time < clip.start + clip.duration)
            else {
                self.reported_audio_failures.remove(&key);
                continue;
            };
            let target_entity = match resolve_timeline_target(world, root, target, bindings) {
                Ok(entity) => entity,
                Err(error) => {
                    if self.reported_audio_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!("audio track '{name}' target '{target}' {error}"),
                        });
                    }
                    continue;
                }
            };
            let Some(authored) = world.get_component::<AudioSource>(target_entity).cloned() else {
                if self.reported_audio_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "audio track '{name}' target '{target}' does not have an AudioSource component"
                        ),
                    });
                }
                continue;
            };
            self.reported_audio_failures.remove(&key);
            if let Some(previous) = self.audio_overrides.get(&key) {
                if previous.target != target_entity {
                    self.restore_audio_override(world, &key);
                }
            }
            self.audio_overrides
                .entry(key.clone())
                .or_insert_with(|| AudioOverride {
                    target: target_entity,
                    original: authored,
                    last_timeline_time: start,
                    clip_start: clip.start,
                    clip_path: String::new(),
                    clip_in: clip.clip_in,
                    clip_pitch: clip.pitch,
                });

            let previous = self
                .audio_overrides
                .get(&key)
                .expect("audio override inserted above");
            let discontinuity = just_started
                || (start - previous.last_timeline_time).abs() > 0.001
                || director_speed > 0.0 && time < start
                || director_speed < 0.0 && time > start
                || previous.clip_start != clip.start
                || previous.clip_path != clip.clip
                || previous.clip_in != clip.clip_in
                || previous.clip_pitch != clip.pitch;
            let expected_time = clip.clip_in + (time - clip.start).max(0.0) * clip.pitch;
            let effective_pitch = clip.pitch * director_speed;
            let audible = effective_pitch.is_finite() && (0.05..=4.0).contains(&effective_pitch);
            if let Some(source) = world.get_component_mut::<AudioSource>(target_entity) {
                source.clip.clone_from(&clip.clip);
                source.play_on_awake = true;
                source.playing = audible;
                source.looped = clip.looped;
                source.volume = clip.volume * timeline_audio_gain(clip, time);
                source.pitch = if audible { effective_pitch } else { clip.pitch };
                if discontinuity
                    || !audible
                    || !clip.looped && (source.time - expected_time).abs() > 0.1
                {
                    source.time = expected_time;
                }
            }
            if let Some(state) = self.audio_overrides.get_mut(&key) {
                state.last_timeline_time = time;
                state.clip_start = clip.start;
                state.clip_path.clone_from(&clip.clip);
                state.clip_in = clip.clip_in;
                state.clip_pitch = clip.pitch;
            }
            applied.insert(key);
        }
        (applied, failures)
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_animation_tracks(
        &mut self,
        world: &mut World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        time: f32,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Animation {
                id,
                name,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (owner, format!("{key_prefix}{id}"));
            self.animation_blends.remove(&key);
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_animation_failures.remove(&key);
                continue;
            }
            let Some((clip_index, clip)) = clips
                .iter()
                .enumerate()
                .rev()
                .find(|(_, clip)| time >= clip.start && time < clip.start + clip.duration)
            else {
                self.reported_animation_failures.remove(&key);
                continue;
            };
            let target_entity = match resolve_timeline_target(world, root, target, bindings) {
                Ok(entity) => entity,
                Err(error) => {
                    if self.reported_animation_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!("animation track '{name}' target '{target}' {error}"),
                        });
                    }
                    continue;
                }
            };
            let Some(authored) = world
                .get_component::<AnimationPlayer>(target_entity)
                .cloned()
            else {
                if self.reported_animation_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "animation track '{name}' target '{target}' does not have an AnimationPlayer component"
                        ),
                    });
                }
                continue;
            };
            if world.get_component::<Animator>(target_entity).is_some() {
                if self.reported_animation_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "animation track '{name}' target '{target}' also has an Animator; remove it or bind a dedicated AnimationPlayer"
                        ),
                    });
                }
                continue;
            }
            self.reported_animation_failures.remove(&key);
            if let Some(previous) = self.animation_overrides.get(&key) {
                if previous.target != target_entity {
                    self.restore_animation_override(world, &key);
                }
            }
            self.animation_overrides
                .entry(key.clone())
                .or_insert(AnimationOverride {
                    target: target_entity,
                    original: authored,
                });
            let destination_time = (clip.clip_in + (time - clip.start) * clip.speed).max(0.0);
            if let Some(player) = world.get_component_mut::<AnimationPlayer>(target_entity) {
                player.clip.clone_from(&clip.clip);
                player.play_on_awake = true;
                player.playing = true;
                player.speed = 0.0;
                player.time = destination_time;
            }
            let local_time = (time - clip.start).max(0.0);
            let linear_weight = if clip.blend_in <= f32::EPSILON {
                1.0
            } else {
                (local_time / clip.blend_in).clamp(0.0, 1.0)
            };
            let weight = timeline_animation_blend_factor(&clip.blend_curve, linear_weight);
            if clip.blend_in > f32::EPSILON && clip_index > 0 {
                let previous = &clips[clip_index - 1];
                let previous_end = previous.start + previous.duration;
                if previous_end + 0.0001 >= clip.start {
                    let source_time = if time < previous_end {
                        (previous.clip_in + (time - previous.start) * previous.speed).max(0.0)
                    } else {
                        outgoing_animation_sample_time(previous)
                    };
                    self.animation_blends.insert(
                        key.clone(),
                        RuntimeAnimationBlend {
                            entity: target_entity,
                            source_clip: previous.clip.clone(),
                            source_time,
                            destination_clip: clip.clip.clone(),
                            destination_time,
                            weight,
                        },
                    );
                }
            }
            applied.insert(key);
        }
        (applied, failures)
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_particle_tracks(
        &mut self,
        world: &mut World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        start: f32,
        time: f32,
        director_speed: f32,
        just_started: bool,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Particle {
                id,
                name,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (owner, format!("{key_prefix}{id}"));
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_particle_failures.remove(&key);
                continue;
            }
            let Some(clip) = clips
                .iter()
                .find(|clip| time >= clip.start && time < clip.start + clip.duration)
            else {
                self.reported_particle_failures.remove(&key);
                continue;
            };
            let target_entity = match resolve_timeline_target(world, root, target, bindings) {
                Ok(entity) => entity,
                Err(error) => {
                    if self.reported_particle_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!("particle track '{name}' target '{target}' {error}"),
                        });
                    }
                    continue;
                }
            };
            let two = world
                .get_component::<ParticleEmitter2D>(target_entity)
                .cloned();
            let three = world
                .get_component::<ParticleEmitter3D>(target_entity)
                .cloned();
            let authored = match (two, three) {
                (Some(value), None) => AuthoredParticleEmitter::Two(value),
                (None, Some(value)) => AuthoredParticleEmitter::Three(value),
                (None, None) => {
                    if self.reported_particle_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "particle track '{name}' target '{target}' does not have a ParticleEmitter2D or ParticleEmitter3D component"
                            ),
                        });
                    }
                    continue;
                }
                (Some(_), Some(_)) => {
                    if self.reported_particle_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "particle track '{name}' target '{target}' has both 2D and 3D emitters; bind a dedicated emitter"
                            ),
                        });
                    }
                    continue;
                }
            };
            self.reported_particle_failures.remove(&key);
            if self
                .particle_overrides
                .get(&key)
                .is_some_and(|previous| previous.target != target_entity)
            {
                self.restore_particle_override(world, &key);
            }
            self.particle_overrides
                .entry(key.clone())
                .or_insert(ParticleOverride {
                    target: target_entity,
                    original: authored,
                    last_timeline_time: start,
                    clip_start: clip.start,
                    clip_in: clip.clip_in,
                });

            let previous = self
                .particle_overrides
                .get(&key)
                .expect("particle override inserted above");
            let can_increment = (director_speed - 1.0).abs() <= 0.0001;
            let discontinuity = just_started
                || !can_increment
                || time - start > MAX_INCREMENTAL_DELTA
                || (start - previous.last_timeline_time).abs() > 0.001
                || time < start
                || previous.clip_start != clip.start
                || previous.clip_in != clip.clip_in;
            if let Some(emitter) = world.get_component_mut::<ParticleEmitter2D>(target_entity) {
                emitter.playing = can_increment;
            }
            if let Some(emitter) = world.get_component_mut::<ParticleEmitter3D>(target_entity) {
                emitter.playing = can_increment;
            }
            if discontinuity {
                self.pending_particle_commands
                    .push(RuntimeParticleCommand::Seek {
                        entity: target_entity,
                        time: clip.clip_in + (time - clip.start).max(0.0),
                    });
            }
            if let Some(state) = self.particle_overrides.get_mut(&key) {
                state.last_timeline_time = time;
                state.clip_start = clip.start;
                state.clip_in = clip.clip_in;
            }
            applied.insert(key);
        }
        (applied, failures)
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_camera_tracks(
        &mut self,
        world: &World,
        owner: Entity,
        root: Entity,
        key_prefix: &str,
        asset_key: &str,
        asset: &TimelineAsset,
        bindings: &TimelineBindingTable,
        time: f32,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        let has_solo = asset.has_solo_tracks();
        for track in &asset.tracks {
            let TimelineTrack::Camera {
                id, name, clips, ..
            } = track
            else {
                continue;
            };
            let key = (owner, format!("{key_prefix}{id}"));
            if asset.track_is_muted_with_solo(track, has_solo) {
                self.reported_camera_failures.remove(&key);
                continue;
            }
            let Some((clip_index, clip)) = clips
                .iter()
                .enumerate()
                .find(|(_, clip)| time >= clip.start && time < clip.start + clip.duration)
            else {
                self.reported_camera_failures.remove(&key);
                continue;
            };
            let target = match resolve_timeline_target(world, root, &clip.target, bindings) {
                Ok(entity) => entity,
                Err(error) => {
                    if self.reported_camera_failures.insert(key) {
                        failures.push(TimelineLoadFailure {
                            entity: owner,
                            asset: asset_key.to_owned(),
                            error: format!(
                                "camera track '{name}' target '{}' {error}",
                                clip.target
                            ),
                        });
                    }
                    continue;
                }
            };
            if !has_exactly_one_camera(world, target) {
                if self.reported_camera_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: owner,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "camera track '{name}' target '{}' must have exactly one Camera2D or Camera3D component",
                            clip.target
                        ),
                    });
                }
                continue;
            }
            let local_time = (time - clip.start).max(0.0);
            let linear_weight = if clip.blend_in <= f32::EPSILON {
                1.0
            } else {
                (local_time / clip.blend_in).clamp(0.0, 1.0)
            };
            let weight = if clip.blend_curve == "linear" {
                linear_weight
            } else {
                linear_weight * linear_weight * (3.0 - 2.0 * linear_weight)
            };
            let source = if weight < 1.0 && clip_index > 0 {
                let previous = &clips[clip_index - 1];
                let adjacent = (previous.start + previous.duration - clip.start).abs() <= 0.001;
                if !adjacent {
                    None
                } else {
                    let previous_target =
                        match resolve_timeline_target(world, root, &previous.target, bindings) {
                            Ok(entity) => entity,
                            Err(error) => {
                                if self.reported_camera_failures.insert(key.clone()) {
                                    failures.push(TimelineLoadFailure {
                                        entity: owner,
                                        asset: asset_key.to_owned(),
                                        error: format!(
                                        "camera track '{name}' previous blend source '{}' {error}",
                                        previous.target
                                    ),
                                    });
                                }
                                continue;
                            }
                        };
                    if !has_exactly_one_camera(world, previous_target) {
                        if self.reported_camera_failures.insert(key.clone()) {
                            failures.push(TimelineLoadFailure {
                                entity: owner,
                                asset: asset_key.to_owned(),
                                error: format!(
                                    "camera track '{name}' previous blend source '{}' must have exactly one Camera2D or Camera3D component",
                                    previous.target
                                ),
                            });
                        }
                        continue;
                    }
                    Some(previous_target)
                }
            } else {
                None
            };
            self.reported_camera_failures.remove(&key);
            self.camera_overrides
                .retain(|(existing_owner, _), _| *existing_owner != owner);
            self.camera_overrides.insert(
                key.clone(),
                RuntimeCameraOverride {
                    director: owner,
                    source,
                    target,
                    weight,
                },
            );
            applied.insert(key);
        }
        (applied, failures)
    }

    #[allow(clippy::too_many_arguments)]
    fn retain_paused_overrides(
        &self,
        world: &mut World,
        director: Entity,
        activation: &mut HashSet<(Entity, String)>,
        audio: &mut HashSet<(Entity, String)>,
        animation: &mut HashSet<(Entity, String)>,
        particle: &mut HashSet<(Entity, String)>,
        camera: &mut HashSet<(Entity, String)>,
        control_prefabs_known: &mut HashSet<(Entity, String)>,
        control_prefabs_active: &mut HashSet<(Entity, String)>,
    ) {
        activation.extend(
            self.activation_overrides
                .keys()
                .filter(|(owner, _)| *owner == director)
                .cloned(),
        );
        for (key, state) in &self.audio_overrides {
            if key.0 != director || !world.is_alive(state.target) {
                continue;
            }
            if let Some(source) = world.get_component_mut::<AudioSource>(state.target) {
                source.playing = false;
            }
            audio.insert(key.clone());
        }
        animation.extend(
            self.animation_overrides
                .keys()
                .filter(|(owner, _)| *owner == director)
                .cloned(),
        );
        for (key, state) in &self.particle_overrides {
            if key.0 != director || !world.is_alive(state.target) {
                continue;
            }
            if let Some(emitter) = world.get_component_mut::<ParticleEmitter2D>(state.target) {
                emitter.playing = false;
            }
            if let Some(emitter) = world.get_component_mut::<ParticleEmitter3D>(state.target) {
                emitter.playing = false;
            }
            particle.insert(key.clone());
        }
        camera.extend(
            self.camera_overrides
                .keys()
                .filter(|(owner, _)| *owner == director)
                .cloned(),
        );
        for (key, instance) in &self.control_prefabs {
            if key.0 != director || !world.is_alive(instance.root) {
                continue;
            }
            control_prefabs_known.insert(key.clone());
            if world.entity_active(instance.root) {
                control_prefabs_active.insert(key.clone());
            }
        }
    }

    fn activate_control_prefab(
        &mut self,
        world: &mut World,
        key: &(Entity, String),
        source: &str,
        parent: Entity,
    ) -> Result<Entity, String> {
        let normalized_source = source.trim().replace('\\', "/");
        let reusable = self.control_prefabs.get(key).is_some_and(|instance| {
            instance.source.eq_ignore_ascii_case(&normalized_source)
                && instance.parent == parent
                && world.is_alive(instance.root)
        });
        if !reusable {
            if let Some(previous) = self.control_prefabs.remove(key) {
                destroy_control_prefab_instance(world, previous);
            }
            let instance = instantiate_project_prefab(
                self.project_root.as_deref(),
                &normalized_source,
                Some(parent.to_u64()),
                world,
            )
            .map_err(|error| error.to_string())?;
            let root = Entity::from_u64(instance.root);
            self.control_prefabs.insert(
                key.clone(),
                ControlPrefabInstance {
                    source: normalized_source,
                    parent,
                    root,
                    entities: instance
                        .entities
                        .into_iter()
                        .map(Entity::from_u64)
                        .collect(),
                },
            );
        }
        let root = self.control_prefabs[key].root;
        world.set_editor_state(root, world.sibling_index(root), true);
        Ok(root)
    }

    fn restore_unused_control_prefabs(
        &mut self,
        world: &mut World,
        known: &HashSet<(Entity, String)>,
        active: &HashSet<(Entity, String)>,
    ) {
        let removed = self
            .control_prefabs
            .keys()
            .filter(|key| !known.contains(*key))
            .cloned()
            .collect::<Vec<_>>();
        for key in removed {
            if let Some(instance) = self.control_prefabs.remove(&key) {
                destroy_control_prefab_instance(world, instance);
            }
        }
        for (key, instance) in &self.control_prefabs {
            if world.is_alive(instance.root) {
                world.set_editor_state(
                    instance.root,
                    world.sibling_index(instance.root),
                    active.contains(key),
                );
            }
        }
    }

    fn restore_unused_activation_overrides(
        &mut self,
        world: &mut World,
        applied: &HashSet<(Entity, String)>,
        post_playback_owners: &HashSet<Entity>,
    ) {
        let stale: Vec<_> = self
            .activation_overrides
            .keys()
            .filter(|key| !applied.contains(*key))
            .cloned()
            .collect();
        for key in stale {
            self.restore_activation_override(world, &key, post_playback_owners.contains(&key.0));
        }
    }

    fn restore_activation_override(
        &mut self,
        world: &mut World,
        key: &(Entity, String),
        apply_post_playback: bool,
    ) {
        let Some(previous) = self.activation_overrides.remove(key) else {
            return;
        };
        if !world.is_alive(previous.target) {
            return;
        }
        let active = if apply_post_playback {
            match previous.post_playback.as_str() {
                "active" => Some(true),
                "inactive" => Some(false),
                "leave_as_is" => None,
                _ => Some(previous.original_active),
            }
        } else {
            Some(previous.original_active)
        };
        if let Some(active) = active {
            world.set_editor_state(
                previous.target,
                world.sibling_index(previous.target),
                active,
            );
        }
    }

    fn finish_inactive_control_activation_overrides(
        &mut self,
        world: &mut World,
        owner: Entity,
        control_scope: &str,
        active_scope: Option<&str>,
    ) {
        let finished: Vec<_> = self
            .activation_overrides
            .keys()
            .filter(|(candidate_owner, key)| {
                *candidate_owner == owner
                    && key.starts_with(control_scope)
                    && active_scope.is_none_or(|active| !key.starts_with(active))
            })
            .cloned()
            .collect();
        for key in finished {
            self.restore_activation_override(world, &key, true);
        }
    }

    fn restore_unused_audio_overrides(
        &mut self,
        world: &mut World,
        applied: &HashSet<(Entity, String)>,
    ) {
        let stale: Vec<_> = self
            .audio_overrides
            .keys()
            .filter(|key| !applied.contains(*key))
            .cloned()
            .collect();
        for key in stale {
            self.restore_audio_override(world, &key);
        }
    }

    fn restore_audio_override(&mut self, world: &mut World, key: &(Entity, String)) {
        let Some(previous) = self.audio_overrides.remove(key) else {
            return;
        };
        if world.is_alive(previous.target) {
            world.insert_component(previous.target, previous.original);
        }
    }

    fn restore_unused_animation_overrides(
        &mut self,
        world: &mut World,
        applied: &HashSet<(Entity, String)>,
    ) {
        let stale: Vec<_> = self
            .animation_overrides
            .keys()
            .filter(|key| !applied.contains(*key))
            .cloned()
            .collect();
        for key in stale {
            self.restore_animation_override(world, &key);
        }
    }

    fn restore_animation_override(&mut self, world: &mut World, key: &(Entity, String)) {
        self.animation_blends.remove(key);
        let Some(previous) = self.animation_overrides.remove(key) else {
            return;
        };
        if world.is_alive(previous.target) {
            world.insert_component(previous.target, previous.original);
        }
    }

    fn restore_unused_particle_overrides(
        &mut self,
        world: &mut World,
        applied: &HashSet<(Entity, String)>,
    ) {
        let stale: Vec<_> = self
            .particle_overrides
            .keys()
            .filter(|key| !applied.contains(*key))
            .cloned()
            .collect();
        for key in stale {
            self.restore_particle_override(world, &key);
        }
    }

    fn restore_unused_camera_overrides(&mut self, applied: &HashSet<(Entity, String)>) {
        self.camera_overrides.retain(|key, _| applied.contains(key));
    }

    fn restore_particle_override(&mut self, world: &mut World, key: &(Entity, String)) {
        let Some(previous) = self.particle_overrides.remove(key) else {
            return;
        };
        self.pending_particle_commands
            .push(RuntimeParticleCommand::Reset {
                entity: previous.target,
            });
        if !world.is_alive(previous.target) {
            return;
        }
        match previous.original {
            AuthoredParticleEmitter::Two(component) => {
                world.insert_component(previous.target, component)
            }
            AuthoredParticleEmitter::Three(component) => {
                world.insert_component(previous.target, component)
            }
        }
    }
}

fn destroy_control_prefab_instance(world: &mut World, instance: ControlPrefabInstance) {
    for entity in instance.entities.into_iter().rev() {
        world.despawn(entity);
    }
}

fn has_exactly_one_camera(world: &World, entity: Entity) -> bool {
    world.get_component::<Camera2D>(entity).is_some()
        ^ world.get_component::<Camera3D>(entity).is_some()
}

enum TimelineTargetError {
    MissingLegacyPath,
    StaleBinding { entity: Entity, name: String },
}

impl std::fmt::Display for TimelineTargetError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingLegacyPath => write!(
                formatter,
                "was not found below the Director entity and has no stable binding"
            ),
            Self::StaleBinding { entity, name } if name.is_empty() => write!(
                formatter,
                "has a stale stable binding to entity {entity}; rebind it in Sequencer"
            ),
            Self::StaleBinding { entity, name } => write!(
                formatter,
                "has a stale stable binding to entity {entity} ('{name}'); rebind it in Sequencer"
            ),
        }
    }
}

fn resolve_timeline_target(
    world: &World,
    root: Entity,
    target: &str,
    bindings: &TimelineBindingTable,
) -> Result<Entity, TimelineTargetError> {
    if let Some(binding) = bindings.bindings.get(target) {
        // The table was normalized before evaluation, so this cannot fail here.
        let entity = binding
            .resolved_entity()
            .expect("normalized Timeline binding must contain a valid entity id");
        return if !binding.missing && world.is_alive(entity) {
            Ok(entity)
        } else {
            Err(TimelineTargetError::StaleBinding {
                entity,
                name: binding.name.clone(),
            })
        };
    }
    resolve_descendant_target(world, root, target).ok_or(TimelineTargetError::MissingLegacyPath)
}

fn control_binding_table(
    world: &World,
    parent_root: Entity,
    parent_bindings: &TimelineBindingTable,
    clip: &TimelineControlClip,
) -> TimelineBindingTable {
    let mut child = TimelineBindingTable::default();
    for (child_target, parent_target) in &clip.binding_overrides {
        let binding = if let Some(binding) = parent_bindings.bindings.get(parent_target) {
            binding.clone()
        } else if let Some(entity) = resolve_descendant_target(world, parent_root, parent_target) {
            TimelineEntityBinding {
                entity: entity.to_u64().to_string(),
                name: world.entity_name(entity).unwrap_or_default().to_owned(),
                missing: false,
            }
        } else {
            // Preserve the explicit override as stale. Omitting it would incorrectly
            // fall back to resolving the child target below the nested root.
            TimelineEntityBinding {
                entity: parent_root.to_u64().to_string(),
                name: parent_target.clone(),
                missing: true,
            }
        };
        child.bindings.insert(child_target.clone(), binding);
    }
    child
}

fn resolve_descendant_target(world: &World, root: Entity, target: &str) -> Option<Entity> {
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

#[allow(clippy::too_many_arguments)]
fn collect_ordered_signals_segment(
    asset: &TimelineAsset,
    entity: Entity,
    from: f32,
    to: f32,
    include_start: bool,
    traversal_start: f32,
    traversal_duration: f32,
    output: &mut Vec<OrderedTimelineSignal>,
    limit: usize,
) {
    if output.len() >= limit {
        return;
    }
    let delta = to - from;
    let has_solo = asset.has_solo_tracks();
    for track in &asset.tracks {
        let TimelineTrack::Signal { name, markers, .. } = track else {
            continue;
        };
        if asset.track_is_muted_with_solo(track, has_solo) {
            continue;
        }
        for marker in markers {
            let at_start = include_start && (marker.time - from).abs() <= f32::EPSILON;
            let crossed = delta > f32::EPSILON && marker.time > from && marker.time <= to
                || delta < -f32::EPSILON && marker.time < from && marker.time >= to;
            if !at_start && !crossed {
                continue;
            }
            let progress = if delta.abs() <= f32::EPSILON {
                0.0
            } else {
                ((marker.time - from) / delta).clamp(0.0, 1.0)
            };
            output.push(OrderedTimelineSignal {
                traversal: traversal_start + traversal_duration * progress,
                sequence: output.len(),
                signal: RuntimeTimelineSignal {
                    entity,
                    track: name.clone(),
                    signal: marker.name.clone(),
                    time: marker.time,
                    payload: marker.payload.clone(),
                },
            });
            if output.len() >= limit {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::animation::AnimationRuntime;
    use mengine_core::generated::{ParticleEmitter2D, Transform};
    use mengine_scene::{save_prefab, Prefab, PrefabNode, PREFAB_VERSION};
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

    fn activation_post_playback_project_asset(state: &str, clip_active: bool) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-activation-post-{}",
            uuid::Uuid::new_v4()
        ));
        let relative = "Assets/Timelines/activation-post.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            format!(
                r#"{{"version":1,"duration":1,"tracks":[{{"type":"activation","id":"visibility","name":"Visibility","target":"Panel","post_playback":"{state}","clips":[{{"start":0,"duration":1,"active":{clip_active}}}]}}]}}"#
            ),
        )
        .unwrap();
        (root, relative)
    }

    fn audio_project_asset(target: &str) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("mengine-timeline-{}", uuid::Uuid::new_v4()));
        let relative = "Assets/Timelines/audio.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            format!(
                r#"{{"version":1,"duration":2,"tracks":[{{"type":"audio","id":"music","name":"Music","target":"{target}","clips":[{{"start":0,"duration":2,"clip":"Assets/Audio/timeline.ogg","clip_in":0.5,"volume":0.8,"pitch":1.25}}]}}]}}"#
            ),
        )
        .unwrap();
        (root, relative)
    }

    fn animation_project_asset(target: &str) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("mengine-timeline-{}", uuid::Uuid::new_v4()));
        let timeline_relative = "Assets/Timelines/animation.mtimeline".to_owned();
        let timeline_path = root.join(&timeline_relative);
        let clip_path = root.join("Assets/Animations/move.manim");
        fs::create_dir_all(timeline_path.parent().unwrap()).unwrap();
        fs::create_dir_all(clip_path.parent().unwrap()).unwrap();
        fs::write(
            timeline_path,
            format!(
                r#"{{"version":1,"duration":2,"tracks":[{{"type":"animation","id":"hero","name":"Hero","target":"{target}","clips":[{{"start":0,"duration":1,"clip":"Assets/Animations/move.manim"}}]}}]}}"#
            ),
        )
        .unwrap();
        fs::write(
            clip_path,
            r#"{
              "version":1,"name":"Move","duration":1,"frame_rate":60,"wrap_mode":"once",
              "events":[{"time":0.25,"function":"Quarter"}],
              "tracks":[{"target":".","component":"Transform","property":"position.x","interpolation":"linear",
                "keyframes":[{"time":0,"value":0},{"time":1,"value":10}]}]
            }"#,
        )
        .unwrap();
        (root, timeline_relative)
    }

    fn animation_blend_project_asset(target: &str, incoming_start: f32) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-animation-blend-{}",
            uuid::Uuid::new_v4()
        ));
        let relative = "Assets/Timelines/animation-blend.mtimeline".to_owned();
        let timeline_path = root.join(&relative);
        let animation_root = root.join("Assets/Animations");
        fs::create_dir_all(timeline_path.parent().unwrap()).unwrap();
        fs::create_dir_all(&animation_root).unwrap();
        fs::write(
            timeline_path,
            format!(
                r#"{{"version":1,"duration":2,"tracks":[{{"type":"animation","id":"hero","name":"Hero","target":"{target}","clips":[{{"start":0,"duration":1,"clip":"Assets/Animations/Out.manim"}},{{"start":{incoming_start},"duration":1,"clip":"Assets/Animations/In.manim","blend_in":0.25,"blend_curve":"linear"}}]}}]}}"#
            ),
        )
        .unwrap();
        let clip_json = |start: f32, end: f32| {
            serde_json::json!({
                "version": 1,
                "duration": 1,
                "frame_rate": 30,
                "wrap_mode": "once",
                "tracks": [{
                    "target": ".",
                    "component": "Transform",
                    "property": "position.x",
                    "interpolation": "linear",
                    "keyframes": [{ "time": 0, "value": start }, { "time": 1, "value": end }]
                }]
            })
            .to_string()
        };
        fs::write(animation_root.join("Out.manim"), clip_json(0.0, 10.0)).unwrap();
        fs::write(animation_root.join("In.manim"), clip_json(20.0, 30.0)).unwrap();
        (root, relative)
    }

    fn particle_project_asset(target: &str) -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("mengine-timeline-{}", uuid::Uuid::new_v4()));
        let relative = "Assets/Timelines/particle.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            format!(
                r#"{{"version":1,"duration":2,"tracks":[{{"type":"particle","id":"fx","name":"FX","target":"{target}","clips":[{{"start":0,"duration":1.5,"clip_in":0.25}}]}}]}}"#
            ),
        )
        .unwrap();
        (root, relative)
    }

    fn camera_project_asset() -> (PathBuf, String) {
        let root = std::env::temp_dir().join(format!("mengine-timeline-{}", uuid::Uuid::new_v4()));
        let relative = "Assets/Timelines/cameras.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            r#"{"version":1,"duration":3,"tracks":[{"type":"camera","id":"shots","name":"Shots","clips":[{"start":0,"duration":1,"target":"Cameras/Wide"},{"start":1,"duration":1,"target":"Cameras/Close","blend_in":1,"blend_curve":"ease_in_out"},{"start":2,"duration":1,"target":"Cameras/Close","blend_in":1,"blend_curve":"linear"}]}]}"#,
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
    fn loop_start_at_duration_emits_endpoint_before_wrapped_start() {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-loop-boundary-{}",
            uuid::Uuid::new_v4()
        ));
        let relative = "Assets/Timelines/boundary.mtimeline".to_owned();
        let path = root.join(&relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            r#"{"version":1,"duration":2,"tracks":[{"type":"signal","id":"events","name":"Events","markers":[{"time":0,"name":"Start"},{"time":2,"name":"End"}]}]}"#,
        )
        .unwrap();

        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            TimelineDirector {
                asset: relative,
                time: 2.0,
                wrap_mode: "Loop".into(),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert_eq!(
            runtime
                .take_signals()
                .iter()
                .map(|event| event.signal.as_str())
                .collect::<Vec<_>>(),
            ["End", "Start"]
        );

        {
            let director = world.get_component_mut::<TimelineDirector>(entity).unwrap();
            director.time = 1.75;
            director.speed = 1.0;
            director.playing = true;
        }
        runtime.reset_director(entity);
        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert_eq!(
            runtime
                .take_signals()
                .iter()
                .map(|event| event.signal.as_str())
                .collect::<Vec<_>>(),
            ["End", "Start"]
        );

        {
            let director = world.get_component_mut::<TimelineDirector>(entity).unwrap();
            director.time = 0.25;
            director.speed = -1.0;
            director.playing = true;
        }
        runtime.reset_director(entity);
        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert_eq!(
            runtime
                .take_signals()
                .iter()
                .map(|event| event.signal.as_str())
                .collect::<Vec<_>>(),
            ["Start", "End"]
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
        assert!(!world.entity_active(panel));
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 0.75;
        runtime.update(&mut world, 0.0);
        assert!(world.entity_active(panel));
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 1.25;
        runtime.update(&mut world, 0.0);
        assert!(!world.entity_active(panel));
        runtime.reset_director(director);
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
    fn activation_post_playback_matches_unity_states_and_preserves_sibling_order() {
        for (state, original, clip_active, expected) in [
            ("active", false, false, true),
            ("inactive", true, true, false),
            ("revert", true, false, true),
            ("leave_as_is", true, false, false),
        ] {
            let (root, relative) = activation_post_playback_project_asset(state, clip_active);
            let mut world = World::new();
            let director = world.spawn_empty();
            let panel = world.spawn_empty();
            let sibling = world.spawn_empty();
            world.set_component_value(panel, "Name", serde_json::json!({ "value": "Panel" }));
            world.set_parent(panel, Some(director));
            world.set_parent(sibling, Some(director));
            world.set_editor_state(panel, 0, original);
            world.insert_component(
                director,
                TimelineDirector {
                    asset: relative,
                    ..TimelineDirector::default()
                },
            );
            let mut runtime = TimelineRuntime::new(Some(root.clone()));

            assert!(runtime.update(&mut world, 0.0).is_empty());
            assert_eq!(
                world.entity_active(panel),
                clip_active,
                "state {state} during clip"
            );
            world.set_editor_state(panel, 7, clip_active);
            assert!(runtime.update(&mut world, 2.0).is_empty());
            assert_eq!(
                world.entity_active(panel),
                expected,
                "state {state} after stop"
            );
            assert_eq!(world.sibling_index(panel), 7, "state {state} sibling order");
            let _ = fs::remove_dir_all(root);
        }
    }

    #[test]
    fn activation_post_playback_runs_on_manual_stop_but_not_pause() {
        let (root, relative) = activation_post_playback_project_asset("active", false);
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

        runtime.update(&mut world, 0.25);
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = false;
        }
        runtime.update(&mut world, 0.0);
        assert!(
            !world.entity_active(panel),
            "pause retains the sampled clip state"
        );
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 0.0;
        }
        runtime.update(&mut world, 0.0);
        assert!(
            world.entity_active(panel),
            "Stop applies the active post-playback state"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn activation_post_playback_survives_first_update_reaching_either_end() {
        let (root, relative) = activation_post_playback_project_asset("leave_as_is", true);
        let mut world = World::new();
        let director = world.spawn_empty();
        let panel = world.spawn_empty();
        world.set_component_value(panel, "Name", serde_json::json!({ "value": "Panel" }));
        world.set_parent(panel, Some(director));
        world.set_editor_state(panel, 0, false);
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 2.0).is_empty());
        assert!(
            world.entity_active(panel),
            "Leave As Is retains the last in-range activation sample"
        );
        assert!(
            !world
                .get_component::<TimelineDirector>(director)
                .unwrap()
                .playing
        );
        let _ = fs::remove_dir_all(root);

        let (root, relative) = activation_post_playback_project_asset("leave_as_is", true);
        let mut world = World::new();
        let director = world.spawn_empty();
        let panel = world.spawn_empty();
        world.set_component_value(panel, "Name", serde_json::json!({ "value": "Panel" }));
        world.set_parent(panel, Some(director));
        world.set_editor_state(panel, 0, false);
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                speed: -1.0,
                time: 1.0,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 2.0).is_empty());
        assert!(
            world.entity_active(panel),
            "reverse Leave As Is retains the zero-time activation sample"
        );
        assert!(
            !world
                .get_component::<TimelineDirector>(director)
                .unwrap()
                .playing
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn nested_activation_post_playback_runs_when_its_control_clip_ends() {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-nested-activation-post-{}",
            uuid::Uuid::new_v4()
        ));
        let parent_relative = "Assets/Timelines/parent.mtimeline".to_owned();
        let child_relative = "Assets/Timelines/child.mtimeline";
        fs::create_dir_all(root.join("Assets/Timelines")).unwrap();
        fs::write(
            root.join(&parent_relative),
            format!(
                r#"{{"version":1,"duration":1,"tracks":[{{"type":"control","id":"nested","name":"Nested","target":"Sequence","clips":[{{"start":0,"duration":0.5,"timeline":"{child_relative}"}}]}}]}}"#
            ),
        )
        .unwrap();
        fs::write(
            root.join(child_relative),
            r#"{"version":1,"duration":1,"tracks":[{"type":"activation","id":"visibility","name":"Visibility","target":"Panel","post_playback":"active","clips":[{"start":0,"duration":1,"active":false}]}]}"#,
        )
        .unwrap();
        let mut world = World::new();
        let director = world.spawn_empty();
        let sequence = world.spawn_empty();
        let panel = world.spawn_empty();
        world.set_component_value(sequence, "Name", serde_json::json!({ "value": "Sequence" }));
        world.set_component_value(panel, "Name", serde_json::json!({ "value": "Panel" }));
        world.set_parent(sequence, Some(director));
        world.set_parent(panel, Some(sequence));
        world.insert_component(
            director,
            TimelineDirector {
                asset: parent_relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(!world.entity_active(panel));
        assert!(runtime.update(&mut world, 0.75).is_empty());
        assert!(world.entity_active(panel));
        assert!(
            world
                .get_component::<TimelineDirector>(director)
                .unwrap()
                .playing
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn solo_gate_skips_real_activation_track_evaluation() {
        let asset = mengine_assets::parse_timeline_asset(
            br#"{
              "version":1,"duration":1,
              "tracks":[
                {"type":"signal","id":"focus","name":"Focus","solo":true},
                {"type":"activation","id":"visibility","name":"Visibility","target":"Panel","clips":[{"start":0,"duration":1,"active":false}]}
              ]
            }"#,
        )
        .unwrap();
        let mut world = World::new();
        let director = world.spawn_empty();
        let panel = world.spawn_empty();
        world.set_component_value(panel, "Name", serde_json::json!({ "value": "Panel" }));
        world.set_parent(panel, Some(director));
        let mut runtime = TimelineRuntime::new(None);

        let (applied, failures) = runtime.apply_activation_tracks(
            &mut world,
            director,
            director,
            "",
            "Assets/Timelines/solo.mtimeline",
            &asset,
            &TimelineBindingTable::default(),
            0.0,
        );
        assert!(failures.is_empty());
        assert!(applied.is_empty());
        assert!(world.entity_active(panel));
    }

    #[test]
    fn stable_binding_survives_rename_and_reparent_and_stale_binding_never_falls_back() {
        let (root, relative) = activation_project_asset("Panel");
        let mut world = World::new();
        let director = world.spawn_empty();
        let legacy_panel = world.spawn_empty();
        world.set_component_value(
            legacy_panel,
            "Name",
            serde_json::json!({ "value": "Panel" }),
        );
        world.set_parent(legacy_panel, Some(director));
        let stable_panel = world.spawn_empty();
        world.set_component_value(
            stable_panel,
            "Name",
            serde_json::json!({ "value": "Renamed Outside Panel" }),
        );
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative.clone(),
                bindings_json: format!(
                    r#"{{"version":1,"bindings":{{"Panel":{{"entity":"{}","name":"Panel"}}}}}}"#,
                    stable_panel.to_u64()
                ),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(!world.entity_active(stable_panel));
        assert!(world.entity_active(legacy_panel));

        world.set_editor_state(stable_panel, 0, true);
        world.despawn(stable_panel);
        runtime.reset_director(director);
        let failures = runtime.update(&mut world, 0.0);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("stale stable binding"));
        assert!(world.entity_active(legacy_panel));
        assert!(runtime.update(&mut world, 0.0).is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audio_fades_apply_deterministic_envelopes_during_seek() {
        let (root, relative) = audio_project_asset("Audio");
        fs::write(
            root.join(&relative),
            r#"{"version":1,"duration":2,"tracks":[{"type":"audio","id":"music","name":"Music","target":"Audio","clips":[{"start":0,"duration":2,"clip":"Assets/Audio/timeline.ogg","volume":0.8,"fade_in":0.5,"fade_out":0.5,"fade_curve":"ease_in_out"}]}]}"#,
        )
        .unwrap();
        let mut world = World::new();
        let director = world.spawn_empty();
        let audio = world.spawn_empty();
        world.set_component_value(audio, "Name", serde_json::json!({ "value": "Audio" }));
        world.set_parent(audio, Some(director));
        world.insert_component(audio, AudioSource::default());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        runtime.update(&mut world, 0.0);
        assert_eq!(
            world.get_component::<AudioSource>(audio).unwrap().volume,
            0.0
        );
        for (time, expected) in [(0.25, 0.4), (1.0, 0.8), (1.75, 0.4)] {
            world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap()
                .time = time;
            runtime.update(&mut world, 0.0);
            let volume = world.get_component::<AudioSource>(audio).unwrap().volume;
            assert!((volume - expected).abs() < 0.0001, "time {time}: {volume}");
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audio_tracks_apply_pause_seek_and_restore_authored_sources() {
        let (root, relative) = audio_project_asset("Audio/Music");
        let mut world = World::new();
        let director = world.spawn_empty();
        let audio = world.spawn_empty();
        let music = world.spawn_empty();
        world.set_component_value(audio, "Name", serde_json::json!({ "value": "Audio" }));
        world.set_component_value(music, "Name", serde_json::json!({ "value": "Music" }));
        world.set_parent(audio, Some(director));
        world.set_parent(music, Some(audio));
        let authored = AudioSource {
            clip: "Assets/Audio/authored.ogg".into(),
            play_on_awake: false,
            playing: false,
            time: 0.25,
            volume: 0.4,
            ..AudioSource::default()
        };
        world.insert_component(music, authored.clone());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        let controlled = world.get_component::<AudioSource>(music).unwrap();
        assert_eq!(controlled.clip, "Assets/Audio/timeline.ogg");
        assert!(controlled.playing);
        assert_eq!(controlled.time, 0.5);
        assert_eq!(controlled.volume, 0.8);
        assert_eq!(controlled.pitch, 1.25);

        runtime.update(&mut world, 0.1);

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        runtime.update(&mut world, 0.0);
        let paused = world.get_component::<AudioSource>(music).unwrap();
        assert_eq!(paused.clip, "Assets/Audio/timeline.ogg");
        assert!(!paused.playing);

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = true;
        runtime.update(&mut world, 0.0);
        assert!(world.get_component::<AudioSource>(music).unwrap().playing);

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .wrap_mode = "Loop".into();
        runtime.update(&mut world, 1.9);
        assert_eq!(world.get_component::<AudioSource>(music).unwrap().time, 0.5);
        world.get_component_mut::<AudioSource>(music).unwrap().time = 99.0;
        runtime.update(&mut world, 0.2);
        assert_eq!(
            world.get_component::<AudioSource>(music).unwrap().time,
            0.75
        );

        runtime.reset_director(director);
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        runtime.update(&mut world, 0.0);
        let restored = world.get_component::<AudioSource>(music).unwrap();
        assert_eq!(restored.clip, authored.clip);
        assert_eq!(restored.play_on_awake, authored.play_on_awake);
        assert_eq!(restored.playing, authored.playing);
        assert_eq!(restored.time, authored.time);
        assert_eq!(restored.volume, authored.volume);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn audio_tracks_report_missing_bindings_once_and_do_not_fake_reverse_playback() {
        let (root, relative) = audio_project_asset("Audio");
        let mut world = World::new();
        let director = world.spawn_empty();
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative.clone(),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));
        let failures = runtime.update(&mut world, 0.0);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("Audio"));
        assert!(runtime.update(&mut world, 0.0).is_empty());

        let audio = world.spawn_empty();
        world.set_component_value(audio, "Name", serde_json::json!({ "value": "Audio" }));
        world.set_parent(audio, Some(director));
        world.insert_component(audio, AudioSource::default());
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.speed = -1.0;
            live.time = 0.5;
        }
        runtime.reset_director(director);
        assert!(runtime.update(&mut world, 0.0).is_empty());
        let controlled = world.get_component::<AudioSource>(audio).unwrap();
        assert!(!controlled.playing);
        assert_eq!(controlled.time, 1.125);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn animation_tracks_sample_in_the_same_frame_and_restore_authored_players() {
        let (root, relative) = animation_project_asset("Hero");
        let mut world = World::new();
        let director = world.spawn_empty();
        let hero = world.spawn_empty();
        world.set_component_value(hero, "Name", serde_json::json!({ "value": "Hero" }));
        world.set_parent(hero, Some(director));
        world.insert_component(hero, Transform::default());
        let authored = AnimationPlayer {
            clip: "Assets/Animations/authored.manim".into(),
            play_on_awake: false,
            playing: false,
            speed: 1.0,
            time: 0.25,
        };
        world.insert_component(hero, authored.clone());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut timeline = TimelineRuntime::new(Some(root.clone()));
        let mut animation = AnimationRuntime::new(Some(root.clone()));

        assert!(timeline.update(&mut world, 0.0).is_empty());
        assert!(animation.update(&mut world, 0.0).is_empty());
        assert!(animation.take_events().is_empty());
        assert!(timeline.update(&mut world, 0.5).is_empty());
        assert!(animation.update(&mut world, 0.0).is_empty());
        assert_eq!(animation.take_events()[0].function, "Quarter");
        assert_eq!(
            world.get_component::<Transform>(hero).unwrap().position[0],
            5.0
        );
        let controlled = world.get_component::<AnimationPlayer>(hero).unwrap();
        assert_eq!(controlled.clip, "Assets/Animations/move.manim");
        assert_eq!(controlled.speed, 0.0);
        assert_eq!(controlled.time, 0.5);

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        timeline.update(&mut world, 0.0);
        assert_eq!(
            world.get_component::<AnimationPlayer>(hero).unwrap().clip,
            "Assets/Animations/move.manim"
        );

        timeline.reset_director(director);
        timeline.update(&mut world, 0.0);
        let restored = world.get_component::<AnimationPlayer>(hero).unwrap();
        assert_eq!(restored.clip, authored.clip);
        assert_eq!(restored.playing, authored.playing);
        assert_eq!(restored.speed, authored.speed);
        assert_eq!(restored.time, authored.time);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn animation_tracks_emit_and_apply_adjacent_seam_blends() {
        let (root, relative) = animation_blend_project_asset("Hero", 1.0);
        let mut world = World::new();
        let director = world.spawn_empty();
        let hero = world.spawn_empty();
        world.set_component_value(hero, "Name", serde_json::json!({ "value": "Hero" }));
        world.set_parent(hero, Some(director));
        world.insert_component(hero, Transform::default());
        world.insert_component(hero, AnimationPlayer::default());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                time: 1.125,
                speed: 0.0,
                ..TimelineDirector::default()
            },
        );
        let mut timeline = TimelineRuntime::new(Some(root.clone()));
        let mut animation = AnimationRuntime::new(Some(root.clone()));
        assert!(timeline.update(&mut world, 0.0).is_empty());
        let blends = timeline.animation_blends();
        assert_eq!(blends.len(), 1);
        assert_eq!(blends[0].entity, hero);
        assert!((blends[0].weight - 0.5).abs() < 0.0001);
        assert!(animation.update(&mut world, 0.0).is_empty());
        assert!(animation
            .apply_timeline_blends(&mut world, &blends)
            .is_empty());
        assert!(
            (world.get_component::<Transform>(hero).unwrap().position[0] - 15.625).abs() < 0.0001
        );
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        assert!(timeline.update(&mut world, 0.0).is_empty());
        assert_eq!(timeline.animation_blends(), blends);
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 1.5;
        assert!(timeline.update(&mut world, 0.0).is_empty());
        assert_eq!(timeline.animation_blends().len(), 1);
        assert!((timeline.animation_blends()[0].weight - 1.0).abs() < 0.0001);
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 0.5;
        assert!(timeline.update(&mut world, 0.0).is_empty());
        assert!(timeline.animation_blends().is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn animation_tracks_crossfade_two_live_overlapping_clips() {
        let (root, relative) = animation_blend_project_asset("Hero", 0.75);
        let mut world = World::new();
        let director = world.spawn_empty();
        let hero = world.spawn_empty();
        world.set_component_value(hero, "Name", serde_json::json!({ "value": "Hero" }));
        world.set_parent(hero, Some(director));
        world.insert_component(hero, Transform::default());
        world.insert_component(hero, AnimationPlayer::default());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                time: 0.875,
                speed: 0.0,
                ..TimelineDirector::default()
            },
        );
        let mut timeline = TimelineRuntime::new(Some(root.clone()));
        let mut animation = AnimationRuntime::new(Some(root.clone()));
        assert!(timeline.update(&mut world, 0.0).is_empty());
        let blends = timeline.animation_blends();
        assert_eq!(blends.len(), 1);
        assert!((blends[0].source_time - 0.875).abs() < 0.0001);
        assert!((blends[0].destination_time - 0.125).abs() < 0.0001);
        assert!((blends[0].weight - 0.5).abs() < 0.0001);
        assert!(animation.update(&mut world, 0.0).is_empty());
        assert!(animation
            .apply_timeline_blends(&mut world, &blends)
            .is_empty());
        assert!(
            (world.get_component::<Transform>(hero).unwrap().position[0] - 15.0).abs() < 0.0001
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn particle_tracks_seek_pause_reverse_and_restore_authored_emitters() {
        let (root, relative) = particle_project_asset("FX");
        let mut world = World::new();
        let director = world.spawn_empty();
        let fx = world.spawn_empty();
        world.set_component_value(fx, "Name", serde_json::json!({ "value": "FX" }));
        world.set_parent(fx, Some(director));
        let authored = ParticleEmitter2D {
            playing: false,
            rate_over_time: 42.0,
            ..ParticleEmitter2D::default()
        };
        world.insert_component(fx, authored.clone());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            world
                .get_component::<ParticleEmitter2D>(fx)
                .unwrap()
                .playing
        );
        assert_eq!(
            runtime.take_particle_commands(),
            vec![RuntimeParticleCommand::Seek {
                entity: fx,
                time: 0.25,
            }]
        );

        runtime.update(&mut world, 0.25);
        assert!(runtime.take_particle_commands().is_empty());
        runtime.update(&mut world, 0.5);
        assert_eq!(
            runtime.take_particle_commands(),
            vec![RuntimeParticleCommand::Seek {
                entity: fx,
                time: 1.0,
            }]
        );
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        runtime.update(&mut world, 0.0);
        assert!(
            !world
                .get_component::<ParticleEmitter2D>(fx)
                .unwrap()
                .playing
        );
        assert!(runtime.take_particle_commands().is_empty());

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 1.0;
        runtime.update(&mut world, 0.0);
        assert!(
            !world
                .get_component::<ParticleEmitter2D>(fx)
                .unwrap()
                .playing
        );
        assert_eq!(
            runtime.take_particle_commands(),
            vec![RuntimeParticleCommand::Seek {
                entity: fx,
                time: 1.25,
            }]
        );

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = true;
            live.speed = -1.0;
            live.time = 0.5;
        }
        runtime.update(&mut world, 0.1);
        assert!(
            !world
                .get_component::<ParticleEmitter2D>(fx)
                .unwrap()
                .playing
        );
        let commands = runtime.take_particle_commands();
        assert_eq!(commands.len(), 1);
        let RuntimeParticleCommand::Seek { entity, time } = commands[0] else {
            panic!("expected particle seek");
        };
        assert_eq!(entity, fx);
        assert!((time - 0.65).abs() < 0.0001);

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = false;
            live.time = 0.0;
        }
        runtime.reset_director(director);
        runtime.update(&mut world, 0.0);
        let restored = world.get_component::<ParticleEmitter2D>(fx).unwrap();
        assert_eq!(restored.playing, authored.playing);
        assert_eq!(restored.rate_over_time, authored.rate_over_time);
        assert_eq!(
            runtime.take_particle_commands(),
            vec![RuntimeParticleCommand::Reset { entity: fx }]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn camera_tracks_cut_blend_pause_and_release_without_mutating_primary_flags() {
        let (root, relative) = camera_project_asset();
        let mut world = World::new();
        let director = world.spawn_empty();
        let cameras = world.spawn_empty();
        world.set_component_value(cameras, "Name", serde_json::json!({ "value": "Cameras" }));
        world.set_parent(cameras, Some(director));
        let wide = world.spawn_empty();
        world.set_component_value(wide, "Name", serde_json::json!({ "value": "Wide" }));
        world.set_parent(wide, Some(cameras));
        world.insert_component(
            wide,
            Camera3D {
                primary: true,
                ..Camera3D::default()
            },
        );
        let close = world.spawn_empty();
        world.set_component_value(close, "Name", serde_json::json!({ "value": "Close" }));
        world.set_parent(close, Some(cameras));
        world.insert_component(
            close,
            Camera3D {
                primary: false,
                ..Camera3D::default()
            },
        );
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert_eq!(
            runtime.camera_override(),
            Some(RuntimeCameraOverride {
                director,
                source: None,
                target: wide,
                weight: 1.0,
            })
        );
        runtime.update(&mut world, 1.0);
        assert_eq!(
            runtime.camera_override(),
            Some(RuntimeCameraOverride {
                director,
                source: Some(wide),
                target: close,
                weight: 0.0,
            })
        );
        runtime.update(&mut world, 0.5);
        assert_eq!(runtime.camera_override().unwrap().weight, 0.5);

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        runtime.update(&mut world, 0.0);
        assert_eq!(runtime.camera_override().unwrap().weight, 0.5);
        assert!(world.get_component::<Camera3D>(wide).unwrap().primary);
        assert!(!world.get_component::<Camera3D>(close).unwrap().primary);

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = true;
            live.time = 2.0;
        }
        runtime.update(&mut world, 0.0);
        assert_eq!(
            runtime.camera_override(),
            Some(RuntimeCameraOverride {
                director,
                source: Some(close),
                target: close,
                weight: 0.0,
            })
        );

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = false;
            live.time = 0.0;
        }
        runtime.reset_director(director);
        runtime.update(&mut world, 0.0);
        assert_eq!(runtime.camera_override(), None);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn camera_blend_never_falls_back_when_previous_stable_binding_is_stale() {
        let (root, relative) = camera_project_asset();
        let mut world = World::new();
        let director = world.spawn_empty();
        let cameras = world.spawn_empty();
        world.set_component_value(cameras, "Name", serde_json::json!({ "value": "Cameras" }));
        world.set_parent(cameras, Some(director));
        let legacy_wide = world.spawn_empty();
        world.set_component_value(legacy_wide, "Name", serde_json::json!({ "value": "Wide" }));
        world.set_parent(legacy_wide, Some(cameras));
        world.insert_component(legacy_wide, Camera3D::default());
        let close = world.spawn_empty();
        world.set_component_value(close, "Name", serde_json::json!({ "value": "Close" }));
        world.set_parent(close, Some(cameras));
        world.insert_component(close, Camera3D::default());
        world.insert_component(
            director,
            TimelineDirector {
                asset: relative,
                bindings_json: format!(
                    r#"{{"version":1,"bindings":{{"Cameras/Close":{{"entity":"{}"}},"Cameras/Wide":{{"entity":"99","name":"Deleted Wide","missing":true}}}}}}"#,
                    close.to_u64()
                ),
                time: 1.0,
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        let failures = runtime.update(&mut world, 0.0);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("previous blend source"));
        assert!(failures[0].error.contains("stale stable binding"));
        assert_eq!(runtime.camera_override(), None);
        assert!(runtime.update(&mut world, 0.0).is_empty());
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

    #[test]
    fn control_source_activation_spans_gaps_pauses_and_applies_post_playback_on_stop() {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-control-source-{}",
            uuid::Uuid::new_v4()
        ));
        let timelines = root.join("Assets/Timelines");
        fs::create_dir_all(&timelines).unwrap();
        fs::write(
            timelines.join("Child.mtimeline"),
            r#"{"version":1,"duration":1,"tracks":[]}"#,
        )
        .unwrap();
        fs::write(
            timelines.join("Master.mtimeline"),
            r#"{"version":1,"duration":3,"tracks":[{"type":"control","id":"source","name":"Source","target":"LegacyMissing","clips":[{"start":0.5,"duration":1,"source":"SourceA","timeline":"Assets/Timelines/Child.mtimeline","control_activation":true,"post_playback":"active"},{"start":1.5,"duration":1,"source":"SourceB","timeline":"Assets/Timelines/Child.mtimeline","control_activation":true,"post_playback":"inactive"}]}]}"#,
        )
        .unwrap();

        let mut world = World::new();
        let director = world.spawn_empty();
        let source_a = world.spawn_empty();
        world.set_component_value(source_a, "Name", serde_json::json!({ "value": "SourceA" }));
        world.set_parent(source_a, Some(director));
        world.set_editor_state(source_a, world.sibling_index(source_a), false);
        let source_b = world.spawn_empty();
        world.set_component_value(source_b, "Name", serde_json::json!({ "value": "SourceB" }));
        world.set_parent(source_b, Some(director));
        world.set_editor_state(source_b, world.sibling_index(source_b), true);
        world.insert_component(
            director,
            TimelineDirector {
                asset: "Assets/Timelines/Master.mtimeline".into(),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            !world.entity_active(source_a) && !world.entity_active(source_b),
            "both independent sources are inactive before their clips"
        );
        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 0.75;
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            world.entity_active(source_a) && !world.entity_active(source_b),
            "only SourceA is active inside its clip"
        );

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .playing = false;
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            world.entity_active(source_a) && !world.entity_active(source_b),
            "pause retains both sampled source states"
        );

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = true;
            live.time = 1.75;
        }
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            !world.entity_active(source_a) && world.entity_active(source_b),
            "only SourceB is active inside its clip"
        );

        world
            .get_component_mut::<TimelineDirector>(director)
            .unwrap()
            .time = 2.75;
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            !world.entity_active(source_a) && !world.entity_active(source_b),
            "both sources are inactive after their clips"
        );

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = false;
            live.time = 0.0;
        }
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(
            world.entity_active(source_a) && !world.entity_active(source_b),
            "each source applies its own post-playback state on stop"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn control_prefab_is_reused_while_seeking_and_destroyed_when_director_stops() {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-control-prefab-{}",
            uuid::Uuid::new_v4()
        ));
        let timelines = root.join("Assets/Timelines");
        let prefab_path = root.join("Assets/Prefabs/Enemy.prefab");
        fs::create_dir_all(&timelines).unwrap();
        save_prefab(
            &prefab_path,
            &Prefab {
                version: PREFAB_VERSION,
                name: "Enemy".into(),
                root: PrefabNode {
                    id: "root".into(),
                    name: "Enemy".into(),
                    active: true,
                    components: serde_json::json!({}),
                    children: vec![PrefabNode {
                        id: "sound".into(),
                        name: "Sound".into(),
                        active: true,
                        components: serde_json::json!({
                            "AudioSource": serde_json::to_value(AudioSource::default()).unwrap()
                        }),
                        children: Vec::new(),
                    }],
                },
            },
        )
        .unwrap();
        fs::write(
            timelines.join("Child.mtimeline"),
            r#"{"version":1,"duration":1,"tracks":[{"type":"audio","id":"sound","name":"Sound","target":"Sound","clips":[{"start":0,"duration":1,"clip":"Assets/Audio/spawn.ogg"}]}]}"#,
        )
        .unwrap();
        fs::write(
            timelines.join("Parent.mtimeline"),
            r#"{"version":1,"duration":3,"tracks":[{"type":"control","id":"spawn","name":"Spawn","target":"Container","clips":[{"start":0.5,"duration":1,"prefab":"Assets/Prefabs/Enemy.prefab","timeline":"Assets/Timelines/Child.mtimeline"}]}]}"#,
        )
        .unwrap();

        let mut world = World::new();
        let director = world.spawn_empty();
        let container = world.spawn_empty();
        world.set_component_value(
            container,
            "Name",
            serde_json::json!({ "value": "Container" }),
        );
        world.set_parent(container, Some(director));
        world.insert_component(
            director,
            TimelineDirector {
                asset: "Assets/Timelines/Parent.mtimeline".into(),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));

        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert!(world
            .iter_entities()
            .all(|entity| world.entity_name(entity) != Some("Enemy")));
        assert!(runtime.update(&mut world, 0.5).is_empty());
        let enemy = world
            .iter_entities()
            .find(|entity| world.entity_name(*entity) == Some("Enemy"))
            .expect("active Control clip should instantiate its Prefab");
        assert_eq!(
            world.get_component::<Parent>(enemy).unwrap().entity,
            container
        );
        assert!(world.entity_active(enemy));
        let sound = resolve_descendant_target(&world, enemy, "Sound").unwrap();
        assert_eq!(
            world.get_component::<AudioSource>(sound).unwrap().clip,
            "Assets/Audio/spawn.ogg"
        );

        assert!(runtime.update(&mut world, 0.75).is_empty());
        assert!(world.is_alive(enemy));
        assert!(!world.entity_active(enemy));
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.playing = false;
            live.time = 0.75;
        }
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(world.is_alive(enemy));
        assert!(world.entity_active(enemy));

        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 0.0;
        }
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert!(!world.is_alive(enemy));
        assert!(!world.is_alive(sound));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn control_tracks_evaluate_nested_timing_signals_and_reject_dependency_cycles() {
        let root =
            std::env::temp_dir().join(format!("mengine-timeline-control-{}", uuid::Uuid::new_v4()));
        let timelines = root.join("Assets/Timelines");
        fs::create_dir_all(&timelines).unwrap();
        fs::write(
            timelines.join("Parent.mtimeline"),
            r#"{"version":1,"duration":2,"tracks":[{"type":"signal","id":"parent-events","name":"Parent Events","markers":[{"time":0.1,"name":"Parent Early"},{"time":0.2,"name":"Parent Late"}]},{"type":"control","id":"nested","name":"Nested","target":"Sequence","clips":[{"start":0,"duration":1,"timeline":"Assets/Timelines/Child.mtimeline","clip_in":0.5,"speed":1.5,"binding_overrides":{"Sound":"Cast/Audio"}}]}]}"#,
        )
        .unwrap();
        fs::write(
            timelines.join("Child.mtimeline"),
            r#"{"version":1,"duration":2,"tracks":[{"type":"signal","id":"events","name":"Events","markers":[{"time":0.75,"name":"Nested Beat"},{"time":1.9,"name":"Nested Late"}]},{"type":"audio","id":"sound","name":"Sound","target":"Sound","clips":[{"start":0,"duration":2,"clip":"Assets/Audio/nested.ogg"}]}]}"#,
        )
        .unwrap();

        let mut world = World::new();
        let director = world.spawn_empty();
        let sequence = world.spawn_empty();
        world.set_component_value(sequence, "Name", serde_json::json!({ "value": "Sequence" }));
        world.set_parent(sequence, Some(director));
        let sound = world.spawn_empty();
        world.set_component_value(sound, "Name", serde_json::json!({ "value": "Sound" }));
        world.set_parent(sound, Some(sequence));
        world.insert_component(sound, AudioSource::default());
        let routed_sound = world.spawn_empty();
        world.set_component_value(
            routed_sound,
            "Name",
            serde_json::json!({ "value": "Routed Sound" }),
        );
        world.set_parent(routed_sound, Some(director));
        world.insert_component(routed_sound, AudioSource::default());
        world.insert_component(
            director,
            TimelineDirector {
                asset: "Assets/Timelines/Parent.mtimeline".into(),
                bindings_json: format!(
                    r#"{{"version":1,"bindings":{{"Cast/Audio":{{"entity":"{}","name":"Routed Sound"}}}}}}"#,
                    routed_sound.to_u64()
                ),
                ..TimelineDirector::default()
            },
        );
        let mut runtime = TimelineRuntime::new(Some(root.clone()));
        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert!(world
            .get_component::<AudioSource>(sound)
            .unwrap()
            .clip
            .is_empty());
        let source = world.get_component::<AudioSource>(routed_sound).unwrap();
        assert_eq!(source.clip, "Assets/Audio/nested.ogg");
        assert!((source.time - 0.875).abs() < 0.0001);
        assert_eq!(
            runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Parent Early", "Nested Beat", "Parent Late"]
        );
        assert!(runtime.update(&mut world, 0.75).is_empty());
        assert_eq!(
            runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Nested Late"]
        );
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 0.25;
            live.speed = -1.0;
            live.playing = true;
            live.wrap_mode = "Hold".into();
        }
        runtime.reset_director(director);
        assert!(runtime.update(&mut world, 0.2).is_empty());
        assert_eq!(
            runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Parent Late", "Nested Beat", "Parent Early"]
        );
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 1.9;
            live.speed = 1.0;
            live.playing = true;
            live.wrap_mode = "Loop".into();
        }
        runtime.reset_director(director);
        assert!(runtime.update(&mut world, 0.35).is_empty());
        assert_eq!(
            runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Parent Early", "Nested Beat", "Parent Late"]
        );
        assert!(
            (world
                .get_component::<AudioSource>(routed_sound)
                .unwrap()
                .time
                - 0.875)
                .abs()
                < 0.0001
        );

        fs::write(
            timelines.join("Child.mtimeline"),
            r#"{"version":1,"duration":2,"tracks":[{"type":"control","id":"back","name":"Back","target":"LoopRoot","clips":[{"start":0,"duration":1,"timeline":"Assets/Timelines/Parent.mtimeline"}]}]}"#,
        )
        .unwrap();
        let mut invalid_binding_runtime = TimelineRuntime::new(Some(root.clone()));
        let failures = invalid_binding_runtime.update(&mut world, 0.25);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("unknown binding target 'Sound'"));
        fs::write(
            timelines.join("Parent.mtimeline"),
            r#"{"version":1,"duration":2,"tracks":[{"type":"control","id":"nested","name":"Nested","target":"Sequence","clips":[{"start":0,"duration":1,"timeline":"Assets/Timelines/Child.mtimeline","clip_in":0.5,"speed":1.5}]}]}"#,
        )
        .unwrap();
        let loop_root = world.spawn_empty();
        world.set_component_value(
            loop_root,
            "Name",
            serde_json::json!({ "value": "LoopRoot" }),
        );
        world.set_parent(loop_root, Some(sequence));
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 0.0;
            live.playing = true;
        }
        let mut cyclic_runtime = TimelineRuntime::new(Some(root.clone()));
        let failures = cyclic_runtime.update(&mut world, 0.25);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("dependency cycle"));
        assert!(cyclic_runtime.update(&mut world, 0.0).is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn control_clip_hold_and_loop_extrapolation_sample_and_order_signals() {
        let root = std::env::temp_dir().join(format!(
            "mengine-timeline-control-extrapolation-{}",
            uuid::Uuid::new_v4()
        ));
        let timelines = root.join("Assets/Timelines");
        fs::create_dir_all(&timelines).unwrap();
        fs::write(
            timelines.join("Child.mtimeline"),
            r#"{"version":1,"duration":1,"tracks":[{"type":"signal","id":"events","name":"Events","markers":[{"time":0,"name":"Start"},{"time":0.25,"name":"Quarter"},{"time":1,"name":"End"}]},{"type":"audio","id":"sound","name":"Sound","target":"Sound","clips":[{"start":0,"duration":1,"clip":"Assets/Audio/nested.ogg"}]}]}"#,
        )
        .unwrap();
        let parent_source = |extrapolation: &str| {
            format!(
                r#"{{"version":1,"duration":4,"tracks":[{{"type":"control","id":"nested","name":"Nested","target":"Sequence","clips":[{{"start":0,"duration":4,"timeline":"Assets/Timelines/Child.mtimeline","extrapolation":"{extrapolation}"}}]}}]}}"#
            )
        };
        fs::write(timelines.join("Parent.mtimeline"), parent_source("loop")).unwrap();

        let mut world = World::new();
        let director = world.spawn_empty();
        let sequence = world.spawn_empty();
        world.set_component_value(sequence, "Name", serde_json::json!({ "value": "Sequence" }));
        world.set_parent(sequence, Some(director));
        let sound = world.spawn_empty();
        world.set_component_value(sound, "Name", serde_json::json!({ "value": "Sound" }));
        world.set_parent(sound, Some(sequence));
        world.insert_component(sound, AudioSource::default());
        world.insert_component(
            director,
            TimelineDirector {
                asset: "Assets/Timelines/Parent.mtimeline".into(),
                ..TimelineDirector::default()
            },
        );

        let mut loop_runtime = TimelineRuntime::new(Some(root.clone()));
        assert!(loop_runtime.update(&mut world, 2.25).is_empty());
        assert_eq!(
            loop_runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Start", "Quarter", "End", "Start", "Quarter", "End", "Start", "Quarter"]
        );
        let source = world.get_component::<AudioSource>(sound).unwrap();
        assert!((source.time - 0.25).abs() < 0.0001);
        assert!(source.playing);
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 2.25;
            live.speed = -1.0;
            live.playing = true;
        }
        loop_runtime.reset_director(director);
        assert!(loop_runtime.update(&mut world, 1.25).is_empty());
        assert_eq!(
            loop_runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Quarter", "Start", "End", "Quarter", "Start", "End"]
        );

        fs::write(timelines.join("Parent.mtimeline"), parent_source("hold")).unwrap();
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 0.0;
            live.speed = 1.0;
            live.playing = true;
        }
        let mut hold_runtime = TimelineRuntime::new(Some(root.clone()));
        assert!(hold_runtime.update(&mut world, 2.25).is_empty());
        assert_eq!(
            hold_runtime
                .take_signals()
                .into_iter()
                .map(|signal| signal.signal)
                .collect::<Vec<_>>(),
            ["Start", "Quarter", "End"]
        );
        let source = world.get_component::<AudioSource>(sound).unwrap();
        assert!(source.time > 0.999);
        assert!(!source.playing);
        assert!(hold_runtime.update(&mut world, 0.5).is_empty());
        assert!(hold_runtime.take_signals().is_empty());

        fs::write(timelines.join("Parent.mtimeline"), parent_source("none")).unwrap();
        {
            let live = world
                .get_component_mut::<TimelineDirector>(director)
                .unwrap();
            live.time = 0.0;
            live.playing = true;
        }
        let mut strict_runtime = TimelineRuntime::new(Some(root.clone()));
        let failures = strict_runtime.update(&mut world, 0.25);
        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.contains("source window is outside"));
        let _ = fs::remove_dir_all(root);
    }
}
