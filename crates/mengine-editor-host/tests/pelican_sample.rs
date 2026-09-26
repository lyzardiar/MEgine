//! Opt-in full race through the real QuickJS bridge, native world and Play worker.
use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{EditorPlayRuntime, PlayProject, ScriptInput};
use serde_json::Value;
use std::{path::PathBuf, process::Command};

fn telemetry(snapshot: &WorldSnapshot) -> Value {
    let entity = snapshot.entities.iter().find(|e| e.name.as_deref() == Some("Race telemetry")).unwrap();
    serde_json::from_str(entity.components["Text"]["text"].as_str().unwrap()).unwrap()
}

#[test]
#[ignore = "sample acceptance: requires built CLI and samples/pelican-road-rage"]
fn complete_pelican_race_in_native_play_runtime() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let root = repo.join("samples/pelican-road-rage");
    let compiled = Command::new("node").current_dir(&repo).args(["packages/cli/dist/cli.js", "compile-play-script", "samples/pelican-road-rage"]).output().unwrap();
    assert!(compiled.status.success(), "{}", String::from_utf8_lossy(&compiled.stderr));
    let compiled: Value = serde_json::from_slice(&compiled.stdout).unwrap();
    let scene: Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let authored: WorldSnapshot = serde_json::from_value(scene["world"].clone()).unwrap();
    let runtime = EditorPlayRuntime::default();
    let mut snapshot = runtime.start(runtime.begin(), compiled["source"].as_str().unwrap().into(), authored.clone(), PlayProject { root: Some(root), scene: "Assets/Scenes/Main.mscene".into(), name: "Sunwash Coast".into(), ..Default::default() }).unwrap();
    let mut previous_keys = std::collections::BTreeSet::new();
    let start = std::time::Instant::now();
    let mut frames = 0;
    for frame in 0..1800 {
        let mut keys = Vec::<&str>::new();
        if frame == 1 { keys.push("Enter"); }
        if frame > 1 {
            let state = telemetry(&snapshot);
            if state["mode"] == "finished" { break; }
            assert_ne!(state["mode"], "wrecked", "{state}");
            if state["mode"] == "racing" {
                keys.push("KeyW");
                let distance = state["distance"].as_f64().unwrap();
                let lane = state["lane"].as_f64().unwrap();
                let fish = ((distance - 70.0) / 79.0).ceil() as i32;
                let target = if (0..32).contains(&fish) && 70.0 + fish as f64 * 79.0 - distance < 45.0 { [-4.0, 0.0, 4.0][fish as usize % 3] } else { 0.0 };
                if target > lane + 0.22 { keys.push("KeyD"); } else if target < lane - 0.22 { keys.push("KeyA"); }
                if state["boost"].as_f64().unwrap() > 25.0 && (target - lane).abs() < 1.0 { keys.push("Space"); }
                if frame % 7 == 0 {
                    if let Some(rival) = state["rivals"].as_array().unwrap().iter().find(|r| (r["s"].as_f64().unwrap() - distance).abs() < 5.0 && r["hp"].as_f64().unwrap() > 0.0 && r["stun"].as_f64().unwrap() < 0.1) {
                        keys.push(if rival["x"].as_f64().unwrap() < lane { "KeyJ" } else { "KeyK" });
                    }
                }
            }
        }
        let keys = keys.into_iter().map(str::to_owned).collect::<std::collections::BTreeSet<_>>();
        let mut input = ScriptInput::default();
        input.keys = keys.clone();
        input.pressed_keys = keys.difference(&previous_keys).cloned().collect();
        input.released_keys = previous_keys.difference(&keys).cloned().collect();
        previous_keys = keys;
        snapshot = runtime.step(runtime.generation(), snapshot, input, 0.1).unwrap();
        frames += 1;
    }
    let state = telemetry(&snapshot);
    assert_eq!(state["mode"], "finished", "{state}");
    assert!(state["hits"].as_u64().unwrap() > 0, "{state}");
    assert!(state["pickups"].as_u64().unwrap() >= 8, "{state}");
    assert_eq!(state["distance"], 2700);
    let report = serde_json::json!({"passed":true,"path":"EditorPlayRuntime / QuickJS / native World","frames":frames,"elapsedMs":start.elapsed().as_millis(),"race":state});
    std::fs::write(repo.join("docs/designs/pelican-road-rage/native-race.json"), serde_json::to_string_pretty(&report).unwrap() + "\n").unwrap();
    println!("{report}");
    runtime.stop();
}
