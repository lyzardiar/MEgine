// Author: MiYu. Share optional GPU recording controls across the editor's windows.
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::Emitter;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuTimingSource { Game, Scene }

#[derive(Clone, Copy, Serialize)]
pub struct GpuTimingSettings { game: bool, scene: bool, revision: u64 }

impl GpuTimingSettings {
    fn new(enabled: bool) -> Self { Self { game: enabled, scene: enabled, revision: 0 } }
    fn enabled(self, source: GpuTimingSource) -> bool { match source { GpuTimingSource::Game => self.game, GpuTimingSource::Scene => self.scene } }
    fn set(&mut self, source: GpuTimingSource, enabled: bool) {
        if self.enabled(source) == enabled { return; }
        match source { GpuTimingSource::Game => self.game = enabled, GpuTimingSource::Scene => self.scene = enabled }
        self.revision += 1;
    }
}

fn settings() -> &'static Mutex<GpuTimingSettings> {
    static SETTINGS: OnceLock<Mutex<GpuTimingSettings>> = OnceLock::new();
    SETTINGS.get_or_init(|| Mutex::new(GpuTimingSettings::new(std::env::var("MENGINE_GPU_TIMINGS").is_ok_and(|value| value == "1"))))
}

pub fn enabled(source: GpuTimingSource) -> bool { settings().lock().enabled(source) }

#[tauri::command]
pub fn get_native_gpu_timings() -> GpuTimingSettings { *settings().lock() }

#[tauri::command]
pub fn set_native_gpu_timings(app: tauri::AppHandle, source: GpuTimingSource, enabled: bool) -> Result<GpuTimingSettings, String> {
    let mut state = settings().lock();
    state.set(source, enabled);
    app.emit("native-gpu-timings", *state).map_err(|error| error.to_string())?;
    Ok(*state)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_sources_share_monotonic_recording_revisions() {
        let mut state = GpuTimingSettings::new(false);
        state.set(GpuTimingSource::Game, true);
        assert!(state.game && !state.scene); assert_eq!(state.revision, 1);
        state.set(GpuTimingSource::Game, true); assert_eq!(state.revision, 1);
        state.set(GpuTimingSource::Scene, true);
        state.set(GpuTimingSource::Game, false);
        assert!(!state.game && state.scene); assert_eq!(state.revision, 3);
        let all = GpuTimingSettings::new(true); assert!(all.game && all.scene);
        assert!(serde_json::from_str::<GpuTimingSource>("\"timeline\"").is_err());
    }
}
