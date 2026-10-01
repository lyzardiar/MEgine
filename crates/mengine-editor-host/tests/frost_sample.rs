//! MiYu: actual QuickJS and World acceptance for the native RTS and map editor.
use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{EditorPlayRuntime, PlayProject, ScriptInput};
use serde_json::Value;
use std::path::PathBuf;
fn telemetry(s: &WorldSnapshot) -> Value { serde_json::from_str(s.entities.iter().find(|e|e.name.as_deref()==Some("Frost telemetry")).unwrap().components["Text"]["text"].as_str().unwrap()).unwrap() }
#[test]
fn unicode_map_input_save_cancel_and_undo() {
    let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let source=std::fs::read_to_string(root.join("Assets/Scripts/Main.js")).unwrap();
    let scene:Value=serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let runtime=EditorPlayRuntime::default();
    let mut snapshot=runtime.start(runtime.begin(),source,serde_json::from_value(scene["world"].clone()).unwrap(),PlayProject{root:Some(root),..Default::default()}).unwrap();
    let mut input=ScriptInput::default();input.viewport=[1280,720];
    let tick=|snapshot:WorldSnapshot,input:&mut ScriptInput| {let next=runtime.step(runtime.generation(),snapshot,input.clone(),0.1).unwrap();input.finish_frame();next};
    snapshot=tick(snapshot,&mut input);
    for key in ["F4","F8","KeyN"] {input.key(key.into(),true);snapshot=tick(snapshot,&mut input);input.key(key.into(),false);}
    let original=telemetry(&snapshot)["editorTrigger"]["name"].clone();let depth=telemetry(&snapshot)["undoDepth"].as_u64().unwrap();
    snapshot.entities.iter_mut().find(|e|e.name.as_deref()==Some("Rename input")).unwrap().components.get_mut("InputField").unwrap()["text"]=Value::String("霜境增援任务".into());
    input.pointer=[640.0,425.0];input.button(0,true);snapshot=tick(snapshot,&mut input);input.button(0,false);snapshot=tick(snapshot,&mut input);
    assert_eq!(telemetry(&snapshot)["editorTrigger"]["name"],"霜境增援任务");assert_eq!(telemetry(&snapshot)["undoDepth"],depth+1);
    input.key("KeyN".into(),true);snapshot=tick(snapshot,&mut input);input.key("KeyN".into(),false);
    snapshot.entities.iter_mut().find(|e|e.name.as_deref()==Some("Rename input")).unwrap().components.get_mut("InputField").unwrap()["text"]=Value::String("取消修改".into());
    input.pointer=[910.0,425.0];input.button(0,true);snapshot=tick(snapshot,&mut input);input.button(0,false);snapshot=tick(snapshot,&mut input);
    assert_eq!(telemetry(&snapshot)["editorTrigger"]["name"],"霜境增援任务");assert_eq!(telemetry(&snapshot)["undoDepth"],depth+1);
    input.key("ControlLeft".into(),true);input.key("KeyZ".into(),true);snapshot=tick(snapshot,&mut input);assert_eq!(telemetry(&snapshot)["editorTrigger"]["name"],original);
    runtime.stop();
}
#[test]
fn native_snapshot_deltas_keep_game_state_and_reduce_payload() {
    let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let source=std::fs::read_to_string(root.join("Assets/Scripts/Main.js")).unwrap();
    let scene:Value=serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let runtime=EditorPlayRuntime::default();
    let initial=runtime.start(runtime.begin(),source,serde_json::from_value(scene["world"].clone()).unwrap(),PlayProject{root:Some(root),..Default::default()}).unwrap();
    let mut entities=initial.entities.into_iter().map(|e|(e.entity,e)).collect::<std::collections::HashMap<_,_>>();
    let (mut full_bytes,mut delta_bytes,mut changed)=(0,0,0);
    for frame in 0..40 {
        let mut input=ScriptInput::default();
        if frame==1 { input.key("F1".into(),true); }
        let update=runtime.advance_update(runtime.generation(),None,input,0.1).unwrap();
        assert_eq!(update.base_revision,frame);
        let bytes=serde_json::to_vec(&update).unwrap().len();
        let count=update.snapshot.entities.len();
        let mut snapshot=update.snapshot;
        for entity in snapshot.entities.drain(..) { entities.insert(entity.entity,entity); }
        snapshot.entities=update.entity_order.iter().map(|id|entities[id].clone()).collect();
        entities.retain(|id,_|update.entity_order.contains(id));
        if frame>4 {
            assert_eq!(telemetry(&snapshot)["kind"],"skirmish");
            assert_eq!(telemetry(&snapshot)["mode"],"playing");
            assert!(telemetry(&snapshot)["frame"].as_u64().unwrap()>0);
            delta_bytes+=bytes;full_bytes+=serde_json::to_vec(&snapshot).unwrap().len();changed+=count;
        }
    }
    println!("Snapshot IPC: {delta_bytes} delta bytes / {full_bytes} full bytes over 35 frames; {changed} changed entities");
    assert!(delta_bytes*4<full_bytes,"steady gameplay delta payload must be below 25% of full snapshots");
    runtime.stop();
}
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
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);input.key("KeyX".into(),true);snapshot=tick(snapshot,&mut input);input.key("KeyX".into(),false);input.key("F4".into(),true);snapshot=tick(snapshot,&mut input);input.key("F4".into(),false);assert_eq!(telemetry(&snapshot)["mode"],"editor");
    input.key("Digit2".into(),true);snapshot=tick(snapshot,&mut input);input.key("Digit2".into(),false);assert_eq!(telemetry(&snapshot)["brush"],1);
    input.key("F7".into(),true);snapshot=tick(snapshot,&mut input);input.key("F7".into(),false);assert_eq!(telemetry(&snapshot)["mode"],"playing");
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);assert_eq!(telemetry(&snapshot)["paused"],true);input.key("KeyX".into(),true);snapshot=tick(snapshot,&mut input);input.key("KeyX".into(),false);assert_eq!(telemetry(&snapshot)["mode"],"editor");
    input.key("KeyV".into(),true);snapshot=tick(snapshot,&mut input);input.key("KeyV".into(),false);assert_eq!(telemetry(&snapshot)["editorPage"],1);
    for _ in 0..3 { input.key("Tab".into(),true);snapshot=tick(snapshot,&mut input);input.key("Tab".into(),false); }
    assert_eq!(telemetry(&snapshot)["kind"],"rpg");assert_eq!(telemetry(&snapshot)["placedUnits"],5);
    input.key("F7".into(),true);snapshot=tick(snapshot,&mut input);input.key("F7".into(),false);assert_eq!(telemetry(&snapshot)["kind"],"rpg");
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);input.key("KeyX".into(),true);snapshot=tick(snapshot,&mut input);input.key("KeyX".into(),false);
    input.key("F10".into(),true);snapshot=tick(snapshot,&mut input);input.key("F10".into(),false);
    input.key("F8".into(),true);snapshot=tick(snapshot,&mut input);input.key("F8".into(),false);assert_eq!(telemetry(&snapshot)["kind"],"rpg");assert_eq!(telemetry(&snapshot)["quest"]["stage"],0);
    runtime.stop();
}
