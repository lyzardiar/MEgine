use crate::{AssetError, AssetError::Io};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

fn default_version() -> u32 {
    4
}

fn default_state_speed() -> f32 {
    1.0
}

fn default_layer_weight() -> f32 {
    1.0
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimatorParameterKind {
    #[default]
    Bool,
    Float,
    Int,
    Trigger,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorParameter {
    pub name: String,
    pub kind: AnimatorParameterKind,
    pub default_bool: bool,
    pub default_float: f32,
    pub default_int: i32,
}

impl Default for AnimatorParameter {
    fn default() -> Self {
        Self {
            name: String::new(),
            kind: AnimatorParameterKind::Bool,
            default_bool: false,
            default_float: 0.0,
            default_int: 0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorState {
    pub name: String,
    pub clip: String,
    #[serde(default = "default_state_speed")]
    pub speed: f32,
    pub position: [f32; 2],
}

impl Default for AnimatorState {
    fn default() -> Self {
        Self {
            name: String::new(),
            clip: String::new(),
            speed: default_state_speed(),
            position: [0.0, 0.0],
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimatorConditionMode {
    #[default]
    If,
    IfNot,
    Greater,
    Less,
    Equals,
    NotEqual,
    Trigger,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorCondition {
    pub parameter: String,
    pub mode: AnimatorConditionMode,
    pub threshold: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorTransition {
    /// State name or `*` for Any State.
    pub from: String,
    pub to: String,
    pub duration: f32,
    pub has_exit_time: bool,
    /// Normalized source-state time. Values greater than 1 allow multiple loops.
    pub exit_time: f32,
    pub conditions: Vec<AnimatorCondition>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimatorLayerBlendMode {
    #[default]
    Override,
    Additive,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimatorLayerTimingMode {
    #[default]
    Synced,
    Independent,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorLayerMotion {
    /// State in the base state machine whose motion this layer overrides.
    pub state: String,
    pub clip: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorLayer {
    pub name: String,
    pub enabled: bool,
    #[serde(default = "default_layer_weight")]
    pub weight: f32,
    pub blend_mode: AnimatorLayerBlendMode,
    pub timing_mode: AnimatorLayerTimingMode,
    /// Optional reusable Avatar Mask asset. Its paths are unioned with `mask_paths`.
    pub avatar_mask: String,
    /// Relative target paths included by this layer. Empty means all targets.
    pub mask_paths: Vec<String>,
    /// Motions synchronized to states in the base state machine.
    pub motions: Vec<AnimatorLayerMotion>,
    /// State machine used when `timing_mode` is `independent`.
    pub default_state: String,
    pub states: Vec<AnimatorState>,
    pub transitions: Vec<AnimatorTransition>,
}

impl Default for AnimatorLayer {
    fn default() -> Self {
        Self {
            name: String::new(),
            enabled: true,
            weight: default_layer_weight(),
            blend_mode: AnimatorLayerBlendMode::Override,
            timing_mode: AnimatorLayerTimingMode::Synced,
            avatar_mask: String::new(),
            mask_paths: Vec::new(),
            motions: Vec::new(),
            default_state: String::new(),
            states: Vec::new(),
            transitions: Vec::new(),
        }
    }
}

impl AnimatorLayer {
    pub fn motion(&self, state: &str) -> Option<&AnimatorLayerMotion> {
        self.motions.iter().find(|motion| motion.state == state)
    }

    pub fn state(&self, name: &str) -> Option<&AnimatorState> {
        self.states.iter().find(|state| state.name == name)
    }
}

impl Default for AnimatorTransition {
    fn default() -> Self {
        Self {
            from: String::new(),
            to: String::new(),
            duration: 0.15,
            has_exit_time: false,
            exit_time: 1.0,
            conditions: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimatorController {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    pub default_state: String,
    pub parameters: Vec<AnimatorParameter>,
    pub states: Vec<AnimatorState>,
    pub transitions: Vec<AnimatorTransition>,
    /// Additional synchronized layers. The legacy state machine remains the base layer.
    pub layers: Vec<AnimatorLayer>,
}

impl Default for AnimatorController {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            default_state: String::new(),
            parameters: Vec::new(),
            states: Vec::new(),
            transitions: Vec::new(),
            layers: Vec::new(),
        }
    }
}

impl AnimatorController {
    pub fn normalized(mut self) -> Result<Self, AssetError> {
        if self.version < default_version() {
            self.version = default_version();
        }
        self.name = self.name.trim().to_owned();
        self.default_state = self.default_state.trim().to_owned();
        for parameter in &mut self.parameters {
            parameter.name = parameter.name.trim().to_owned();
            if !parameter.default_float.is_finite() {
                parameter.default_float = 0.0;
            }
        }
        for state in &mut self.states {
            state.name = state.name.trim().to_owned();
            state.clip = state.clip.trim().replace('\\', "/");
            if !state.speed.is_finite() {
                state.speed = default_state_speed();
            }
            for position in &mut state.position {
                if !position.is_finite() {
                    *position = 0.0;
                }
            }
        }
        for transition in &mut self.transitions {
            transition.from = transition.from.trim().to_owned();
            transition.to = transition.to.trim().to_owned();
            transition.duration = if transition.duration.is_finite() {
                transition.duration.max(0.0)
            } else {
                0.0
            };
            transition.exit_time = if transition.exit_time.is_finite() {
                transition.exit_time.max(0.0)
            } else {
                1.0
            };
            for condition in &mut transition.conditions {
                condition.parameter = condition.parameter.trim().to_owned();
                if !condition.threshold.is_finite() {
                    condition.threshold = 0.0;
                }
            }
        }
        for layer in &mut self.layers {
            layer.name = layer.name.trim().to_owned();
            layer.default_state = layer.default_state.trim().to_owned();
            layer.avatar_mask = layer.avatar_mask.trim().replace('\\', "/");
            layer.weight = if layer.weight.is_finite() {
                layer.weight.clamp(0.0, 1.0)
            } else {
                default_layer_weight()
            };
            let mut masks = HashSet::new();
            layer.mask_paths = layer
                .mask_paths
                .drain(..)
                .map(|path| normalize_mask_path(&path))
                .filter(|path| !path.is_empty() && masks.insert(path.clone()))
                .collect();
            for motion in &mut layer.motions {
                motion.state = motion.state.trim().to_owned();
                motion.clip = motion.clip.trim().replace('\\', "/");
            }
            for state in &mut layer.states {
                state.name = state.name.trim().to_owned();
                state.clip = state.clip.trim().replace('\\', "/");
                if !state.speed.is_finite() {
                    state.speed = default_state_speed();
                }
                for position in &mut state.position {
                    if !position.is_finite() {
                        *position = 0.0;
                    }
                }
            }
            for transition in &mut layer.transitions {
                transition.from = transition.from.trim().to_owned();
                transition.to = transition.to.trim().to_owned();
                transition.duration = if transition.duration.is_finite() {
                    transition.duration.max(0.0)
                } else {
                    0.0
                };
                transition.exit_time = if transition.exit_time.is_finite() {
                    transition.exit_time.max(0.0)
                } else {
                    1.0
                };
                for condition in &mut transition.conditions {
                    condition.parameter = condition.parameter.trim().to_owned();
                    if !condition.threshold.is_finite() {
                        condition.threshold = 0.0;
                    }
                }
            }
        }
        self.validate()?;
        Ok(self)
    }

    pub fn validate(&self) -> Result<(), AssetError> {
        if self.states.is_empty() {
            return Err(AssetError::Invalid(
                "Animator Controller needs at least one state".into(),
            ));
        }
        let mut state_names = HashSet::new();
        for state in &self.states {
            if state.name.is_empty() || state.clip.is_empty() {
                return Err(AssetError::Invalid(
                    "Animator states require non-empty names and clips".into(),
                ));
            }
            if !state_names.insert(state.name.as_str()) {
                return Err(AssetError::Invalid(format!(
                    "duplicate Animator state '{}'",
                    state.name
                )));
            }
        }
        if !state_names.contains(self.default_state.as_str()) {
            return Err(AssetError::Invalid(format!(
                "default Animator state '{}' does not exist",
                self.default_state
            )));
        }

        let mut parameter_names = HashSet::new();
        for parameter in &self.parameters {
            if parameter.name.is_empty() || !parameter_names.insert(parameter.name.as_str()) {
                return Err(AssetError::Invalid(format!(
                    "invalid or duplicate Animator parameter '{}'",
                    parameter.name
                )));
            }
        }
        for transition in &self.transitions {
            if transition.from != "*" && !state_names.contains(transition.from.as_str()) {
                return Err(AssetError::Invalid(format!(
                    "transition source state '{}' does not exist",
                    transition.from
                )));
            }
            if !state_names.contains(transition.to.as_str()) {
                return Err(AssetError::Invalid(format!(
                    "transition destination state '{}' does not exist",
                    transition.to
                )));
            }
            if transition.from == transition.to {
                return Err(AssetError::Invalid(format!(
                    "transition '{}' cannot target itself",
                    transition.from
                )));
            }
            for condition in &transition.conditions {
                validate_condition_parameter(self, condition)?;
            }
        }
        let mut layer_names = HashSet::new();
        for layer in &self.layers {
            if layer.name.is_empty() || !layer_names.insert(layer.name.as_str()) {
                return Err(AssetError::Invalid(format!(
                    "invalid or duplicate Animator layer '{}'",
                    layer.name
                )));
            }
            if layer
                .mask_paths
                .iter()
                .any(|path| path != "*" && path.split('/').any(|segment| segment == ".."))
            {
                return Err(AssetError::Invalid(format!(
                    "Animator layer '{}' contains an invalid Avatar Mask path",
                    layer.name
                )));
            }
            if !layer.avatar_mask.is_empty()
                && !layer.avatar_mask.to_ascii_lowercase().ends_with(".mavatar")
            {
                return Err(AssetError::Invalid(format!(
                    "Animator layer '{}' Avatar Mask must use the .mavatar extension",
                    layer.name
                )));
            }
            if layer.avatar_mask.split('/').any(|segment| segment == "..") {
                return Err(AssetError::Invalid(format!(
                    "Animator layer '{}' contains an unsafe Avatar Mask asset path",
                    layer.name
                )));
            }
            let mut layer_states = HashSet::new();
            if layer.timing_mode == AnimatorLayerTimingMode::Independent {
                if layer.states.is_empty() {
                    return Err(AssetError::Invalid(format!(
                        "independent Animator layer '{}' needs at least one state",
                        layer.name
                    )));
                }
                for state in &layer.states {
                    if state.name.is_empty() || state.clip.is_empty() {
                        return Err(AssetError::Invalid(format!(
                            "independent Animator layer '{}' states require names and clips",
                            layer.name
                        )));
                    }
                    if !layer_states.insert(state.name.as_str()) {
                        return Err(AssetError::Invalid(format!(
                            "independent Animator layer '{}' contains duplicate state '{}'",
                            layer.name, state.name
                        )));
                    }
                }
                if !layer_states.contains(layer.default_state.as_str()) {
                    return Err(AssetError::Invalid(format!(
                        "independent Animator layer '{}' default state '{}' does not exist",
                        layer.name, layer.default_state
                    )));
                }
                for transition in &layer.transitions {
                    if (transition.from != "*" && !layer_states.contains(transition.from.as_str()))
                        || !layer_states.contains(transition.to.as_str())
                    {
                        return Err(AssetError::Invalid(format!(
                            "independent Animator layer '{}' transition '{} -> {}' references a missing state",
                            layer.name, transition.from, transition.to
                        )));
                    }
                    if transition.from == transition.to {
                        return Err(AssetError::Invalid(format!(
                            "independent Animator layer '{}' state '{}' cannot target itself",
                            layer.name, transition.from
                        )));
                    }
                    for condition in &transition.conditions {
                        validate_condition_parameter(self, condition)?;
                    }
                }
                continue;
            }
            layer_states.clear();
            for motion in &layer.motions {
                if !state_names.contains(motion.state.as_str()) {
                    return Err(AssetError::Invalid(format!(
                        "Animator layer '{}' references unknown state '{}'",
                        layer.name, motion.state
                    )));
                }
                if motion.clip.is_empty() {
                    return Err(AssetError::Invalid(format!(
                        "Animator layer '{}' state '{}' requires a clip",
                        layer.name, motion.state
                    )));
                }
                if !layer_states.insert(motion.state.as_str()) {
                    return Err(AssetError::Invalid(format!(
                        "Animator layer '{}' contains duplicate state motion '{}'",
                        layer.name, motion.state
                    )));
                }
            }
        }
        Ok(())
    }

    pub fn state(&self, name: &str) -> Option<&AnimatorState> {
        self.states.iter().find(|state| state.name == name)
    }

    pub fn parameter(&self, name: &str) -> Option<&AnimatorParameter> {
        self.parameters
            .iter()
            .find(|parameter| parameter.name == name)
    }
}

fn validate_condition_parameter(
    controller: &AnimatorController,
    condition: &AnimatorCondition,
) -> Result<(), AssetError> {
    let Some(parameter) = controller.parameter(&condition.parameter) else {
        return Err(AssetError::Invalid(format!(
            "transition references unknown parameter '{}'",
            condition.parameter
        )));
    };
    let compatible = match condition.mode {
        AnimatorConditionMode::If | AnimatorConditionMode::IfNot => {
            parameter.kind == AnimatorParameterKind::Bool
        }
        AnimatorConditionMode::Trigger => parameter.kind == AnimatorParameterKind::Trigger,
        AnimatorConditionMode::Greater
        | AnimatorConditionMode::Less
        | AnimatorConditionMode::Equals
        | AnimatorConditionMode::NotEqual => matches!(
            parameter.kind,
            AnimatorParameterKind::Float | AnimatorParameterKind::Int
        ),
    };
    if !compatible {
        return Err(AssetError::Invalid(format!(
            "condition mode {:?} is incompatible with parameter '{}' ({:?})",
            condition.mode, condition.parameter, parameter.kind
        )));
    }
    Ok(())
}

fn normalize_mask_path(path: &str) -> String {
    let path = path.trim().replace('\\', "/");
    let path = path.trim_matches('/');
    if path.is_empty() || path == "." || path == "*" {
        path.to_owned()
    } else {
        path.split('/')
            .map(str::trim)
            .filter(|segment| !segment.is_empty() && *segment != ".")
            .collect::<Vec<_>>()
            .join("/")
    }
}

pub fn parse_animator_controller(bytes: &[u8]) -> Result<AnimatorController, AssetError> {
    serde_json::from_slice::<AnimatorController>(bytes)?.normalized()
}

pub fn load_animator_controller(path: impl AsRef<Path>) -> Result<AnimatorController, AssetError> {
    let bytes = std::fs::read(path).map_err(Io)?;
    parse_animator_controller(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn controller_normalizes_and_validates_references() {
        let controller = parse_animator_controller(
            br#"{
              "version":1,
              "name":"Hero", "default_state":"Idle",
              "parameters":[{"name":"Speed","kind":"float"}],
              "states":[
                {"name":"Idle","clip":"Assets\\Animations\\idle.manim"},
                {"name":"Run","clip":"Assets/Animations/run.manim","speed":2}
              ],
              "transitions":[{
                "from":"Idle","to":"Run","duration":-1,
                "conditions":[{"parameter":"Speed","mode":"greater","threshold":0.1}]
              }]
            }"#,
        )
        .unwrap();
        assert_eq!(controller.version, 4);
        assert_eq!(controller.states[0].clip, "Assets/Animations/idle.manim");
        assert_eq!(controller.states[0].position, [0.0, 0.0]);
        assert_eq!(controller.transitions[0].duration, 0.0);
    }

    #[test]
    fn controller_rejects_broken_graphs() {
        let error = parse_animator_controller(
            br#"{
              "default_state":"Idle",
              "states":[{"name":"Idle","clip":"idle.manim"}],
              "transitions":[{"from":"Idle","to":"Missing"}]
            }"#,
        )
        .unwrap_err();
        assert!(error.to_string().contains("Missing"));
    }

    #[test]
    fn controller_normalizes_and_validates_synced_layers() {
        let controller = parse_animator_controller(
            br#"{
              "version":2,
              "default_state":"Idle",
              "states":[
                {"name":"Idle","clip":"Assets/Animations/idle.manim"},
                {"name":"Run","clip":"Assets/Animations/run.manim"}
              ],
              "layers":[{
                "name":" Upper Body ","weight":4,"blend_mode":"additive",
                "mask_paths":[" Rig\\Spine ","Rig/Spine/","Rig/Spine"],
                "motions":[{"state":"Run","clip":"Assets\\Animations\\wave.manim"}]
              }]
            }"#,
        )
        .unwrap();
        assert_eq!(controller.layers[0].name, "Upper Body");
        assert_eq!(controller.layers[0].weight, 1.0);
        assert_eq!(controller.layers[0].mask_paths, ["Rig/Spine"]);
        assert_eq!(
            controller.layers[0].motions[0].clip,
            "Assets/Animations/wave.manim"
        );
        let mut invalid_mask = controller.clone();
        invalid_mask.layers[0].mask_paths = vec!["../Rig".into()];
        assert!(invalid_mask
            .validate()
            .unwrap_err()
            .to_string()
            .contains("Avatar Mask"));
        let mut invalid_asset = controller.clone();
        invalid_asset.layers[0].avatar_mask = "../Outside.mavatar".into();
        assert!(invalid_asset
            .validate()
            .unwrap_err()
            .to_string()
            .contains("unsafe Avatar Mask"));

        let error = parse_animator_controller(
            br#"{
              "default_state":"Idle",
              "states":[{"name":"Idle","clip":"idle.manim"}],
              "layers":[{"name":"Upper","motions":[{"state":"Missing","clip":"wave.manim"}]}]
            }"#,
        )
        .unwrap_err();
        assert!(error.to_string().contains("unknown state 'Missing'"));
    }

    #[test]
    fn controller_validates_independent_layer_state_machines() {
        let controller = parse_animator_controller(
            br#"{
              "version":4,"default_state":"Idle",
              "parameters":[{"name":"Wave","kind":"bool"}],
              "states":[{"name":"Idle","clip":"idle.manim"}],
              "layers":[{
                "name":"Upper","timing_mode":"independent","default_state":"Rest",
                "states":[
                  {"name":"Rest","clip":"rest.manim"},
                  {"name":"Wave","clip":"wave.manim"}
                ],
                "transitions":[{
                  "from":"Rest","to":"Wave","duration":0.2,
                  "conditions":[{"parameter":"Wave","mode":"if"}]
                }]
              }]
            }"#,
        )
        .unwrap();
        assert_eq!(
            controller.layers[0].timing_mode,
            AnimatorLayerTimingMode::Independent
        );
        assert_eq!(
            controller.layers[0].state("Wave").unwrap().clip,
            "wave.manim"
        );

        let mut invalid = controller;
        invalid.layers[0].default_state = "Missing".into();
        assert!(invalid
            .validate()
            .unwrap_err()
            .to_string()
            .contains("default state 'Missing'"));
    }
}
