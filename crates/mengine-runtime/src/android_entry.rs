//! Android native C-ABI / JNI bridge entry points wired to `mengine-platform`.
//!
//! Android players link `mengine-runtime` (`cdylib` / `staticlib`) with native V8
//! scripting and Vulkan/GLES rendering, forwarding Activity lifecycle, SurfaceView
//! geometry, safe-area insets, and multi-touch events into this state machine.

use mengine_platform::{
    capabilities_for, AppLifecycleEvent, InputState, LifecycleState, PlatformTarget,
    SafeAreaInsets, TouchPhase,
};
use std::sync::{Mutex, OnceLock};

struct AndroidHostState {
    lifecycle: LifecycleState,
    input: InputState,
    frame: u64,
}

impl Default for AndroidHostState {
    fn default() -> Self {
        Self {
            lifecycle: LifecycleState::default(),
            input: InputState::default(),
            frame: 0,
        }
    }
}

static ANDROID_HOST: OnceLock<Mutex<AndroidHostState>> = OnceLock::new();

fn host() -> &'static Mutex<AndroidHostState> {
    ANDROID_HOST.get_or_init(|| Mutex::new(AndroidHostState::default()))
}

#[no_mangle]
pub extern "C" fn mengine_android_init() -> u32 {
    crate::panic_hook::install_panic_hook();
    let mut state = host()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    state.lifecycle.apply(&AppLifecycleEvent::Started);
    let caps = capabilities_for(PlatformTarget::Android);
    log::info!(
        "MEngine Android host initialized (script={:?}, gpu={:?}, fallback={:?})",
        caps.default_script_backend,
        caps.preferred_graphics,
        caps.fallback_graphics
    );
    1
}

/// Lifecycle codes: 1=Resumed, 2=Suspended, 3=LowMemory, 4=QuitRequested.
#[no_mangle]
pub extern "C" fn mengine_android_on_lifecycle(code: u32) {
    let event = match code {
        1 => AppLifecycleEvent::Resumed,
        2 => AppLifecycleEvent::Suspended,
        3 => AppLifecycleEvent::LowMemory,
        4 => AppLifecycleEvent::QuitRequested,
        _ => return,
    };
    let mut state = host()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    state.lifecycle.apply(&event);
}

#[no_mangle]
pub extern "C" fn mengine_android_on_surface(width: u32, height: u32, scale_factor: f32) {
    let mut state = host()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if width == 0 || height == 0 {
        state.lifecycle.apply(&AppLifecycleEvent::SurfaceDestroyed);
    } else if !state.lifecycle.has_surface {
        state.lifecycle.apply(&AppLifecycleEvent::SurfaceCreated {
            width,
            height,
            scale_factor,
        });
    } else {
        state.lifecycle.apply(&AppLifecycleEvent::SurfaceResized {
            width,
            height,
            scale_factor,
        });
    }
}

#[no_mangle]
pub extern "C" fn mengine_android_on_safe_area(top: f32, right: f32, bottom: f32, left: f32) {
    let mut state = host()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    state
        .lifecycle
        .apply(&AppLifecycleEvent::SafeAreaChanged(SafeAreaInsets {
            top,
            right,
            bottom,
            left,
        }));
}

/// Touch phase codes: 0=Began, 1=Moved, 2=Ended, 3=Cancelled.
#[no_mangle]
pub extern "C" fn mengine_android_on_touch(
    pointer_id: u64,
    x: f32,
    y: f32,
    pressure: f32,
    phase_code: u32,
) {
    let phase = match phase_code {
        0 => TouchPhase::Began,
        1 => TouchPhase::Moved,
        2 => TouchPhase::Ended,
        _ => TouchPhase::Cancelled,
    };
    let mut state = host()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    state.input.record_touch(pointer_id, x, y, pressure, phase);
}

/// Advances one Android frame if foreground & surface are ready. Returns 1 when rendered, 0 when paused.
#[no_mangle]
pub extern "C" fn mengine_android_tick(_dt_seconds: f32) -> u32 {
    let mut state = host()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if !state.lifecycle.should_render() {
        return 0;
    }
    state.frame = state.frame.wrapping_add(1);
    let frame = state.frame;
    state.input.begin_frame(frame);
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn android_entry_gates_ticks_by_lifecycle_and_surface() {
        assert_eq!(mengine_android_init(), 1);
        mengine_android_on_lifecycle(2); // Suspended
        assert_eq!(mengine_android_tick(0.016), 0);

        mengine_android_on_lifecycle(1); // Resumed
        mengine_android_on_surface(1080, 2400, 3.0);
        mengine_android_on_touch(1, 540.0, 1200.0, 1.0, 0);
        assert_eq!(mengine_android_tick(0.016), 1);

        mengine_android_on_surface(0, 0, 3.0); // SurfaceDestroyed
        assert_eq!(mengine_android_tick(0.016), 0);
    }
}
