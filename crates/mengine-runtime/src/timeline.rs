use crate::particles::MAX_INCREMENTAL_DELTA;
use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_timeline_asset, TimelineAsset, TimelineTrack};
use mengine_core::generated::{
    AnimationPlayer, Animator, AudioSource, ParticleEmitter2D, ParticleEmitter3D, TimelineDirector,
};
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

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeParticleCommand {
    Seek { entity: Entity, time: f32 },
    Reset { entity: Entity },
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
pub struct TimelineRuntime {
    project_root: Option<PathBuf>,
    assets: HashMap<PathBuf, CachedTimeline>,
    initialized: HashSet<Entity>,
    active: HashSet<Entity>,
    evaluated_directors: HashMap<Entity, (String, f32)>,
    reported_failures: HashSet<(String, String)>,
    reported_activation_failures: HashSet<(Entity, String)>,
    reported_audio_failures: HashSet<(Entity, String)>,
    reported_animation_failures: HashSet<(Entity, String)>,
    reported_particle_failures: HashSet<(Entity, String)>,
    activation_overrides: HashMap<(Entity, String), ActivationOverride>,
    audio_overrides: HashMap<(Entity, String), AudioOverride>,
    animation_overrides: HashMap<(Entity, String), AnimationOverride>,
    particle_overrides: HashMap<(Entity, String), ParticleOverride>,
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
        self.evaluated_directors
            .retain(|entity, _| active_entities.contains(entity) && world.is_alive(*entity));
        self.active
            .retain(|entity| active_entities.contains(entity) && world.is_alive(*entity));

        let mut failures = Vec::new();
        let mut applied_activation_overrides = HashSet::new();
        let mut applied_audio_overrides = HashSet::new();
        let mut applied_animation_overrides = HashSet::new();
        let mut applied_particle_overrides = HashSet::new();
        for (entity, mut director) in entities {
            if self.initialized.insert(entity) && !director.play_on_awake {
                director.playing = false;
                if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                    live.playing = false;
                }
            }
            let asset_key = director.asset.trim();
            if asset_key.is_empty() {
                self.active.remove(&entity);
                self.evaluated_directors.remove(&entity);
                continue;
            }
            if !director.playing {
                if director.time <= 0.0 {
                    self.active.remove(&entity);
                    self.evaluated_directors.remove(&entity);
                    continue;
                }
                let Some((evaluated_asset, evaluated_time)) = self.evaluated_directors.get(&entity)
                else {
                    self.active.remove(&entity);
                    continue;
                };
                let unchanged = evaluated_asset == asset_key
                    && (director.time - *evaluated_time).abs() <= 0.001;
                if unchanged {
                    self.retain_paused_overrides(
                        world,
                        entity,
                        &mut applied_activation_overrides,
                        &mut applied_audio_overrides,
                        &mut applied_animation_overrides,
                        &mut applied_particle_overrides,
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
                let (applied, mut activation_failures) =
                    self.apply_activation_tracks(world, entity, asset_key, &asset, paused_time);
                applied_activation_overrides.extend(applied);
                failures.append(&mut activation_failures);
                let (applied, mut audio_failures) = self.apply_audio_tracks(
                    world,
                    entity,
                    asset_key,
                    &asset,
                    paused_time,
                    paused_time,
                    0.0,
                    true,
                );
                applied_audio_overrides.extend(applied);
                failures.append(&mut audio_failures);
                let (applied, mut animation_failures) =
                    self.apply_animation_tracks(world, entity, asset_key, &asset, paused_time);
                applied_animation_overrides.extend(applied);
                failures.append(&mut animation_failures);
                let (applied, mut particle_failures) = self.apply_particle_tracks(
                    world,
                    entity,
                    asset_key,
                    &asset,
                    paused_time,
                    paused_time,
                    0.0,
                    true,
                );
                applied_particle_overrides.extend(applied);
                failures.append(&mut particle_failures);
                self.evaluated_directors
                    .insert(entity, (asset_key.to_owned(), paused_time));
                if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                    live.time = paused_time;
                }
                continue;
            }

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
                let (applied, mut audio_failures) = self.apply_audio_tracks(
                    world,
                    entity,
                    asset_key,
                    &asset,
                    start,
                    next,
                    director.speed,
                    just_started,
                );
                applied_audio_overrides.extend(applied);
                failures.append(&mut audio_failures);
                let (applied, mut animation_failures) =
                    self.apply_animation_tracks(world, entity, asset_key, &asset, next);
                applied_animation_overrides.extend(applied);
                failures.append(&mut animation_failures);
                let (applied, mut particle_failures) = self.apply_particle_tracks(
                    world,
                    entity,
                    asset_key,
                    &asset,
                    start,
                    next,
                    director.speed,
                    just_started,
                );
                applied_particle_overrides.extend(applied);
                failures.append(&mut particle_failures);
            }
            if let Some(live) = world.get_component_mut::<TimelineDirector>(entity) {
                live.time = next;
                if finished {
                    live.playing = false;
                    self.active.remove(&entity);
                }
            }
            self.evaluated_directors
                .insert(entity, (asset_key.to_owned(), next));
        }
        self.restore_unused_activation_overrides(world, &applied_activation_overrides);
        self.restore_unused_audio_overrides(world, &applied_audio_overrides);
        self.restore_unused_animation_overrides(world, &applied_animation_overrides);
        self.restore_unused_particle_overrides(world, &applied_particle_overrides);
        self.reported_activation_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_audio_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_animation_failures
            .retain(|(entity, _)| world.is_alive(*entity));
        self.reported_particle_failures
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
            .insert(entity, (String::new(), f32::NAN));
    }

    pub fn take_signals(&mut self) -> Vec<RuntimeTimelineSignal> {
        std::mem::take(&mut self.pending_signals)
    }

    pub fn take_particle_commands(&mut self) -> Vec<RuntimeParticleCommand> {
        std::mem::take(&mut self.pending_particle_commands)
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
                ..
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
            let Some(target_entity) = resolve_descendant_target(world, director, target) else {
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

    #[allow(clippy::too_many_arguments)]
    fn apply_audio_tracks(
        &mut self,
        world: &mut World,
        director: Entity,
        asset_key: &str,
        asset: &TimelineAsset,
        start: f32,
        time: f32,
        director_speed: f32,
        just_started: bool,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        for track in &asset.tracks {
            let TimelineTrack::Audio {
                id,
                name,
                muted,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (director, id.clone());
            if *muted {
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
            let Some(target_entity) = resolve_descendant_target(world, director, target) else {
                if self.reported_audio_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: director,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "audio track '{name}' target '{target}' was not found below the Director entity"
                        ),
                    });
                }
                continue;
            };
            let Some(authored) = world.get_component::<AudioSource>(target_entity).cloned() else {
                if self.reported_audio_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: director,
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
                source.volume = clip.volume;
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

    fn apply_animation_tracks(
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
            let TimelineTrack::Animation {
                id,
                name,
                muted,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (director, id.clone());
            if *muted {
                self.reported_animation_failures.remove(&key);
                continue;
            }
            let Some(clip) = clips
                .iter()
                .find(|clip| time >= clip.start && time < clip.start + clip.duration)
            else {
                self.reported_animation_failures.remove(&key);
                continue;
            };
            let Some(target_entity) = resolve_descendant_target(world, director, target) else {
                if self.reported_animation_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: director,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "animation track '{name}' target '{target}' was not found below the Director entity"
                        ),
                    });
                }
                continue;
            };
            let Some(authored) = world
                .get_component::<AnimationPlayer>(target_entity)
                .cloned()
            else {
                if self.reported_animation_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: director,
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
                        entity: director,
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
            if let Some(player) = world.get_component_mut::<AnimationPlayer>(target_entity) {
                player.clip.clone_from(&clip.clip);
                player.play_on_awake = true;
                player.playing = true;
                player.speed = 0.0;
                player.time = (clip.clip_in + (time - clip.start) * clip.speed).max(0.0);
            }
            applied.insert(key);
        }
        (applied, failures)
    }

    #[allow(clippy::too_many_arguments)]
    fn apply_particle_tracks(
        &mut self,
        world: &mut World,
        director: Entity,
        asset_key: &str,
        asset: &TimelineAsset,
        start: f32,
        time: f32,
        director_speed: f32,
        just_started: bool,
    ) -> (HashSet<(Entity, String)>, Vec<TimelineLoadFailure>) {
        let mut applied = HashSet::new();
        let mut failures = Vec::new();
        for track in &asset.tracks {
            let TimelineTrack::Particle {
                id,
                name,
                muted,
                target,
                clips,
                ..
            } = track
            else {
                continue;
            };
            let key = (director, id.clone());
            if *muted {
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
            let Some(target_entity) = resolve_descendant_target(world, director, target) else {
                if self.reported_particle_failures.insert(key) {
                    failures.push(TimelineLoadFailure {
                        entity: director,
                        asset: asset_key.to_owned(),
                        error: format!(
                            "particle track '{name}' target '{target}' was not found below the Director entity"
                        ),
                    });
                }
                continue;
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
                            entity: director,
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
                            entity: director,
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

    fn retain_paused_overrides(
        &self,
        world: &mut World,
        director: Entity,
        activation: &mut HashSet<(Entity, String)>,
        audio: &mut HashSet<(Entity, String)>,
        animation: &mut HashSet<(Entity, String)>,
        particle: &mut HashSet<(Entity, String)>,
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
    use crate::animation::AnimationRuntime;
    use mengine_core::generated::{ParticleEmitter2D, Transform};
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
