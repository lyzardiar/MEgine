//! Script host backed by QuickJS, shared by editor Play and standalone players:
//! scripts only talk to `engine.*` and emit CommandBuffer entries.

mod bridge;
mod input;
mod network;

pub use bridge::{ScriptAnimationEvent, ScriptHost, ScriptRuntimeRequest, ScriptTimelineSignal};
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
