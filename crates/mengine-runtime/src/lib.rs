//! Shared runtime library (PC player binary + mobile stubs).

pub mod animation;
pub mod materials;
pub mod mobile_stub;
pub mod particles;
pub mod player_config;
pub mod scenes;
pub mod sprites;
pub mod textures;
pub mod ui;

pub use mobile_stub::{mengine_mobile_boot, mengine_mobile_version};
