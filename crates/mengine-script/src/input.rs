use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Physical key codes match browser KeyboardEvent.code and winit KeyCode names.
/// Pointer coordinates are pixels from the top-left of the Game viewport.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ScriptInput {
    pub keys: BTreeSet<String>,
    pub pressed_keys: BTreeSet<String>,
    pub released_keys: BTreeSet<String>,
    pub pointer: [f32; 2],
    pub viewport: [u32; 2],
    pub buttons: BTreeSet<u8>,
    pub pressed_buttons: BTreeSet<u8>,
    pub released_buttons: BTreeSet<u8>,
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
        self.pressed_keys.clear();
        self.released_keys.clear();
        self.pressed_buttons.clear();
        self.released_buttons.clear();
    }

    pub fn release_all(&mut self) {
        self.released_keys.append(&mut self.keys);
        self.released_buttons.append(&mut self.buttons);
    }
}
