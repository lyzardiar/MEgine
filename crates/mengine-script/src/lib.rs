//! Script host backed by Boa (pure-Rust JS). API matches the planned QuickJS host:
//! scripts only talk to `engine.*` and emit CommandBuffer entries.

mod bridge;

pub use bridge::ScriptHost;

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
