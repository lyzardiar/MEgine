use crate::{AssetError, AssetError::Io};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

fn default_version() -> u32 {
    1
}

fn default_duration() -> f32 {
    5.0
}

fn default_frame_rate() -> f32 {
    60.0
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineSignal {
    pub time: f32,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimelineTrack {
    Signal {
        id: String,
        name: String,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        markers: Vec<TimelineSignal>,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineAsset {
    pub version: u32,
    #[serde(default)]
    pub name: String,
    pub duration: f32,
    #[serde(default = "default_frame_rate")]
    pub frame_rate: f32,
    #[serde(default)]
    pub tracks: Vec<TimelineTrack>,
}

impl Default for TimelineAsset {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            duration: default_duration(),
            frame_rate: default_frame_rate(),
            tracks: Vec::new(),
        }
    }
}

impl TimelineAsset {
    pub fn normalized(mut self) -> Result<Self, AssetError> {
        if self.version != default_version() {
            return Err(AssetError::Invalid(format!(
                "unsupported Timeline version {}",
                self.version
            )));
        }
        self.name = self.name.trim().to_owned();
        if !self.duration.is_finite() || self.duration <= 0.0 {
            return Err(AssetError::Invalid(
                "Timeline duration must be a finite positive number".into(),
            ));
        }
        if !self.frame_rate.is_finite() || self.frame_rate <= 0.0 {
            return Err(AssetError::Invalid(
                "Timeline frame_rate must be a finite positive number".into(),
            ));
        }

        let mut track_ids = HashSet::new();
        for track in &mut self.tracks {
            match track {
                TimelineTrack::Signal {
                    id, name, markers, ..
                } => {
                    *id = id.trim().to_owned();
                    *name = name.trim().to_owned();
                    if id.is_empty() || !track_ids.insert(id.clone()) {
                        return Err(AssetError::Invalid(
                            "Timeline track ids must be non-empty and unique".into(),
                        ));
                    }
                    if name.is_empty() {
                        return Err(AssetError::Invalid(format!(
                            "Timeline track '{id}' must have a name"
                        )));
                    }
                    for marker in markers.iter_mut() {
                        marker.name = marker.name.trim().to_owned();
                        if !marker.time.is_finite()
                            || marker.time < 0.0
                            || marker.time > self.duration
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline track '{id}' contains a marker outside its duration"
                            )));
                        }
                        if marker.name.is_empty() {
                            return Err(AssetError::Invalid(format!(
                                "Timeline track '{id}' contains an unnamed signal"
                            )));
                        }
                    }
                    markers.sort_by(|left, right| {
                        left.time
                            .total_cmp(&right.time)
                            .then_with(|| left.name.cmp(&right.name))
                    });
                }
            }
        }
        Ok(self)
    }
}

pub fn parse_timeline_asset(bytes: &[u8]) -> Result<TimelineAsset, AssetError> {
    serde_json::from_slice::<TimelineAsset>(bytes)?.normalized()
}

pub fn load_timeline_asset(path: impl AsRef<Path>) -> Result<TimelineAsset, AssetError> {
    let bytes = std::fs::read(path).map_err(Io)?;
    parse_timeline_asset(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_extensible_signal_tracks_and_sorts_markers() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"name":" Intro ","duration":3,"frame_rate":30,
              "tracks":[{"type":"signal","id":"gameplay","name":" Gameplay ","markers":[
                {"time":2,"name":"End","payload":{"score":10}},
                {"time":0.5,"name":" Start "}
              ]}]
            }"#,
        )
        .unwrap();
        assert_eq!(asset.name, "Intro");
        let TimelineTrack::Signal { name, markers, .. } = &asset.tracks[0];
        assert_eq!(name, "Gameplay");
        assert_eq!(markers[0].name, "Start");
        assert_eq!(markers[1].payload, Some(serde_json::json!({"score": 10})));
    }

    #[test]
    fn rejects_invalid_tracks_and_marker_times() {
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":1,"tracks":[{"type":"signal","id":"","name":"Signals"}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":1,"tracks":[{"type":"signal","id":"a","name":"Signals","markers":[{"time":2,"name":"Late"}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(br#"{"version":2,"duration":1}"#).is_err());
        assert!(parse_timeline_asset(br#"{"name":"Missing contract"}"#).is_err());
    }
}
