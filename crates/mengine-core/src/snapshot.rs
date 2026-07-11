use crate::hierarchy::{Children, Parent};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntitySnapshot {
    pub entity:     u64,
    pub name:       Option<String>,
    pub parent:     Option<u64>,
    pub components: HashMap<String, Value>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorldSnapshot {
    pub entities:    Vec<EntitySnapshot>,
    pub frame:       u64,
    pub sim_frame:   u64,
    pub clear_color: [f32; 4],
    pub selected:    Option<u64>,
}

impl WorldSnapshot {
    pub fn from_world(world: &crate::world::World) -> Self {
        let mut entities = Vec::new();
        for e in world.iter_entities() {
            let name = world
                .get_component::<crate::generated::Name>(e)
                .map(|n| n.value.clone());
            let parent = world.get_component::<Parent>(e).map(|p| p.entity.to_u64());
            let mut components = HashMap::new();
            if let Some(t) = world.get_component::<crate::generated::Transform>(e) {
                components.insert(
                    "Transform".into(),
                    serde_json::to_value(t).unwrap_or(Value::Null),
                );
            }
            if let Some(c) = world.get_component::<crate::generated::Camera3D>(e) {
                components.insert(
                    "Camera3D".into(),
                    serde_json::to_value(c).unwrap_or(Value::Null),
                );
            }
            if let Some(m) = world.get_component::<crate::generated::MeshRenderer>(e) {
                components.insert(
                    "MeshRenderer".into(),
                    serde_json::to_value(m).unwrap_or(Value::Null),
                );
            }
            if let Some(t2) = world.get_component::<crate::generated::Transform2D>(e) {
                components.insert(
                    "Transform2D".into(),
                    serde_json::to_value(t2).unwrap_or(Value::Null),
                );
            }
            if let Some(s) = world.get_component::<crate::generated::SpriteRenderer>(e) {
                components.insert(
                    "SpriteRenderer".into(),
                    serde_json::to_value(s).unwrap_or(Value::Null),
                );
            }
            if let Some(c) = world.get_component::<crate::generated::Canvas>(e) {
                components.insert("Canvas".into(), serde_json::to_value(c).unwrap_or(Value::Null));
            }
            if let Some(c) = world.get_component::<crate::generated::CanvasScaler>(e) {
                components.insert(
                    "CanvasScaler".into(),
                    serde_json::to_value(c).unwrap_or(Value::Null),
                );
            }
            if let Some(r) = world.get_component::<crate::generated::RectTransform>(e) {
                components.insert(
                    "RectTransform".into(),
                    serde_json::to_value(r).unwrap_or(Value::Null),
                );
            }
            if let Some(i) = world.get_component::<crate::generated::Image>(e) {
                components.insert("Image".into(), serde_json::to_value(i).unwrap_or(Value::Null));
            }
            if let Some(b) = world.get_component::<crate::generated::Button>(e) {
                components.insert("Button".into(), serde_json::to_value(b).unwrap_or(Value::Null));
            }
            let _ = world.get_component::<Children>(e);
            entities.push(EntitySnapshot {
                entity: e.to_u64(),
                name,
                parent,
                components,
            });
        }
        let cc = world.time.clear_color;
        Self {
            entities,
            frame:       world.time.frame,
            sim_frame:   world.time.sim_frame,
            clear_color: [cc.x, cc.y, cc.z, cc.w],
            selected:    world.selected.map(|e| e.to_u64()),
        }
    }
}
