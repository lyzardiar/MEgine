// Author: MiYu. Frame-local UI submissions accompany physical input in the script runtime.
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Physical key codes match browser KeyboardEvent.code and winit KeyCode names.
/// Pointer coordinates are pixels from the top-left of the Game viewport.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ScriptInput {
    pub ui_submits: Vec<ScriptUiSubmit>,
    pub keys: BTreeSet<String>,
    pub pressed_keys: BTreeSet<String>,
    pub released_keys: BTreeSet<String>,
    pub pointer: [f32; 2],
    pub pointer_delta: [f32; 2],
    /// Wheel notches in this frame; positive scrolls down, negative up.
    pub wheel_delta: f32,
    pub pointer_locked: bool,
    pub viewport: [u32; 2],
    pub buttons: BTreeSet<u8>,
    pub pressed_buttons: BTreeSet<u8>,
    pub released_buttons: BTreeSet<u8>,
}

/// A committed Game text field submission; its value belongs to this input frame.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptUiSubmit {
    pub entity: u64,
    pub component: String,
    pub value: String,
}

impl ScriptInput {
    pub fn key(&mut self, code: String, down: bool) {
        if down {
            if self.keys.insert(code.clone()) { self.pressed_keys.insert(code); }
        } else if self.keys.remove(&code) { self.released_keys.insert(code); }
    }

    pub fn button(&mut self, button: u8, down: bool) {
        if down {
            if self.buttons.insert(button) { self.pressed_buttons.insert(button); }
        } else if self.buttons.remove(&button) { self.released_buttons.insert(button); }
    }

    pub fn finish_frame(&mut self) {
        self.wheel_delta = 0.0;
        self.ui_submits.clear();
        self.pointer_delta = [0.0; 2];
        self.pressed_keys.clear();
        self.released_keys.clear();
        self.pressed_buttons.clear();
        self.released_buttons.clear();
    }

    pub fn release_all(&mut self) {
        self.wheel_delta = 0.0;
        self.pointer_delta = [0.0; 2];
        self.pointer_locked = false;
        self.released_keys.append(&mut self.keys);
        self.released_buttons.append(&mut self.buttons);
    }
}
