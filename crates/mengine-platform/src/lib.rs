//! Platform abstractions: target adapters, app lifecycle, unified input, VFS, and file stamps.

mod adapter;
mod files;
mod input;
mod lifecycle;
mod vfs;

pub use adapter::{
    capabilities_for, current_capabilities, current_target, AndroidAdapter, GraphicsBackendHint,
    IosAdapter, LinuxAdapter, MacOsAdapter, PlatformAdapter, PlatformCapabilities, PlatformTarget,
    ScriptBackendKind, SupportStage, WebAdapter, WindowsAdapter,
};
pub use files::{file_change_stamp, file_modified_time, FileChangeStamp};
pub use input::{GamepadState, ImeEvent, InputState, KeyCode, PointerState, TouchPhase, TouchPoint};
pub use lifecycle::{AppLifecycleEvent, LifecycleState, SafeAreaInsets};
pub use vfs::{
    normalize_vfs_path, AssetSource, LocalFsSource, MemoryFsSource, VfsError, VirtualFileSystem,
};

use std::path::{Path, PathBuf};

pub fn project_root_from_cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn resolve_asset(root: &Path, relative: &str) -> PathBuf {
    root.join("assets").join(relative)
}
