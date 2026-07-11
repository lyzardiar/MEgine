//! Audio subsystem stub — interface stable for Phase 4 backends.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AudioError {
    #[error("not initialized")]
    NotInit,
    #[error("{0}")]
    Other(String),
}

pub struct AudioEngine {
    ready: bool,
}

impl Default for AudioEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioEngine {
    pub fn new() -> Self {
        Self { ready: false }
    }

    pub fn init(&mut self) -> Result<(), AudioError> {
        log::info!("audio: stub init");
        self.ready = true;
        Ok(())
    }

    pub fn play_oneshot(&self, _name: &str) -> Result<(), AudioError> {
        if !self.ready {
            return Err(AudioError::NotInit);
        }
        Ok(())
    }

    pub fn set_listener(&self, _pos: [f32; 3]) {}
}
