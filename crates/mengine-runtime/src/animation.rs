use crate::textures::resolve_project_asset_path;
use mengine_assets::{
    load_animation_clip, load_animator_controller, AnimationClip, AnimationEvent, AnimationValue,
    AnimationWrapMode, AnimatorCondition, AnimatorConditionMode, AnimatorController,
    AnimatorParameterKind,
};
use mengine_core::generated::{AnimationPlayer, Animator};
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

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeAnimationEvent {
    pub entity: Entity,
    pub function: String,
    pub time: f32,
    pub parameter: Option<AnimationValue>,
    pub state: Option<String>,
    pub weight: f32,
}

#[derive(Clone)]
struct CachedAnimation {
    modified: Option<SystemTime>,
    result: Result<Arc<AnimationClip>, String>,
}

#[derive(Clone)]
struct CachedController {
    modified: Option<SystemTime>,
    result: Result<Arc<AnimatorController>, String>,
}

#[derive(Clone, Debug)]
struct ActiveTransition {
    source_state: String,
    source_time: f32,
    destination_state: String,
    destination_time: f32,
    elapsed: f32,
    duration: f32,
}

#[derive(Clone, Debug)]
struct AnimatorInstance {
    controller: String,
    state: String,
    state_time: f32,
    transition: Option<ActiveTransition>,
}

#[derive(Default)]
pub struct AnimationRuntime {
    project_root: Option<PathBuf>,
    clips: HashMap<PathBuf, CachedAnimation>,
    controllers: HashMap<PathBuf, CachedController>,
    animator_instances: HashMap<Entity, AnimatorInstance>,
    reported_failures: HashSet<(String, String)>,
    active_players: HashSet<Entity>,
    active_animators: HashSet<Entity>,
    pending_events: Vec<RuntimeAnimationEvent>,
}

impl AnimationRuntime {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            clips: HashMap::new(),
            controllers: HashMap::new(),
            animator_instances: HashMap::new(),
            reported_failures: HashSet::new(),
            active_players: HashSet::new(),
            active_animators: HashSet::new(),
            pending_events: Vec::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.clips.clear();
        self.controllers.clear();
        self.animator_instances.clear();
        self.reported_failures.clear();
        self.active_players.clear();
        self.active_animators.clear();
        self.pending_events.clear();
    }

    pub fn invalidate(&mut self, clip: &str) {
        let Some(root) = self.project_root.as_deref() else {
            return;
        };
        if let Some(path) = resolve_project_asset_path(root, clip) {
            self.clips.remove(&path);
            self.controllers.remove(&path);
        }
    }

    pub fn update(&mut self, world: &mut World, delta_seconds: f32) -> Vec<AnimationLoadFailure> {
        self.pending_events.clear();
        if !delta_seconds.is_finite() {
            return Vec::new();
        }
        let animator_entities: HashSet<_> = world
            .iter_entities()
            .filter(|entity| world.get_component::<Animator>(*entity).is_some())
            .collect();
        self.animator_instances
            .retain(|entity, _| animator_entities.contains(entity) && world.is_alive(*entity));
        self.active_animators
            .retain(|entity| animator_entities.contains(entity) && world.is_alive(*entity));

        let mut failures = self.update_animators(world, delta_seconds);
        let players: Vec<_> = world
            .iter_entities()
            .filter(|entity| world.entity_active(*entity))
            // A state machine owns animation output when both components are present.
            .filter(|entity| !animator_entities.contains(entity))
            .filter_map(|entity| {
                world
                    .get_component::<AnimationPlayer>(entity)
                    .cloned()
                    .map(|player| (entity, player))
            })
            .collect();
        let live_players: HashSet<_> = players.iter().map(|(entity, _)| *entity).collect();
        self.active_players
            .retain(|entity| live_players.contains(entity) && world.is_alive(*entity));
        for (entity, player) in players {
            let clip_key = player.clip.trim();
            if !player.playing || clip_key.is_empty() {
                self.active_players.remove(&entity);
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

            let delta = delta_seconds * player.speed;
            let just_started = self.active_players.insert(entity);
            if just_started {
                self.pending_events.extend(events_at_sample_time(
                    &clip,
                    entity,
                    player.time,
                    None,
                    1.0,
                ));
            }
            self.pending_events.extend(crossed_animation_events(
                &clip,
                entity,
                player.time,
                delta,
                None,
                1.0,
            ));
            let next_time = advance_player_time(player.time, delta, clip.duration, clip.wrap_mode);
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
                    self.active_players.remove(&entity);
                }
            }
        }

        failures
    }

    pub fn take_events(&mut self) -> Vec<RuntimeAnimationEvent> {
        std::mem::take(&mut self.pending_events)
    }

    fn update_animators(
        &mut self,
        world: &mut World,
        delta_seconds: f32,
    ) -> Vec<AnimationLoadFailure> {
        let animators: Vec<_> = world
            .iter_entities()
            .filter(|entity| world.entity_active(*entity))
            .filter_map(|entity| {
                world
                    .get_component::<Animator>(entity)
                    .cloned()
                    .map(|animator| (entity, animator))
            })
            .collect();
        let mut failures = Vec::new();

        for (entity, mut animator) in animators {
            let controller_key = animator.controller.trim();
            if controller_key.is_empty() {
                self.animator_instances.remove(&entity);
                self.active_animators.remove(&entity);
                continue;
            }
            let controller = match self.load_controller(controller_key) {
                Ok(controller) => controller,
                Err(error) => {
                    self.record_failure(entity, controller_key, error, &mut failures);
                    continue;
                }
            };
            self.reported_failures
                .retain(|(reported_asset, _)| reported_asset != controller_key);

            let requested_state = animator.current_state.trim();
            let previous_instance = self.animator_instances.remove(&entity);
            let mut entered_state = previous_instance.is_none();
            let mut instance = previous_instance.unwrap_or_else(|| {
                let state = controller
                    .state(requested_state)
                    .map(|state| state.name.clone())
                    .unwrap_or_else(|| controller.default_state.clone());
                AnimatorInstance {
                    controller: controller_key.to_owned(),
                    state,
                    state_time: 0.0,
                    transition: None,
                }
            });
            if instance.controller != controller_key {
                entered_state = true;
                instance = AnimatorInstance {
                    controller: controller_key.to_owned(),
                    state: controller.default_state.clone(),
                    state_time: 0.0,
                    transition: None,
                };
            } else if !requested_state.is_empty()
                && requested_state != instance.state
                && controller.state(requested_state).is_some()
            {
                entered_state = true;
                instance.state = requested_state.to_owned();
                instance.state_time = 0.0;
                instance.transition = None;
            }
            animator.current_state = instance.state.clone();
            if !animator.playing {
                self.active_animators.remove(&entity);
                if let Some(live) = world.get_component_mut::<Animator>(entity) {
                    live.current_state = animator.current_state;
                }
                self.animator_instances.insert(entity, instance);
                continue;
            }
            entered_state |= self.active_animators.insert(entity);

            let parameters = animator_parameters(&controller, &animator.parameters_json);
            let delta = delta_seconds * animator.speed;
            let mut consumed_triggers = Vec::new();
            let advanced_transition = instance.transition.is_some();

            if let Some(active) = instance.transition.as_mut() {
                let Some(source) = controller.state(&active.source_state) else {
                    instance.transition = None;
                    self.animator_instances.insert(entity, instance);
                    continue;
                };
                let Some(destination) = controller.state(&active.destination_state) else {
                    instance.transition = None;
                    self.animator_instances.insert(entity, instance);
                    continue;
                };
                active.source_time += delta * source.speed;
                active.destination_time += delta * destination.speed;
                active.elapsed += delta.abs();
            } else {
                let Some(state) = controller.state(&instance.state) else {
                    instance.state = controller.default_state.clone();
                    instance.state_time = 0.0;
                    self.animator_instances.insert(entity, instance);
                    continue;
                };
                let previous_state_time = instance.state_time;
                instance.state_time += delta * state.speed;
                let state_clip = match self.load_clip(&state.clip) {
                    Ok(clip) => clip,
                    Err(error) => {
                        self.record_failure(entity, &state.clip, error, &mut failures);
                        self.animator_instances.insert(entity, instance);
                        continue;
                    }
                };
                if entered_state {
                    self.pending_events.extend(events_at_sample_time(
                        &state_clip,
                        entity,
                        previous_state_time,
                        Some(&state.name),
                        1.0,
                    ));
                }
                self.pending_events.extend(crossed_animation_events(
                    &state_clip,
                    entity,
                    previous_state_time,
                    delta * state.speed,
                    Some(&state.name),
                    1.0,
                ));
                if let Some(transition) = select_transition(
                    &controller,
                    &instance.state,
                    instance.state_time,
                    state_clip.duration,
                    &parameters,
                    &mut consumed_triggers,
                ) {
                    if let Some(destination) = controller.state(&transition.to) {
                        if let Ok(destination_clip) = self.load_clip(&destination.clip) {
                            self.pending_events.extend(events_at_sample_time(
                                &destination_clip,
                                entity,
                                0.0,
                                Some(&destination.name),
                                if transition.duration <= f32::EPSILON {
                                    1.0
                                } else {
                                    0.0
                                },
                            ));
                        }
                    }
                    if transition.duration <= f32::EPSILON {
                        instance.state = transition.to.clone();
                        instance.state_time = 0.0;
                    } else {
                        instance.transition = Some(ActiveTransition {
                            source_state: instance.state.clone(),
                            source_time: instance.state_time,
                            destination_state: transition.to.clone(),
                            destination_time: 0.0,
                            elapsed: 0.0,
                            duration: transition.duration,
                        });
                    }
                }
            }

            let samples = if let Some(active) = instance.transition.as_ref() {
                let source = controller.state(&active.source_state).unwrap();
                let destination = controller.state(&active.destination_state).unwrap();
                let source_clip = match self.load_clip(&source.clip) {
                    Ok(clip) => clip,
                    Err(error) => {
                        self.record_failure(entity, &source.clip, error, &mut failures);
                        self.animator_instances.insert(entity, instance);
                        continue;
                    }
                };
                let destination_clip = match self.load_clip(&destination.clip) {
                    Ok(clip) => clip,
                    Err(error) => {
                        self.record_failure(entity, &destination.clip, error, &mut failures);
                        self.animator_instances.insert(entity, instance);
                        continue;
                    }
                };
                let amount = (active.elapsed / active.duration).clamp(0.0, 1.0);
                if advanced_transition {
                    self.pending_events.extend(crossed_animation_events(
                        &source_clip,
                        entity,
                        active.source_time - delta * source.speed,
                        delta * source.speed,
                        Some(&source.name),
                        1.0 - amount,
                    ));
                    self.pending_events.extend(crossed_animation_events(
                        &destination_clip,
                        entity,
                        active.destination_time - delta * destination.speed,
                        delta * destination.speed,
                        Some(&destination.name),
                        amount,
                    ));
                }
                blend_samples(
                    source_clip.sample(active.source_time),
                    destination_clip.sample(active.destination_time),
                    amount,
                )
            } else {
                let state = controller.state(&instance.state).unwrap();
                let clip = match self.load_clip(&state.clip) {
                    Ok(clip) => clip,
                    Err(error) => {
                        self.record_failure(entity, &state.clip, error, &mut failures);
                        self.animator_instances.insert(entity, instance);
                        continue;
                    }
                };
                clip.sample(instance.state_time)
            };
            apply_animation_samples(world, entity, samples);

            if instance
                .transition
                .as_ref()
                .is_some_and(|active| active.elapsed >= active.duration)
            {
                let active = instance.transition.take().unwrap();
                instance.state = active.destination_state;
                instance.state_time = active.destination_time;
            }
            animator.current_state = instance.state.clone();
            if !consumed_triggers.is_empty() {
                animator.parameters_json =
                    consume_trigger_parameters(&animator.parameters_json, &consumed_triggers);
            }
            if let Some(live) = world.get_component_mut::<Animator>(entity) {
                live.current_state = animator.current_state;
                live.parameters_json = animator.parameters_json;
            }
            self.animator_instances.insert(entity, instance);
        }
        failures
    }

    fn record_failure(
        &mut self,
        entity: Entity,
        asset: &str,
        error: String,
        failures: &mut Vec<AnimationLoadFailure>,
    ) {
        if self
            .reported_failures
            .insert((asset.to_owned(), error.clone()))
        {
            failures.push(AnimationLoadFailure {
                entity,
                clip: asset.to_owned(),
                error,
            });
        }
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

    fn load_controller(&mut self, key: &str) -> Result<Arc<AnimatorController>, String> {
        let root = self.project_root.as_deref().ok_or_else(|| {
            "runtime requires --project-root to resolve Animator Controllers".to_owned()
        })?;
        let path = resolve_project_asset_path(root, key).ok_or_else(|| {
            "Animator Controller path must be project-relative without '..'".to_owned()
        })?;
        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok();
        let reload = self
            .controllers
            .get(&path)
            .is_none_or(|cached| cached.modified != modified);
        if reload {
            let result = load_animator_controller(&path)
                .map(Arc::new)
                .map_err(|error| error.to_string());
            self.controllers
                .insert(path.clone(), CachedController { modified, result });
        }
        self.controllers
            .get(&path)
            .expect("animator controller cache inserted")
            .result
            .clone()
    }
}

type AnimatorParameters = HashMap<String, Value>;

fn animator_parameters(controller: &AnimatorController, json: &str) -> AnimatorParameters {
    let mut values = AnimatorParameters::new();
    for parameter in &controller.parameters {
        let value = match parameter.kind {
            AnimatorParameterKind::Bool | AnimatorParameterKind::Trigger => {
                Value::Bool(parameter.default_bool)
            }
            AnimatorParameterKind::Float => Number::from_f64(parameter.default_float as f64)
                .map(Value::Number)
                .unwrap_or(Value::Null),
            AnimatorParameterKind::Int => Value::Number(parameter.default_int.into()),
        };
        values.insert(parameter.name.clone(), value);
    }
    if let Ok(Value::Object(overrides)) = serde_json::from_str::<Value>(json) {
        for (name, value) in overrides {
            if controller.parameter(&name).is_some() && (value.is_boolean() || value.is_number()) {
                values.insert(name, value);
            }
        }
    }
    values
}

fn condition_matches(condition: &AnimatorCondition, values: &AnimatorParameters) -> bool {
    let value = values.get(&condition.parameter).unwrap_or(&Value::Null);
    match condition.mode {
        AnimatorConditionMode::If | AnimatorConditionMode::Trigger => {
            value.as_bool().unwrap_or(false)
        }
        AnimatorConditionMode::IfNot => !value.as_bool().unwrap_or(false),
        AnimatorConditionMode::Greater => value
            .as_f64()
            .is_some_and(|value| value > condition.threshold as f64),
        AnimatorConditionMode::Less => value
            .as_f64()
            .is_some_and(|value| value < condition.threshold as f64),
        AnimatorConditionMode::Equals => value
            .as_f64()
            .is_some_and(|value| (value - condition.threshold as f64).abs() <= f32::EPSILON as f64),
        AnimatorConditionMode::NotEqual => value
            .as_f64()
            .is_some_and(|value| (value - condition.threshold as f64).abs() > f32::EPSILON as f64),
    }
}

fn select_transition<'a>(
    controller: &'a AnimatorController,
    state: &str,
    state_time: f32,
    clip_duration: f32,
    parameters: &AnimatorParameters,
    consumed_triggers: &mut Vec<String>,
) -> Option<&'a mengine_assets::AnimatorTransition> {
    let normalized_time = if clip_duration > f32::EPSILON {
        state_time.max(0.0) / clip_duration
    } else {
        0.0
    };
    let transition = controller.transitions.iter().find(|transition| {
        (transition.from == state || transition.from == "*")
            && transition.to != state
            && (!transition.has_exit_time || normalized_time >= transition.exit_time)
            && transition
                .conditions
                .iter()
                .all(|condition| condition_matches(condition, parameters))
    })?;
    for condition in &transition.conditions {
        if condition.mode == AnimatorConditionMode::Trigger {
            consumed_triggers.push(condition.parameter.clone());
        }
    }
    Some(transition)
}

fn consume_trigger_parameters(json: &str, names: &[String]) -> String {
    let mut object = serde_json::from_str::<Value>(json)
        .ok()
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    for name in names {
        object.insert(name.clone(), Value::Bool(false));
    }
    Value::Object(object).to_string()
}

fn blend_animation_values(
    left: AnimationValue,
    right: AnimationValue,
    amount: f32,
) -> AnimationValue {
    let amount = amount.clamp(0.0, 1.0);
    match (left, right) {
        (AnimationValue::Float(left), AnimationValue::Float(right)) => {
            AnimationValue::Float(left + (right - left) * amount)
        }
        (AnimationValue::Vector(left), AnimationValue::Vector(right))
            if left.len() == right.len() =>
        {
            AnimationValue::Vector(
                left.into_iter()
                    .zip(right)
                    .map(|(left, right)| left + (right - left) * amount)
                    .collect(),
            )
        }
        (left, right) => {
            if amount < 0.5 {
                left
            } else {
                right
            }
        }
    }
}

fn blend_samples(
    source: Vec<mengine_assets::AnimationSample>,
    destination: Vec<mengine_assets::AnimationSample>,
    amount: f32,
) -> Vec<mengine_assets::AnimationSample> {
    let key = |sample: &mengine_assets::AnimationSample| {
        (
            sample.target.clone(),
            sample.component.clone(),
            sample.property.clone(),
        )
    };
    let destination_keys: HashSet<_> = destination.iter().map(&key).collect();
    let mut source_by_key = HashMap::new();
    for sample in &source {
        source_by_key.insert(key(sample), sample.value.clone());
    }
    let mut output: Vec<_> = source
        .into_iter()
        .filter(|sample| !destination_keys.contains(&key(sample)))
        .collect();
    for sample in destination {
        if let Some(previous) = source_by_key.get(&key(&sample)) {
            output.push(mengine_assets::AnimationSample {
                target: sample.target,
                component: sample.component,
                property: sample.property,
                value: blend_animation_values(previous.clone(), sample.value, amount),
            });
        } else {
            output.push(sample);
        }
    }
    output
}

fn apply_animation_samples(
    world: &mut World,
    entity: Entity,
    samples: Vec<mengine_assets::AnimationSample>,
) {
    for sample in samples {
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
}

const MAX_ANIMATION_EVENTS_PER_UPDATE: usize = 4096;
const MAX_EVENT_PERIODS_PER_UPDATE: f32 = 1024.0;

fn runtime_event(
    entity: Entity,
    event: &AnimationEvent,
    state: Option<&str>,
    weight: f32,
) -> RuntimeAnimationEvent {
    RuntimeAnimationEvent {
        entity,
        function: event.function.clone(),
        time: event.time,
        parameter: event.parameter.clone(),
        state: state.map(str::to_owned),
        weight: weight.clamp(0.0, 1.0),
    }
}

fn events_at_sample_time(
    clip: &AnimationClip,
    entity: Entity,
    time: f32,
    state: Option<&str>,
    weight: f32,
) -> Vec<RuntimeAnimationEvent> {
    let sample_time = clip.sample_time(time);
    clip.events
        .iter()
        .filter(|event| (event.time - sample_time).abs() <= 1.0e-5)
        .take(MAX_ANIMATION_EVENTS_PER_UPDATE)
        .map(|event| runtime_event(entity, event, state, weight))
        .collect()
}

fn crossed_animation_events(
    clip: &AnimationClip,
    entity: Entity,
    start: f32,
    delta: f32,
    state: Option<&str>,
    weight: f32,
) -> Vec<RuntimeAnimationEvent> {
    if clip.events.is_empty()
        || !start.is_finite()
        || !delta.is_finite()
        || delta.abs() <= f32::EPSILON
        || clip.duration <= f32::EPSILON
    {
        return Vec::new();
    }
    let period = match clip.wrap_mode {
        AnimationWrapMode::Once => None,
        AnimationWrapMode::Loop => Some(clip.duration),
        AnimationWrapMode::PingPong => Some(clip.duration * 2.0),
    };
    let bounded_delta = period
        .map(|period| {
            delta.clamp(
                -period * MAX_EVENT_PERIODS_PER_UPDATE,
                period * MAX_EVENT_PERIODS_PER_UPDATE,
            )
        })
        .unwrap_or(delta);
    let end = start + bounded_delta;
    let forward = end >= start;
    let crossed = |occurrence: f32| {
        if forward {
            occurrence > start && occurrence <= end
        } else {
            occurrence >= end && occurrence < start
        }
    };
    let mut occurrences: Vec<(f32, usize)> = Vec::new();
    for (index, event) in clip.events.iter().enumerate() {
        let offsets: Vec<f32> = match clip.wrap_mode {
            AnimationWrapMode::PingPong
                if event.time > f32::EPSILON
                    && (event.time - clip.duration).abs() > f32::EPSILON =>
            {
                vec![event.time, clip.duration * 2.0 - event.time]
            }
            _ => vec![event.time],
        };
        if let Some(period) = period {
            for offset in offsets {
                let min = start.min(end);
                let max = start.max(end);
                let first = ((min - offset) / period).floor() as i64 - 1;
                let last = ((max - offset) / period).ceil() as i64 + 1;
                for cycle in first..=last {
                    let occurrence = offset + cycle as f32 * period;
                    if crossed(occurrence) {
                        occurrences.push((occurrence, index));
                    }
                }
            }
        } else if crossed(event.time) {
            occurrences.push((event.time, index));
        }
    }
    occurrences.sort_by(|left, right| {
        let order = left
            .0
            .total_cmp(&right.0)
            .then_with(|| left.1.cmp(&right.1));
        if forward {
            order
        } else {
            order.reverse()
        }
    });
    occurrences
        .into_iter()
        .take(MAX_ANIMATION_EVENTS_PER_UPDATE)
        .map(|(_occurrence, index)| runtime_event(entity, &clip.events[index], state, weight))
        .collect()
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
    use mengine_core::generated::{AnimationPlayer, Animator, Transform};
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
    fn animation_events_cross_loops_reverse_and_ping_pong_turnarounds_in_order() {
        let clip = |wrap_mode| AnimationClip {
            duration: 1.0,
            wrap_mode,
            events: vec![
                AnimationEvent {
                    time: 0.1,
                    function: "Early".into(),
                    parameter: None,
                },
                AnimationEvent {
                    time: 0.9,
                    function: "Late".into(),
                    parameter: Some(AnimationValue::String("step".into())),
                },
            ],
            ..AnimationClip::default()
        };
        let entity = Entity::new(7, 1);
        let names = |events: Vec<RuntimeAnimationEvent>| {
            events
                .into_iter()
                .map(|event| event.function)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            names(crossed_animation_events(
                &clip(AnimationWrapMode::Loop),
                entity,
                0.8,
                0.4,
                None,
                1.0,
            )),
            ["Late", "Early"]
        );
        assert_eq!(
            names(crossed_animation_events(
                &clip(AnimationWrapMode::Loop),
                entity,
                0.2,
                -0.4,
                None,
                1.0,
            )),
            ["Early", "Late"]
        );
        assert_eq!(
            names(crossed_animation_events(
                &clip(AnimationWrapMode::PingPong),
                entity,
                0.8,
                0.4,
                Some("Run"),
                0.5,
            )),
            ["Late", "Late"]
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
              "events": [
                {"time":0,"function":"Started"},
                {"time":0.25,"function":"Quarter","parameter":"step"},
                {"time":1,"function":"Finished"}
              ],
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
        assert_eq!(
            runtime
                .take_events()
                .into_iter()
                .map(|event| event.function)
                .collect::<Vec<_>>(),
            ["Started", "Quarter"]
        );
        let transform = world.get_component::<Transform>(entity).unwrap();
        assert!((transform.position[0] - 5.0).abs() < 0.0001);
        assert_eq!(transform.scale, [1.0, 1.0, 1.0]);

        assert!(runtime.update(&mut world, 0.5).is_empty());
        assert_eq!(runtime.take_events()[0].function, "Finished");
        let player = world.get_component::<AnimationPlayer>(entity).unwrap();
        assert!(!player.playing);
        assert_eq!(player.time, 1.0);

        let player = world.get_component_mut::<AnimationPlayer>(entity).unwrap();
        player.time = 0.0;
        player.playing = true;
        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert_eq!(runtime.take_events()[0].function, "Started");
        fs::remove_dir_all(project).unwrap();
    }

    #[test]
    fn animator_emits_state_events_and_restarts_after_pause() {
        let project = temp_project();
        fs::write(
            project.join("Assets/Animations/idle.manim"),
            r#"{
              "name":"Idle","duration":1,"wrap_mode":"loop",
              "events":[{"time":0,"function":"EnterIdle"},{"time":0.5,"function":"IdlePulse"}],
              "tracks":[]
            }"#,
        )
        .unwrap();
        fs::write(
            project.join("Assets/Animations/idle.mcontroller"),
            r#"{
              "name":"Idle","default_state":"Idle","parameters":[],
              "states":[{"name":"Idle","clip":"Assets/Animations/idle.manim"}],
              "transitions":[]
            }"#,
        )
        .unwrap();
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(
            entity,
            Animator {
                controller: "Assets/Animations/idle.mcontroller".into(),
                playing: true,
                ..Animator::default()
            },
        );
        let mut runtime = AnimationRuntime::new(Some(project.clone()));
        assert!(runtime.update(&mut world, 0.5).is_empty());
        let events = runtime.take_events();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].function, "EnterIdle");
        assert_eq!(events[0].state.as_deref(), Some("Idle"));
        assert_eq!(events[1].function, "IdlePulse");

        world.get_component_mut::<Animator>(entity).unwrap().playing = false;
        runtime.update(&mut world, 0.1);
        assert!(runtime.take_events().is_empty());
        world.get_component_mut::<Animator>(entity).unwrap().playing = true;
        runtime.update(&mut world, 0.0);
        assert_eq!(runtime.take_events()[0].function, "IdlePulse");
        fs::remove_dir_all(project).unwrap();
    }

    fn write_constant_clip(project: &Path, name: &str, value: f32) {
        fs::write(
            project.join(format!("Assets/Animations/{name}.manim")),
            format!(
                r#"{{
                  "name":"{name}","duration":1,"wrap_mode":"loop",
                  "tracks":[{{
                    "target":".","component":"Transform","property":"position.x",
                    "keyframes":[{{"time":0,"value":{value}}},{{"time":1,"value":{value}}}]
                  }}]
                }}"#
            ),
        )
        .unwrap();
    }

    #[test]
    fn animator_transitions_blends_and_consumes_triggers() {
        let project = temp_project();
        write_constant_clip(&project, "idle", 0.0);
        write_constant_clip(&project, "run", 10.0);
        fs::write(
            project.join("Assets/Animations/hero.mcontroller"),
            r#"{
              "name":"Hero","default_state":"Idle",
              "parameters":[
                {"name":"Speed","kind":"float"},
                {"name":"Go","kind":"trigger"}
              ],
              "states":[
                {"name":"Idle","clip":"Assets/Animations/idle.manim"},
                {"name":"Run","clip":"Assets/Animations/run.manim"}
              ],
              "transitions":[{
                "from":"Idle","to":"Run","duration":0.5,
                "conditions":[{"parameter":"Speed","mode":"greater","threshold":0.1}]
              }]
            }"#,
        )
        .unwrap();

        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(entity, Transform::default());
        world.insert_component(
            entity,
            Animator {
                controller: "Assets/Animations/hero.mcontroller".into(),
                parameters_json: r#"{"Speed":1,"Go":true}"#.into(),
                ..Animator::default()
            },
        );
        let mut runtime = AnimationRuntime::new(Some(project.clone()));

        assert!(runtime.update(&mut world, 0.0).is_empty());
        assert_eq!(
            world
                .get_component::<Animator>(entity)
                .unwrap()
                .current_state,
            "Idle"
        );
        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert!(
            (world.get_component::<Transform>(entity).unwrap().position[0] - 5.0).abs() < 0.001
        );
        assert!(runtime.update(&mut world, 0.25).is_empty());
        assert_eq!(
            world
                .get_component::<Animator>(entity)
                .unwrap()
                .current_state,
            "Run"
        );
        assert!(
            (world.get_component::<Transform>(entity).unwrap().position[0] - 10.0).abs() < 0.001
        );

        let mut controller =
            load_animator_controller(project.join("Assets/Animations/hero.mcontroller")).unwrap();
        controller.transitions[0].conditions = vec![AnimatorCondition {
            parameter: "Go".into(),
            mode: AnimatorConditionMode::Trigger,
            threshold: 0.0,
        }];
        let parameters = animator_parameters(&controller, r#"{"Go":true}"#);
        let mut consumed = Vec::new();
        assert!(
            select_transition(&controller, "Idle", 0.0, 1.0, &parameters, &mut consumed,).is_some()
        );
        assert_eq!(consumed, ["Go"]);
        assert_eq!(
            consume_trigger_parameters(r#"{"Go":true}"#, &consumed),
            r#"{"Go":false}"#
        );
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
