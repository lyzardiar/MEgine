// Author: MiYu. Compare revisioned extraction with fresh world/material evaluation after edits and hot reload.
use super::*;
use mengine_core::generated::Transform;
use std::{any::Any, sync::{Arc, atomic::{AtomicBool, Ordering}}, time::Instant};

fn compare(cache: &mut FrameMeshInputs, world: &World, materials: &mut RuntimeMaterialCache) -> Vec<RenderObject> {
    let hierarchy = TransformHierarchy::build(world); let expected = collect_objects(world, &hierarchy, materials);
    let mut entities = Vec::new(); let current = cache.collect(world, &hierarchy, materials, Some(&mut entities));
    assert_eq!(cache.last_entities(), entities);
    assert_eq!(entities.len(), current.len()); assert_eq!(expected.len(), current.len());
    for (old, new) in expected.iter().zip(&current) {
        assert_eq!(old.mesh_key, new.mesh_key); assert_eq!(old.model, new.model); assert_eq!(old.cast_shadows, new.cast_shadows); assert_eq!(old.receive_shadows, new.receive_shadows);
        assert_eq!(format!("{:?}", *old.material), format!("{:?}", *new.material));
    }
    current
}

fn mesh(world: &mut World, key: &str) -> Entity {
    let entity = world.spawn_empty(); world.insert_component(entity, Transform::default());
    world.insert_component(entity, MeshRenderer { mesh: " Assets\\Cube.glb ".into(), material: key.into(), ..Default::default() }); entity
}

#[test]
fn cached_mesh_inputs_follow_parent_activation_component_edits_order_and_entity_reuse() {
    let mut world = World::new(); let parent = world.spawn_empty(); world.insert_component(parent, Transform::default());
    let first = mesh(&mut world, "red"); world.set_parent(first, Some(parent)); let second = mesh(&mut world, "blue");
    world.insert_component(second, PbrMaterial::default());
    let mut cache = FrameMeshInputs::default(); let mut materials = RuntimeMaterialCache::default();
    let original = compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 2);
    compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 0);
    world.get_component_mut::<Transform>(parent).unwrap().position[0] = 3.;
    let moved = compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 0); assert_ne!(moved[0].model, original[0].model);
    world.get_component_mut::<MeshRenderer>(first).unwrap().mesh = " next\\mesh ".into();
    world.insert_component(first, MaterialPropertyBlock { override_base_color: true, base_color: [-0., 0.3, 0.4, 1.], ..Default::default() });
    world.get_component_mut::<PbrMaterial>(second).unwrap().metallic = 0.8;
    let changed = compare(&mut cache, &world, &mut materials); assert_eq!(changed[0].mesh_key, "next/mesh"); assert_eq!(changed[1].material.metallic, 0.8);
    world.remove_component_by_name(second, "PbrMaterial"); world.get_component_mut::<MeshRenderer>(second).unwrap().material = "green".into();
    compare(&mut cache, &world, &mut materials);
    world.set_editor_state(parent, 0, false); compare(&mut cache, &world, &mut materials); assert_eq!(cache.entries.len(), 1);
    world.get_component_mut::<MaterialPropertyBlock>(first).unwrap().base_color = [1.; 4]; world.set_editor_state(parent, 0, true);
    compare(&mut cache, &world, &mut materials); world.set_entity_iteration_order(&[second, first, parent]);
    let reordered = compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 0); assert_eq!(reordered[1].mesh_key, "next/mesh");
    world.despawn(first); let reused = mesh(&mut world, "green"); assert_eq!(reused.index, first.index); assert_ne!(reused, first);
    compare(&mut cache, &world, &mut materials); assert_eq!(cache.entries.len(), 2);
    world.remove_component_by_name(second, "MeshRenderer"); compare(&mut cache, &world, &mut materials); assert_eq!(cache.entries.len(), 1); assert_eq!(cache.sources.len(), 1);
    let mut replacement = World::new(); mesh(&mut replacement, "blue"); compare(&mut cache, &replacement, &mut materials); assert_eq!(cache.rebuilt, 1);
    replacement = World::new(); compare(&mut cache, &replacement, &mut materials); assert!(cache.entries.is_empty() && cache.sources.is_empty());
    assert_eq!(original[0].mesh_key, "Assets/Cube.glb"); assert_ne!(original[1].material.metallic, 0.8);
}

struct ProjectedMaterial { switch: Arc<AtomicBool>, first: PbrMaterial, second: PbrMaterial }
impl mengine_core::Component for ProjectedMaterial {
    fn type_name() -> &'static str { "ProjectedMaterial" }
    fn as_any(&self) -> &dyn Any { if self.switch.load(Ordering::Relaxed) { &self.second } else { &self.first } }
    fn as_any_mut(&mut self) -> &mut dyn Any { self }
    fn to_value(&self) -> serde_json::Value { serde_json::Value::Null }
}

#[test]
fn cached_mesh_inputs_reread_custom_any_views_without_world_mutation() {
    let mut world = World::new(); let entity = mesh(&mut world, "red"); let switch = Arc::new(AtomicBool::new(false));
    world.insert_component(entity, ProjectedMaterial { switch: switch.clone(), first: PbrMaterial::default(), second: PbrMaterial { metallic: 0.9, ..Default::default() } });
    let mut cache = FrameMeshInputs::default(); let mut materials = RuntimeMaterialCache::default();
    compare(&mut cache, &world, &mut materials); switch.store(true, Ordering::Relaxed);
    let next = compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 1); assert_eq!(next[0].material.metallic, 0.9);
}

#[test]
fn cached_mesh_inputs_refresh_authored_materials_without_entity_changes() {
    let root = std::env::temp_dir().join(format!("mengine-frame-mesh-inputs-{}", uuid::Uuid::new_v4())); std::fs::create_dir_all(root.join("Assets")).unwrap();
    let file = root.join("Assets/Shared.mmat"); std::fs::write(&file, r#"{"version":10,"base_color":[1,1,1,1],"roughness":0.2}"#).unwrap();
    let mut world = World::new(); let first = mesh(&mut world, "Assets/Shared.mmat"); let second = mesh(&mut world, "Assets/Shared.mmat");
    for entity in [first, second] { world.insert_component(entity, MaterialPropertyBlock { override_base_color: true, base_color: [0.3, 0.4, 0.5, 1.], ..Default::default() }); }
    let mut materials = RuntimeMaterialCache::new(Some(root.clone())); let mut cache = FrameMeshInputs::default();
    let before = compare(&mut cache, &world, &mut materials); assert!(std::ptr::eq(&*before[0].material, &*before[1].material));
    let stable = compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 0); assert!(std::ptr::eq(&*before[0].material, &*stable[0].material));
    std::fs::write(&file, r#"{"version":10,"base_color":[1,1,1,1],"roughness":0.8}"#).unwrap(); materials.invalidate("Assets/Shared.mmat");
    let after = compare(&mut cache, &world, &mut materials); assert_eq!(cache.rebuilt, 0); assert_eq!(after[0].material.roughness, 0.8); assert_eq!(before[0].material.roughness, 0.2);
    assert!(std::ptr::eq(&*after[0].material, &*after[1].material));
    std::fs::remove_file(&file).unwrap(); materials.invalidate("Assets/Shared.mmat"); compare(&mut cache, &world, &mut materials);
    drop(materials); std::fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "manual actual-map alternating mesh input extraction profile"]
fn benchmark_cached_mesh_inputs() {
    let root = std::path::PathBuf::from(std::env::var_os("MENGINE_MATERIAL_PROJECT").unwrap());
    let scene = std::env::var_os("MENGINE_MATERIAL_SCENE").unwrap(); let mut world = World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
    let mut materials = RuntimeMaterialCache::new(Some(root)); let mut cache = FrameMeshInputs::default();
    let ids: Vec<_> = world.entities_with_components(&["MeshRenderer", "Transform"]).take(200).collect();
    for animated in [false, true] {
        compare(&mut cache, &world, &mut materials); let mut samples = [Vec::new(), Vec::new()];
        for round in 0..10 {
            for mode in if round % 2 == 0 { [0, 1] } else { [1, 0] } {
                let mut elapsed = 0.;
                for iteration in 0..20 {
                    if animated { for &entity in &ids { world.get_component_mut::<Transform>(entity).unwrap().position[0] = (iteration % 2) as f32; } }
                    let hierarchy = TransformHierarchy::build(&world); let started = Instant::now();
                    let objects = if mode == 0 { collect_objects(&world, &hierarchy, &mut materials) } else { cache.collect(&world, &hierarchy, &mut materials, None) };
                    elapsed += started.elapsed().as_secs_f64() * 1000.; std::hint::black_box(objects);
                }
                if round >= 2 { samples[mode].push(elapsed / 20.); }
            }
            compare(&mut cache, &world, &mut materials);
        }
        let summary = |mut v: Vec<f64>| { let mean = v.iter().sum::<f64>() / v.len() as f64; v.sort_by(f64::total_cmp); [mean, v[v.len() / 2], v[v.len() * 95 / 100]] };
        println!("FRAME_MESH_INPUTS animated200={animated} objects={} sources={} cachedEntries={} samples=8 framesPerSample=20 before={:?} after={:?}", cache.entries.len(), cache.sources.len(), cache.entries.len(), summary(samples[0].clone()), summary(samples[1].clone()));
    }
}
