//! Script requests shared by the desktop Player and Editor Play Mode.
use crate::{animation::AnimationRuntime, audio::AudioRuntime, prefabs::instantiate_project_prefab, scenes::SceneSelector, timeline::TimelineRuntime};
use mengine_core::{Entity, World};
use mengine_core::generated::{Animator, AnimationPlayer, AudioSource, TimelineDirector};
use mengine_script::ScriptRuntimeRequest;
use std::path::Path;

pub struct ScriptRequestContext<'a> {
    pub world: &'a mut World,
    pub project_root: Option<&'a Path>,
    pub animations: &'a mut AnimationRuntime,
    pub timelines: &'a mut TimelineRuntime,
    pub audio: &'a mut AudioRuntime,
}

impl ScriptRequestContext<'_> {
    pub fn apply(&mut self, request: ScriptRuntimeRequest) -> Option<SceneSelector> {
        match &request {
            ScriptRuntimeRequest::SetAnimatorParameter {
                entity,
                name,
                value,
            } => {
                let entity = Entity::from_u64(*entity);
                let Some(animator) = self.world.get_component_mut::<Animator>(entity) else {
                    log::warn!(
                        "script tried to set Animator parameter on missing entity {entity:?}"
                    );
                    return None;
                };
                let mut parameters =
                    serde_json::from_str::<serde_json::Value>(&animator.parameters_json)
                        .ok()
                        .and_then(|value| value.as_object().cloned())
                        .unwrap_or_default();
                parameters.insert(name.clone(), value.clone());
                animator.parameters_json = serde_json::Value::Object(parameters).to_string();
                return None;
            }
            ScriptRuntimeRequest::PlayAnimatorState { entity, state } => {
                let entity = Entity::from_u64(*entity);
                let Some(animator) = self.world.get_component_mut::<Animator>(entity) else {
                    log::warn!("script tried to play Animator state on missing entity {entity:?}");
                    return None;
                };
                animator.current_state = state.clone();
                animator.playing = true;
                return None;
            }
            ScriptRuntimeRequest::SetAnimatorLayerWeight {
                entity,
                layer,
                weight,
            } => {
                let entity = Entity::from_u64(*entity);
                let Some(animator) = self.world.get_component_mut::<Animator>(entity) else {
                    log::warn!(
                        "script tried to set Animator layer weight on missing entity {entity:?}"
                    );
                    return None;
                };
                let mut weights =
                    serde_json::from_str::<serde_json::Value>(&animator.layer_weights_json)
                        .ok()
                        .and_then(|value| value.as_object().cloned())
                        .unwrap_or_default();
                weights.insert(layer.clone(), serde_json::json!(weight.clamp(0.0, 1.0)));
                animator.layer_weights_json = serde_json::Value::Object(weights).to_string();
                return None;
            }
            ScriptRuntimeRequest::PlayAnimatorLayerState {
                entity,
                layer,
                state,
            } => {
                let entity = Entity::from_u64(*entity);
                if self.world.get_component::<Animator>(entity).is_none() {
                    log::warn!(
                        "script tried to play Animator layer state on missing entity {entity:?}"
                    );
                    return None;
                }
                self.animations
                    .play_animator_layer_state(entity, layer, state);
                return None;
            }
            ScriptRuntimeRequest::PlayAnimation { entity, restart } => {
                let entity = Entity::from_u64(*entity);
                if *restart {
                    self.animations.reset_player(entity);
                }
                let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) else {
                    log::warn!("script tried to play AnimationPlayer on missing entity {entity:?}");
                    return None;
                };
                if *restart {
                    player.time = 0.0;
                }
                player.playing = true;
                return None;
            }
            ScriptRuntimeRequest::PauseAnimation { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) {
                    player.playing = false;
                } else {
                    log::warn!(
                        "script tried to pause AnimationPlayer on missing entity {entity:?}"
                    );
                }
                return None;
            }
            ScriptRuntimeRequest::StopAnimation { entity } => {
                let entity = Entity::from_u64(*entity);
                self.animations.reset_player(entity);
                if let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) {
                    player.playing = false;
                    player.time = 0.0;
                } else {
                    log::warn!("script tried to stop AnimationPlayer on missing entity {entity:?}");
                }
                return None;
            }
            ScriptRuntimeRequest::SeekAnimation { entity, time } => {
                let entity = Entity::from_u64(*entity);
                if let Some(player) = self.world.get_component_mut::<AnimationPlayer>(entity) {
                    player.time = *time;
                } else {
                    log::warn!("script tried to seek AnimationPlayer on missing entity {entity:?}");
                }
                return None;
            }
            ScriptRuntimeRequest::PlayTimeline { entity, restart } => {
                let entity = Entity::from_u64(*entity);
                if *restart {
                    self.timelines.reset_director(entity);
                }
                let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity)
                else {
                    log::warn!(
                        "script tried to play TimelineDirector on missing entity {entity:?}"
                    );
                    return None;
                };
                if *restart {
                    director.time = 0.0;
                }
                director.playing = true;
                return None;
            }
            ScriptRuntimeRequest::PauseTimeline { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity) {
                    director.playing = false;
                } else {
                    log::warn!(
                        "script tried to pause TimelineDirector on missing entity {entity:?}"
                    );
                }
                return None;
            }
            ScriptRuntimeRequest::StopTimeline { entity } => {
                let entity = Entity::from_u64(*entity);
                self.timelines.reset_director(entity);
                if let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity) {
                    director.playing = false;
                    director.time = 0.0;
                } else {
                    log::warn!(
                        "script tried to stop TimelineDirector on missing entity {entity:?}"
                    );
                }
                return None;
            }
            ScriptRuntimeRequest::SeekTimeline { entity, time } => {
                let entity = Entity::from_u64(*entity);
                if let Some(director) = self.world.get_component_mut::<TimelineDirector>(entity) {
                    director.time = *time;
                    self.timelines.seek_director(entity);
                } else {
                    log::warn!(
                        "script tried to seek TimelineDirector on missing entity {entity:?}"
                    );
                }
                return None;
            }
            ScriptRuntimeRequest::PlayAudio { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.playing = true;
                } else {
                    log::warn!("script tried to play AudioSource on missing entity {entity:?}");
                }
                return None;
            }
            ScriptRuntimeRequest::PauseAudio { entity } => {
                let entity = Entity::from_u64(*entity);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.playing = false;
                } else {
                    log::warn!("script tried to pause AudioSource on missing entity {entity:?}");
                }
                return None;
            }
            ScriptRuntimeRequest::StopAudio { entity } => {
                let entity = Entity::from_u64(*entity);
                self.audio.stop_source(entity);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.playing = false;
                    source.time = 0.0;
                } else {
                    log::warn!("script tried to stop AudioSource on missing entity {entity:?}");
                }
                return None;
            }
            ScriptRuntimeRequest::SeekAudio { entity, time } => {
                let entity = Entity::from_u64(*entity);
                self.audio.seek_source(entity, *time);
                if let Some(source) = self.world.get_component_mut::<AudioSource>(entity) {
                    source.time = *time;
                } else {
                    log::warn!("script tried to seek AudioSource on missing entity {entity:?}");
                }
                return None;
            }
            ScriptRuntimeRequest::InstantiatePrefab { path, parent } => {
                match instantiate_project_prefab(
                    self.project_root,
                    path,
                    *parent,
                    self.world,
                ) {
                    Ok(instance) => log::info!(
                        "instantiated prefab '{path}' as entity {} ({} nodes)",
                        instance.root,
                        instance.entities.len()
                    ),
                    Err(error) => log::error!("failed to instantiate prefab '{path}': {error}"),
                }
                return None;
            }
            _ => {}
        }
        let selector = match request {
            ScriptRuntimeRequest::LoadSceneByIndex(index) => SceneSelector::Index(index),
            ScriptRuntimeRequest::LoadScene(reference) => SceneSelector::PathOrName(reference),
            ScriptRuntimeRequest::ReloadScene => SceneSelector::Reload,
            ScriptRuntimeRequest::SetAnimatorParameter { .. }
            | ScriptRuntimeRequest::SetAnimatorLayerWeight { .. }
            | ScriptRuntimeRequest::InstantiatePrefab { .. }
            | ScriptRuntimeRequest::PlayAnimatorState { .. }
            | ScriptRuntimeRequest::PlayAnimatorLayerState { .. }
            | ScriptRuntimeRequest::PlayAnimation { .. }
            | ScriptRuntimeRequest::PauseAnimation { .. }
            | ScriptRuntimeRequest::StopAnimation { .. }
            | ScriptRuntimeRequest::SeekAnimation { .. }
            | ScriptRuntimeRequest::PlayTimeline { .. }
            | ScriptRuntimeRequest::PauseTimeline { .. }
            | ScriptRuntimeRequest::StopTimeline { .. }
            | ScriptRuntimeRequest::SeekTimeline { .. }
            | ScriptRuntimeRequest::PlayAudio { .. }
            | ScriptRuntimeRequest::PauseAudio { .. }
            | ScriptRuntimeRequest::StopAudio { .. }
            | ScriptRuntimeRequest::SeekAudio { .. } => unreachable!(),
        };
        Some(selector)
    }
}
