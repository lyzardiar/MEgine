use mengine_core::command::WorldCommand;
use mengine_core::World;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Prefab {
    pub name: String,
    pub version: u32,
    pub components: Value,
    #[serde(default)]
    pub children: Vec<Prefab>,
}

/// Expand prefab into spawn commands (Intent IR / Content Browser).
pub fn expand_prefab(prefab: &Prefab, world: &mut World) {
    fn spawn_rec(prefab: &Prefab, world: &mut World, parent: Option<u64>) -> u64 {
        world.commands.push(WorldCommand::Spawn {
            name: Some(prefab.name.clone()),
            components: prefab.components.clone(),
        });
        let spawned = world.commit();
        let id = spawned.last().map(|e| e.to_u64()).unwrap_or(0);
        if let Some(p) = parent {
            world.commands.push(WorldCommand::SetParent {
                entity: id,
                parent: Some(p),
            });
            world.commit();
        }
        for child in &prefab.children {
            spawn_rec(child, world, Some(id));
        }
        id
    }
    spawn_rec(prefab, world, None);
}
