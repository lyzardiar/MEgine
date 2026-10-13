// Author: MiYu. Shared Editor/Player VM lifecycle and failed-call regression coverage.
use crate::{ScriptHost, ScriptInput};
use mengine_core::World;

#[test]
fn interleaved_hosts_survive_non_lifo_destruction_and_thread_local_creation() {
    let mut first = ScriptHost::new().unwrap(); let mut second = ScriptHost::new().unwrap();
    first.eval("var marker=17").unwrap(); second.eval("var marker=29").unwrap();
    for _ in 0..8 { first.eval("if(marker!==17)throw Error('first')").unwrap(); second.eval("if(marker!==29)throw Error('second')").unwrap(); }
    drop(first); second.eval("if(marker!==29)throw Error('after drop')").unwrap();
    let workers: Vec<_> = (0..4).map(|_| std::thread::spawn(|| {
        for _ in 0..4 { let mut host = ScriptHost::new().unwrap(); host.eval("function onTick(){engine.setClearColor(0,1,0,1)}").unwrap(); let mut world=World::new();host.tick(&mut world,0.02).unwrap();assert_eq!(world.time.clear_color.y,1.0); }
    })).collect();
    for worker in workers { worker.join().unwrap(); }
    second.eval("if(marker!==29)throw Error('after threads')").unwrap();
}

#[test]
fn failed_eval_and_event_callbacks_do_not_leak_native_effects_to_the_next_frame() {
    let mut host=ScriptHost::new().unwrap();let mut world=World::new();let color=world.time.clear_color;
    assert!(host.eval("engine.setClearColor(1,0,0,1);engine.reloadScene();throw Error('eval failed')").is_err());
    assert!(host.take_runtime_requests().is_empty());host.tick(&mut world,0.02).unwrap();assert_eq!(world.time.clear_color,color);
    host.eval("function onCollisionEnter(){engine.setClearColor(1,0,0,1);engine.reloadScene();throw Error('event failed')}").unwrap();
    assert!(host.notify_collision_events(&[(1,2)],&[]).is_err());assert!(host.take_runtime_requests().is_empty());
    host.tick(&mut world,0.02).unwrap();assert_eq!(world.time.clear_color,color);
    host.eval("Object.defineProperty(engine,'input',{configurable:true,set(){engine.reloadScene();throw Error('input failed')}})").unwrap();
    assert!(host.set_input(&ScriptInput::default()).is_err());assert!(host.take_runtime_requests().is_empty());
}

#[test]
fn syntax_exceptions_stack_overflow_and_deadlines_leave_host_usable() {
    let mut host=ScriptHost::new().unwrap();
    for source in ["let = ;", "throw Error('expected failure')", "function recurse(){recurse()}recurse()", "while(true){}", "throw {toString(){while(true){}}}"] {
        assert!(host.eval(source).is_err(),"{source}");
        for _ in 0..3 { host.eval("if(6*7!==42)throw Error('recovery')").unwrap(); }
    }
}

#[test]
fn sprite_batch_getters_cannot_expand_native_allocations_past_the_limit() {
    let mut host=ScriptHost::new().unwrap();
    host.eval("var colors=[];var instances=[null];Object.defineProperty(instances,0,{get(){colors.push(...new Array(8193).fill([0,0,0,1]));return [0,0,0,1]}})").unwrap();
    assert!(host.eval("engine.setSpriteBatchData('1',instances,colors)").is_err());
    host.eval("if(engine.setSpriteBatchData('1',[],[])!==true)throw Error('batch recovery')").unwrap();
}

#[test]
fn project_storage_preserves_javascript_number_roundtrips() {
    let root=std::env::temp_dir().join(format!("mengine-vm-roundtrip-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    let mut host=ScriptHost::new().unwrap();host.set_storage_root(root.clone());
    let result=host.eval("var numbers=[112.00000000000001,-10.875644347017863,115.90000000000137,Number.MIN_VALUE,Number.MAX_VALUE];engine.storage.save('numbers',numbers);var restored=engine.storage.load('numbers');if(numbers.some((n,i)=>n!==restored[i]))throw Error('numeric storage roundtrip changed state')");
    std::fs::remove_dir_all(root).unwrap();result.unwrap();
}

#[test]
fn tcp_bridge_preserves_authoritative_numbers_and_exact_entity_strings() {
    use std::{io::{BufRead, BufReader, Write}, net::TcpListener, time::{Duration, Instant}};
    let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();listener.set_nonblocking(true).unwrap();
    let server=std::thread::spawn(move || {
        let deadline=Instant::now()+Duration::from_secs(4);
        let mut peer=loop { match listener.accept() { Ok((peer,_))=>break peer,Err(e) if e.kind()==std::io::ErrorKind::WouldBlock && Instant::now()<deadline=>std::thread::sleep(Duration::from_millis(2)),Err(e)=>panic!("accept: {e}") } };
        peer.set_read_timeout(Some(Duration::from_secs(4))).unwrap();let mut line=String::new();BufReader::new(peer.try_clone().unwrap()).read_line(&mut line).unwrap();
        assert!(line.contains("112.00000000000001"));peer.write_all(line.as_bytes()).unwrap();
    });
    let mut host=ScriptHost::new().unwrap();let mut world=World::new();
    host.eval(&format!("var payload={{hp:112.00000000000001,x:-10.875644347017863,id:'9007199254740993'}};if(!engine.network.connect('{address}'))throw Error('connect');if(!engine.network.send(payload))throw Error('send');function onTick(){{for(const e of engine.network.poll()){{if(e.type==='message'){{if(e.data.hp!==payload.hp||e.data.x!==payload.x||e.data.id!==payload.id)throw Error('snapshot precision');engine.setClearColor(0,1,0,1);}}}}}}" )).unwrap();
    let deadline=Instant::now()+Duration::from_secs(4);
    while Instant::now()<deadline && world.time.clear_color.y!=1.0 { host.tick(&mut world,0.02).unwrap();std::thread::sleep(Duration::from_millis(2)); }
    host.eval("engine.network.close()").unwrap();server.join().unwrap();assert_eq!(world.time.clear_color.y,1.0);
}
