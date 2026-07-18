use crate::{AssetError, AssetError::Io};
use serde::{Deserialize, Serialize};
use std::path::Path;

fn default_version() -> u32 {
    1
}

fn default_frame_rate() -> f32 {
    60.0
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationWrapMode {
    Once,
    #[default]
    Loop,
    PingPong,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationInterpolation {
    Step,
    #[default]
    Linear,
    Smooth,
    Cubic,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnimationValue {
    Bool(bool),
    Float(f32),
    Vector(Vec<f32>),
    String(String),
}

impl AnimationValue {
    fn is_valid(&self) -> bool {
        match self {
            Self::Float(value) => value.is_finite(),
            Self::Vector(values) => {
                !values.is_empty() && values.iter().all(|value| value.is_finite())
            }
            Self::Bool(_) | Self::String(_) => true,
        }
    }

    fn interpolate(&self, next: &Self, amount: f32) -> Self {
        if amount >= 1.0 {
            return next.clone();
        }
        match (self, next) {
            (Self::Float(left), Self::Float(right)) => Self::Float(left + (right - left) * amount),
            (Self::Vector(left), Self::Vector(right)) if left.len() == right.len() => Self::Vector(
                left.iter()
                    .zip(right)
                    .map(|(left, right)| left + (right - left) * amount)
                    .collect(),
            ),
            _ => self.clone(),
        }
    }

    fn is_tangent_for(&self, value: &Self) -> bool {
        match (self, value) {
            (Self::Float(tangent), Self::Float(_)) => tangent.is_finite(),
            (Self::Vector(tangent), Self::Vector(value)) => {
                tangent.len() == value.len() && tangent.iter().all(|part| part.is_finite())
            }
            _ => false,
        }
    }

    fn slope(left: &Self, right: &Self, span: f32) -> Option<Self> {
        if !span.is_finite() || span <= f32::EPSILON {
            return None;
        }
        match (left, right) {
            (Self::Float(left), Self::Float(right)) => Some(Self::Float((right - left) / span)),
            (Self::Vector(left), Self::Vector(right)) if left.len() == right.len() => {
                Some(Self::Vector(
                    left.iter()
                        .zip(right)
                        .map(|(left, right)| (right - left) / span)
                        .collect(),
                ))
            }
            _ => None,
        }
    }

    fn cubic(
        &self,
        next: &Self,
        out_tangent: &Self,
        in_tangent: &Self,
        span: f32,
        amount: f32,
    ) -> Self {
        let amount2 = amount * amount;
        let amount3 = amount2 * amount;
        let h00 = 2.0 * amount3 - 3.0 * amount2 + 1.0;
        let h10 = amount3 - 2.0 * amount2 + amount;
        let h01 = -2.0 * amount3 + 3.0 * amount2;
        let h11 = amount3 - amount2;
        match (self, next, out_tangent, in_tangent) {
            (Self::Float(left), Self::Float(right), Self::Float(out), Self::Float(input)) => {
                Self::Float(h00 * left + h10 * span * out + h01 * right + h11 * span * input)
            }
            (Self::Vector(left), Self::Vector(right), Self::Vector(out), Self::Vector(input))
                if left.len() == right.len()
                    && left.len() == out.len()
                    && left.len() == input.len() =>
            {
                Self::Vector(
                    left.iter()
                        .zip(right)
                        .zip(out)
                        .zip(input)
                        .map(|(((left, right), out), input)| {
                            h00 * left + h10 * span * out + h01 * right + h11 * span * input
                        })
                        .collect(),
                )
            }
            _ => self.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AnimationKeyframe {
    pub time: f32,
    pub value: AnimationValue,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "inTangent")]
    pub in_tangent: Option<AnimationValue>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "outTangent")]
    pub out_tangent: Option<AnimationValue>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AnimationEvent {
    pub time: f32,
    #[serde(alias = "name")]
    pub function: String,
    #[serde(default)]
    pub parameter: Option<AnimationValue>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimationTrack {
    pub target: String,
    pub component: String,
    pub property: String,
    pub interpolation: AnimationInterpolation,
    pub keyframes: Vec<AnimationKeyframe>,
}

impl Default for AnimationTrack {
    fn default() -> Self {
        Self {
            target: ".".into(),
            component: String::new(),
            property: String::new(),
            interpolation: AnimationInterpolation::Linear,
            keyframes: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AnimationClip {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    pub duration: f32,
    #[serde(default = "default_frame_rate")]
    pub frame_rate: f32,
    pub wrap_mode: AnimationWrapMode,
    pub events: Vec<AnimationEvent>,
    pub tracks: Vec<AnimationTrack>,
}

impl Default for AnimationClip {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            duration: 0.0,
            frame_rate: default_frame_rate(),
            wrap_mode: AnimationWrapMode::Loop,
            events: Vec::new(),
            tracks: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AnimationSample {
    pub target: String,
    pub component: String,
    pub property: String,
    pub value: AnimationValue,
}

impl AnimationClip {
    pub fn normalized(mut self) -> Self {
        if self.version == 0 {
            self.version = default_version();
        }
        if !self.frame_rate.is_finite() || self.frame_rate <= 0.0 {
            self.frame_rate = default_frame_rate();
        }
        self.tracks.retain(|track| {
            !track.component.trim().is_empty() && !track.property.trim().is_empty()
        });
        let mut max_time = 0.0_f32;
        self.events.retain(|event| {
            event.time.is_finite()
                && !event.function.trim().is_empty()
                && event
                    .parameter
                    .as_ref()
                    .is_none_or(AnimationValue::is_valid)
        });
        for event in &mut self.events {
            event.time = event.time.max(0.0);
            event.function = event.function.trim().to_owned();
            max_time = max_time.max(event.time);
        }
        self.events.sort_by(|left, right| {
            left.time
                .total_cmp(&right.time)
                .then_with(|| left.function.cmp(&right.function))
        });
        for track in &mut self.tracks {
            if track.target.trim().is_empty() {
                track.target = ".".into();
            }
            track
                .keyframes
                .retain(|key| key.time.is_finite() && key.value.is_valid());
            for key in &mut track.keyframes {
                key.time = key.time.max(0.0);
                key.in_tangent = key
                    .in_tangent
                    .take()
                    .filter(|tangent| tangent.is_tangent_for(&key.value));
                key.out_tangent = key
                    .out_tangent
                    .take()
                    .filter(|tangent| tangent.is_tangent_for(&key.value));
            }
            track
                .keyframes
                .sort_by(|left, right| left.time.total_cmp(&right.time));
            let mut deduplicated: Vec<AnimationKeyframe> = Vec::new();
            for key in track.keyframes.drain(..) {
                if deduplicated
                    .last()
                    .is_some_and(|previous| previous.time == key.time)
                {
                    *deduplicated.last_mut().unwrap() = key;
                } else {
                    deduplicated.push(key);
                }
            }
            if let Some(last) = deduplicated.last() {
                max_time = max_time.max(last.time);
            }
            track.keyframes = deduplicated;
        }
        self.duration = if self.duration.is_finite() {
            self.duration.max(0.0).max(max_time)
        } else {
            max_time
        };
        self
    }

    pub fn sample_time(&self, time: f32) -> f32 {
        wrapped_animation_time(time, self.duration, self.wrap_mode)
    }

    pub fn sample(&self, time: f32) -> Vec<AnimationSample> {
        let time = self.sample_time(time);
        self.tracks
            .iter()
            .filter_map(|track| {
                sample_track(track, time).map(|value| AnimationSample {
                    target: track.target.clone(),
                    component: track.component.clone(),
                    property: track.property.clone(),
                    value,
                })
            })
            .collect()
    }
}

pub fn wrapped_animation_time(time: f32, duration: f32, mode: AnimationWrapMode) -> f32 {
    if !time.is_finite() || !duration.is_finite() || duration <= 0.0 {
        return 0.0;
    }
    match mode {
        AnimationWrapMode::Once => time.clamp(0.0, duration),
        AnimationWrapMode::Loop => time.rem_euclid(duration),
        AnimationWrapMode::PingPong => {
            let period = duration * 2.0;
            let wrapped = time.rem_euclid(period);
            if wrapped <= duration {
                wrapped
            } else {
                period - wrapped
            }
        }
    }
}

pub fn sample_track(track: &AnimationTrack, time: f32) -> Option<AnimationValue> {
    let first = track.keyframes.first()?;
    if time <= first.time {
        return Some(first.value.clone());
    }
    for (pair_index, pair) in track.keyframes.windows(2).enumerate() {
        let left = &pair[0];
        let right = &pair[1];
        if time > right.time {
            continue;
        }
        let span = right.time - left.time;
        let mut amount = if span > f32::EPSILON {
            ((time - left.time) / span).clamp(0.0, 1.0)
        } else {
            1.0
        };
        if amount >= 1.0 {
            return Some(right.value.clone());
        }
        amount = match track.interpolation {
            AnimationInterpolation::Step => 0.0,
            AnimationInterpolation::Linear => amount,
            AnimationInterpolation::Smooth => amount * amount * (3.0 - 2.0 * amount),
            AnimationInterpolation::Cubic => {
                let fallback = AnimationValue::slope(&left.value, &right.value, span);
                let out_tangent = left
                    .out_tangent
                    .as_ref()
                    .filter(|tangent| tangent.is_tangent_for(&left.value))
                    .cloned()
                    .or_else(|| automatic_tangent(track, pair_index))
                    .or_else(|| fallback.clone());
                let in_tangent = right
                    .in_tangent
                    .as_ref()
                    .filter(|tangent| tangent.is_tangent_for(&right.value))
                    .cloned()
                    .or_else(|| automatic_tangent(track, pair_index + 1))
                    .or(fallback);
                if let (Some(out_tangent), Some(in_tangent)) = (out_tangent, in_tangent) {
                    return Some(left.value.cubic(
                        &right.value,
                        &out_tangent,
                        &in_tangent,
                        span,
                        amount,
                    ));
                }
                amount
            }
        };
        return Some(left.value.interpolate(&right.value, amount));
    }
    track.keyframes.last().map(|key| key.value.clone())
}

fn automatic_tangent(track: &AnimationTrack, key_index: usize) -> Option<AnimationValue> {
    let key = track.keyframes.get(key_index)?;
    match &key.value {
        AnimationValue::Float(_) | AnimationValue::Vector(_) => {}
        AnimationValue::Bool(_) | AnimationValue::String(_) => return None,
    }
    let left = &track.keyframes[key_index.saturating_sub(1)];
    let right = &track.keyframes[(key_index + 1).min(track.keyframes.len() - 1)];
    if std::ptr::eq(left, right) {
        return match &key.value {
            AnimationValue::Float(_) => Some(AnimationValue::Float(0.0)),
            AnimationValue::Vector(value) => Some(AnimationValue::Vector(vec![0.0; value.len()])),
            AnimationValue::Bool(_) | AnimationValue::String(_) => None,
        };
    }
    AnimationValue::slope(&left.value, &right.value, right.time - left.time)
}

pub fn parse_animation_clip(bytes: &[u8]) -> Result<AnimationClip, AssetError> {
    Ok(serde_json::from_slice::<AnimationClip>(bytes)?.normalized())
}

pub fn load_animation_clip(path: impl AsRef<Path>) -> Result<AnimationClip, AssetError> {
    let bytes = std::fs::read(path).map_err(Io)?;
    parse_animation_clip(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn float_track(interpolation: AnimationInterpolation) -> AnimationTrack {
        AnimationTrack {
            target: ".".into(),
            component: "Transform".into(),
            property: "position.x".into(),
            interpolation,
            keyframes: vec![
                AnimationKeyframe {
                    time: 0.0,
                    value: AnimationValue::Float(0.0),
                    in_tangent: None,
                    out_tangent: None,
                },
                AnimationKeyframe {
                    time: 2.0,
                    value: AnimationValue::Float(10.0),
                    in_tangent: None,
                    out_tangent: None,
                },
            ],
        }
    }

    #[test]
    fn wrap_modes_are_deterministic_for_positive_and_negative_time() {
        assert_eq!(
            wrapped_animation_time(2.5, 2.0, AnimationWrapMode::Once),
            2.0
        );
        assert_eq!(
            wrapped_animation_time(2.5, 2.0, AnimationWrapMode::Loop),
            0.5
        );
        assert_eq!(
            wrapped_animation_time(-0.5, 2.0, AnimationWrapMode::Loop),
            1.5
        );
        assert_eq!(
            wrapped_animation_time(2.5, 2.0, AnimationWrapMode::PingPong),
            1.5
        );
        assert_eq!(
            wrapped_animation_time(4.5, 2.0, AnimationWrapMode::PingPong),
            0.5
        );
    }

    #[test]
    fn scalar_vector_and_discrete_tracks_sample_expected_values() {
        assert_eq!(
            sample_track(&float_track(AnimationInterpolation::Linear), 0.5),
            Some(AnimationValue::Float(2.5))
        );
        assert_eq!(
            sample_track(&float_track(AnimationInterpolation::Step), 1.5),
            Some(AnimationValue::Float(0.0))
        );
        assert_eq!(
            sample_track(&float_track(AnimationInterpolation::Smooth), 0.5),
            Some(AnimationValue::Float(1.5625))
        );

        let vector = AnimationTrack {
            keyframes: vec![
                AnimationKeyframe {
                    time: 0.0,
                    value: AnimationValue::Vector(vec![0.0, 2.0]),
                    in_tangent: None,
                    out_tangent: None,
                },
                AnimationKeyframe {
                    time: 1.0,
                    value: AnimationValue::Vector(vec![2.0, 4.0]),
                    in_tangent: None,
                    out_tangent: None,
                },
            ],
            ..float_track(AnimationInterpolation::Linear)
        };
        assert_eq!(
            sample_track(&vector, 0.5),
            Some(AnimationValue::Vector(vec![1.0, 3.0]))
        );

        let discrete = AnimationTrack {
            keyframes: vec![
                AnimationKeyframe {
                    time: 0.0,
                    value: AnimationValue::Bool(false),
                    in_tangent: None,
                    out_tangent: None,
                },
                AnimationKeyframe {
                    time: 1.0,
                    value: AnimationValue::Bool(true),
                    in_tangent: None,
                    out_tangent: None,
                },
            ],
            ..float_track(AnimationInterpolation::Linear)
        };
        assert_eq!(
            sample_track(&discrete, 0.75),
            Some(AnimationValue::Bool(false))
        );
        assert_eq!(
            sample_track(&discrete, 1.0),
            Some(AnimationValue::Bool(true))
        );
    }

    #[test]
    fn cubic_tracks_support_automatic_and_authored_hermite_tangents() {
        let mut track = float_track(AnimationInterpolation::Cubic);
        track.keyframes = vec![
            AnimationKeyframe {
                time: 0.0,
                value: AnimationValue::Float(0.0),
                in_tangent: None,
                out_tangent: None,
            },
            AnimationKeyframe {
                time: 1.0,
                value: AnimationValue::Float(1.0),
                in_tangent: None,
                out_tangent: None,
            },
            AnimationKeyframe {
                time: 2.0,
                value: AnimationValue::Float(0.0),
                in_tangent: None,
                out_tangent: None,
            },
        ];
        assert_eq!(
            sample_track(&track, 0.5),
            Some(AnimationValue::Float(0.625))
        );
        track.keyframes[0].out_tangent = Some(AnimationValue::Float(0.0));
        track.keyframes[1].in_tangent = Some(AnimationValue::Float(0.0));
        assert_eq!(sample_track(&track, 0.5), Some(AnimationValue::Float(0.5)));

        let vector = AnimationTrack {
            interpolation: AnimationInterpolation::Cubic,
            keyframes: vec![
                AnimationKeyframe {
                    time: 0.0,
                    value: AnimationValue::Vector(vec![0.0, 2.0]),
                    in_tangent: None,
                    out_tangent: Some(AnimationValue::Vector(vec![0.0, 0.0])),
                },
                AnimationKeyframe {
                    time: 1.0,
                    value: AnimationValue::Vector(vec![2.0, 4.0]),
                    in_tangent: Some(AnimationValue::Vector(vec![0.0, 0.0])),
                    out_tangent: None,
                },
            ],
            ..float_track(AnimationInterpolation::Linear)
        };
        assert_eq!(
            sample_track(&vector, 0.5),
            Some(AnimationValue::Vector(vec![1.0, 3.0]))
        );
    }

    #[test]
    fn parsing_normalizes_invalid_metadata_key_order_and_duplicates() {
        let clip = parse_animation_clip(
            br#"{
            "version": 0,
            "name": "Move",
            "duration": 1,
            "frame_rate": 0,
            "wrap_mode": "once",
            "events": [
                {"time": 0.5, "name": "Footstep", "parameter": "left"},
                {"time": -2, "function": "Start"},
                {"time": 1, "function": ""}
            ],
            "tracks": [{
                "target": "",
                "component": "Transform",
                "property": "position.x",
                "interpolation": "linear",
                "keyframes": [
                    {"time": 2, "value": 2},
                    {"time": 0, "value": 0},
                    {"time": 2, "value": 3, "in_tangent": [4]}
                ]
            }]
        }"#,
        )
        .unwrap();
        assert_eq!(clip.version, 1);
        assert_eq!(clip.frame_rate, 60.0);
        assert_eq!(clip.duration, 2.0);
        assert_eq!(clip.events.len(), 2);
        assert_eq!(clip.events[0].function, "Start");
        assert_eq!(clip.events[0].time, 0.0);
        assert_eq!(clip.events[1].function, "Footstep");
        assert_eq!(
            clip.events[1].parameter,
            Some(AnimationValue::String("left".into()))
        );
        assert_eq!(clip.tracks[0].target, ".");
        assert_eq!(clip.tracks[0].keyframes.len(), 2);
        assert_eq!(
            clip.tracks[0].keyframes[1].value,
            AnimationValue::Float(3.0)
        );
        assert_eq!(clip.tracks[0].keyframes[1].in_tangent, None);
    }
}
