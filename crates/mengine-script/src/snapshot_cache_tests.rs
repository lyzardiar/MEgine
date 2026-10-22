// Author: MiYu. Snapshot compatibility and repeatable native/VM bridge measurements.
use super::*;
use mengine_core::generated::{Name, Transform};

fn publish(state: &mut ScriptSnapshot, world: &World, cache: &mut WorldSnapshotCache) {
    state.world = Some(cache.capture(world));
    state.revision += 1;
    state.json = None;
}

fn assert_snapshot(state: &mut ScriptSnapshot) {
    let expected = serde_json::to_string(&state.world).unwrap();
    assert_eq!(state.json(), expected);
}

#[test]
fn fragments_reuse_unchanged_entities_and_preserve_snapshot_schema() {
    let mut world = World::new();
    let first = world.spawn_empty();
    let second = world.spawn_empty();
    world.insert_component(first, Name { value: "quoted\"\\\n角色".into() });
    world.insert_component(first, Transform::default());
    world.set_parent(second, Some(first));
    world.set_component_value(second, "Custom", serde_json::json!({"values":[null, true, 112.00000000000001, "9007199254740993"]}));
    let mut cache = WorldSnapshotCache::default();
    let mut state = ScriptSnapshot::default();
    assert_eq!(state.json(), "null");
    publish(&mut state, &world, &mut cache);
    assert_snapshot(&mut state);
    assert!(state.entity_json.values().all(|cached| cached.1.is_none()));
    publish(&mut state, &world, &mut cache);
    assert_snapshot(&mut state);
    let first_json = state.entity_json[&first.to_u64()].1.as_ref().unwrap().get().as_ptr();
    let second_json = state.entity_json[&second.to_u64()].1.as_ref().unwrap().get().as_ptr();
    world.time.frame = 9; world.time.sim_frame = 7; world.time.elapsed = 0.125;
    world.time.clear_color = glam::Vec4::new(0.1, 0.2, 0.3, 0.4); world.selected = Some(second);
    publish(&mut state, &world, &mut cache);
    assert_snapshot(&mut state);
    assert_eq!(first_json, state.entity_json[&first.to_u64()].1.as_ref().unwrap().get().as_ptr());
    assert_eq!(second_json, state.entity_json[&second.to_u64()].1.as_ref().unwrap().get().as_ptr());
    world.set_component_value(second, "Custom", serde_json::json!({"values":[42]}));
    publish(&mut state, &world, &mut cache);
    state.world.as_mut().unwrap().entities.reverse();
    assert_snapshot(&mut state);
    assert_eq!(first_json, state.entity_json[&first.to_u64()].1.as_ref().unwrap().get().as_ptr());
    world.despawn(second);
    publish(&mut state, &world, &mut cache);
    assert_snapshot(&mut state);
    assert_eq!(state.entity_json.len(), 1);
    let mut replacement = World::new();
    let same_id = replacement.spawn_empty();
    assert_eq!(same_id, first);
    replacement.insert_component(same_id, Name { value: "replacement".into() });
    publish(&mut state, &replacement, &mut cache);
    assert_snapshot(&mut state);
    assert_eq!(state.entity_json[&same_id.to_u64()].0.upgrade().unwrap().name.as_deref(), Some("replacement"));
}

#[test]
fn vm_mutations_never_change_cached_native_entity_fragments() {
    let mut host = ScriptHost::new().unwrap();
    let mut world = World::new();
    let entity = world.spawn_empty(); world.insert_component(entity, Transform::default());
    host.sync_world(&world).unwrap();
    host.eval("const oldSnapshot = engine.snapshot; oldSnapshot.entities[0].components.Transform.position[0] = 123; oldSnapshot.entities[0].name = 'local';").unwrap();
    world.time.frame = 3;
    host.sync_world(&world).unwrap();
    host.eval("if (engine.snapshot.frame !== 3 || engine.snapshot.entities[0].components.Transform.position[0] !== 0 || engine.snapshot.entities[0].name !== null || oldSnapshot.entities[0].components.Transform.position[0] !== 123) throw Error('entity isolation');").unwrap();
    assert_eq!(host.snapshot.borrow().entity_json.len(), 1);
    host.inject_snapshot_json("{\"frame\":99}").unwrap();
    assert!(host.snapshot.borrow().entity_json.is_empty());
    host.sync_world(&world).unwrap();
    host.eval("if (engine.snapshot.frame !== 3 || engine.snapshot.entities.length !== 1) throw Error('injected cache retained');").unwrap();
}

#[test]
fn dense_changes_use_direct_json_and_stable_frames_warm_fragments() {
    let mut world = World::new();
    let entities: Vec<_> = (0..4).map(|_| world.spawn_empty()).collect();
    let mut cache = WorldSnapshotCache::default();
    let mut state = ScriptSnapshot::default();
    for frame in 0..4 {
        for entity in &entities { world.insert_component(*entity, Name { value: format!("Changed {frame}") }); }
        publish(&mut state, &world, &mut cache);
        assert_snapshot(&mut state);
        assert!(state.entity_json.values().all(|cached| cached.1.is_none()));
    }
    publish(&mut state, &world, &mut cache);
    assert_snapshot(&mut state);
    assert!(state.entity_json.values().all(|cached| cached.1.is_some()));
    let warmed = state.entity_json[&entities[0].to_u64()].1.as_ref().unwrap().get().as_ptr();
    publish(&mut state, &world, &mut cache);
    assert_snapshot(&mut state);
    assert_eq!(warmed, state.entity_json[&entities[0].to_u64()].1.as_ref().unwrap().get().as_ptr());
}

fn median_ms(mut samples: Vec<f64>) -> f64 { samples.sort_by(f64::total_cmp); samples[samples.len() / 2] }

// Run with cargo test -p mengine-script benchmark_snapshot_bridge -- --ignored --nocapture --test-threads=1.
#[test]
#[ignore = "manual performance measurement"]
fn benchmark_snapshot_bridge() {
    use std::hint::black_box;
    let mut reports = Vec::new();
    for count in [2_000, 20_000] {
        let mut world = World::new();
        for index in 0..count {
            let entity = world.spawn_empty();
            world.insert_component(entity, Name { value: format!("Entity {index}") });
            world.insert_component(entity, Transform::default());
            world.set_component_value(entity, "Custom", serde_json::json!({"weights":[0.125,0.25,0.5,1.0],"label":"snapshot benchmark 角色"}));
        }
        let changed = world.iter_entities().next().unwrap();
        for changed_count in [0, 1, count] {
            let mut cache = WorldSnapshotCache::default();
            let mut state = ScriptSnapshot::default();
            let mut before = Vec::new(); let mut after = Vec::new();
            let mut cold = (0.0, 0.0);
            let mut bytes = 0;
            for frame in 0..35 {
                world.time.frame = frame;
                if changed_count == 1 { world.insert_component(changed, Name { value: format!("Changed {frame}") }); }
                if changed_count == count {
                    let entities: Vec<_> = world.iter_entities().collect();
                    for entity in entities { world.insert_component(entity, Name { value: format!("Changed {} {frame}", entity.to_u64()) }); }
                }
                publish(&mut state, &world, &mut cache);
                let started = Instant::now();
                let original = serde_json::to_string(&state.world).unwrap();
                let baseline_ms = started.elapsed().as_secs_f64() * 1000.0;
                let started = Instant::now();
                let actual = black_box(state.json());
                let cached_ms = started.elapsed().as_secs_f64() * 1000.0;
                assert_eq!(actual, original); bytes = actual.len();
                if frame == 0 { cold = (baseline_ms, cached_ms); }
                if frame >= 5 { before.push(baseline_ms); after.push(cached_ms); }
            }
            reports.push(serde_json::json!({"phase":"native_json","entities":count,"changed_per_frame":changed_count,"bytes":bytes,"samples":30,"baseline_median_ms":median_ms(before),"cached_median_ms":median_ms(after),"cold_baseline_ms":cold.0,"cold_cached_ms":cold.1}));
        }
        let mut host = ScriptHost::new().unwrap();
        let mut before = Vec::new(); let mut after = Vec::new();
        for frame in 0..35 {
            for baseline in [true, false] {
                world.time.frame += 1;
                let started = Instant::now();
                host.sync_world(&world).unwrap();
                if baseline {
                    let mut state = host.snapshot.borrow_mut();
                    state.json = Some(serde_json::to_string(&state.world).unwrap());
                }
                host.eval("if(engine.snapshot.entities.length === 0) throw Error('empty');").unwrap();
                let ms = started.elapsed().as_secs_f64() * 1000.0;
                if frame >= 5 { if baseline { before.push(ms); } else { after.push(ms); } }
            }
        }
        reports.push(serde_json::json!({"phase":"sync_native_and_vm_parse","entities":count,"samples":30,"baseline_median_ms":median_ms(before),"cached_median_ms":median_ms(after)}));
    }
    println!("SNAPSHOT_BENCHMARK={}", serde_json::to_string(&reports).unwrap());
}

fn original_parse_command(json: &str) -> Option<WorldCommand> {
    #[derive(serde::Deserialize)]
    struct ComponentCommand { op: String, entity: u64, component: String, value: JsonValue }
    if let Ok(command) = serde_json::from_str::<ComponentCommand>(json) {
        if command.op == "setComponent" { return Some(WorldCommand::SetComponent { entity: command.entity, component: command.component, value: command.value }); }
    }
    serde_json::from_str(json).ok()
}

#[test]
fn optimized_command_dispatch_preserves_unusual_inputs() {
    for json in [r#" { "value": [1, 2], "component": "Custom", "op": "setComponent", "entity": 3 }"#, r#"{"op":"setComponent" ,"entity":3,"component":"Custom","value":[1,2]}"#, r#"{"op":"setComponent","op":"despawn","entity":3,"component":"Custom","value":null}"#, r#"{"op":"setActive","entity":3,"active":true,"value":[1,2],"component":"Custom"}"#, r#"{"op":"setClearColor","r":1,"g":0,"b":0,"a":1} trailing"#] {
        let encoded = |command: Option<WorldCommand>| command.map(|command| serde_json::to_value(command).unwrap());
        assert_eq!(encoded(parse_command(json)), encoded(original_parse_command(json)), "{json}");
    }
}

#[test]
#[ignore = "manual performance measurement"]
fn benchmark_command_bridge() {
    use std::hint::black_box;
    let values = serde_json::to_string(&vec![[1.0, 2.0, 3.0, 4.0]; 8192]).unwrap();
    let mut reports = Vec::new();
    for (name, json, iterations) in [
        ("clear_color", r#"{"op":"setClearColor","r":1,"g":0,"b":0,"a":1}"#.to_owned(), 5000),
        ("large_component", format!(r#"{{"op":"setComponent","entity":1,"component":"Custom","value":{values}}}"#), 30),
        ("reordered_large_component", format!(r#"{{"value":{values},"entity":1,"component":"Custom","op":"setComponent"}}"#), 30),
    ] {
        let mut before = Vec::new(); let mut after = Vec::new();
        for round in 0..9 {
            for baseline in [true, false] {
                let started = Instant::now();
                for _ in 0..iterations { black_box(if baseline { original_parse_command(black_box(&json)) } else { parse_command(black_box(&json)) }).unwrap(); }
                let ms = started.elapsed().as_secs_f64() * 1000.0 / iterations as f64;
                if round >= 2 { if baseline { before.push(ms); } else { after.push(ms); } }
            }
        }
        reports.push(serde_json::json!({"command":name,"iterations_per_sample":iterations,"samples":7,"baseline_median_ms":median_ms(before),"optimized_median_ms":median_ms(after)}));
    }
    println!("COMMAND_BENCHMARK={}", serde_json::to_string(&reports).unwrap());
}

#[test]
#[ignore = "manual performance measurement"]
fn benchmark_frost_scene_snapshot() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms/Assets/Scenes/Main.mscene");
    let scene: JsonValue = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let original: mengine_core::snapshot::WorldSnapshot = serde_json::from_value(scene["world"].clone()).unwrap();
    let mut world = SharedWorldSnapshot { entities: original.entities.into_iter().map(Arc::new).collect(), frame: original.frame, sim_frame: original.sim_frame, elapsed: original.elapsed, clear_color: original.clear_color, selected: original.selected };
    let units: Vec<_> = world.entities.iter().enumerate().filter(|(_, entity)| entity.name.as_ref().is_some_and(|name| name.starts_with("Unit ") || name.starts_with("Mini unit "))).map(|(index, _)| index).collect();
    let mut reports = Vec::new();
    for moving in [false, true] {
        let mut host = ScriptHost::new().unwrap();
        let mut native_before = Vec::new(); let mut native_after = Vec::new();
        let mut vm_before = Vec::new(); let mut vm_after = Vec::new();
        let mut bytes = 0;
        for frame in 0..18 {
            world.frame += 1;
            if moving {
                for index in &units {
                    let entity = Arc::make_mut(&mut world.entities[*index]);
                    let (component, field) = if entity.components.contains_key("Transform") { ("Transform", "position") } else { ("RectTransform", "anchored_position") };
                    if let Some(position) = entity.components.get_mut(component).and_then(|component| component.get_mut(field)).and_then(JsonValue::as_array_mut) { position[0] = serde_json::json!(frame as f64 * 0.1); }
                }
            }
            for baseline in [true, false] {
                let mut state = host.snapshot.borrow_mut();
                state.revision += 1; state.world = Some(world.clone()); state.json = None;
                let started = Instant::now();
                if baseline { state.json = Some(serde_json::to_string(&state.world).unwrap()); } else { state.json(); }
                let native_ms = started.elapsed().as_secs_f64() * 1000.0;
                bytes = state.json.as_ref().unwrap().len();
                drop(state);
                host.restore_snapshot_properties().unwrap();
                let started = Instant::now();
                host.eval("if(engine.snapshot.entities.length !== 3812) throw Error('scene fixture changed');").unwrap();
                let total_ms = native_ms + started.elapsed().as_secs_f64() * 1000.0;
                if frame >= 3 {
                    if baseline { native_before.push(native_ms); vm_before.push(total_ms); }
                    else { native_after.push(native_ms); vm_after.push(total_ms); }
                }
            }
        }
        reports.push(serde_json::json!({"scene":"Frostbound Main.mscene","entities":world.entities.len(),"bytes":bytes,"synthetic_unit_motion":moving,"changed_per_frame":if moving { units.len() } else { 0 },"samples":15,"native_baseline_median_ms":median_ms(native_before),"native_cached_median_ms":median_ms(native_after),"native_and_vm_baseline_median_ms":median_ms(vm_before),"native_and_vm_cached_median_ms":median_ms(vm_after)}));
    }
    println!("FROST_SNAPSHOT_BENCHMARK={}", serde_json::to_string(&reports).unwrap());
}
