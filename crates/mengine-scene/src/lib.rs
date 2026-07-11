//! Scene / prefab serialization (*.mscene JSON + version header).

mod prefab;
mod scene_file;

pub use prefab::{expand_prefab, Prefab};
pub use scene_file::{apply_snapshot, load_scene, save_scene, SceneFile, SCENE_VERSION};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SceneError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("version mismatch: got {0}")]
    Version(u32),
}
