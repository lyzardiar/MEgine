//! MiYu: first AI tick and construction probe CPU measurements in the native QuickJS runtime.
use rquickjs::{Context, Runtime};
use std::{path::PathBuf, time::Instant};

#[test]
#[ignore = "manual native script CPU measurement; excludes world commands, rendering and IPC"]
fn first_ai_tick_cpu() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let source_path = std::env::var_os("MENGINE_FROST_GROUND_SOURCE").map(PathBuf::from).unwrap_or_else(|| root.join("samples/frostbound-realms/Assets/Scripts/Main.js"));
    let source = std::fs::read_to_string(source_path).unwrap();
    let source = source.split_once("var FrostClient").expect("generated client boundary").0;
    let runtime = Runtime::new().unwrap();runtime.set_memory_limit(256 * 1024 * 1024);runtime.set_max_stack_size(1024 * 1024);
    let context = Context::full(&runtime).unwrap();
    let mut rows = Vec::new();
    context.with(|ctx| {
        ctx.eval::<(), _>(source.as_bytes()).unwrap();
        for (name, map, options) in [("orc-night-elf-default", "Frost.defaultMap()", ",factions:[1,2]"), ("siege", "Frost.siegeMap()", ""), ("orc-night-elf-highland", "Frost.highlandMap()", ",factions:[1,2]")] {
            let mut samples = Vec::new();let mut final_state = String::new();
            for run in 0..7 {
                ctx.eval::<(), _>(format!("var groundBench=Frost.create('skirmish',{{map:{map}{options}}});")).unwrap();
                let started = Instant::now();ctx.eval::<(), _>("Frost.tick(groundBench);").unwrap();
                if run >= 2 { samples.push(started.elapsed().as_secs_f64() * 1000.0); }
                let state = ctx.eval::<String, _>("JSON.stringify(groundBench)").unwrap();
                if !final_state.is_empty() {assert_eq!(state, final_state, "first tick must be deterministic across cold maps");}
                final_state = state;
            }
            samples.sort_by(f64::total_cmp);rows.push(serde_json::json!({"map":name,"runs":5,"warmups":2,"medianMs":samples[2],"samplesMs":samples}));
        }
    });
    println!("FROST_GROUND_QUICKJS_CPU {}", serde_json::json!({"scope":"Native QuickJS simulation CPU for the first AI tick on independent cold map instances. Excludes editor, world commands, rendering and IPC.","rows":rows}));
}
