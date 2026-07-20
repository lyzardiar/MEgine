//! Platform abstractions: window helpers, input state, paths.

mod input;

pub use input::{InputState, KeyCode, MouseButton, PointerState};

use std::path::{Path, PathBuf};

pub fn project_root_from_cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn resolve_asset(root: &Path, relative: &str) -> PathBuf {
    root.join("Assets").join(relative)
}
