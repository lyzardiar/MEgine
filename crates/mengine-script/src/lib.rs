//! JavaScript host, shared by editor Play and standalone players:
//! scripts only talk to `engine.*` and emit CommandBuffer entries.

#[cfg(all(feature = "v8-runtime", feature = "quickjs-runtime"))]
compile_error!("Choose one script runtime; QuickJS requires --no-default-features --features quickjs-runtime.");
#[cfg(not(any(feature = "v8-runtime", feature = "quickjs-runtime")))]
compile_error!("Enable either v8-runtime or quickjs-runtime.");

/// Build identity shared by editor Play, SDK validation and standalone players.
pub fn runtime_identity() -> serde_json::Value {
    #[cfg(feature = "v8-runtime")]
    let (backend, version) = ("v8", v8::V8::get_version());
    #[cfg(not(feature = "v8-runtime"))]
    let (backend, version) = ("quickjs", "rquickjs-0.14");
    serde_json::json!({ "backend": backend, "version": version, "bridgeVersion": 1 })
}

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
pub use asset_nodes::AssetNodeProfile;
pub use storage::project_storage_root;

pub use bridge::{ScriptAnimationEvent, ScriptHost, ScriptRuntimeRequest, ScriptTickProfile, ScriptTimelineSignal};
pub use input::{ScriptInput, ScriptUiSubmit};

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
