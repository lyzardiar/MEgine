use crate::SceneError;
use mengine_core::snapshot::WorldSnapshot;
use mengine_core::World;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;
use uuid::Uuid;

pub const SCENE_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SceneFile {
    pub version: u32,
    pub name: String,
    pub world: WorldSnapshot,
}

pub fn save_scene(path: &Path, name: &str, world: &World) -> Result<(), SceneError> {
    let file = SceneFile {
        version: SCENE_VERSION,
        name: name.into(),
        world: WorldSnapshot::from_world(world),
    };
    let json = serde_json::to_string_pretty(&file)?;
    atomic_write(path, json.as_bytes())?;
    Ok(())
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("scene.mscene");
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));

    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace_file(&temp_path, path)?;
        sync_parent(parent)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temp_path);
    }
    result
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let from_wide: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to_wide: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let ok = unsafe {
        MoveFileExW(
            from_wide.as_ptr(),
            to_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::rename(from, to)
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> std::io::Result<()> {
    std::fs::File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> std::io::Result<()> {
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
    world.time.frame = snap.frame;
    world.time.sim_frame = snap.sim_frame;
    world.selected = None;

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
            name: ent.name.clone(),
            components: serde_json::Value::Object(components),
        });
    }
    // `commit` returns entities in Spawn command order. Do not rebuild this list
    // with `iter_entities`: clearing a populated world fills the free list and
    // subsequent spawns reuse slots in reverse order, so slot iteration no longer
    // matches the snapshot order.
    let spawned = world.commit();
    let entity_map: HashMap<u64, _> = snap
        .entities
        .iter()
        .zip(spawned.iter().copied())
        .map(|(snapshot, spawned)| (snapshot.entity, spawned))
        .collect();

    for ent in &snap.entities {
        let Some(&child) = entity_map.get(&ent.entity) else {
            continue;
        };
        world.set_editor_state(child, ent.sibling_index, ent.active);
        if let Some(parent) = ent.parent.and_then(|id| entity_map.get(&id)).copied() {
            world.set_parent(child, Some(parent));
        }
    }

    world.selected = snap.selected.and_then(|id| entity_map.get(&id)).copied();
}

#[cfg(test)]
mod tests {
    use super::*;
    use mengine_core::command::WorldCommand;
    use mengine_core::generated::{ParticleEmitter2D, ParticleEmitter3D, SpineSkeleton};
    use serde_json::json;

    fn temp_scene(name: &str) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("mengine-scene-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        (dir, path)
    }

    #[test]
    fn preserves_unknown_components_and_editor_fields() {
        let (dir, path) = temp_scene("unknown.mscene");
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Custom".into()),
            components: json!({
                "Transform": {
                    "position": [1.0, 2.0, 3.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0]
                },
                "CustomBehaviour": { "speed": 7, "label": "kept" }
            }),
        });
        let entity = world.commit()[0];
        world.set_editor_state(entity, 4, false);
        world.time.frame = 12;
        world.time.sim_frame = 9;
        world.selected = Some(entity);

        save_scene(&path, "Unknown", &world).unwrap();
        let mut loaded = World::new();
        load_scene(&path, &mut loaded).unwrap();
        let snapshot = WorldSnapshot::from_world(&loaded);

        assert_eq!(snapshot.entities[0].sibling_index, 4);
        assert!(!snapshot.entities[0].active);
        assert_eq!(snapshot.frame, 12);
        assert_eq!(snapshot.sim_frame, 9);
        assert!(snapshot.selected.is_some());
        assert_eq!(
            snapshot.entities[0].components["CustomBehaviour"]["speed"],
            7
        );
        assert_eq!(
            snapshot.entities[0].components["CustomBehaviour"]["label"],
            "kept"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn preserves_hierarchy_when_reusing_entity_slots_in_reverse_order() {
        let mut source = World::new();
        for name in ["Canvas", "Panel", "Image", "Text", "Badge"] {
            source.commands.push(WorldCommand::Spawn {
                name: Some(name.into()),
                components: json!({}),
            });
        }
        let entities = source.commit();
        source.set_parent(entities[1], Some(entities[0]));
        source.set_parent(entities[2], Some(entities[1]));
        source.set_parent(entities[3], Some(entities[1]));
        source.set_parent(entities[4], Some(entities[2]));
        source.set_editor_state(entities[2], 1, true);
        source.set_editor_state(entities[3], 0, false);
        source.selected = Some(entities[4]);
        let snapshot = WorldSnapshot::from_world(&source);

        // Populate the destination first. apply_snapshot will despawn these in
        // ascending slot order, causing Spawn to reuse the slots in reverse.
        let mut loaded = World::new();
        for index in 0..8 {
            loaded.commands.push(WorldCommand::Spawn {
                name: Some(format!("Old {index}")),
                components: json!({}),
            });
        }
        loaded.commit();
        apply_snapshot(&mut loaded, &snapshot);

        let round_trip = WorldSnapshot::from_world(&loaded);
        let by_name: HashMap<_, _> = round_trip
            .entities
            .iter()
            .map(|entity| (entity.name.as_deref().unwrap(), entity))
            .collect();
        let parent_name = |name: &str| {
            let parent_id = by_name[name].parent.expect("entity has a parent");
            round_trip
                .entities
                .iter()
                .find(|entity| entity.entity == parent_id)
                .and_then(|entity| entity.name.as_deref())
                .unwrap()
        };

        assert_eq!(parent_name("Panel"), "Canvas");
        assert_eq!(parent_name("Image"), "Panel");
        assert_eq!(parent_name("Text"), "Panel");
        assert_eq!(parent_name("Badge"), "Image");
        assert_eq!(by_name["Image"].sibling_index, 1);
        assert_eq!(by_name["Text"].sibling_index, 0);
        assert!(!by_name["Text"].active);
        assert_eq!(
            round_trip.selected,
            Some(by_name["Badge"].entity),
            "selection must follow the remapped entity id"
        );
    }

    #[test]
    fn atomic_save_replaces_an_existing_scene() {
        let (dir, path) = temp_scene("replace.mscene");
        std::fs::write(&path, "old").unwrap();
        save_scene(&path, "Replacement", &World::new()).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("Replacement"));
        assert!(!text.contains("old"));
        assert!(std::fs::read_dir(&dir).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".tmp")));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn round_trips_canvas_controls_lights_and_materials() {
        let (dir, path) = temp_scene("rendering.mscene");
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Rendered".into()),
            components: json!({
                "Transform": {
                    "position": [1, 2, 3], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]
                },
                "MeshRenderer": { "mesh": "cube", "material": "gold" },
                "SpriteRenderer": {
                    "sprite": "Assets/Sprites/hero.png", "flip_x": true, "flip_y": false,
                    "sorting_layer": "characters"
                },
                "PbrMaterial": { "base_color": [1, 0.5, 0.1, 1], "metallic": 0.8 },
                "PointLight": { "intensity": 9, "range": 11 },
                "SpotLight": { "inner_angle_degrees": 20, "outer_angle_degrees": 45 },
                "Image": {
                    "sprite": "Assets/UI/panel.png", "image_type": "Sliced",
                    "border": [8, 10, 8, 10], "source_size": [64, 64]
                },
                "AnimatedSprite2D": {
                    "frames": ["Assets/Sprites/run0.png", "Assets/Sprites/run1.png"],
                    "fps": 8, "playing": true, "looped": true, "frame": 1,
                    "flip_x": false, "flip_y": true, "sorting_layer": "characters",
                    "sorting_order": 3
                },
                "Line2D": {
                    "points": [[-1, 0], [0, 1], [1, 0]], "width": 0.15,
                    "color": [0.2, 0.8, 1, 1], "closed": true,
                    "sorting_layer": "effects", "sorting_order": 4
                },
                "AnimationPlayer": {
                    "clip": "Assets/Animations/idle.manim", "play_on_awake": true,
                    "playing": false, "speed": 1.25, "time": 0.5
                },
                "Animator": {
                    "controller": "Assets/Animations/hero.mcontroller",
                    "play_on_awake": true, "playing": true, "speed": 0.8,
                    "current_state": "Run", "parameters_json": "{\"Speed\":1}"
                },
                "AudioListener": { "primary": true },
                "AudioSource": {
                    "clip": "Assets/Audio/theme.ogg", "play_on_awake": true,
                    "playing": true, "looped": true, "volume": 0.75, "pitch": 1.1,
                    "pan": -0.2, "spatial_blend": 0.5, "min_distance": 2,
                    "max_distance": 40, "bus": "Music", "mute": false
                },
                "AudioMixer": {
                    "master_volume": 0.9, "music_volume": 0.8, "sfx_volume": 0.7,
                    "ui_volume": 0.6, "ambience_volume": 0.5, "muted": false
                },
                "RigidBody3D": {
                    "body_type": "dynamic", "mass": 2.5, "gravity_scale": 0.75,
                    "velocity": [1, 2, 3], "lock_rotation": true, "ccd": true
                },
                "BoxCollider3D": {
                    "size": [2, 3, 4], "center": [0, 0.5, 0], "friction": 0.8
                },
                "SphereCollider3D": {
                    "radius": 1.25, "is_trigger": true, "restitution": 0.6
                },
                "AspectRatioFitter": { "aspect_mode": "FitInParent", "aspect_ratio": 1.777778 },
                "ContentSizeFitter": {
                    "horizontal_fit": "PreferredSize", "vertical_fit": "MinSize"
                },
                "RawImage": {
                    "texture": "Assets/UI/avatar.png", "uv_rect": [0.25, 0, 0.5, 1]
                },
                "Shadow": {
                    "effect_color": [0, 0, 0, 0.4], "effect_distance": [2, -2]
                },
                "Outline": {
                    "effect_color": [1, 0.5, 0, 0.75], "effect_distance": [1, -1]
                },
                "Text": { "text": "Saved UI" },
                "Toggle": { "is_on": true },
                "ToggleGroup": { "allow_switch_off": true },
                "Slider": { "min_value": 0, "max_value": 10, "value": 7 },
                "Scrollbar": { "value": 0.6, "size": 0.25, "number_of_steps": 5 },
                "Panel": { "border_width": 2 },
                "CanvasGroup": { "alpha": 0.75 },
                "LayoutGroup": { "direction": "Grid", "constraint_count": 3 },
                "RectMask2D": { "padding": [1, 2, 3, 4] },
                "ProgressBar": { "value": 0.8 },
                "InputField": { "text": "Player" },
                "Dropdown": { "options": ["Low", "High"], "selected_index": 1 },
                "ListView": { "items": ["A", "B", "C"], "selected_index": 2 },
                "ScrollView": { "normalized_position": [0.25, 0.5] },
                "TabView": { "tabs": ["Main", "Advanced"], "selected_index": 1 }
            }),
        });
        world.commit();

        save_scene(&path, "Rendering", &world).unwrap();
        let mut loaded = World::new();
        load_scene(&path, &mut loaded).unwrap();
        let snapshot = WorldSnapshot::from_world(&loaded);
        let components = &snapshot.entities[0].components;
        let metallic = components["PbrMaterial"]["metallic"].as_f64().unwrap();
        assert!((metallic - 0.8).abs() < 0.0001);
        assert_eq!(components["PointLight"]["range"], 11.0);
        assert_eq!(components["SpotLight"]["outer_angle_degrees"], 45.0);
        assert_eq!(components["Image"]["image_type"], "Sliced");
        assert_eq!(components["Image"]["border"][1], 10.0);
        assert_eq!(components["Image"]["source_size"][0], 64.0);
        assert_eq!(components["SpriteRenderer"]["flip_x"], true);
        assert_eq!(components["SpriteRenderer"]["flip_y"], false);
        assert_eq!(components["SpriteRenderer"]["sorting_layer"], "characters");
        assert_eq!(components["SpriteRenderer"]["pivot"], json!([0.5, 0.5]));
        assert_eq!(
            components["AnimatedSprite2D"]["frames"][1],
            "Assets/Sprites/run1.png"
        );
        assert_eq!(components["AnimatedSprite2D"]["sorting_order"], 3);
        assert_eq!(
            components["AnimatedSprite2D"]["sorting_layer"],
            "characters"
        );
        assert_eq!(components["AnimatedSprite2D"]["flip_y"], true);
        assert_eq!(components["AnimatedSprite2D"]["pivot"], json!([0.5, 0.5]));
        assert_eq!(components["Line2D"]["points"][1][1], 1.0);
        assert_eq!(components["Line2D"]["closed"], true);
        assert_eq!(components["Line2D"]["sorting_layer"], "effects");
        assert_eq!(
            components["AnimationPlayer"]["clip"],
            "Assets/Animations/idle.manim"
        );
        assert_eq!(components["AnimationPlayer"]["playing"], false);
        assert_eq!(components["AnimationPlayer"]["speed"], 1.25);
        assert_eq!(
            components["Animator"]["controller"],
            "Assets/Animations/hero.mcontroller"
        );
        assert_eq!(components["Animator"]["current_state"], "Run");
        assert_eq!(components["Animator"]["parameters_json"], "{\"Speed\":1}");
        assert_eq!(components["AudioListener"]["primary"], true);
        assert_eq!(components["AudioSource"]["clip"], "Assets/Audio/theme.ogg");
        assert_eq!(components["AudioSource"]["spatial_blend"], 0.5);
        assert_eq!(components["AudioSource"]["bus"], "Music");
        assert!((components["AudioMixer"]["master_volume"].as_f64().unwrap() - 0.9).abs() < 0.0001);
        assert!(
            (components["AudioMixer"]["ambience_volume"]
                .as_f64()
                .unwrap()
                - 0.5)
                .abs()
                < 0.0001
        );
        assert_eq!(components["RigidBody3D"]["mass"], 2.5);
        assert_eq!(
            components["RigidBody3D"]["velocity"],
            json!([1.0, 2.0, 3.0])
        );
        assert_eq!(components["BoxCollider3D"]["size"], json!([2.0, 3.0, 4.0]));
        assert_eq!(components["SphereCollider3D"]["is_trigger"], true);
        assert_eq!(
            components["AspectRatioFitter"]["aspect_mode"],
            "FitInParent"
        );
        assert_eq!(
            components["ContentSizeFitter"]["horizontal_fit"],
            "PreferredSize"
        );
        assert_eq!(components["RawImage"]["uv_rect"][0], 0.25);
        assert_eq!(components["Shadow"]["effect_distance"][0], 2.0);
        assert_eq!(components["Outline"]["effect_color"][3], 0.75);
        assert_eq!(components["Text"]["text"], "Saved UI");
        assert_eq!(components["Toggle"]["is_on"], true);
        assert_eq!(components["ToggleGroup"]["allow_switch_off"], true);
        assert_eq!(components["Slider"]["value"], 7.0);
        assert_eq!(components["Scrollbar"]["number_of_steps"], 5);
        assert_eq!(components["Panel"]["border_width"], 2.0);
        assert_eq!(components["CanvasGroup"]["alpha"], 0.75);
        assert_eq!(components["LayoutGroup"]["constraint_count"], 3);
        assert_eq!(components["RectMask2D"]["padding"][2], 3.0);
        assert!((components["ProgressBar"]["value"].as_f64().unwrap() - 0.8).abs() < 0.0001);
        assert_eq!(components["InputField"]["text"], "Player");
        assert_eq!(components["Dropdown"]["options"][1], "High");
        assert_eq!(components["ListView"]["items"][2], "C");
        assert_eq!(components["ScrollView"]["normalized_position"][1], 0.5);
        assert_eq!(components["TabView"]["tabs"][0], "Main");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn round_trips_typed_2d_physics_components() {
        let (dir, path) = temp_scene("physics2d.mscene");
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Physics 2D".into()),
            components: json!({
                "Transform": {
                    "position": [1, 2, 3], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]
                },
                "Rigidbody2D": {
                    "body_type": "dynamic", "mass": 1.5, "gravity_scale": 0.5,
                    "velocity": [2, 3], "angular_velocity": 90, "freeze_rotation": false,
                    "ccd": true
                },
                "BoxCollider2D": {
                    "size": [2, 4], "offset": [0.25, -0.5], "friction": 0.7,
                    "bounciness": 0.2
                },
                "CircleCollider2D": {
                    "radius": 1.25, "offset": [0.5, 0], "is_trigger": true,
                    "friction": 0.3, "bounciness": 0.6
                }
            }),
        });
        world.commit();

        save_scene(&path, "Physics 2D", &world).unwrap();
        let mut loaded = World::new();
        load_scene(&path, &mut loaded).unwrap();
        let snapshot = WorldSnapshot::from_world(&loaded);
        let components = &snapshot.entities[0].components;
        assert_eq!(components["Rigidbody2D"]["velocity"], json!([2.0, 3.0]));
        assert_eq!(components["Rigidbody2D"]["angular_velocity"], 90.0);
        assert_eq!(components["BoxCollider2D"]["size"], json!([2.0, 4.0]));
        assert!((components["BoxCollider2D"]["bounciness"].as_f64().unwrap() - 0.2).abs() < 0.0001);
        assert_eq!(components["CircleCollider2D"]["is_trigger"], true);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn generated_loader_restores_particle_and_spine_runtime_types() {
        let (dir, path) = temp_scene("generated-runtime-components.mscene");
        let mut world = World::new();
        world.commands.push(WorldCommand::Spawn {
            name: Some("Runtime Components".into()),
            components: json!({
                "Transform": {},
                "ParticleEmitter2D": {
                    "rate_over_time": 12, "sorting_layer": "effects", "sorting_order": 7
                },
                "ParticleEmitter3D": { "max_particles": 321, "shape": "sphere" },
                "SpineSkeleton": {
                    "skeleton": "Assets/Spine/hero.json",
                    "atlas": "Assets/Spine/hero.atlas",
                    "animation": "walk",
                    "sorting_layer": "characters"
                }
            }),
        });
        world.commit();

        save_scene(&path, "Generated Runtime Components", &world).unwrap();
        let mut loaded = World::new();
        load_scene(&path, &mut loaded).unwrap();
        let entity = loaded.iter_entities().next().unwrap();
        assert_eq!(
            loaded
                .get_component::<ParticleEmitter2D>(entity)
                .unwrap()
                .sorting_order,
            7
        );
        assert_eq!(
            loaded
                .get_component::<ParticleEmitter2D>(entity)
                .unwrap()
                .sorting_layer,
            "effects"
        );
        assert_eq!(
            loaded
                .get_component::<ParticleEmitter3D>(entity)
                .unwrap()
                .max_particles,
            321
        );
        assert_eq!(
            loaded
                .get_component::<SpineSkeleton>(entity)
                .unwrap()
                .animation,
            "walk"
        );
        assert_eq!(
            loaded
                .get_component::<SpineSkeleton>(entity)
                .unwrap()
                .sorting_layer,
            "characters"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
