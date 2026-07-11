//! Asset database, handles, glTF import helpers.

mod gltf_import;
mod registry;

pub use gltf_import::load_gltf_mesh_data;
pub use registry::{AssetMeta, AssetRegistry};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AssetError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("gltf: {0}")]
    Gltf(String),
    #[error("not found: {0}")]
    NotFound(String),
}
