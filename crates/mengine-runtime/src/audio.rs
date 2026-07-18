use crate::textures::resolve_project_asset_path;
use mengine_audio::{
    AudioBus, AudioEngine, AudioMixerSettings, AudioSourceSettings, SourceSyncStatus,
};
use mengine_core::generated::{AudioListener, AudioMixer, AudioSource};
use mengine_core::{Entity, TransformHierarchy, World};
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AudioLoadFailure {
    pub entity: Entity,
    pub clip: String,
    pub error: String,
}

/// Synchronizes declarative ECS audio components with the platform audio device.
pub struct AudioRuntime {
    project_root: Option<PathBuf>,
    engine: AudioEngine,
    initialized_sources: HashSet<Entity>,
    reported_failures: HashSet<(Entity, String, String)>,
    device_error: Option<String>,
}

impl AudioRuntime {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        let mut engine = AudioEngine::new();
        let device_error = engine.init().err().map(|error| error.to_string());
        if let Some(error) = device_error.as_deref() {
            log::warn!("audio output disabled: {error}");
        }
        Self {
            project_root,
            engine,
            initialized_sources: HashSet::new(),
            reported_failures: HashSet::new(),
            device_error,
        }
    }

    pub fn device_error(&self) -> Option<&str> {
        self.device_error.as_deref()
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.clear();
    }

    pub fn clear(&mut self) {
        self.engine.clear();
        self.initialized_sources.clear();
        self.reported_failures.clear();
    }

    pub fn stop_source(&mut self, entity: Entity) {
        self.engine.stop_source(entity.to_u64());
    }

    pub fn seek_source(&mut self, entity: Entity, time: f32) {
        self.engine.seek_source(entity.to_u64(), time);
    }

    pub fn update(&mut self, world: &mut World) -> Vec<AudioLoadFailure> {
        let hierarchy = TransformHierarchy::build(world);
        self.sync_mixer(world, &hierarchy);
        self.sync_listener(world, &hierarchy);

        let all_source_entities: Vec<_> = world
            .iter_entities()
            .filter(|entity| world.get_component::<AudioSource>(*entity).is_some())
            .collect();
        let source_entity_set: HashSet<_> = all_source_entities.iter().copied().collect();
        self.initialized_sources
            .retain(|entity| source_entity_set.contains(entity) && world.is_alive(*entity));
        let sources: Vec<_> = all_source_entities
            .into_iter()
            .filter(|entity| hierarchy.is_active(*entity))
            .filter_map(|entity| {
                world
                    .get_component::<AudioSource>(entity)
                    .cloned()
                    .map(|source| (entity, source))
            })
            .collect();

        let mut live_ids = HashSet::new();
        let mut failures = Vec::new();
        for (entity, mut source) in sources {
            if self.initialized_sources.insert(entity) && !source.play_on_awake {
                source.playing = false;
                if let Some(live) = world.get_component_mut::<AudioSource>(entity) {
                    live.playing = false;
                }
            }
            let clip_key = source.clip.trim();
            if clip_key.is_empty() {
                continue;
            }
            let Some(root) = self.project_root.as_deref() else {
                self.record_failure(
                    entity,
                    clip_key,
                    "project root is not configured".into(),
                    &mut failures,
                );
                continue;
            };
            let Some(path) = resolve_project_asset_path(root, clip_key) else {
                self.record_failure(
                    entity,
                    clip_key,
                    "audio path must be project-relative and cannot contain '..'".into(),
                    &mut failures,
                );
                continue;
            };
            live_ids.insert(entity.to_u64());
            if self.device_error.is_some() {
                continue;
            }
            let position = hierarchy
                .get(entity)
                .map(|transform| transform.position.to_array())
                .unwrap_or_default();
            let settings = AudioSourceSettings {
                clip: path,
                playing: source.playing,
                time: source.time,
                looped: source.looped,
                volume: source.volume,
                pitch: source.pitch,
                pan: source.pan,
                spatial_blend: source.spatial_blend,
                min_distance: source.min_distance,
                max_distance: source.max_distance,
                bus: AudioBus::parse(&source.bus),
                muted: source.mute,
                position,
            };
            match self.engine.sync_source(entity.to_u64(), settings) {
                Ok(SourceSyncStatus::Finished { position }) => {
                    if let Some(live) = world.get_component_mut::<AudioSource>(entity) {
                        live.playing = false;
                        live.time = position;
                    }
                }
                Ok(
                    SourceSyncStatus::Playing { position } | SourceSyncStatus::Paused { position },
                ) => {
                    if let Some(live) = world.get_component_mut::<AudioSource>(entity) {
                        live.time = position;
                    }
                    self.reported_failures
                        .retain(|(failed_entity, failed_clip, _)| {
                            *failed_entity != entity || failed_clip != clip_key
                        });
                }
                Err(error) => {
                    self.record_failure(entity, clip_key, error.to_string(), &mut failures);
                }
            }
        }
        self.engine.retain_sources(&live_ids);
        failures
    }

    fn sync_mixer(&mut self, world: &World, hierarchy: &TransformHierarchy) {
        let mixer = world
            .iter_entities()
            .filter(|entity| hierarchy.is_active(*entity))
            .find_map(|entity| world.get_component::<AudioMixer>(entity));
        let settings = mixer.map_or_else(AudioMixerSettings::default, |mixer| AudioMixerSettings {
            master_volume: mixer.master_volume,
            music_volume: mixer.music_volume,
            sfx_volume: mixer.sfx_volume,
            ui_volume: mixer.ui_volume,
            ambience_volume: mixer.ambience_volume,
            muted: mixer.muted,
        });
        self.engine.set_mixer(settings);
    }

    fn sync_listener(&mut self, world: &World, hierarchy: &TransformHierarchy) {
        let listener = world
            .iter_entities()
            .filter(|entity| hierarchy.is_active(*entity))
            .filter_map(|entity| {
                world
                    .get_component::<AudioListener>(entity)
                    .map(|listener| (entity, listener.primary))
            })
            .min_by_key(|(_, primary)| !*primary);
        let transform = listener.and_then(|(entity, _)| hierarchy.get(entity));
        let position = transform
            .map(|transform| transform.position.to_array())
            .unwrap_or_default();
        let orientation = transform
            .map(|transform| {
                [
                    transform.rotation.x,
                    transform.rotation.y,
                    transform.rotation.z,
                    transform.rotation.w,
                ]
            })
            .unwrap_or([0.0, 0.0, 0.0, 1.0]);
        self.engine.set_listener(position, orientation);
    }

    fn record_failure(
        &mut self,
        entity: Entity,
        clip: &str,
        error: String,
        output: &mut Vec<AudioLoadFailure>,
    ) {
        if self
            .reported_failures
            .insert((entity, clip.to_owned(), error.clone()))
        {
            output.push(AudioLoadFailure {
                entity,
                clip: clip.to_owned(),
                error,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_update_honors_play_on_awake_false_even_headless() {
        let mut runtime = AudioRuntime::new(None);
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            AudioSource {
                clip: String::new(),
                play_on_awake: false,
                playing: true,
                ..AudioSource::default()
            },
        );
        runtime.update(&mut world);
        assert!(!world.get_component::<AudioSource>(entity).unwrap().playing);
    }

    #[test]
    fn missing_project_root_is_reported_once_per_source() {
        let mut runtime = AudioRuntime::new(None);
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            AudioSource {
                clip: "Assets/Audio/music.ogg".into(),
                ..AudioSource::default()
            },
        );
        assert_eq!(runtime.update(&mut world).len(), 1);
        assert!(runtime.update(&mut world).is_empty());
    }

    #[test]
    fn reactivating_a_source_does_not_repeat_play_on_awake() {
        let mut runtime = AudioRuntime::new(None);
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            AudioSource {
                play_on_awake: false,
                playing: true,
                ..AudioSource::default()
            },
        );
        runtime.update(&mut world);
        world
            .get_component_mut::<AudioSource>(entity)
            .unwrap()
            .playing = true;
        world.set_editor_state(entity, 0, false);
        runtime.update(&mut world);
        world.set_editor_state(entity, 0, true);
        runtime.update(&mut world);
        assert!(world.get_component::<AudioSource>(entity).unwrap().playing);
    }
}
