use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Keyboard key codes covering the full range needed by games and editors.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum KeyCode {
    // Letters
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,

    // Digits
    Key0,
    Key1,
    Key2,
    Key3,
    Key4,
    Key5,
    Key6,
    Key7,
    Key8,
    Key9,

    // Function keys
    F1,
    F2,
    F3,
    F4,
    F5,
    F6,
    F7,
    F8,
    F9,
    F10,
    F11,
    F12,

    // Arrow keys
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,

    // Modifiers
    ShiftLeft,
    ShiftRight,
    ControlLeft,
    ControlRight,
    AltLeft,
    AltRight,
    MetaLeft,
    MetaRight,

    // Navigation / editing
    Space,
    Enter,
    Escape,
    Backspace,
    Delete,
    Insert,
    Home,
    End,
    PageUp,
    PageDown,
    Tab,
    CapsLock,

    // Punctuation / symbols
    Minus,
    Equal,
    BracketLeft,
    BracketRight,
    Backslash,
    Semicolon,
    Quote,
    Backquote,
    Comma,
    Period,
    Slash,

    // Numpad
    Numpad0,
    Numpad1,
    Numpad2,
    Numpad3,
    Numpad4,
    Numpad5,
    Numpad6,
    Numpad7,
    Numpad8,
    Numpad9,
    NumpadAdd,
    NumpadSubtract,
    NumpadMultiply,
    NumpadDivide,
    NumpadDecimal,
    NumpadEnter,

    // Lock keys
    NumLock,
    ScrollLock,
    PrintScreen,
    Pause,

    /// Any key not explicitly listed above.
    Other,
}

/// Mouse button identifiers.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    Back,
    Forward,
}

#[derive(Clone, Debug, Default)]
pub struct PointerState {
    pub x: f32,
    pub y: f32,
    pub delta_x: f32,
    pub delta_y: f32,
    /// Accumulated scroll wheel delta for the current frame (line units).
    pub scroll_x: f32,
    pub scroll_y: f32,
    pub left: bool,
    pub right: bool,
    pub middle: bool,
}

#[derive(Clone, Debug, Default)]
pub struct InputState {
    pressed: HashSet<KeyCode>,
    just: HashSet<KeyCode>,
    mouse_pressed: HashSet<MouseButton>,
    mouse_just: HashSet<MouseButton>,
    pub pointer: PointerState,
    /// Frame-numbered events for deterministic replay (Phase 3+).
    pub frame: u64,
}

impl InputState {
    pub fn begin_frame(&mut self, frame: u64) {
        self.frame = frame;
        self.just.clear();
        self.mouse_just.clear();
        self.pointer.delta_x = 0.0;
        self.pointer.delta_y = 0.0;
        self.pointer.scroll_x = 0.0;
        self.pointer.scroll_y = 0.0;
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

    pub fn mouse_down(&mut self, button: MouseButton) {
        if self.mouse_pressed.insert(button) {
            self.mouse_just.insert(button);
        }
        match button {
            MouseButton::Left => self.pointer.left = true,
            MouseButton::Right => self.pointer.right = true,
            MouseButton::Middle => self.pointer.middle = true,
            _ => {}
        }
    }

    pub fn mouse_up(&mut self, button: MouseButton) {
        self.mouse_pressed.remove(&button);
        match button {
            MouseButton::Left => self.pointer.left = false,
            MouseButton::Right => self.pointer.right = false,
            MouseButton::Middle => self.pointer.middle = false,
            _ => {}
        }
    }

    pub fn is_mouse_down(&self, button: MouseButton) -> bool {
        self.mouse_pressed.contains(&button)
    }

    pub fn just_mouse_pressed(&self, button: MouseButton) -> bool {
        self.mouse_just.contains(&button)
    }

    pub fn add_scroll(&mut self, x: f32, y: f32) {
        self.pointer.scroll_x += x;
        self.pointer.scroll_y += y;
    }
}