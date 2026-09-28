use crate::hierarchy::Parent;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;

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
    #[serde(default = "default_tag")]
    pub tag: String,
    #[serde(default)]
    pub layer: u8,
    #[serde(default)]
    pub components: HashMap<String, Value>,
}

fn default_true() -> bool {
    true
}

fn default_tag() -> String {
    "Untagged".into()
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WorldSnapshot {
    pub entities: Vec<EntitySnapshot>,
    pub frame: u64,
    #[serde(alias = "simFrame")]
    pub sim_frame: u64,
    #[serde(alias = "simulationTime")]
    pub elapsed: f64,
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
            elapsed: 0.0,
            clear_color: [0.1, 0.1, 0.14, 1.0],
            selected: None,
        }
    }
}

impl EntitySnapshot {
    fn from_world(world: &crate::world::World, e: crate::Entity) -> Self {
        let name = world
            .get_component::<crate::generated::Name>(e)
            .map(|n| n.value.clone());
        let parent = world.get_component::<Parent>(e).map(|p| p.entity.to_u64());
        let mut components = world.component_values(e).unwrap_or_default();
        components.retain(|name, _| name != "Name" && name != "Parent" && name != "Children");
        if let Some(serialized) = world.serialized_components(e) {
            for (name, value) in serialized {
                if !matches!(name.as_str(), "Name" | "Parent" | "Children") && !components.contains_key(name) { components.insert(name.clone(), value.clone()); }
            }
        }
        Self {
            entity: e.to_u64(),
            name,
            parent,
            sibling_index: world.sibling_index(e),
            active: world.entity_active(e),
            tag: world.entity_tag(e).into(),
            layer: world.entity_layer(e),
            components,
        }
    }
}

impl WorldSnapshot {
    pub fn from_world(world: &crate::world::World) -> Self {
        let entities = world.iter_entities().map(|e| EntitySnapshot::from_world(world, e)).collect();
        let cc = world.time.clear_color;
        Self {
            entities,
            frame: world.time.frame,
            sim_frame: world.time.sim_frame,
            elapsed: world.time.elapsed,
            clear_color: [cc.x, cc.y, cc.z, cc.w],
            selected: world.selected.map(|e| e.to_u64()),
        }
    }
}

/// Immutable entity payloads may be shared between frames; frame metadata is always fresh.
#[derive(Clone, Debug, Serialize)]
pub struct SharedWorldSnapshot {
    pub entities: Vec<Arc<EntitySnapshot>>,
    pub frame: u64,
    pub sim_frame: u64,
    pub elapsed: f64,
    pub clear_color: [f32; 4],
    pub selected: Option<u64>,
}

impl SharedWorldSnapshot {
    pub fn into_owned(self) -> WorldSnapshot {
        WorldSnapshot { entities: self.entities.into_iter().map(|entity| Arc::unwrap_or_clone(entity)).collect(), frame: self.frame, sim_frame: self.sim_frame, elapsed: self.elapsed, clear_color: self.clear_color, selected: self.selected }
    }
}

#[derive(Default)]
pub struct WorldSnapshotCache {
    world_id: u64,
    entities: HashMap<u64, (u64, Arc<EntitySnapshot>)>,
}

impl WorldSnapshotCache {
    pub fn capture(&mut self, world: &crate::World) -> SharedWorldSnapshot {
        if self.world_id != world.snapshot_id { self.entities.clear(); self.world_id = world.snapshot_id; }
        self.entities.retain(|id, _| world.is_alive(crate::Entity::from_u64(*id)));
        let entities = world.iter_entities().map(|entity| {
            let revision = world.entity_revision(entity);
            let entry = self.entities.entry(entity.to_u64()).or_insert_with(|| (revision, Arc::new(EntitySnapshot::from_world(world, entity))));
            if entry.0 != revision { *entry = (revision, Arc::new(EntitySnapshot::from_world(world, entity))); }
            Arc::clone(&entry.1)
        }).collect();
        SharedWorldSnapshot { entities, frame: world.time.frame, sim_frame: world.time.sim_frame, elapsed: world.time.elapsed, clear_color: world.time.clear_color.to_array(), selected: world.selected.map(|e| e.to_u64()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_snapshots_match_owned_values_across_all_world_mutations() {
        use crate::{command::WorldCommand, generated::{Name, Transform}};
        let mut world = crate::World::new();
        let first = world.spawn_empty();
        let second = world.spawn_empty();
        world.insert_component(first, Transform::default());
        let mut cache = WorldSnapshotCache::default();
        let original = cache.capture(&world);
        world.time.frame = 17; world.time.elapsed = 2.0; world.selected = Some(first);
        assert!(world.get_component_mut::<Name>(first).is_none());
        let clock = cache.capture(&world);
        assert!(Arc::ptr_eq(&original.entities[0], &clock.entities[0]));
        assert_eq!(clock.frame, 17);
        for operation in 0..11 {
            match operation {
                0 => world.get_component_mut::<Transform>(first).unwrap().position[0] = 9.0,
                1 => world.set_component_value(first, "Name", serde_json::json!({"value":"Hero"})),
                2 => world.set_component_value(first, "Custom", serde_json::json!({"text":"未知组件", "nested":[1,2]})),
                3 => world.set_parent(second, Some(first)),
                4 => world.set_editor_state(first, 7, false),
                5 => world.set_entity_metadata(first, "Hero".into(), 4),
                6 => world.remove_component_by_name(first, "Custom"),
                7 => world.apply_command(WorldCommand::SetComponent { entity:first.to_u64(), component:"Transform".into(), value:serde_json::json!({"position":[4,5,6]}) }),
                8 => world.remove_component_by_name(first, "Transform"),
                9 => { world.despawn(first); world.spawn_empty(); },
                _ => { world = crate::World::new(); world.spawn_empty(); },
            }
            let expected = WorldSnapshot::from_world(&world);
            let shared = cache.capture(&world);
            assert_eq!(serde_json::to_value(&shared).unwrap(), serde_json::to_value(&expected).unwrap());
            assert_eq!(shared.into_owned(), expected);
        }
        assert_eq!(original.entities[0].components["Transform"]["position"][0], 0.0);
        assert_eq!(original.frame, 0);
        assert_eq!(cache.entities.len(), 1);
    }

    #[test]
    fn snapshot_uses_live_typed_values_and_preserves_unknown_components() {
        let mut world = crate::World::new();
        let entity = world.spawn_empty();
        world.set_component_value(entity, "Name", serde_json::json!({"value":"Hero"}));
        world.set_component_value(entity, "Transform", serde_json::json!({"position":[1,2,3]}));
        world.set_component_value(entity, "ProjectBehaviour", serde_json::json!({"text":"自定义", "speed":4}));
        world.get_component_mut::<crate::generated::Transform>(entity).unwrap().position[0] = 9.0;
        let snapshot = WorldSnapshot::from_world(&world);
        assert_eq!(snapshot.entities[0].components["Transform"]["position"][0], 9.0);
        assert_eq!(snapshot.entities[0].components["ProjectBehaviour"]["speed"], 4);
        assert_eq!(snapshot.entities[0].name.as_deref(), Some("Hero"));
        assert!(!snapshot.entities[0].components.contains_key("Name"));
    }

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
        assert_eq!(snapshot.entities[0].tag, "Untagged");
        assert_eq!(snapshot.entities[0].layer, 0);
        assert_eq!(snapshot.entities[0].sibling_index, 3);
        assert!(!snapshot.entities[0].active);
        assert_eq!(snapshot.entities[0].components["Custom"]["value"], 42);
    }
}
