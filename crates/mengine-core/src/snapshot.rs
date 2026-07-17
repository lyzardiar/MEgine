use crate::hierarchy::{Children, Parent};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntitySnapshot {
    pub entity: u64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub parent: Option<u64>,
    #[serde(default, alias = "siblingIndex")]
    pub sibling_index: i32,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub components: HashMap<String, Value>,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct WorldSnapshot {
    pub entities: Vec<EntitySnapshot>,
    pub frame: u64,
    #[serde(alias = "simFrame")]
    pub sim_frame: u64,
    #[serde(alias = "clearColor")]
    pub clear_color: [f32; 4],
    pub selected: Option<u64>,
}

impl Default for WorldSnapshot {
    fn default() -> Self {
        Self {
            entities: Vec::new(),
            frame: 0,
            sim_frame: 0,
            clear_color: [0.1, 0.1, 0.14, 1.0],
            selected: None,
        }
    }
}

impl WorldSnapshot {
    pub fn from_world(world: &crate::world::World) -> Self {
        let mut entities = Vec::new();
        for e in world.iter_entities() {
            let name = world
                .get_component::<crate::generated::Name>(e)
                .map(|n| n.value.clone());
            let parent = world.get_component::<Parent>(e).map(|p| p.entity.to_u64());
            let mut components = world.serialized_components(e).cloned().unwrap_or_default();
            macro_rules! capture_component {
                ($ty:ty, $name:literal) => {
                    if let Some(component) = world.get_component::<$ty>(e) {
                        components.insert(
                            $name.into(),
                            serde_json::to_value(component).unwrap_or(Value::Null),
                        );
                    }
                };
            }
            capture_component!(crate::generated::Transform, "Transform");
            capture_component!(crate::generated::Transform2D, "Transform2D");
            capture_component!(crate::generated::Camera3D, "Camera3D");
            capture_component!(crate::generated::Camera2D, "Camera2D");
            capture_component!(crate::generated::DirectionalLight, "DirectionalLight");
            capture_component!(crate::generated::PointLight, "PointLight");
            capture_component!(crate::generated::SpotLight, "SpotLight");
            capture_component!(crate::generated::MeshRenderer, "MeshRenderer");
            capture_component!(crate::generated::PbrMaterial, "PbrMaterial");
            capture_component!(crate::generated::SpriteRenderer, "SpriteRenderer");
            capture_component!(crate::generated::AnimatedSprite2D, "AnimatedSprite2D");
            capture_component!(crate::generated::Canvas, "Canvas");
            capture_component!(crate::generated::CanvasScaler, "CanvasScaler");
            capture_component!(crate::generated::CanvasGroup, "CanvasGroup");
            capture_component!(crate::generated::RectTransform, "RectTransform");
            capture_component!(crate::generated::AspectRatioFitter, "AspectRatioFitter");
            capture_component!(crate::generated::ContentSizeFitter, "ContentSizeFitter");
            capture_component!(crate::generated::RectMask2D, "RectMask2D");
            capture_component!(crate::generated::LayoutGroup, "LayoutGroup");
            capture_component!(crate::generated::Image, "Image");
            capture_component!(crate::generated::RawImage, "RawImage");
            capture_component!(crate::generated::Shadow, "Shadow");
            capture_component!(crate::generated::Outline, "Outline");
            capture_component!(crate::generated::Button, "Button");
            capture_component!(crate::generated::Text, "Text");
            capture_component!(crate::generated::Toggle, "Toggle");
            capture_component!(crate::generated::ToggleGroup, "ToggleGroup");
            capture_component!(crate::generated::Slider, "Slider");
            capture_component!(crate::generated::Scrollbar, "Scrollbar");
            capture_component!(crate::generated::Panel, "Panel");
            capture_component!(crate::generated::ProgressBar, "ProgressBar");
            capture_component!(crate::generated::InputField, "InputField");
            capture_component!(crate::generated::Dropdown, "Dropdown");
            capture_component!(crate::generated::ListView, "ListView");
            capture_component!(crate::generated::ScrollView, "ScrollView");
            capture_component!(crate::generated::TabView, "TabView");
            capture_component!(crate::generated::Layer, "Layer");
            capture_component!(crate::generated::EditorOnly, "EditorOnly");
            capture_component!(crate::generated::AutoRotate, "AutoRotate");
            let _ = world.get_component::<Children>(e);
            entities.push(EntitySnapshot {
                entity: e.to_u64(),
                name,
                parent,
                sibling_index: world.sibling_index(e),
                active: world.entity_active(e),
                components,
            });
        }
        let cc = world.time.clear_color;
        Self {
            entities,
            frame: world.time.frame,
            sim_frame: world.time.sim_frame,
            clear_color: [cc.x, cc.y, cc.z, cc.w],
            selected: world.selected.map(|e| e.to_u64()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_browser_snapshot_aliases_and_defaults() {
        let json = r#"{
            "entities": [{
                "entity": 1,
                "name": "Cube",
                "siblingIndex": 3,
                "active": false,
                "components": { "Custom": { "value": 42 } }
            }],
            "frame": 2,
            "simFrame": 4,
            "clearColor": [0.2, 0.3, 0.4, 1.0]
        }"#;

        let snapshot: WorldSnapshot = serde_json::from_str(json).unwrap();
        assert_eq!(snapshot.sim_frame, 4);
        assert_eq!(snapshot.clear_color, [0.2, 0.3, 0.4, 1.0]);
        assert_eq!(snapshot.entities[0].sibling_index, 3);
        assert!(!snapshot.entities[0].active);
        assert_eq!(snapshot.entities[0].components["Custom"]["value"], 42);
    }
}
