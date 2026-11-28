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

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PointerState {
    pub x: f32,
    pub y: f32,
    pub delta_x: f32,
    pub delta_y: f32,
    pub left: bool,
    pub right: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TouchPhase {
    Began,
    Moved,
    Ended,
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct TouchPoint {
    pub id: u64,
    pub x: f32,
    pub y: f32,
    pub delta_x: f32,
    pub delta_y: f32,
    pub pressure: f32,
    pub phase: TouchPhase,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct GamepadState {
    pub connected: bool,
    pub left_stick: [f32; 2],
    pub right_stick: [f32; 2],
    pub left_trigger: f32,
    pub right_trigger: f32,
    pub buttons: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImeEvent {
    Preedit { text: String, cursor_start: usize, cursor_end: usize },
    Commit(String),
    Clear,
}

#[derive(Clone, Debug, Default)]
pub struct InputState {
    pressed: HashSet<KeyCode>,
    just: HashSet<KeyCode>,
    pub pointer: PointerState,
    touches: Vec<TouchPoint>,
    pub gamepad: GamepadState,
    ime_events: Vec<ImeEvent>,
    /// Frame-numbered events for deterministic replay (Phase 3+).
    pub frame: u64,
}

impl InputState {
    pub fn begin_frame(&mut self, frame: u64) {
        self.frame = frame;
        self.just.clear();
        self.pointer.delta_x = 0.0;
        self.pointer.delta_y = 0.0;
        self.ime_events.clear();
        self.touches
            .retain(|touch| !matches!(touch.phase, TouchPhase::Ended | TouchPhase::Cancelled));
        for touch in &mut self.touches {
            touch.delta_x = 0.0;
            touch.delta_y = 0.0;
        }
    }

    pub fn key_down(&mut self, key: KeyCode) {
        if self.pressed.insert(key) {
            self.just.insert(key);
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

    pub fn record_touch(&mut self, id: u64, x: f32, y: f32, pressure: f32, phase: TouchPhase) {
        if let Some(existing) = self.touches.iter_mut().find(|t| t.id == id) {
            existing.delta_x += x - existing.x;
            existing.delta_y += y - existing.y;
            existing.x = x;
            existing.y = y;
            existing.pressure = pressure;
            existing.phase = phase;
        } else {
            self.touches.push(TouchPoint {
                id,
                x,
                y,
                delta_x: 0.0,
                delta_y: 0.0,
                pressure,
                phase,
            });
        }
    }

    pub fn touches(&self) -> &[TouchPoint] {
        &self.touches
    }

    pub fn push_ime_event(&mut self, event: ImeEvent) {
        self.ime_events.push(event);
    }

    pub fn ime_events(&self) -> &[ImeEvent] {
        &self.ime_events
    }
}
