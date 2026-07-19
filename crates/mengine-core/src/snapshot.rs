use crate::hierarchy::Parent;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
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
            if let Some(live_components) = world.component_values(e) {
                components.extend(
                    live_components.into_iter().filter(|(name, _)| {
                        name != "Name" && name != "Parent" && name != "Children"
                    }),
                );
            }
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
