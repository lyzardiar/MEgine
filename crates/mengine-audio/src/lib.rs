//! Runtime audio device, mixer buses, cached clips, and spatial emitters.

use kira::sound::static_sound::{StaticSoundData, StaticSoundHandle};
use kira::sound::PlaybackState;
use kira::track::{SpatialTrackBuilder, SpatialTrackHandle, TrackBuilder, TrackHandle};
use kira::{AudioManager, AudioManagerSettings, Decibels, DefaultBackend, Tween};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AudioError {
    #[error("audio device is not initialized")]
    NotInitialized,
    #[error("could not initialize the audio device: {0}")]
    Device(String),
    #[error("could not load audio clip '{path}': {message}")]
    Clip { path: PathBuf, message: String },
    #[error("audio resource limit reached: {0}")]
    Resource(String),
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum AudioBus {
    Music,
    #[default]
    Sfx,
    Ui,
    Ambience,
}

impl AudioBus {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "music" => Self::Music,
            "ui" => Self::Ui,
            "ambience" | "ambient" => Self::Ambience,
            _ => Self::Sfx,
        }
    }

    const ALL: [Self; 4] = [Self::Music, Self::Sfx, Self::Ui, Self::Ambience];
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AudioMixerSettings {
    pub master_volume: f32,
    pub music_volume: f32,
    pub sfx_volume: f32,
    pub ui_volume: f32,
    pub ambience_volume: f32,
    pub muted: bool,
}

impl Default for AudioMixerSettings {
    fn default() -> Self {
        Self {
            master_volume: 1.0,
            music_volume: 1.0,
            sfx_volume: 1.0,
            ui_volume: 1.0,
            ambience_volume: 1.0,
            muted: false,
        }
    }
}

impl AudioMixerSettings {
    fn volume(self, bus: AudioBus) -> f32 {
        match bus {
            AudioBus::Music => self.music_volume,
            AudioBus::Sfx => self.sfx_volume,
            AudioBus::Ui => self.ui_volume,
            AudioBus::Ambience => self.ambience_volume,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AudioSourceSettings {
    pub clip: PathBuf,
    pub playing: bool,
    pub time: f32,
    pub looped: bool,
    pub volume: f32,
    pub pitch: f32,
    pub pan: f32,
    pub spatial_blend: f32,
    pub min_distance: f32,
    pub max_distance: f32,
    pub bus: AudioBus,
    pub muted: bool,
    pub position: [f32; 3],
}

impl AudioSourceSettings {
    fn restart_key(&self) -> SourceRestartKey {
        SourceRestartKey {
            clip: self.clip.clone(),
            bus: self.bus,
            spatial: self.spatial_blend > 0.0001,
            min_distance_bits: self.min_distance.to_bits(),
            max_distance_bits: self.max_distance.to_bits(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct SourceRestartKey {
    clip: PathBuf,
    bus: AudioBus,
    spatial: bool,
    min_distance_bits: u32,
    max_distance_bits: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SourceSyncStatus {
    Playing { position: f32 },
    Paused { position: f32 },
    Finished { position: f32 },
}

struct LiveSource {
    sound: StaticSoundHandle,
    spatial_track: Option<SpatialTrackHandle>,
    restart_key: SourceRestartKey,
    desired_playing: bool,
    reported_position: f32,
}

struct BackendState {
    manager: AudioManager<DefaultBackend>,
    listener: kira::listener::ListenerHandle,
    buses: HashMap<AudioBus, TrackHandle>,
}

/// Owns the platform audio device. The runtime may keep this object in a
/// disabled state when no output device is available (for CI/headless builds).
pub struct AudioEngine {
    backend: Option<BackendState>,
    clips: HashMap<PathBuf, StaticSoundData>,
    sources: HashMap<u64, LiveSource>,
    mixer: AudioMixerSettings,
}

impl Default for AudioEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioEngine {
    pub fn new() -> Self {
        Self {
            backend: None,
            clips: HashMap::new(),
            sources: HashMap::new(),
            mixer: AudioMixerSettings::default(),
        }
    }

    pub fn is_ready(&self) -> bool {
        self.backend.is_some()
    }

    pub fn init(&mut self) -> Result<(), AudioError> {
        if self.backend.is_some() {
            return Ok(());
        }
        let mut manager = AudioManager::<DefaultBackend>::new(AudioManagerSettings::default())
            .map_err(|error| AudioError::Device(error.to_string()))?;
        let listener = manager
            .add_listener([0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0])
            .map_err(|error| AudioError::Resource(error.to_string()))?;
        let mut buses = HashMap::new();
        for bus in AudioBus::ALL {
            let handle = manager
                .add_sub_track(TrackBuilder::new())
                .map_err(|error| AudioError::Resource(error.to_string()))?;
            buses.insert(bus, handle);
        }
        self.backend = Some(BackendState {
            manager,
            listener,
            buses,
        });
        self.set_mixer(self.mixer);
        log::info!("audio: Kira output initialized with 4 mixer buses");
        Ok(())
    }

    pub fn set_mixer(&mut self, settings: AudioMixerSettings) {
        self.mixer = sanitize_mixer(settings);
        let Some(backend) = self.backend.as_mut() else {
            return;
        };
        let master = if self.mixer.muted {
            Decibels::SILENCE
        } else {
            linear_to_decibels(self.mixer.master_volume)
        };
        backend
            .manager
            .main_track()
            .set_volume(master, Tween::default());
        for (bus, track) in &mut backend.buses {
            track.set_volume(
                linear_to_decibels(self.mixer.volume(*bus)),
                Tween::default(),
            );
        }
    }

    pub fn set_listener(&mut self, position: [f32; 3], orientation: [f32; 4]) {
        let Some(backend) = self.backend.as_mut() else {
            return;
        };
        backend
            .listener
            .set_position(finite_position(position), Tween::default());
        backend
            .listener
            .set_orientation(finite_orientation(orientation), Tween::default());
    }

    pub fn sync_source(
        &mut self,
        id: u64,
        mut settings: AudioSourceSettings,
    ) -> Result<SourceSyncStatus, AudioError> {
        if self.backend.is_none() {
            return Err(AudioError::NotInitialized);
        }
        sanitize_source(&mut settings);
        let restart_key = settings.restart_key();
        let needs_restart = self
            .sources
            .get(&id)
            .is_some_and(|source| source.restart_key != restart_key);
        if needs_restart {
            self.stop_source(id);
        }

        let starting = !self.sources.contains_key(&id);
        if starting {
            if !settings.playing {
                return Ok(SourceSyncStatus::Paused {
                    position: settings.time,
                });
            }
            let source = self.start_source(&settings)?;
            self.sources.insert(id, source);
        }

        let source = self.sources.get_mut(&id).expect("source inserted above");
        let mut position = if starting {
            settings.time
        } else {
            finite_playback_position(source.sound.position(), source.reported_position)
        };
        if source.sound.state() == PlaybackState::Stopped {
            self.sources.remove(&id);
            return Ok(SourceSyncStatus::Finished { position });
        }
        if !starting && (settings.time - source.reported_position).abs() > 0.001 {
            source.sound.seek_to(settings.time as f64);
            position = settings.time;
        }

        let volume = if settings.muted {
            Decibels::SILENCE
        } else {
            linear_to_decibels(settings.volume)
        };
        source.sound.set_volume(volume, Tween::default());
        source
            .sound
            .set_playback_rate(settings.pitch as f64, Tween::default());
        source.sound.set_panning(settings.pan, Tween::default());
        if settings.looped {
            source.sound.set_loop_region(0.0..);
        } else {
            source.sound.set_loop_region(None);
        }
        if let Some(track) = source.spatial_track.as_mut() {
            track.set_position(finite_position(settings.position), Tween::default());
            track.set_spatialization_strength(settings.spatial_blend, Tween::default());
        }

        if settings.playing && !source.desired_playing {
            source.sound.resume(Tween::default());
        } else if !settings.playing && source.desired_playing {
            source.sound.pause(Tween::default());
        }
        source.desired_playing = settings.playing;
        source.reported_position = position;
        Ok(if settings.playing {
            SourceSyncStatus::Playing { position }
        } else {
            SourceSyncStatus::Paused { position }
        })
    }

    pub fn retain_sources(&mut self, live_ids: &HashSet<u64>) {
        self.sources.retain(|id, source| {
            let retain = live_ids.contains(id);
            if !retain {
                source.sound.stop(Tween::default());
            }
            retain
        });
    }

    pub fn stop_source(&mut self, id: u64) {
        if let Some(mut source) = self.sources.remove(&id) {
            source.sound.stop(Tween::default());
        }
    }

    /// Seeks an already-live source. The requested position is retained by the
    /// ECS component when the source has not started yet, so absence is not an
    /// error and the next sync will still begin at the requested time.
    pub fn seek_source(&mut self, id: u64, time: f32) -> bool {
        let time = finite_clamp(time, 0.0, f32::MAX, 0.0);
        let Some(source) = self.sources.get_mut(&id) else {
            return false;
        };
        source.sound.seek_to(time as f64);
        source.reported_position = time;
        true
    }

    pub fn clear(&mut self) {
        for (_, mut source) in self.sources.drain() {
            source.sound.stop(Tween::default());
        }
    }

    pub fn play_oneshot(&mut self, path: impl AsRef<Path>) -> Result<(), AudioError> {
        if self.backend.is_none() {
            return Err(AudioError::NotInitialized);
        }
        let path = path.as_ref().to_path_buf();
        let data = self.load_clip(&path)?;
        let backend = self.backend.as_mut().ok_or(AudioError::NotInitialized)?;
        backend
            .buses
            .get_mut(&AudioBus::Sfx)
            .expect("SFX bus exists")
            .play(data)
            .map_err(|error| AudioError::Resource(error.to_string()))?;
        Ok(())
    }

    fn load_clip(&mut self, path: &Path) -> Result<StaticSoundData, AudioError> {
        if let Some(data) = self.clips.get(path) {
            return Ok(data.clone());
        }
        let data = StaticSoundData::from_file(path).map_err(|error| AudioError::Clip {
            path: path.to_path_buf(),
            message: error.to_string(),
        })?;
        self.clips.insert(path.to_path_buf(), data.clone());
        Ok(data)
    }

    fn start_source(&mut self, settings: &AudioSourceSettings) -> Result<LiveSource, AudioError> {
        let mut data = self.load_clip(&settings.clip)?;
        data = data
            .start_position(settings.time as f64)
            .volume(if settings.muted {
                Decibels::SILENCE
            } else {
                linear_to_decibels(settings.volume)
            })
            .playback_rate(settings.pitch as f64)
            .panning(settings.pan);
        if settings.looped {
            data = data.loop_region(0.0..);
        }

        let backend = self.backend.as_mut().ok_or(AudioError::NotInitialized)?;
        let bus = backend
            .buses
            .get_mut(&settings.bus)
            .expect("all audio buses exist");
        let (sound, spatial_track) = if settings.spatial_blend > 0.0001 {
            let builder = SpatialTrackBuilder::new()
                .distances((settings.min_distance, settings.max_distance))
                .spatialization_strength(settings.spatial_blend);
            let mut track = bus
                .add_spatial_sub_track(
                    &backend.listener,
                    finite_position(settings.position),
                    builder,
                )
                .map_err(|error| AudioError::Resource(error.to_string()))?;
            let sound = track
                .play(data)
                .map_err(|error| AudioError::Resource(error.to_string()))?;
            (sound, Some(track))
        } else {
            let sound = bus
                .play(data)
                .map_err(|error| AudioError::Resource(error.to_string()))?;
            (sound, None)
        };
        Ok(LiveSource {
            sound,
            spatial_track,
            restart_key: settings.restart_key(),
            desired_playing: true,
            reported_position: settings.time,
        })
    }
}

fn sanitize_mixer(mut settings: AudioMixerSettings) -> AudioMixerSettings {
    settings.master_volume = finite_clamp(settings.master_volume, 0.0, 1.0, 1.0);
    settings.music_volume = finite_clamp(settings.music_volume, 0.0, 1.0, 1.0);
    settings.sfx_volume = finite_clamp(settings.sfx_volume, 0.0, 1.0, 1.0);
    settings.ui_volume = finite_clamp(settings.ui_volume, 0.0, 1.0, 1.0);
    settings.ambience_volume = finite_clamp(settings.ambience_volume, 0.0, 1.0, 1.0);
    settings
}

fn sanitize_source(settings: &mut AudioSourceSettings) {
    settings.time = finite_clamp(settings.time, 0.0, f32::MAX, 0.0);
    settings.volume = finite_clamp(settings.volume, 0.0, 4.0, 1.0);
    settings.pitch = finite_clamp(settings.pitch, 0.05, 4.0, 1.0);
    settings.pan = finite_clamp(settings.pan, -1.0, 1.0, 0.0);
    settings.spatial_blend = finite_clamp(settings.spatial_blend, 0.0, 1.0, 0.0);
    settings.min_distance = finite_clamp(settings.min_distance, 0.01, 100_000.0, 1.0);
    settings.max_distance = finite_clamp(
        settings.max_distance,
        settings.min_distance + 0.01,
        100_000.0,
        settings.min_distance.max(1.0) + 100.0,
    );
    settings.position = finite_position(settings.position).into();
}

fn finite_playback_position(value: f64, fallback: f32) -> f32 {
    if value.is_finite() && value >= 0.0 && value <= f32::MAX as f64 {
        value as f32
    } else {
        fallback
    }
}

fn finite_clamp(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        fallback
    }
}

fn finite_position(value: [f32; 3]) -> mint::Vector3<f32> {
    [
        if value[0].is_finite() { value[0] } else { 0.0 },
        if value[1].is_finite() { value[1] } else { 0.0 },
        if value[2].is_finite() { value[2] } else { 0.0 },
    ]
    .into()
}

fn finite_orientation(value: [f32; 4]) -> mint::Quaternion<f32> {
    let length_sq = value.iter().map(|value| value * value).sum::<f32>();
    if value.iter().all(|value| value.is_finite()) && length_sq > 0.000001 {
        let inverse_length = length_sq.sqrt().recip();
        [
            value[0] * inverse_length,
            value[1] * inverse_length,
            value[2] * inverse_length,
            value[3] * inverse_length,
        ]
        .into()
    } else {
        [0.0, 0.0, 0.0, 1.0].into()
    }
}

fn linear_to_decibels(value: f32) -> Decibels {
    if !value.is_finite() || value <= 0.00001 {
        Decibels::SILENCE
    } else {
        Decibels(20.0 * value.log10())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixer_and_sources_are_sanitized_without_an_audio_device() {
        let mixer = sanitize_mixer(AudioMixerSettings {
            master_volume: f32::NAN,
            music_volume: -1.0,
            sfx_volume: 2.0,
            ..AudioMixerSettings::default()
        });
        assert_eq!(mixer.master_volume, 1.0);
        assert_eq!(mixer.music_volume, 0.0);
        assert_eq!(mixer.sfx_volume, 1.0);

        let mut source = AudioSourceSettings {
            clip: "test.wav".into(),
            playing: true,
            time: f32::NAN,
            looped: false,
            volume: f32::NAN,
            pitch: 0.0,
            pan: 9.0,
            spatial_blend: 2.0,
            min_distance: -1.0,
            max_distance: 0.0,
            bus: AudioBus::Sfx,
            muted: false,
            position: [f32::NAN, 2.0, 3.0],
        };
        sanitize_source(&mut source);
        assert_eq!(source.time, 0.0);
        assert_eq!(source.volume, 1.0);
        assert_eq!(source.pitch, 0.05);
        assert_eq!(source.pan, 1.0);
        assert_eq!(source.spatial_blend, 1.0);
        assert!(source.max_distance > source.min_distance);
        assert_eq!(source.position, [0.0, 2.0, 3.0]);
    }

    #[test]
    fn uninitialized_engine_fails_softly() {
        let mut engine = AudioEngine::new();
        assert!(!engine.is_ready());
        assert!(matches!(
            engine.play_oneshot("missing.wav"),
            Err(AudioError::NotInitialized)
        ));
    }

    #[test]
    fn bus_names_match_editor_values() {
        assert_eq!(AudioBus::parse("Music"), AudioBus::Music);
        assert_eq!(AudioBus::parse("UI"), AudioBus::Ui);
        assert_eq!(AudioBus::parse("Ambience"), AudioBus::Ambience);
        assert_eq!(AudioBus::parse("unknown"), AudioBus::Sfx);
    }

    #[test]
    fn wav_clips_decode_and_are_cached_without_opening_a_device() {
        let path = std::env::temp_dir().join(format!(
            "mengine-audio-{}-{}.wav",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        // Mono PCM16, 8 kHz, two frames.
        let mut wav = b"RIFF".to_vec();
        wav.extend_from_slice(&40u32.to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&8_000u32.to_le_bytes());
        wav.extend_from_slice(&16_000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&4u32.to_le_bytes());
        wav.extend_from_slice(&0i16.to_le_bytes());
        wav.extend_from_slice(&1_000i16.to_le_bytes());
        std::fs::write(&path, wav).unwrap();

        let mut engine = AudioEngine::new();
        let first = engine.load_clip(&path).unwrap();
        let second = engine.load_clip(&path).unwrap();
        std::fs::remove_file(path).unwrap();

        assert_eq!(first.sample_rate, 8_000);
        assert_eq!(first.frames.len(), 2);
        assert_eq!(first.frames, second.frames);
        assert_eq!(engine.clips.len(), 1);
    }
}
