// Author: MiYu. Run a benchmark workload through the real ScriptHost API and persist its final state.
use anyhow::{bail, Result};
use mengine_core::World;
use mengine_script::ScriptHost;
use std::{path::PathBuf, time::Instant};
fn main() -> Result<()> {
    let args:Vec<_>=std::env::args().collect();
    if args.len()!=5 { bail!("Usage: script_host_workload <workload.js> <warmup steps> <measured steps> <new output directory>"); }
    let warmup:usize=args[2].parse()?;let steps:usize=args[3].parse()?;let output=PathBuf::from(&args[4]);
    std::fs::create_dir(&output)?;
    let started=Instant::now();let mut host=ScriptHost::new()?;host.set_storage_root(output.clone());host.load_file(std::path::Path::new(&args[1]))?;
    host.eval("benchmarkReset(); function onTick(){benchmarkStep()}")?;
    let load_ms=started.elapsed().as_secs_f64()*1000.0;let mut world=World::new();
    for _ in 0..warmup { host.tick(&mut world,0.02)?; }
    host.eval("benchmarkReset()")?;
    let mut callbacks=Vec::with_capacity(steps);let started=Instant::now();
    for _ in 0..steps { callbacks.push(host.tick_profiled(&mut world,0.02)?.callback_ms); }
    let measured_ms=started.elapsed().as_secs_f64()*1000.0;
    host.eval("engine.storage.save('state',JSON.parse(benchmarkResult()))")?;
    let report=serde_json::json!({"runtime":if cfg!(feature="v8-runtime"){"v8"}else{"quickjs"},"scope":"Production ScriptHost with world publication, native API and deadlines; no viewport or Player window.","loadMs":load_ms,"measuredMs":measured_ms,"warmup":warmup,"steps":steps,"callbackMs":callbacks});
    std::fs::write(output.join("report.json"),serde_json::to_vec_pretty(&report)?)?;
    println!("{}",serde_json::json!({"passed":true,"runtime":report["runtime"],"steps":steps,"output":output}));
    Ok(())
}
