//! MiYu: reproducible CPU measurement in the same QuickJS library used by editor and Player.
use rquickjs::{Context, Runtime};
use std::{path::PathBuf, time::Instant};

#[test]
#[ignore = "manual CPU measurement; not a native render frame budget"]
fn dense_marching_cpu() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let source_path = std::env::var_os("FROST_TRAFFIC_SOURCE").map(PathBuf::from).unwrap_or_else(|| root.join("samples/frostbound-realms/game/simulation.js"));
    let source = std::fs::read(source_path).unwrap();
    let runtime = Runtime::new().unwrap();
    runtime.set_memory_limit(256 * 1024 * 1024);
    let context = Context::full(&runtime).unwrap();
    let mut rows = Vec::new();
    let mut march = serde_json::Value::Null;
    context.with(|ctx| {
        ctx.eval::<(), _>(source).unwrap();
        ctx.eval::<(), _>(r#"
            var benchState;
            function prepare(count) {
                const map=Frost.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.props=[];map.units=[];map.triggers=[];
                benchState=Frost.create('skirmish',{map,ai:[false,false]});benchState.units=[];benchState.resources=[];
                const us=Array.from({length:count},(_,i)=>Frost.spawn(benchState,'soldier',0,-20+i%10*1.2,-20+Math.floor(i/10)*1.2,{damage:0}));
                for(let i=0;i<count;i+=40){const error=Frost.command(benchState,0,{type:'move',ids:us.slice(i,i+40).map(u=>u.id),x:20,z:20});if(error)throw Error(error);}
            }
        "#).unwrap();
        for count in [20, 40, 80] {
            let mut timings = Vec::new();
            for run in 0..13 {
                ctx.eval::<(), _>(format!("prepare({count});")).unwrap();
                let started = Instant::now();
                ctx.eval::<(), _>("Frost.tick(benchState);").unwrap();
                if run >= 3 { timings.push(started.elapsed().as_secs_f64() * 1000.0); }
                assert_eq!(ctx.eval::<usize, _>("benchState.units.length").unwrap(), count);
            }
            timings.sort_by(f64::total_cmp);
            rows.push(serde_json::json!({"units":count,"medianMs":(timings[4]+timings[5])/2.0,"maxMs":timings[9]}));
        }
        ctx.eval::<(), _>(r#"
            prepare(0);
            var marchUnits=Array.from({length:40},(_,i)=>Frost.spawn(benchState,['soldier','archer','knight','catapult'][i%4],0,-23+i%8*2,-23+Math.floor(i/8)*2));
            if(Frost.command(benchState,0,{type:'move',ids:marchUnits.map(u=>u.id),x:12,z:12}))throw Error('march command rejected');
            var marchGoals=marchUnits.map(u=>({id:u.id,x:u.order.x,z:u.order.z}));
        "#).unwrap();
        let mut timings = Vec::new();
        let mut arrived_at = None;
        for frame in 1..=545 {
            let started = Instant::now();
            ctx.eval::<(), _>("Frost.tick(benchState);").unwrap();
            timings.push(started.elapsed().as_secs_f64() * 1000.0);
            if ctx.eval::<bool, _>("marchUnits.every((u,i)=>!u.order&&Frost.distance(u,marchGoals[i])<=.121)").unwrap() {
                arrived_at = Some(frame);
                break;
            }
        }
        assert!(arrived_at.is_some(), "all forty mixed units must reach their assigned destinations");
        let total: f64 = timings.iter().sum();
        timings.sort_by(f64::total_cmp);
        march = serde_json::json!({"units":40,"arrivalFrame":arrived_at,"totalMs":total,"medianTickMs":timings[timings.len()/2],"p95TickMs":timings[(timings.len()*95/100).min(timings.len()-1)],"maxTickMs":timings.last(),"runs":1});
    });
    println!("FROST_QUICKJS_CPU {}", serde_json::json!({"profile":if cfg!(debug_assertions) { "debug" } else { "release" },"scope":"QuickJS simulation CPU, first dense marching tick; 3 warmups and 10 independent scenes per size. Also one complete forty-unit mixed formation march. Excludes native rendering and IPC.","rows":rows,"mixedFormationMarch":march}));
}
