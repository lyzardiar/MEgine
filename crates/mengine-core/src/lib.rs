//! MEngine core: World, ECS, schedule, commands, time.

pub mod command;
pub mod component;
pub mod entity;
pub mod generated;
pub mod handle;
pub mod hierarchy;
pub mod query;
pub mod schedule;
pub mod snapshot;
pub mod surface_shader;
pub mod time;
pub mod transform_hierarchy;
pub mod world;

pub use command::{CommandBuffer, WorldCommand};
pub use component::{Component, ComponentId, ComponentRegistry};
pub use entity::Entity;
pub use handle::{AssetId, Handle};
pub use hierarchy::{Children, Parent};
pub use query::Query;
pub use schedule::{Schedule, Stage, SystemDesc};
pub use snapshot::{EntitySnapshot, WorldSnapshot};
pub use time::Time;
pub use transform_hierarchy::{TransformHierarchy, WorldTransform};
pub use world::World;
