//! Shared runtime library (PC player binary + mobile stubs).

pub mod animation;
pub mod audio;
pub mod materials;
pub mod meshes;
pub mod mobile_stub;
pub mod particles;
pub mod player_config;
pub mod prefabs;
pub mod scenes;
pub mod sorting;
pub mod sprites;
pub mod textures;
pub mod ui;

pub use mobile_stub::{mengine_mobile_boot, mengine_mobile_version};
