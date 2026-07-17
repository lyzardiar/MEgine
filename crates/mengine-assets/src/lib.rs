//! Asset database, handles, glTF import helpers.

mod animation;
mod animator;
mod gltf_import;
mod material;
mod registry;
mod texture;

pub use animation::{
    load_animation_clip, parse_animation_clip, sample_track, wrapped_animation_time, AnimationClip,
    AnimationEvent, AnimationInterpolation, AnimationKeyframe, AnimationSample, AnimationTrack,
    AnimationValue, AnimationWrapMode,
};
pub use animator::{
    load_animator_controller, parse_animator_controller, AnimatorCondition, AnimatorConditionMode,
    AnimatorController, AnimatorParameter, AnimatorParameterKind, AnimatorState,
    AnimatorTransition,
};
pub use gltf_import::{load_gltf_mesh_data, MeshData};
pub use material::{
    load_material_asset, parse_material_asset, MaterialAsset, MaterialFilter, MaterialShader,
    MaterialSurface, MaterialWrap,
};
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
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid asset: {0}")]
    Invalid(String),
}
