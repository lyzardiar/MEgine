//! Asset database, handles, glTF import helpers.

mod gltf_import;
mod registry;
mod texture;

pub use gltf_import::load_gltf_mesh_data;
pub use registry::{AssetMeta, AssetRegistry};
pub use texture::load_texture_rgba8;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureRgba8 {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AssetError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("gltf: {0}")]
    Gltf(String),
    #[error("image: {0}")]
    Image(#[from] image::ImageError),
    #[error("not found: {0}")]
    NotFound(String),
}
