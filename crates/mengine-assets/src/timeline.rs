use crate::{AssetError, AssetError::Io};
use mengine_core::Entity;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::Path;

pub const MAX_TIMELINE_PARTICLE_TIME: f32 = 300.0;
pub const MAX_TIMELINE_BINDINGS: usize = 256;
pub const MAX_TIMELINE_CONTROL_BINDING_OVERRIDES: usize = 256;
const TIMELINE_ANIMATION_OVERLAP_EPSILON: f32 = 0.0001;

fn animation_crossfades_are_valid(clips: &[TimelineAnimationClip]) -> bool {
    for index in 1..clips.len() {
        let previous = &clips[index - 1];
        let current = &clips[index];
        let overlap = previous.start + previous.duration - current.start;
        if overlap > TIMELINE_ANIMATION_OVERLAP_EPSILON
            && (current.start <= previous.start + TIMELINE_ANIMATION_OVERLAP_EPSILON
                || overlap > current.blend_in + TIMELINE_ANIMATION_OVERLAP_EPSILON)
        {
            return false;
        }
        if index > 1
            && clips[index - 2].start + clips[index - 2].duration
                > current.start + TIMELINE_ANIMATION_OVERLAP_EPSILON
        {
            return false;
        }
    }
    true
}

fn default_version() -> u32 {
    1
}

fn default_duration() -> f32 {
    5.0
}

fn default_frame_rate() -> f32 {
    60.0
}

fn default_one() -> f32 {
    1.0
}

fn default_blend_curve() -> String {
    "ease_in_out".to_owned()
}

fn default_audio_fade_curve() -> String {
    "linear".to_owned()
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimelineEntityBinding {
    /// Decimal `Entity::to_u64()` value. A string keeps the full u64 intact in WebView JSON.
    pub entity: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub name: String,
    /// Set during scene reconstruction when the authored entity no longer exists.
    #[serde(default, skip_serializing_if = "is_false")]
    pub missing: bool,
}

impl TimelineEntityBinding {
    pub fn resolved_entity(&self) -> Result<Entity, AssetError> {
        let raw = self.entity.trim();
        let value = raw.parse::<u64>().map_err(|_| {
            AssetError::Invalid(format!(
                "Timeline binding entity '{raw}' must be an unsigned decimal id"
            ))
        })?;
        let entity = Entity::from_u64(value);
        if !entity.is_valid() {
            return Err(AssetError::Invalid(format!(
                "Timeline binding entity '{raw}' is invalid"
            )));
        }
        Ok(entity)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimelineBindingTable {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub bindings: BTreeMap<String, TimelineEntityBinding>,
}

impl Default for TimelineBindingTable {
    fn default() -> Self {
        Self {
            version: default_version(),
            bindings: BTreeMap::new(),
        }
    }
}

impl TimelineBindingTable {
    pub fn normalized(mut self) -> Result<Self, AssetError> {
        if self.version != default_version() {
            return Err(AssetError::Invalid(format!(
                "unsupported Timeline binding table version {}",
                self.version
            )));
        }
        if self.bindings.len() > MAX_TIMELINE_BINDINGS {
            return Err(AssetError::Invalid(format!(
                "Timeline binding table exceeds {MAX_TIMELINE_BINDINGS} entries"
            )));
        }

        let mut normalized = BTreeMap::new();
        for (target, mut binding) in self.bindings {
            let target = normalize_timeline_target(&target).ok_or_else(|| {
                AssetError::Invalid(format!(
                    "Timeline binding target '{target}' is not a portable descendant path"
                ))
            })?;
            binding.entity = binding.resolved_entity()?.to_u64().to_string();
            binding.name = binding.name.trim().chars().take(256).collect();
            if normalized.insert(target.clone(), binding).is_some() {
                return Err(AssetError::Invalid(format!(
                    "Timeline binding target '{target}' is duplicated after normalization"
                )));
            }
        }
        self.bindings = normalized;
        Ok(self)
    }

    /// Remaps scene-authored entity ids after a world snapshot is reconstructed.
    pub fn remap_entities(&mut self, entity_map: &HashMap<u64, Entity>) {
        for binding in self.bindings.values_mut() {
            let Ok(old_id) = binding.entity.parse::<u64>() else {
                continue;
            };
            if let Some(entity) = entity_map.get(&old_id) {
                binding.entity = entity.to_u64().to_string();
                binding.missing = false;
            } else {
                // Never let an old generation-zero id accidentally resolve to a newly
                // allocated entity that reused the same slot during reconstruction.
                binding.missing = true;
            }
        }
    }
}

pub fn parse_timeline_binding_table(raw: &str) -> Result<TimelineBindingTable, AssetError> {
    if raw.trim().is_empty() {
        return Ok(TimelineBindingTable::default());
    }
    serde_json::from_str::<TimelineBindingTable>(raw)?.normalized()
}

pub fn serialize_timeline_binding_table(table: TimelineBindingTable) -> Result<String, AssetError> {
    Ok(serde_json::to_string(&table.normalized()?)?)
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineSignal {
    pub time: f32,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineActivationClip {
    pub start: f32,
    pub duration: f32,
    pub active: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineAudioClip {
    pub start: f32,
    pub duration: f32,
    pub clip: String,
    #[serde(default)]
    pub clip_in: f32,
    #[serde(default = "default_one")]
    pub volume: f32,
    #[serde(default = "default_one")]
    pub pitch: f32,
    #[serde(default)]
    pub looped: bool,
    #[serde(default)]
    pub fade_in: f32,
    #[serde(default)]
    pub fade_out: f32,
    #[serde(default = "default_audio_fade_curve")]
    pub fade_curve: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineAnimationClip {
    pub start: f32,
    pub duration: f32,
    pub clip: String,
    #[serde(default)]
    pub clip_in: f32,
    #[serde(default = "default_one")]
    pub speed: f32,
    #[serde(default)]
    pub blend_in: f32,
    #[serde(default = "default_blend_curve")]
    pub blend_curve: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineParticleClip {
    pub start: f32,
    pub duration: f32,
    #[serde(default)]
    pub clip_in: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineCameraClip {
    pub start: f32,
    pub duration: f32,
    pub target: String,
    #[serde(default)]
    pub blend_in: f32,
    #[serde(default = "default_blend_curve")]
    pub blend_curve: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineControlClip {
    pub start: f32,
    pub duration: f32,
    pub timeline: String,
    #[serde(default)]
    pub clip_in: f32,
    #[serde(default = "default_one")]
    pub speed: f32,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub binding_overrides: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimelineTrack {
    Signal {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        #[serde(default)]
        markers: Vec<TimelineSignal>,
    },
    Activation {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        target: String,
        #[serde(default)]
        clips: Vec<TimelineActivationClip>,
    },
    Audio {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        target: String,
        #[serde(default)]
        clips: Vec<TimelineAudioClip>,
    },
    Animation {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        target: String,
        #[serde(default)]
        clips: Vec<TimelineAnimationClip>,
    },
    Particle {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        target: String,
        #[serde(default)]
        clips: Vec<TimelineParticleClip>,
    },
    Camera {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        #[serde(default)]
        clips: Vec<TimelineCameraClip>,
    },
    Control {
        id: String,
        name: String,
        #[serde(default)]
        solo: bool,
        #[serde(default)]
        muted: bool,
        #[serde(default)]
        locked: bool,
        target: String,
        #[serde(default)]
        clips: Vec<TimelineControlClip>,
    },
}

impl TimelineTrack {
    pub fn id(&self) -> &str {
        match self {
            Self::Signal { id, .. }
            | Self::Activation { id, .. }
            | Self::Audio { id, .. }
            | Self::Animation { id, .. }
            | Self::Particle { id, .. }
            | Self::Camera { id, .. }
            | Self::Control { id, .. } => id,
        }
    }

    pub fn is_muted(&self) -> bool {
        match self {
            Self::Signal { muted, .. }
            | Self::Activation { muted, .. }
            | Self::Audio { muted, .. }
            | Self::Animation { muted, .. }
            | Self::Particle { muted, .. }
            | Self::Camera { muted, .. }
            | Self::Control { muted, .. } => *muted,
        }
    }

    pub fn is_solo(&self) -> bool {
        match self {
            Self::Signal { solo, .. }
            | Self::Activation { solo, .. }
            | Self::Audio { solo, .. }
            | Self::Animation { solo, .. }
            | Self::Particle { solo, .. }
            | Self::Camera { solo, .. }
            | Self::Control { solo, .. } => *solo,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimelineTrackGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub solo: bool,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub track_ids: Vec<String>,
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
    #[serde(default)]
    pub groups: Vec<TimelineTrackGroup>,
}

impl Default for TimelineAsset {
    fn default() -> Self {
        Self {
            version: default_version(),
            name: String::new(),
            duration: default_duration(),
            frame_rate: default_frame_rate(),
            tracks: Vec::new(),
            groups: Vec::new(),
        }
    }
}

impl TimelineAsset {
    pub fn requires_binding_target(&self, target: &str) -> bool {
        self.tracks.iter().any(|track| match track {
            TimelineTrack::Signal { .. } => false,
            TimelineTrack::Camera { clips, .. } => clips.iter().any(|clip| clip.target == target),
            TimelineTrack::Activation {
                target: candidate, ..
            }
            | TimelineTrack::Audio {
                target: candidate, ..
            }
            | TimelineTrack::Animation {
                target: candidate, ..
            }
            | TimelineTrack::Particle {
                target: candidate, ..
            } => candidate == target,
            TimelineTrack::Control {
                target: candidate,
                clips,
                ..
            } => {
                candidate == target
                    || clips
                        .iter()
                        .any(|clip| clip.binding_overrides.values().any(|value| value == target))
            }
        })
    }

    pub fn required_binding_targets(&self) -> BTreeSet<String> {
        let mut targets = BTreeSet::new();
        for track in &self.tracks {
            match track {
                TimelineTrack::Signal { .. } => {}
                TimelineTrack::Camera { clips, .. } => {
                    targets.extend(clips.iter().map(|clip| clip.target.clone()));
                }
                TimelineTrack::Activation { target, .. }
                | TimelineTrack::Audio { target, .. }
                | TimelineTrack::Animation { target, .. }
                | TimelineTrack::Particle { target, .. } => {
                    targets.insert(target.clone());
                }
                TimelineTrack::Control { target, clips, .. } => {
                    targets.insert(target.clone());
                    for clip in clips {
                        targets.extend(clip.binding_overrides.values().cloned());
                    }
                }
            }
        }
        targets
    }

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
        if !self.frame_rate.is_finite() || self.frame_rate <= 0.0 || self.frame_rate > 240.0 {
            return Err(AssetError::Invalid(
                "Timeline frame_rate must be finite and no greater than 240".into(),
            ));
        }

        let mut track_ids = HashSet::new();
        let mut activation_targets = HashSet::new();
        let mut audio_targets = HashSet::new();
        let mut animation_targets = HashSet::new();
        let mut particle_targets = HashSet::new();
        let mut control_targets = HashSet::new();
        let mut camera_track_seen = false;
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
                TimelineTrack::Activation {
                    id,
                    name,
                    target,
                    clips,
                    ..
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
                    *target = normalize_timeline_target(target).ok_or_else(|| {
                        AssetError::Invalid(format!(
                            "Timeline activation track '{id}' must target a descendant path without '.' or '..'"
                        ))
                    })?;
                    if !activation_targets.insert(target.clone()) {
                        return Err(AssetError::Invalid(format!(
                            "Timeline activation target '{target}' is controlled by more than one track"
                        )));
                    }
                    for clip in clips.iter() {
                        if !clip.start.is_finite()
                            || !clip.duration.is_finite()
                            || clip.start < 0.0
                            || clip.duration <= 0.0
                            || clip.start + clip.duration > self.duration
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline activation track '{id}' contains a clip outside its duration"
                            )));
                        }
                    }
                    clips.sort_by(|left, right| left.start.total_cmp(&right.start));
                    if clips
                        .windows(2)
                        .any(|pair| pair[0].start + pair[0].duration > pair[1].start)
                    {
                        return Err(AssetError::Invalid(format!(
                            "Timeline activation track '{id}' contains overlapping clips"
                        )));
                    }
                }
                TimelineTrack::Audio {
                    id,
                    name,
                    target,
                    clips,
                    ..
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
                    *target = normalize_timeline_target(target).ok_or_else(|| {
                        AssetError::Invalid(format!(
                            "Timeline audio track '{id}' must target a descendant path without '.' or '..'"
                        ))
                    })?;
                    if !audio_targets.insert(target.clone()) {
                        return Err(AssetError::Invalid(format!(
                            "Timeline audio target '{target}' is controlled by more than one track"
                        )));
                    }
                    for clip in clips.iter_mut() {
                        clip.clip = normalize_audio_asset_path(&clip.clip).ok_or_else(|| {
                            AssetError::Invalid(format!(
                                "Timeline audio track '{id}' contains an invalid audio clip path"
                            ))
                        })?;
                        clip.fade_curve = clip.fade_curve.trim().to_ascii_lowercase();
                        if !clip.start.is_finite()
                            || !clip.duration.is_finite()
                            || clip.start < 0.0
                            || clip.duration <= 0.0
                            || clip.start + clip.duration > self.duration
                            || !clip.clip_in.is_finite()
                            || clip.clip_in < 0.0
                            || !clip.volume.is_finite()
                            || !(0.0..=4.0).contains(&clip.volume)
                            || !clip.pitch.is_finite()
                            || !(0.05..=4.0).contains(&clip.pitch)
                            || !clip.fade_in.is_finite()
                            || !(0.0..=clip.duration).contains(&clip.fade_in)
                            || !clip.fade_out.is_finite()
                            || !(0.0..=clip.duration).contains(&clip.fade_out)
                            || !matches!(clip.fade_curve.as_str(), "linear" | "ease_in_out")
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline audio track '{id}' contains an invalid or out-of-range clip"
                            )));
                        }
                    }
                    clips.sort_by(|left, right| left.start.total_cmp(&right.start));
                    if clips
                        .windows(2)
                        .any(|pair| pair[0].start + pair[0].duration > pair[1].start)
                    {
                        return Err(AssetError::Invalid(format!(
                            "Timeline audio track '{id}' contains overlapping clips"
                        )));
                    }
                }
                TimelineTrack::Animation {
                    id,
                    name,
                    target,
                    clips,
                    ..
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
                    *target = normalize_timeline_target(target).ok_or_else(|| {
                        AssetError::Invalid(format!(
                            "Timeline animation track '{id}' must target a descendant path without '.' or '..'"
                        ))
                    })?;
                    if !animation_targets.insert(target.clone()) {
                        return Err(AssetError::Invalid(format!(
                            "Timeline animation target '{target}' is controlled by more than one track"
                        )));
                    }
                    for clip in clips.iter_mut() {
                        clip.clip = normalize_animation_asset_path(&clip.clip).ok_or_else(|| {
                            AssetError::Invalid(format!(
                                "Timeline animation track '{id}' contains an invalid animation clip path"
                            ))
                        })?;
                        if !clip.start.is_finite()
                            || !clip.duration.is_finite()
                            || clip.start < 0.0
                            || clip.duration <= 0.0
                            || clip.start + clip.duration > self.duration
                            || !clip.clip_in.is_finite()
                            || clip.clip_in < 0.0
                            || !clip.speed.is_finite()
                            || !(-4.0..=4.0).contains(&clip.speed)
                            || !clip.blend_in.is_finite()
                            || !(0.0..=clip.duration).contains(&clip.blend_in)
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline animation track '{id}' contains an invalid or out-of-range clip"
                            )));
                        }
                        clip.blend_curve = clip.blend_curve.trim().to_ascii_lowercase();
                        if !matches!(clip.blend_curve.as_str(), "linear" | "ease_in_out") {
                            return Err(AssetError::Invalid(format!(
                                "Timeline animation track '{id}' contains an invalid blend curve"
                            )));
                        }
                    }
                    clips.sort_by(|left, right| left.start.total_cmp(&right.start));
                    if !animation_crossfades_are_valid(clips) {
                        return Err(AssetError::Invalid(format!(
                            "Timeline animation track '{id}' contains an invalid crossfade; overlap must fit the incoming blend and may involve only two clips"
                        )));
                    }
                }
                TimelineTrack::Particle {
                    id,
                    name,
                    target,
                    clips,
                    ..
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
                    *target = normalize_timeline_target(target).ok_or_else(|| {
                        AssetError::Invalid(format!(
                            "Timeline particle track '{id}' must target a descendant path without '.' or '..'"
                        ))
                    })?;
                    if !particle_targets.insert(target.clone()) {
                        return Err(AssetError::Invalid(format!(
                            "Timeline particle target '{target}' is controlled by more than one track"
                        )));
                    }
                    for clip in clips.iter() {
                        if !clip.start.is_finite()
                            || !clip.duration.is_finite()
                            || clip.start < 0.0
                            || clip.duration <= 0.0
                            || clip.start + clip.duration > self.duration
                            || !clip.clip_in.is_finite()
                            || clip.clip_in < 0.0
                            || clip.clip_in + clip.duration > MAX_TIMELINE_PARTICLE_TIME
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline particle track '{id}' contains an invalid or out-of-range clip"
                            )));
                        }
                    }
                    clips.sort_by(|left, right| left.start.total_cmp(&right.start));
                    if clips
                        .windows(2)
                        .any(|pair| pair[0].start + pair[0].duration > pair[1].start)
                    {
                        return Err(AssetError::Invalid(format!(
                            "Timeline particle track '{id}' contains overlapping clips"
                        )));
                    }
                }
                TimelineTrack::Camera {
                    id, name, clips, ..
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
                    if camera_track_seen {
                        return Err(AssetError::Invalid(
                            "Timeline assets may contain only one camera track".into(),
                        ));
                    }
                    camera_track_seen = true;
                    for clip in clips.iter_mut() {
                        clip.target = normalize_timeline_target(&clip.target).ok_or_else(|| {
                            AssetError::Invalid(format!(
                                "Timeline camera track '{id}' contains an invalid descendant camera target"
                            ))
                        })?;
                        clip.blend_curve = clip.blend_curve.trim().to_ascii_lowercase();
                        if !clip.start.is_finite()
                            || !clip.duration.is_finite()
                            || clip.start < 0.0
                            || clip.duration <= 0.0
                            || clip.start + clip.duration > self.duration
                            || !clip.blend_in.is_finite()
                            || !(0.0..=clip.duration).contains(&clip.blend_in)
                            || !matches!(clip.blend_curve.as_str(), "linear" | "ease_in_out")
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline camera track '{id}' contains an invalid or out-of-range clip"
                            )));
                        }
                    }
                    clips.sort_by(|left, right| left.start.total_cmp(&right.start));
                    if clips
                        .windows(2)
                        .any(|pair| pair[0].start + pair[0].duration > pair[1].start)
                    {
                        return Err(AssetError::Invalid(format!(
                            "Timeline camera track '{id}' contains overlapping clips"
                        )));
                    }
                }
                TimelineTrack::Control {
                    id,
                    name,
                    target,
                    clips,
                    ..
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
                    *target = normalize_timeline_target(target).ok_or_else(|| {
                        AssetError::Invalid(format!(
                            "Timeline control track '{id}' must target a descendant root without '.' or '..'"
                        ))
                    })?;
                    if !control_targets.insert(target.clone()) {
                        return Err(AssetError::Invalid(format!(
                            "Timeline control target '{target}' is controlled by more than one track"
                        )));
                    }
                    for clip in clips.iter_mut() {
                        clip.timeline = normalize_timeline_asset_path(&clip.timeline).ok_or_else(|| {
                            AssetError::Invalid(format!(
                                "Timeline control track '{id}' contains an invalid nested Timeline path"
                            ))
                        })?;
                        if clip.binding_overrides.len() > MAX_TIMELINE_CONTROL_BINDING_OVERRIDES {
                            return Err(AssetError::Invalid(format!(
                                "Timeline control track '{id}' exceeds {MAX_TIMELINE_CONTROL_BINDING_OVERRIDES} binding overrides"
                            )));
                        }
                        let mut binding_overrides = BTreeMap::new();
                        for (child, parent) in std::mem::take(&mut clip.binding_overrides) {
                            let child = normalize_timeline_target(&child).ok_or_else(|| {
                                AssetError::Invalid(format!(
                                    "Timeline control track '{id}' contains an invalid child binding target"
                                ))
                            })?;
                            let parent = normalize_timeline_target(&parent).ok_or_else(|| {
                                AssetError::Invalid(format!(
                                    "Timeline control track '{id}' contains an invalid parent binding target"
                                ))
                            })?;
                            if binding_overrides.insert(child.clone(), parent).is_some() {
                                return Err(AssetError::Invalid(format!(
                                    "Timeline control track '{id}' duplicates child binding target '{child}' after normalization"
                                )));
                            }
                        }
                        clip.binding_overrides = binding_overrides;
                        if !clip.start.is_finite()
                            || !clip.duration.is_finite()
                            || clip.start < 0.0
                            || clip.duration <= 0.0
                            || clip.start + clip.duration > self.duration
                            || !clip.clip_in.is_finite()
                            || clip.clip_in < 0.0
                            || !clip.speed.is_finite()
                            || !(-4.0..=4.0).contains(&clip.speed)
                        {
                            return Err(AssetError::Invalid(format!(
                                "Timeline control track '{id}' contains an invalid or out-of-range clip"
                            )));
                        }
                    }
                    clips.sort_by(|left, right| left.start.total_cmp(&right.start));
                    if clips
                        .windows(2)
                        .any(|pair| pair[0].start + pair[0].duration > pair[1].start)
                    {
                        return Err(AssetError::Invalid(format!(
                            "Timeline control track '{id}' contains overlapping clips"
                        )));
                    }
                }
            }
        }
        let mut group_ids = HashSet::new();
        let mut grouped_track_ids = HashSet::new();
        for group in &mut self.groups {
            group.id = group.id.trim().to_owned();
            group.name = group.name.trim().to_owned();
            if group.id.is_empty() || !group_ids.insert(group.id.clone()) {
                return Err(AssetError::Invalid(
                    "Timeline group ids must be non-empty and unique".into(),
                ));
            }
            if group.name.is_empty() {
                return Err(AssetError::Invalid(format!(
                    "Timeline group '{}' must have a name",
                    group.id
                )));
            }
            for track_id in &mut group.track_ids {
                *track_id = track_id.trim().to_owned();
                if !track_ids.contains(track_id) {
                    return Err(AssetError::Invalid(format!(
                        "Timeline group '{}' references missing track '{}'",
                        group.id, track_id
                    )));
                }
                if !grouped_track_ids.insert(track_id.clone()) {
                    return Err(AssetError::Invalid(format!(
                        "Timeline track '{track_id}' belongs to more than one group"
                    )));
                }
            }
        }
        Ok(self)
    }

    pub fn group_for_track(&self, track_id: &str) -> Option<&TimelineTrackGroup> {
        self.groups.iter().find(|group| {
            group
                .track_ids
                .iter()
                .any(|candidate| candidate == track_id)
        })
    }

    pub fn has_solo_tracks(&self) -> bool {
        self.tracks.iter().any(TimelineTrack::is_solo)
            || self
                .groups
                .iter()
                .any(|candidate| candidate.solo && !candidate.track_ids.is_empty())
    }

    pub fn track_is_muted_with_solo(&self, track: &TimelineTrack, has_solo: bool) -> bool {
        let group = self.group_for_track(track.id());
        if track.is_muted() || group.is_some_and(|candidate| candidate.muted) {
            return true;
        }
        has_solo && !track.is_solo() && !group.is_some_and(|candidate| candidate.solo)
    }

    pub fn track_is_muted(&self, track: &TimelineTrack) -> bool {
        self.track_is_muted_with_solo(track, self.has_solo_tracks())
    }
}

pub fn normalize_timeline_target(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') {
        return None;
    }
    let segments: Vec<_> = normalized.split('/').collect();
    if segments
        .iter()
        .any(|segment| segment.is_empty() || matches!(*segment, "." | ".."))
    {
        return None;
    }
    Some(segments.join("/"))
}

fn normalize_audio_asset_path(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let segments: Vec<_> = normalized.split('/').collect();
    if segments.len() < 2
        || !segments[0].eq_ignore_ascii_case("Assets")
        || segments
            .iter()
            .any(|segment| segment.is_empty() || matches!(*segment, "." | ".."))
    {
        return None;
    }
    let lower = normalized.to_ascii_lowercase();
    if ![".wav", ".ogg", ".mp3", ".flac"]
        .iter()
        .any(|extension| lower.ends_with(extension))
    {
        return None;
    }
    Some(format!("Assets/{}", segments[1..].join("/")))
}

fn normalize_animation_asset_path(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let segments: Vec<_> = normalized.split('/').collect();
    if segments.len() < 2
        || !segments[0].eq_ignore_ascii_case("Assets")
        || segments
            .iter()
            .any(|segment| segment.is_empty() || matches!(*segment, "." | ".."))
        || !normalized.to_ascii_lowercase().ends_with(".manim")
    {
        return None;
    }
    Some(format!("Assets/{}", segments[1..].join("/")))
}

pub fn normalize_timeline_asset_path(raw: &str) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    let segments: Vec<_> = normalized.split('/').collect();
    if segments.len() < 2
        || !segments[0].eq_ignore_ascii_case("Assets")
        || segments
            .iter()
            .any(|segment| segment.is_empty() || matches!(*segment, "." | ".."))
        || !normalized.to_ascii_lowercase().ends_with(".mtimeline")
    {
        return None;
    }
    Some(format!("Assets/{}", segments[1..].join("/")))
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
    fn normalizes_serializes_and_remaps_stable_binding_tables() {
        let mut table = parse_timeline_binding_table(
            r#"{"bindings":{" Characters\\Hero ":{"entity":"2","name":" Hero "}}}"#,
        )
        .unwrap();
        assert_eq!(table.bindings["Characters/Hero"].name, "Hero");
        assert_eq!(table.bindings["Characters/Hero"].entity, "2");

        let replacement = Entity::new(7, 3);
        table.remap_entities(&HashMap::from([(2, replacement)]));
        let serialized = serialize_timeline_binding_table(table).unwrap();
        let reparsed = parse_timeline_binding_table(&serialized).unwrap();
        assert_eq!(
            reparsed.bindings["Characters/Hero"]
                .resolved_entity()
                .unwrap(),
            replacement
        );
        assert_eq!(
            parse_timeline_binding_table("{}").unwrap(),
            TimelineBindingTable::default()
        );
    }

    #[test]
    fn rejects_invalid_stable_binding_tables() {
        assert!(parse_timeline_binding_table(r#"{"version":2,"bindings":{}}"#,).is_err());
        assert!(
            parse_timeline_binding_table(r#"{"bindings":{"../Hero":{"entity":"2"}}}"#,).is_err()
        );
        assert!(
            parse_timeline_binding_table(r#"{"bindings":{"Hero":{"entity":"not-an-id"}}}"#,)
                .is_err()
        );
    }

    #[test]
    fn parses_extensible_signal_tracks_and_sorts_markers() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"name":" Intro ","duration":3,"frame_rate":30,
              "tracks":[{"type":"signal","id":"gameplay","name":" Gameplay ","locked":true,"markers":[
                {"time":2,"name":"End","payload":{"score":10}},
                {"time":0.5,"name":" Start "}
              ]}]
            }"#,
        )
        .unwrap();
        assert_eq!(asset.name, "Intro");
        let TimelineTrack::Signal {
            name,
            locked,
            markers,
            ..
        } = &asset.tracks[0]
        else {
            panic!("expected signal track");
        };
        assert_eq!(name, "Gameplay");
        assert!(*locked);
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

    #[test]
    fn validates_track_groups_and_resolves_effective_mute() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":2,
              "tracks":[
                {"type":"signal","id":"events","name":"Events"},
                {"type":"signal","id":"dialogue","name":"Dialogue","muted":true}
              ],
              "groups":[{"id":"presentation","name":" Presentation ","muted":true,"locked":true,"collapsed":true,"track_ids":["events"]}]
            }"#,
        )
        .unwrap();
        assert_eq!(asset.groups[0].name, "Presentation");
        assert_eq!(asset.group_for_track("events"), Some(&asset.groups[0]));
        assert!(asset.track_is_muted(&asset.tracks[0]));
        assert!(asset.track_is_muted(&asset.tracks[1]));
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":1,"tracks":[{"type":"signal","id":"events","name":"Events"}],"groups":[{"id":"a","name":"A","track_ids":["events"]},{"id":"b","name":"B","track_ids":["events"]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":1,"tracks":[],"groups":[{"id":"a","name":"A","track_ids":["missing"]}]}"#
        )
        .is_err());
    }

    #[test]
    fn solo_filters_non_solo_tracks_without_overriding_mute() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":2,
              "tracks":[
                {"type":"signal","id":"events","name":"Events"},
                {"type":"signal","id":"dialogue","name":"Dialogue","solo":true},
                {"type":"signal","id":"muted","name":"Muted","solo":true,"muted":true},
                {"type":"signal","id":"grouped","name":"Grouped"}
              ],
              "groups":[{"id":"presentation","name":"Presentation","solo":true,"track_ids":["grouped"]}]
            }"#,
        )
        .unwrap();
        assert!(asset.track_is_muted(&asset.tracks[0]));
        assert!(!asset.track_is_muted(&asset.tracks[1]));
        assert!(asset.track_is_muted(&asset.tracks[2]));
        assert!(!asset.track_is_muted(&asset.tracks[3]));
        let empty_group = parse_timeline_asset(
            br#"{"version":1,"duration":1,"tracks":[{"type":"signal","id":"events","name":"Events"}],"groups":[{"id":"empty","name":"Empty","solo":true,"track_ids":[]}]}"#,
        )
        .unwrap();
        assert!(!empty_group.has_solo_tracks());
        assert!(!empty_group.track_is_muted(&empty_group.tracks[0]));
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":1,"tracks":[{"type":"signal","id":"events","name":"Events","solo":"yes"}]}"#
        )
        .is_err());
    }

    #[test]
    fn normalizes_activation_tracks_and_rejects_overlaps() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":3,
              "tracks":[{"type":"activation","id":"visibility","name":" Visibility ",
                "target":"Canvas\\Dialog","clips":[
                  {"start":1,"duration":0.5,"active":true},
                  {"start":0,"duration":0.5,"active":false}
                ]}]
            }"#,
        )
        .unwrap();
        let TimelineTrack::Activation {
            name,
            target,
            clips,
            ..
        } = &asset.tracks[0]
        else {
            panic!("expected activation track");
        };
        assert_eq!(name, "Visibility");
        assert_eq!(target, "Canvas/Dialog");
        assert_eq!(clips[0].start, 0.0);

        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"activation","id":"a","name":"A","target":"Child","clips":[{"start":0,"duration":1.5,"active":true},{"start":1,"duration":1,"active":false}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"activation","id":"a","name":"A","target":"../Sibling"}]}"#
        )
        .is_err());
    }

    #[test]
    fn normalizes_audio_tracks_and_rejects_invalid_clips() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":4,
              "tracks":[{"type":"audio","id":"music","name":" Music ",
                "target":"Audio\\Music","clips":[
                  {"start":2,"duration":1,"clip":"assets\\Audio\\theme.OGG","clip_in":0.5,"volume":0.8,"pitch":1.25,"fade_in":0.25,"fade_out":0.5,"fade_curve":" EASE_IN_OUT "},
                  {"start":0,"duration":1,"clip":"Assets/Audio/intro.wav"}
                ]}]
            }"#,
        )
        .unwrap();
        let TimelineTrack::Audio {
            name,
            target,
            clips,
            ..
        } = &asset.tracks[0]
        else {
            panic!("expected audio track");
        };
        assert_eq!(name, "Music");
        assert_eq!(target, "Audio/Music");
        assert_eq!(clips[0].clip, "Assets/Audio/intro.wav");
        assert_eq!(clips[0].volume, 1.0);
        assert_eq!(clips[0].fade_in, 0.0);
        assert_eq!(clips[0].fade_out, 0.0);
        assert_eq!(clips[0].fade_curve, "linear");
        assert_eq!(clips[1].clip, "Assets/Audio/theme.OGG");
        assert_eq!(clips[1].fade_in, 0.25);
        assert_eq!(clips[1].fade_out, 0.5);
        assert_eq!(clips[1].fade_curve, "ease_in_out");

        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"audio","id":"a","name":"A","target":"Audio","clips":[{"start":0,"duration":1.5,"clip":"Assets/Audio/a.ogg"},{"start":1,"duration":1,"clip":"Assets/Audio/b.ogg"}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"audio","id":"a","name":"A","target":"Audio","clips":[{"start":0,"duration":1,"clip":"../outside.ogg"}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"audio","id":"a","name":"A","target":"Audio","clips":[{"start":0,"duration":1,"clip":"Assets/Audio/a.ogg","fade_in":1.1}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"audio","id":"a","name":"A","target":"Audio","clips":[{"start":0,"duration":1,"clip":"Assets/Audio/a.ogg","fade_curve":"exponential"}]}]}"#
        )
        .is_err());
    }

    #[test]
    fn normalizes_animation_tracks_and_rejects_invalid_clips() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":3,
              "tracks":[{"type":"animation","id":"hero","name":" Hero ",
                "target":"Characters\\Hero","clips":[
                  {"start":1,"duration":1,"clip":"assets\\Animations\\Run.manim","clip_in":0.25,"speed":-1,"blend_in":0.4,"blend_curve":" LINEAR "},
                  {"start":0,"duration":1,"clip":"Assets/Animations/Idle.manim"}
                ]}]
            }"#,
        )
        .unwrap();
        let TimelineTrack::Animation {
            name,
            target,
            clips,
            ..
        } = &asset.tracks[0]
        else {
            panic!("expected animation track");
        };
        assert_eq!(name, "Hero");
        assert_eq!(target, "Characters/Hero");
        assert_eq!(clips[0].clip, "Assets/Animations/Idle.manim");
        assert_eq!(clips[0].speed, 1.0);
        assert_eq!(clips[0].blend_in, 0.0);
        assert_eq!(clips[0].blend_curve, "ease_in_out");
        assert_eq!(clips[1].clip, "Assets/Animations/Run.manim");
        assert_eq!(clips[1].blend_in, 0.4);
        assert_eq!(clips[1].blend_curve, "linear");

        let overlap = parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1,"clip":"Assets/Animations/A.manim"},{"start":0.75,"duration":1,"clip":"Assets/Animations/B.manim","blend_in":0.25}]}]}"#,
        )
        .unwrap();
        let TimelineTrack::Animation { clips, .. } = &overlap.tracks[0] else {
            panic!("expected animation track");
        };
        assert_eq!(clips[1].start, 0.75);

        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1.5,"clip":"Assets/Animations/A.manim"},{"start":1,"duration":1,"clip":"Assets/Animations/B.manim"}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1.5,"clip":"Assets/Animations/A.manim"},{"start":1,"duration":1,"clip":"Assets/Animations/B.manim","blend_in":0.25}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1.2,"clip":"Assets/Animations/A.manim"},{"start":0.5,"duration":1,"clip":"Assets/Animations/B.manim","blend_in":0.7},{"start":0.9,"duration":1,"clip":"Assets/Animations/C.manim","blend_in":0.6}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1,"clip":"Assets/Animations/A.anim"}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1,"clip":"Assets/Animations/A.manim","blend_in":1.1}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"animation","id":"a","name":"A","target":"Hero","clips":[{"start":0,"duration":1,"clip":"Assets/Animations/A.manim","blend_curve":"bounce"}]}]}"#
        )
        .is_err());
    }

    #[test]
    fn normalizes_particle_tracks_and_rejects_invalid_clips() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":4,
              "tracks":[{"type":"particle","id":"fx","name":" FX ",
                "target":"Effects\\Burst","clips":[
                  {"start":2,"duration":1,"clip_in":0.5},
                  {"start":0,"duration":1}
                ]}]
            }"#,
        )
        .unwrap();
        let TimelineTrack::Particle {
            name,
            target,
            clips,
            ..
        } = &asset.tracks[0]
        else {
            panic!("expected particle track");
        };
        assert_eq!(name, "FX");
        assert_eq!(target, "Effects/Burst");
        assert_eq!(clips[0].start, 0.0);
        assert_eq!(clips[0].clip_in, 0.0);
        assert_eq!(clips[1].clip_in, 0.5);

        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"particle","id":"fx","name":"FX","target":"Burst","clips":[{"start":0,"duration":1.5},{"start":1,"duration":1}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"particle","id":"fx","name":"FX","target":"Burst","clips":[{"start":0,"duration":1,"clip_in":-1}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"particle","id":"fx","name":"FX","target":"Burst","clips":[{"start":0,"duration":1,"clip_in":300}]}]}"#
        )
        .is_err());
    }

    #[test]
    fn normalizes_control_tracks_and_rejects_invalid_nested_assets() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":6,
              "tracks":[{"type":"control","id":"dialogue","name":" Dialogue ",
                "target":"Sequences\\Dialogue","clips":[
                  {"start":3,"duration":2,"timeline":"assets\\Timelines\\Outro.mtimeline","clip_in":1,"speed":-0.5},
                  {"start":0,"duration":2,"timeline":"Assets/Timelines/Intro.mtimeline",
                    "binding_overrides":{"Actor\\Body":"Cast\\Lead"}}
                ]}]
            }"#,
        )
        .unwrap();
        let TimelineTrack::Control {
            name,
            target,
            clips,
            ..
        } = &asset.tracks[0]
        else {
            panic!("expected control track");
        };
        assert_eq!(name, "Dialogue");
        assert_eq!(target, "Sequences/Dialogue");
        assert_eq!(clips[0].timeline, "Assets/Timelines/Intro.mtimeline");
        assert_eq!(clips[0].speed, 1.0);
        assert_eq!(clips[0].binding_overrides["Actor/Body"], "Cast/Lead");
        assert_eq!(clips[1].timeline, "Assets/Timelines/Outro.mtimeline");
        assert_eq!(clips[1].speed, -0.5);
        assert_eq!(
            asset.required_binding_targets(),
            BTreeSet::from(["Cast/Lead".to_owned(), "Sequences/Dialogue".to_owned()])
        );

        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"control","id":"nested","name":"Nested","target":"Sequences","clips":[{"start":0,"duration":1,"timeline":"Assets/Scenes/Nested.mscene"}]}]}"#,
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"control","id":"a","name":"A","target":"Sequences","clips":[]},{"type":"control","id":"b","name":"B","target":"Sequences","clips":[]}]}"#,
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"control","id":"nested","name":"Nested","target":"Sequences","clips":[{"start":0,"duration":1,"timeline":"Assets/Timelines/Child.mtimeline","binding_overrides":{"Actor\\Body":"Cast/Lead","Actor/Body":"Cast/Backup"}}]}]}"#,
        )
        .is_err());
    }

    #[test]
    fn normalizes_camera_tracks_and_rejects_invalid_blends() {
        let asset = parse_timeline_asset(
            br#"{
              "version":1,"duration":4,
              "tracks":[{"type":"camera","id":"shots","name":" Shots ","clips":[
                {"start":2,"duration":1,"target":"Cameras\\Close","blend_in":0.25,"blend_curve":"LINEAR"},
                {"start":0,"duration":2,"target":"Cameras/Wide"}
              ]}]
            }"#,
        )
        .unwrap();
        let TimelineTrack::Camera { name, clips, .. } = &asset.tracks[0] else {
            panic!("expected camera track");
        };
        assert_eq!(name, "Shots");
        assert_eq!(clips[0].target, "Cameras/Wide");
        assert_eq!(clips[0].blend_curve, "ease_in_out");
        assert_eq!(clips[1].target, "Cameras/Close");
        assert_eq!(clips[1].blend_curve, "linear");

        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"camera","id":"a","name":"A","clips":[{"start":0,"duration":1,"target":"../Outside"}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"camera","id":"a","name":"A","clips":[{"start":0,"duration":1,"target":"Camera","blend_in":1.1}]}]}"#
        )
        .is_err());
        assert!(parse_timeline_asset(
            br#"{"version":1,"duration":2,"tracks":[{"type":"camera","id":"a","name":"A"},{"type":"camera","id":"b","name":"B"}]}"#
        )
        .is_err());
    }
}
