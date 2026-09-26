//! Opt-in campaign acceptance through the real QuickJS bridge and native Play worker.
use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{EditorPlayRuntime, PlayProject, ScriptInput};
use serde_json::Value;
use std::{collections::{BTreeMap, BTreeSet}, path::{Path, PathBuf}, process::Command};

fn telemetry(snapshot: &WorldSnapshot) -> Value {
    let entity = snapshot.entities.iter().find(|e| e.name.as_deref() == Some("Flight telemetry")).unwrap();
    serde_json::from_str(entity.components["Text"]["text"].as_str().unwrap()).unwrap()
}

fn save_frame(repo: &Path, name: &str, snapshot: &WorldSnapshot) {
    let scene = serde_json::json!({"version":1,"name":"Astral Thunder native replay","world":snapshot});
    std::fs::write(repo.join(format!("tmp/thunder-{name}.mscene")), serde_json::to_string(&scene).unwrap()).unwrap();
}

#[test]
#[ignore = "sample acceptance: requires Node, built CLI and samples/thunder-fighter"]
fn complete_thunder_campaign_in_native_play_runtime() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let pilot = Command::new("node").current_dir(&repo).arg("scripts/test-thunder-fighter.mjs").output().unwrap();
    assert!(pilot.status.success(), "{}\n{}", String::from_utf8_lossy(&pilot.stdout), String::from_utf8_lossy(&pilot.stderr));
    let replay: Vec<Vec<String>> = serde_json::from_slice(&std::fs::read(repo.join("tmp/thunder-replay.json")).unwrap()).unwrap();
    let root = repo.join("samples/thunder-fighter");
    let compiled = Command::new("node").current_dir(&repo).args(["packages/cli/dist/cli.js", "compile-play-script", "samples/thunder-fighter"]).output().unwrap();
    assert!(compiled.status.success(), "{}", String::from_utf8_lossy(&compiled.stderr));
    let compiled: Value = serde_json::from_slice(&compiled.stdout).unwrap();
    let scene: Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let authored: WorldSnapshot = serde_json::from_value(scene["world"].clone()).unwrap();
    let runtime = EditorPlayRuntime::default();
    let mut snapshot = runtime.start(runtime.begin(), compiled["source"].as_str().unwrap().into(), authored, PlayProject { root: Some(root), scene: "Assets/Scenes/Main.mscene".into(), name: "Astral Thunder".into(), ..Default::default() }).unwrap();
    let start = std::time::Instant::now();
    let mut previous_keys = BTreeSet::new();
    let mut phase_peaks = BTreeMap::<String,u64>::new();
    let mut nova_frame = None;
    for (frame, keys) in [Vec::new(), vec!["Enter".to_string()]].into_iter().chain(replay).enumerate() {
        let keys = keys.into_iter().collect::<BTreeSet<_>>();
        if keys.contains("Space") && !previous_keys.contains("Space") { nova_frame = Some(frame + 4); }
        let input = ScriptInput { keys: keys.clone(), pressed_keys: keys.difference(&previous_keys).cloned().collect(), released_keys: previous_keys.difference(&keys).cloned().collect(), ..Default::default() };
        previous_keys = keys;
        snapshot = runtime.step(runtime.generation(), snapshot, input, if frame < 2 { 1.0/60.0 } else { 0.1 }).unwrap();
        let state = telemetry(&snapshot);
        assert_ne!(state["mode"], "defeat", "frame {frame}: {state}");
        if frame == 0 { save_frame(&repo, "title", &snapshot); }
        if nova_frame == Some(frame) { save_frame(&repo, "nova", &snapshot); }
        if state["lasers"].as_array().unwrap().iter().any(|l| l["age"].as_f64().unwrap() > 1.5 && l["age"].as_f64().unwrap() < 1.61) { save_frame(&repo, "laser", &snapshot); }
        if state["mode"] == "victory" { save_frame(&repo, "victory", &snapshot); break; }
        if let Some(boss) = state["enemies"].as_array().unwrap().iter().find(|e| e["kind"].as_i64().unwrap() >= 3 && e["phase"].as_i64().unwrap() >= 0) {
            let name = format!("boss-{}-{}", boss["kind"], boss["phase"]);
            let count = state["bullets"].as_u64().unwrap();
            if count > *phase_peaks.get(&name).unwrap_or(&0) { phase_peaks.insert(name.clone(), count); save_frame(&repo, &name, &snapshot); }
        }
    }
    let state = telemetry(&snapshot);
    assert_eq!(state["mode"], "victory", "{state}");
    assert_eq!(state["bossPhases"], 5);
    assert_eq!(phase_peaks.len(), 5);
    assert!(state["peak"].as_u64().unwrap() >= 150);
    assert!(state["graze"].as_u64().unwrap() > 0);
    assert!(state["damageTaken"].as_u64().unwrap() > 0);
    let report = serde_json::json!({"passed":true,"path":"EditorPlayRuntime / QuickJS / native World / input-only replay","elapsedMs":start.elapsed().as_millis(),"flight":state,"phasePeaks":phase_peaks});
    std::fs::write(repo.join("docs/designs/thunder-fighter/native-campaign.json"), serde_json::to_string_pretty(&report).unwrap() + "\n").unwrap();
    println!("{report}");
    runtime.stop();
}
