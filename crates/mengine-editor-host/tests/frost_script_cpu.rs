//! MiYu: measure full-scene client phases and native API calls in actual QuickJS without rendering.
use mengine_editor_host::{EditorPlayRuntime, PlayProject, ScriptInput};
use serde_json::Value;
use std::{path::PathBuf, time::Instant};

#[test]
#[ignore = "manual full-scene native script measurement; excludes renderer and IPC"]
fn full_scene_client_cpu() {
    let source_root=std::env::var_os("MENGINE_FROST_SCRIPT_SOURCE").map(PathBuf::from).unwrap_or_else(||PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms"));
    let root=std::env::temp_dir().join(format!("mengine-frost-script-cpu-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();
    let storage=mengine_script::project_storage_root(&root);
    let mut source=std::fs::read_to_string(source_root.join("Assets/Scripts/Main.js")).unwrap();
    for (old,new) in [
        ("function tick(dt){if(!initialized)init();", "function tick(dt){__frostStats={};__frostMark=Date.now();if(!initialized)init();"),
        ("receive();controls(input,dt);", "receive();controls(input,dt);__frostPhase('controls');"),
        ("transform('Strategy camera',[camera[0]", "__frostPhase('simulation');transform('Strategy camera',[camera[0]"),
        ("renderUnits(input);renderLocusts();", "renderUnits(input);__frostPhase('units');renderLocusts();"),
        ("    renderResources();", "    __frostPhase('effects');renderResources();__frostPhase('resources');"),
        ("    const ground=FrostTerrain.cells(state,team,allVisible);", "    __frostPhase('hudHeader');const ground=FrostTerrain.cells(state,team,allVisible);"),
        ("    for(let j=0;j<256;j++){const v=ground", "    __frostPhase('hudGround');for(let j=0;j<256;j++){const v=ground"),
        ("    for(let i=0;i<140;i++){", "    __frostPhase('hudMinimap');for(let i=0;i<140;i++){"),
        ("    const pathing=editing&&pathingVisible", "    __frostPhase('hudScenery');const pathing=editing&&pathingVisible"),
        ("    renderMissiles(dt);", "    __frostPhase('hud');renderMissiles(dt);"),
        ("    renderSentinels();", "    renderSentinels();__frostPhase('missiles');")
    ] {assert_eq!(source.matches(old).count(),1,"profiling anchor: {old}");source=source.replace(old,new);}
    source.insert_str(0,r#"
        var __frostStats={},__frostMark=0;
        function __frostPhase(name){const now=Date.now();__frostStats[name]={ms:now-__frostMark};__frostMark=now;}
        function __frostWrap(owner,key,name){const original=owner[key];owner[key]=function(...args){const at=Date.now();const result=original.apply(this,args);const row=__frostStats[name]||(__frostStats[name]={calls:0,ms:0,characters:0});row.calls++;row.ms+=Date.now()-at;row.characters+=typeof args[0]==='string'?args[0].length:0;return result;};}
        __frostWrap(engine,'pushCommandJson','commands');__frostWrap(engine,'setActive','activation');__frostWrap(engine,'findEntitiesByName','queries');
        const __frostAssets=engine.assets;engine.assets={sampleNodes:__frostAssets.sampleNodes};__frostWrap(engine.assets,'sampleNodes','assets');
    "#);
    source.push_str("\nonTick=function(dt){FrostClient.tick(dt);engine.storage.save('frost-script-cpu',__frostStats);};");
    let scene:Value=serde_json::from_slice(&std::fs::read(source_root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
    let runtime=EditorPlayRuntime::default();runtime.start(runtime.begin(),source,serde_json::from_value(scene["world"].clone()).unwrap(),PlayProject{root:Some(root.clone()),..Default::default()}).unwrap();
    let mut input=ScriptInput::default();input.viewport=[1280,720];input.key("F1".into(),true);
    runtime.advance_update(runtime.generation(),None,input.clone(),0.1).unwrap();input.finish_frame();input.key("F1".into(),false);
    let mut rows=Vec::new();let mut telemetry=Value::Null;
    for frame in 0..55 {
        let at=Instant::now();let update=runtime.advance_update(runtime.generation(),None,input.clone(),0.1).unwrap();let elapsed=at.elapsed().as_secs_f64()*1000.0;input.finish_frame();
        if let Some(entity)=update.snapshot.entities.iter().find(|e|e.name.as_deref()==Some("Frost telemetry")) {telemetry=serde_json::from_str(entity.components["Text"]["text"].as_str().unwrap()).unwrap();}
        let stats:Value=serde_json::from_slice(&std::fs::read(storage.join("frost-script-cpu.json")).unwrap()).unwrap();
        if frame>=5 {rows.push(serde_json::json!({"stepMs":elapsed,"phases":stats}));}
    }
    assert_eq!(telemetry["mode"],"playing");
    runtime.stop();std::fs::remove_dir_all(root).unwrap();
    println!("FROST_SCRIPT_CPU {}",serde_json::json!({"scope":"Actual native QuickJS client with the full authored world and native incremental update path; 50 measured frames after 5 warmups. JS phases use millisecond wall-clock timestamps. Native API wrapper times are included in phases. Excludes renderer and IPC; step includes snapshot deltas and profiling storage.","rows":rows}));
}
