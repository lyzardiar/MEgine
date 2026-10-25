// Author: MiYu. On-demand allocator diagnostics use existing viewport devices without initializing a renderer.
use super::{native_gpu_timings::GpuTimingSource, SCENE_VIEWPORT_RENDERER, VIEWPORT_RENDERER};

#[tauri::command]
pub async fn get_native_gpu_memory(source: GpuTimingSource) -> Result<Option<mengine_editor_host::ViewportGpuMemory>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let slot = match source { GpuTimingSource::Scene => &SCENE_VIEWPORT_RENDERER, GpuTimingSource::Game => &VIEWPORT_RENDERER };
        slot.get().and_then(|slot| slot.lock().as_ref().map(|renderer| renderer.gpu_memory_diagnostics()))
    }).await.map_err(|error| error.to_string())
}
