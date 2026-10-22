// Author: MiYu. Per-extraction material sharing preserves per-object overrides and authored hot reload.
use super::*;
use mengine_core::generated::Transform;
use std::{hint::black_box, time::{Duration, Instant}};

fn baseline_objects(world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache) -> Vec<RenderObject> {
    let mut out = Vec::new();
    for entity in world.entities_with_components(&["MeshRenderer"]) {
        let Some(transform) = hierarchy.get(entity) else { continue; };
        if let Some(mesh) = world.get_component::<MeshRenderer>(entity) {
            let mut material = world.get_component::<PbrMaterial>(entity).map(render_material_from_component).unwrap_or_else(|| materials.resolve(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material)));
            if let Some(block) = world.get_component::<MaterialPropertyBlock>(entity) { material = apply_material_property_block(material, block); }
            out.push(RenderObject { mesh_key: mesh.mesh.trim().replace('\\', "/"), model: transform.matrix, cast_shadows: mesh.cast_shadows, receive_shadows: mesh.receive_shadows, material });
        }
    }
    out
}

fn assert_objects_equal(left: &[RenderObject], right: &[RenderObject]) {
    assert_eq!(left.len(), right.len());
    for (left, right) in left.iter().zip(right) {
        assert_eq!(left.mesh_key, right.mesh_key); assert_eq!(left.model, right.model);
        assert_eq!(left.cast_shadows, right.cast_shadows); assert_eq!(left.receive_shadows, right.receive_shadows);
        assert_eq!(format!("{:?}", left.material), format!("{:?}", right.material));
    }
}

#[test]
fn shared_material_extraction_keeps_overrides_private_and_refreshes_next_frame() {
    let root = std::env::temp_dir().join(format!("mengine-frame-materials-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(root.join("Assets")).unwrap();
    let file = root.join("Assets/Shared.mmat");
    std::fs::write(&file, r#"{"version":8,"shader":"pbr","base_color":[1,0,0,1],"roughness":0.8}"#).unwrap();
    let mut world = World::new();
    let entities: Vec<_> = (0..3).map(|_| { let entity = world.spawn_empty(); world.insert_component(entity, Transform::default()); world.insert_component(entity, MeshRenderer { mesh: "Assets\\Cube.glb".into(), material: "Assets/Shared.mmat".into(), ..Default::default() }); entity }).collect();
    world.insert_component(entities[0], MaterialPropertyBlock { override_base_color: true, base_color: [0.0, 1.0, 0.0, 1.0], ..Default::default() });
    world.insert_component(entities[2], PbrMaterial { base_color: [0.0, 0.0, 1.0, 1.0], ..Default::default() });
    let hierarchy = TransformHierarchy::build(&world);
    let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
    let first = collect_objects(&world, &hierarchy, &mut materials);
    assert_eq!(first[0].material.base_color, [0.0, 1.0, 0.0, 1.0]);
    assert_eq!(first[1].material.base_color, [1.0, 0.0, 0.0, 1.0]);
    assert_eq!(first[2].material.base_color, [0.0, 0.0, 1.0, 1.0]);
    assert_objects_equal(&first, &baseline_objects(&world, &hierarchy, &mut materials));
    std::thread::sleep(Duration::from_millis(270));
    std::fs::write(&file, r#"{"version":8,"shader":"pbr","base_color":[0.5,0.5,0.5,1],"roughness":0.2}"#).unwrap();
    let changed = collect_objects(&world, &hierarchy, &mut materials);
    assert_eq!(changed[1].material.base_color, [0.5, 0.5, 0.5, 1.0]);
    assert_eq!(changed[0].material.base_color, first[0].material.base_color);
    assert_eq!(changed[2].material.base_color, first[2].material.base_color);
    assert_objects_equal(&changed, &baseline_objects(&world, &hierarchy, &mut materials));
    drop(materials); std::fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "manual Frostbound material extraction CPU benchmark"]
fn benchmark_mesh_material_extraction() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let snapshot: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
    let mut world = World::new(); mengine_scene::apply_snapshot(&mut world, &snapshot);
    let mut reports = Vec::new();
    for activate in [false, true] {
        if activate { for entity in world.iter_entities().collect::<Vec<_>>() { world.set_editor_state(entity, 0, true); } }
        let hierarchy = TransformHierarchy::build(&world);
        let mut materials = RuntimeMaterialCache::new(Some(root.clone()));
        let expected = baseline_objects(&world, &hierarchy, &mut materials);
        assert_objects_equal(&expected, &collect_objects(&world, &hierarchy, &mut materials));
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
                let started = Instant::now();
                for _ in 0..40 { black_box(if index == 0 { baseline_objects(&world, &hierarchy, &mut materials) } else { collect_objects(&world, &hierarchy, &mut materials) }); }
                if run > 1 { samples[index].push(started.elapsed().as_secs_f64() * 1000.0 / 40.0); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        reports.push(serde_json::json!({"all_pool_entities_active":activate,"objects":expected.len(),"baseline_median_ms":samples[0][4],"cached_median_ms":samples[1][4],"samples":9,"objects_equal":true}));
    }
    println!("MESH_MATERIAL_BENCHMARK={}", serde_json::json!(reports));
}
