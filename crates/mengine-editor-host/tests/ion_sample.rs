//! Ion Outpost acceptance through the same QuickJS host used by native Editor Play.
use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{EditorPlayRuntime, PlayProject, ScriptInput};
use serde_json::Value;
use std::path::PathBuf;

fn telemetry(snapshot: &WorldSnapshot) -> Value {
    let entity = snapshot.entities.iter().find(|e| e.name.as_deref() == Some("FPS telemetry")).unwrap();
    serde_json::from_str(entity.components["Text"]["text"].as_str().unwrap()).unwrap()
}

#[test]
fn ion_outpost_input_combat_and_pause_in_native_play() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let root = repo.join("samples/ion-outpost");
    let source = std::fs::read_to_string(root.join("Assets/Scripts/Main.js")).unwrap();
    let scene: Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let authored: WorldSnapshot = serde_json::from_value(scene["world"].clone()).unwrap();
    let runtime = EditorPlayRuntime::default();
    let mut snapshot = runtime.start(runtime.begin(), source, authored, PlayProject { root: Some(root), scene: "Assets/Scenes/Main.mscene".into(), name: "Ion Outpost".into(), ..Default::default() }).unwrap();
    let mut input = ScriptInput::default();
    input.key("F1".into(), true);
    for frame in 0..90 {
        snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 1.0/60.0).unwrap();
        input.finish_frame();
        if frame == 1 { input.key("F1".into(), false); input.key("KeyW".into(), true); }
        if frame == 30 { input.pointer_locked = true; input.pointer_delta = [100.0, -20.0]; input.button(0, true); }
        if frame == 60 { input.key("KeyW".into(), false); input.button(0, false); input.key("KeyR".into(), true); }
    }
    let state = telemetry(&snapshot);
    assert_eq!(state["mode"], "playing"); assert_eq!(state["actors"], 6);
    assert!(state["player"]["z"].as_f64().unwrap() < 18.0);
    assert!(state["shots"].as_i64().unwrap() > 0);
    assert!(state["player"]["ammo"][0].as_i64().unwrap() < 24);
    input.key("Escape".into(), true);
    snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap();
    input.finish_frame(); input.key("Escape".into(), false);
    snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap();
    let paused = telemetry(&snapshot);
    for _ in 0..5 { snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap(); }
    assert_eq!(telemetry(&snapshot)["frame"], paused["frame"]);
    assert_eq!(telemetry(&snapshot)["paused"], true);
    input.key("Enter".into(), true);
    snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap();
    input.finish_frame(); input.key("Enter".into(), false);
    for _ in 0..1850 {
        snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap();
        input.finish_frame();
        if telemetry(&snapshot)["mode"] == "finished" { break; }
    }
    assert_eq!(telemetry(&snapshot)["mode"], "finished");
    input.key("Enter".into(), true);
    snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap();
    input.finish_frame(); input.key("Enter".into(), false);
    for _ in 0..3 { snapshot = runtime.step(runtime.generation(), snapshot, input.clone(), 0.1).unwrap(); }
    assert_eq!(telemetry(&snapshot)["mode"], "playing");
    assert_eq!(telemetry(&snapshot)["player"]["deaths"], 0);
    runtime.stop();
}
