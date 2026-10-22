//! Platform abstractions: window helpers, input state, paths.

mod input;
mod files;

pub use input::{InputState, KeyCode, PointerState};
pub use files::file_modified_time;

use std::path::{Path, PathBuf};

pub fn project_root_from_cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn resolve_asset(root: &Path, relative: &str) -> PathBuf {
    root.join("assets").join(relative)
}
