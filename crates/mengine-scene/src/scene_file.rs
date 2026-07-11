use crate::SceneError;
use mengine_core::snapshot::WorldSnapshot;
use mengine_core::World;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const SCENE_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SceneFile {
    pub version: u32,
    pub name:    String,
    pub world:   WorldSnapshot,
}

pub fn save_scene(path: &Path, name: &str, world: &World) -> Result<(), SceneError> {
    let file = SceneFile {
        version: SCENE_VERSION,
        name:    name.into(),
        world:   WorldSnapshot::from_world(world),
    };
    let json = serde_json::to_string_pretty(&file)?;
    std::fs::write(path, json)?;
    Ok(())
}

pub fn load_scene(path: &Path, world: &mut World) -> Result<SceneFile, SceneError> {
    let text = std::fs::read_to_string(path)?;
    let file: SceneFile = serde_json::from_str(&text)?;
    if file.version != SCENE_VERSION {
        return Err(SceneError::Version(file.version));
    }
    apply_snapshot(world, &file.world);
    Ok(file)
}

pub fn apply_snapshot(world: &mut World, snap: &WorldSnapshot) {
    // Clear alive entities
    let existing: Vec<_> = world.iter_entities().collect();
    for e in existing {
        world.despawn(e);
    }
    world.time.clear_color = glam::Vec4::new(
        snap.clear_color[0],
        snap.clear_color[1],
        snap.clear_color[2],
        snap.clear_color[3],
    );

    use mengine_core::command::WorldCommand;
    use serde_json::json;

    for ent in &snap.entities {
        let mut components = serde_json::Map::new();
        for (k, v) in &ent.components {
            components.insert(k.clone(), v.clone());
        }
        if let Some(name) = &ent.name {
            components.insert("Name".into(), json!({ "value": name }));
        }
        world.commands.push(WorldCommand::Spawn {
            name:       ent.name.clone(),
            components: serde_json::Value::Object(components),
        });
    }
    world.commit();

    // Re-apply parents in second pass (entities re-created with new ids — map by order)
    // MVP: parent links restored by index order matching snapshot order when possible.
    let spawned: Vec<_> = world.iter_entities().collect();
    for (i, ent) in snap.entities.iter().enumerate() {
        if let (Some(parent_u64), Some(child)) = (ent.parent, spawned.get(i)) {
            // Find parent by original id match in snapshot list
            if let Some(pi) = snap.entities.iter().position(|e| e.entity == parent_u64) {
                if let Some(p) = spawned.get(pi) {
                    world.set_parent(*child, Some(*p));
                }
            }
        }
    }

    if let Some(sel) = snap.selected {
        if let Some(i) = snap.entities.iter().position(|e| e.entity == sel) {
            world.selected = spawned.get(i).copied();
        }
    }
}
