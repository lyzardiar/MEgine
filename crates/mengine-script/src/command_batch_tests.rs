// Author: MiYu. Ordered batch transport, validation boundaries and VM rollback coverage.
use super::*;

fn queue(host: &ScriptHost) -> Vec<JsonValue> {
    host.commands.borrow_mut().drain().into_iter().map(|command| serde_json::to_value(command).unwrap()).collect()
}

#[test]
fn command_batch_preserves_order_exact_numbers_and_component_payloads() {
    let json = r#"[{"value":{"instances":[[1,2,3,4]],"label":"雪\n\"\\","precise":1.0000000000000002},"entity":9007199254740993,"component":"SpriteBatch2D","op":"setComponent"},{"op":"setActive","entity":9007199254740993,"active":false},{"op":"despawn","entity":18446744073709551615}]"#;
    let raw: Vec<&serde_json::value::RawValue> = serde_json::from_str(json).unwrap();
    let expected: Vec<JsonValue> = raw.iter().map(|value| serde_json::to_value(parse_command(value.get()).unwrap()).unwrap()).collect();
    let mut host = ScriptHost::new().unwrap();
    host.eval(&format!("if(!engine.pushCommandsJson({}))throw Error('batch rejected');", serde_json::to_string(json).unwrap())).unwrap();
    assert_eq!(queue(&host), expected);
    host.eval("if(typeof __mengineCommandBatch!=='undefined')throw Error('native binding exposed');").unwrap();
}

#[test]
fn command_batch_rejects_whole_invalid_array_without_touching_prior_commands() {
    let mut host = ScriptHost::new().unwrap();
    for json in ["null", "{}", "[", "[{},null]", r#"[{"op":"despawn","entity":1},{"op":"unknown"}]"#, r#"[{"op":"despawn","entity":1},]"#, r#"[{"op":"setComponent","entity":-1,"component":"Text","value":{}}]"#, "[] trailing"] {
        host.eval("engine.setClearColor(.25,.5,.75,1);").unwrap();
        host.eval(&format!("if(engine.pushCommandsJson({}))throw Error('invalid batch accepted');", serde_json::to_string(json).unwrap())).unwrap();
        assert_eq!(queue(&host), vec![serde_json::json!({"op":"setClearColor","r":0.25,"g":0.5,"b":0.75,"a":1.0})]);
    }
    host.eval("if(!engine.pushCommandsJson({toString:()=> '[]'}))throw Error('empty batch');").unwrap();
    assert!(queue(&host).is_empty());
}

#[test]
fn command_batch_interleaves_with_single_and_sprite_commands() {
    let mut host = ScriptHost::new().unwrap();
    host.eval("engine.setActive(1,true);engine.pushCommandsJson('[{\"op\":\"setActive\",\"entity\":2,\"active\":false},{\"op\":\"setActive\",\"entity\":3,\"active\":true}]');engine.setSpriteBatchData(4,[[1,2,3,4]]);engine.pushCommandJson('{\"op\":\"despawn\",\"entity\":5}');").unwrap();
    let commands = queue(&host);
    assert_eq!(commands.iter().map(|value| value["entity"].as_u64().unwrap()).collect::<Vec<_>>(), vec![1,2,3,4,5]);
    assert_eq!(commands[3]["op"], "setSpriteBatchData");
    assert_eq!(commands[4]["op"], "despawn");
}

#[test]
fn command_batch_failed_tick_discards_all_commands_and_isolates_hosts() {
    let mut host = ScriptHost::new().unwrap();
    let mut other = ScriptHost::new().unwrap();
    let mut world = World::new();
    let before = world.time.clear_color;
    other.eval("engine.pushCommandsJson('[{\"op\":\"despawn\",\"entity\":42}]');").unwrap();
    host.eval("function onTick(){engine.setClearColor(1,0,0,1);engine.pushCommandsJson('[{\"op\":\"spawn\",\"name\":\"discarded\",\"components\":{}}]');engine.reloadScene();throw Error('abort');}").unwrap();
    assert!(host.tick(&mut world, 0.016).is_err());
    assert!(queue(&host).is_empty());assert!(host.take_runtime_requests().is_empty());assert_eq!(world.iter_entities().count(), 0);assert_eq!(world.time.clear_color, before);
    assert_eq!(queue(&other), vec![serde_json::json!({"op":"despawn","entity":42})]);
    host.eval("onTick=()=>{if(!engine.pushCommandsJson('[{\"op\":\"setClearColor\",\"r\":0,\"g\":1,\"b\":0,\"a\":1}]'))throw Error('recovery');};").unwrap();
    host.tick(&mut world, 0.016).unwrap();assert_eq!(world.time.clear_color.y, 1.0);
}

#[test]
#[ignore = "manual VM transport benchmark; run with the integration batch"]
fn benchmark_command_batch_transport() {
    for size in [1, 32, 256, 1024] {
        let mut host = ScriptHost::new().unwrap();
        host.eval(&format!("var items=Array.from({{length:{size}}},(_,entity)=>({{op:'setComponent',entity,component:'Transform',value:{{position:[entity,.125,-entity],rotation:[0,0,0,1],scale:[1,1,1]}}}}));function single(){{for(const item of items)engine.pushCommandJson(JSON.stringify(item));}}function batch(){{if(!engine.pushCommandsJson(JSON.stringify(items)))throw Error('batch');}}")).unwrap();
        host.eval("single()").unwrap();let expected = queue(&host);host.eval("batch()").unwrap();assert_eq!(queue(&host), expected);
        let mut samples = [Vec::new(), Vec::new()];
        for sample in 0..11 {
            for mode in [sample%2, (sample+1)%2] {
                let start = Instant::now();
                for _ in 0..20 {
                    host.eval(if mode==0 {"single()"} else {"batch()"}).unwrap();
                    let commands = host.commands.borrow_mut().drain();assert_eq!(commands.len(), size);std::hint::black_box(commands);
                }
                if sample>=2 { samples[mode].push(start.elapsed().as_secs_f64()*1000.0/20.0); }
            }
        }
        for values in &mut samples { values.sort_by(f64::total_cmp); }
        println!("command_batch size={size} single_ms={:.6} batch_ms={:.6}", samples[0][4], samples[1][4]);
    }
}
