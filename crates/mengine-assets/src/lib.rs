//! Asset database, handles, glTF import helpers.

mod animation;
mod animator;
mod asset_sidecar;
mod avatar_mask;
mod gltf_import;
mod material;
mod material_instance;
mod registry;
mod sprite;
mod surface_shader;
mod texture;
mod timeline;

pub use animation::{
    load_animation_clip, parse_animation_clip, sample_track, wrapped_animation_time, AnimationClip,
    AnimationEvent, AnimationInterpolation, AnimationKeyframe, AnimationSample,
    AnimationTangentMode, AnimationTrack, AnimationValue, AnimationWrapMode,
};
pub use animator::{
    load_animator_controller, parse_animator_controller, AnimatorBlendTree1D,
    AnimatorBlendTreeChild, AnimatorCondition, AnimatorConditionMode, AnimatorController,
    AnimatorLayer, AnimatorLayerBlendMode, AnimatorLayerMotion, AnimatorLayerTimingMode,
    AnimatorParameter, AnimatorParameterKind, AnimatorState, AnimatorTransition,
};
pub use asset_sidecar::{
    asset_sidecar_path, ensure_asset_sidecar, parse_asset_sidecar, read_asset_sidecar,
    AssetSidecar, ASSET_SIDECAR_SCHEMA_VERSION,
};
pub use avatar_mask::{load_avatar_mask, parse_avatar_mask, target_matches_mask, AvatarMaskAsset};
pub use gltf_import::{load_gltf_mesh_data, MeshData};
pub use material::{
    load_material_asset, parse_material_asset, MaterialAsset, MaterialBlendMode, MaterialFilter,
    MaterialShader, MaterialSurface, MaterialWrap,
};
pub use material_instance::{
    load_material_instance_asset, parse_material_instance_asset, MaterialInstanceAsset,
    MaterialInstanceOverrides,
};
pub use registry::{AssetMeta, AssetRegistry};
pub use sprite::{
    load_sprite_import, parse_sprite_import, split_sprite_reference, sprite_import_path,
    ResolvedSpriteSlice, SpriteImportSettings, SpriteMode, SpriteSlice,
};
pub use surface_shader::{load_surface_shader, parse_surface_shader, SURFACE_SHADER_HOOK_NAME};
pub use texture::{load_environment_texture, load_texture_rgba8, texture_dimensions};
pub use timeline::{
    load_timeline_asset, normalize_timeline_target, parse_timeline_asset,
    parse_timeline_binding_table, serialize_timeline_binding_table, TimelineAsset,
    TimelineBindingTable, TimelineCameraClip, TimelineEntityBinding, TimelineParticleClip,
    TimelineSignal, TimelineTrack, TimelineTrackGroup, MAX_TIMELINE_BINDINGS,
    MAX_TIMELINE_PARTICLE_TIME,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureRgba8 {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// Linear-light floating-point pixels used by image-based lighting.
///
/// Unlike regular color textures, values may exceed `1.0`; this is what keeps
/// Radiance HDR and OpenEXR highlights intact through the runtime upload path.
#[derive(Clone, Debug, PartialEq)]
pub struct EnvironmentTexture {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<f32>,
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
