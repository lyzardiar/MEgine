use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SafeAreaInsets {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

/// Cross-platform application and render surface lifecycle events
/// (Desktop windowing, Android Activity/SurfaceView, iOS UIApplication, Web visibility).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum AppLifecycleEvent {
    Started,
    Resumed,
    Suspended,
    LowMemory,
    SurfaceCreated {
        width: u32,
        height: u32,
        scale_factor: f32,
    },
    SurfaceResized {
        width: u32,
        height: u32,
        scale_factor: f32,
    },
    SurfaceDestroyed,
    SafeAreaChanged(SafeAreaInsets),
    AudioFocusChanged(bool),
    QuitRequested,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LifecycleState {
    pub started: bool,
    pub foreground: bool,
    pub has_surface: bool,
    pub surface_width: u32,
    pub surface_height: u32,
    pub scale_factor: f32,
    pub safe_area: SafeAreaInsets,
    pub has_audio_focus: bool,
    pub quit_requested: bool,
}

impl Default for LifecycleState {
    fn default() -> Self {
        Self {
            started: false,
            foreground: false,
            has_surface: false,
            surface_width: 0,
            surface_height: 0,
            scale_factor: 1.0,
            safe_area: SafeAreaInsets::default(),
            has_audio_focus: true,
            quit_requested: false,
        }
    }
}

impl LifecycleState {
    pub fn apply(&mut self, event: &AppLifecycleEvent) {
        match *event {
            AppLifecycleEvent::Started => self.started = true,
            AppLifecycleEvent::Resumed => self.foreground = true,
            AppLifecycleEvent::Suspended => self.foreground = false,
            AppLifecycleEvent::LowMemory => {}
            AppLifecycleEvent::SurfaceCreated {
                width,
                height,
                scale_factor,
            } => {
                self.has_surface = true;
                self.surface_width = width;
                self.surface_height = height;
                self.scale_factor = scale_factor.max(0.25);
            }
            AppLifecycleEvent::SurfaceResized {
                width,
                height,
                scale_factor,
            } => {
                self.surface_width = width;
                self.surface_height = height;
                self.scale_factor = scale_factor.max(0.25);
            }
            AppLifecycleEvent::SurfaceDestroyed => {
                self.has_surface = false;
                self.surface_width = 0;
                self.surface_height = 0;
            }
            AppLifecycleEvent::SafeAreaChanged(insets) => {
                self.safe_area = insets;
            }
            AppLifecycleEvent::AudioFocusChanged(focused) => {
                self.has_audio_focus = focused;
            }
            AppLifecycleEvent::QuitRequested => {
                self.quit_requested = true;
            }
        }
    }

    pub fn should_render(&self) -> bool {
        self.foreground
            && self.has_surface
            && !self.quit_requested
            && self.surface_width > 0
            && self.surface_height > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_gates_rendering_on_foreground_and_valid_surface() {
        let mut state = LifecycleState::default();
        assert!(!state.should_render());

        state.apply(&AppLifecycleEvent::Started);
        state.apply(&AppLifecycleEvent::Resumed);
        assert!(!state.should_render());

        state.apply(&AppLifecycleEvent::SurfaceCreated {
            width: 1280,
            height: 720,
            scale_factor: 2.0,
        });
        assert!(state.should_render());

        state.apply(&AppLifecycleEvent::Suspended);
        assert!(!state.should_render());

        state.apply(&AppLifecycleEvent::Resumed);
        assert!(state.should_render());

        state.apply(&AppLifecycleEvent::SurfaceDestroyed);
        assert!(!state.should_render());
    }
}
