//! MiYu: actual QuickJS and World acceptance for the native RTS and map editor.
use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{EditorPlayRuntime, PlayProject, ScriptInput};
use serde_json::Value;
use std::path::PathBuf;
fn telemetry(s: &WorldSnapshot) -> Value { serde_json::from_str(s.entities.iter().find(|e|e.name.as_deref()==Some("Frost telemetry")).unwrap().components["Text"]["text"].as_str().unwrap()).unwrap() }
#[test]
fn native_skirmish_editor_and_rpg_modes() {
    let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let source=std::fs::read_to_string(root.join("Assets/Scripts/Main.js")).unwrap();
    let scene:Value=serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let runtime=EditorPlayRuntime::default();
    let mut snapshot=runtime.start(runtime.begin(),source,serde_json::from_value(scene["world"].clone()).unwrap(),PlayProject{root:Some(root),scene:"Assets/Scenes/Main.mscene".into(),name:"Frostbound Realms".into(),..Default::default()}).unwrap();
    let mut input=ScriptInput::default();
    let tick=|snapshot:WorldSnapshot,input:&mut ScriptInput| { let result=runtime.step(runtime.generation(),snapshot,input.clone(),0.1).unwrap();input.finish_frame();result };
    snapshot=tick(snapshot,&mut input);assert_eq!(telemetry(&snapshot)["mode"],"title");
    input.key("F1".into(),true);snapshot=tick(snapshot,&mut input);input.key("F1".into(),false);
    for _ in 0..50 {snapshot=tick(snapshot,&mut input);}
    assert_eq!(telemetry(&snapshot)["kind"],"skirmish");assert!(telemetry(&snapshot)["frame"].as_u64().unwrap()>40);
    input.key("Escape".into(),true);snapshot=tick(snapshot,&mut input);input.key("Escape".into(),false);let paused=telemetry(&snapshot)["frame"].clone();for _ in 0..4 {snapshot=tick(snapshot,&mut input);}assert_eq!(telemetry(&snapshot)["frame"],paused);
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);input.key("F4".into(),true);snapshot=tick(snapshot,&mut input);input.key("F4".into(),false);assert_eq!(telemetry(&snapshot)["mode"],"editor");
    input.key("Digit2".into(),true);snapshot=tick(snapshot,&mut input);input.key("Digit2".into(),false);assert_eq!(telemetry(&snapshot)["brush"],1);
    input.key("F7".into(),true);snapshot=tick(snapshot,&mut input);input.key("F7".into(),false);assert_eq!(telemetry(&snapshot)["mode"],"playing");
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);assert_eq!(telemetry(&snapshot)["mode"],"editor");
    input.key("KeyV".into(),true);snapshot=tick(snapshot,&mut input);input.key("KeyV".into(),false);assert_eq!(telemetry(&snapshot)["editorPage"],1);
    for _ in 0..3 { input.key("Tab".into(),true);snapshot=tick(snapshot,&mut input);input.key("Tab".into(),false); }
    assert_eq!(telemetry(&snapshot)["kind"],"rpg");assert_eq!(telemetry(&snapshot)["placedUnits"],5);
    input.key("F7".into(),true);snapshot=tick(snapshot,&mut input);input.key("F7".into(),false);assert_eq!(telemetry(&snapshot)["kind"],"rpg");
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);
    input.key("F8".into(),true);snapshot=tick(snapshot,&mut input);input.key("F8".into(),false);assert_eq!(telemetry(&snapshot)["kind"],"rpg");assert_eq!(telemetry(&snapshot)["quest"]["stage"],0);
    runtime.stop();
}
