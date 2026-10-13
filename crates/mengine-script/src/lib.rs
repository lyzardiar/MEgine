//! JavaScript host, shared by editor Play and standalone players:
//! scripts only talk to `engine.*` and emit CommandBuffer entries.

mod bridge;
#[cfg(feature = "v8-runtime")]
#[path = "vm_v8.rs"]
mod vm;
#[cfg(not(feature = "v8-runtime"))]
#[path = "vm_quickjs.rs"]
mod vm;
mod input;
mod network;
mod storage;
mod asset_nodes;
pub use storage::project_storage_root;

pub use bridge::{ScriptAnimationEvent, ScriptHost, ScriptRuntimeRequest, ScriptTickProfile, ScriptTimelineSignal};
pub use input::ScriptInput;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScriptError {
    #[error("js: {0}")]
    Js(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

#[cfg(test)]
mod runtime_tests;
