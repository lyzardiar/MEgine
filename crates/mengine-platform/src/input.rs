// Author: MiYu

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum KeyCode {
    W,
    A,
    S,
    D,
    Space,
    Escape,
    F5,
    Other,
}

#[derive(Clone, Debug, Default)]
pub struct PointerState {
    pub x: f32,
    pub y: f32,
    pub delta_x: f32,
    pub delta_y: f32,
    pub left: bool,
    pub right: bool,
}

#[derive(Clone, Debug, Default)]
pub struct InputState {
    pressed: HashSet<KeyCode>,
    just: HashSet<KeyCode>,
    pending_just: HashSet<KeyCode>,
    pub pointer: PointerState,
    /// Frame-numbered events for deterministic replay (Phase 3+).
    pub frame: u64,
}

impl InputState {
    pub fn begin_frame(&mut self, frame: u64) {
        self.frame = frame;
        self.just = std::mem::take(&mut self.pending_just);
        self.pointer.delta_x = 0.0;
        self.pointer.delta_y = 0.0;
    }

    pub fn key_down(&mut self, key: KeyCode) {
        if self.pressed.insert(key) {
            self.pending_just.insert(key);
        }
    }

    pub fn key_up(&mut self, key: KeyCode) {
        self.pressed.remove(&key);
    }

    pub fn is_down(&self, key: KeyCode) -> bool {
        self.pressed.contains(&key)
    }

    pub fn just_pressed(&self, key: KeyCode) -> bool {
        self.just.contains(&key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_edges_survive_until_the_next_gameplay_frame() {
        let mut input = InputState::default();
        input.key_down(KeyCode::W);
        assert!(!input.just_pressed(KeyCode::W));
        input.begin_frame(1);
        assert!(input.is_down(KeyCode::W));
        assert!(input.just_pressed(KeyCode::W));
        input.begin_frame(2);
        assert!(input.is_down(KeyCode::W));
        assert!(!input.just_pressed(KeyCode::W));
        input.key_up(KeyCode::W);
        input.key_down(KeyCode::W);
        input.begin_frame(3);
        assert!(input.just_pressed(KeyCode::W));
    }
}
