// Author: MiYu. Compare trusted JavaScript workloads in native QuickJS-NG and V8 hosts.
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use std::time::Instant;

fn quickjs(source: &str, warmup: usize, samples: usize) -> Result<Value> {
    let started = Instant::now();
    let runtime = rquickjs::Runtime::new()?;
    runtime.set_memory_limit(256 * 1024 * 1024);
    runtime.set_max_stack_size(1024 * 1024);
    let context = rquickjs::Context::full(&runtime)?;
    context.with(|ctx| {
        let run = || -> rquickjs::Result<Value> {
            let mut options = rquickjs::context::EvalOptions::default();
            options.strict = false;
            ctx.eval_with_options::<(), _>(source, options)?;
            let load_ms = started.elapsed().as_secs_f64() * 1000.0;
            eprintln!("loaded in {load_ms:.3} ms");
            let reset: rquickjs::Function = ctx.globals().get("benchmarkReset")?;
            let step: rquickjs::Function = ctx.globals().get("benchmarkStep")?;
            let result: rquickjs::Function = ctx.globals().get("benchmarkResult")?;
            let at = Instant::now();
            reset.call::<_, ()>(())?;
            let initial_reset_ms = at.elapsed().as_secs_f64() * 1000.0;
            eprintln!("initial reset in {initial_reset_ms:.3} ms");
            let at = Instant::now();
            for _ in 0..warmup { step.call::<_, ()>(())?; }
            let warmup_ms = at.elapsed().as_secs_f64() * 1000.0;
            eprintln!("warmup in {warmup_ms:.3} ms");
            let at = Instant::now();
            reset.call::<_, ()>(())?;
            let reset_ms = at.elapsed().as_secs_f64() * 1000.0;
            eprintln!("measurement reset in {reset_ms:.3} ms");
            let mut times = Vec::with_capacity(samples);
            for _ in 0..samples {
                let at = Instant::now();
                step.call::<_, ()>(())?;
                times.push(at.elapsed().as_secs_f64() * 1000.0);
            }
            let state: String = result.call(())?;
            Ok(json!({"runtime":"quickjs-ng", "binding":"rquickjs 0.14.0", "loadMs":load_ms, "initialResetMs":initial_reset_ms, "warmupMs":warmup_ms, "resetMs":reset_ms, "stepMs":times, "state":state}))
        };
        run().map_err(|e| anyhow::anyhow!(rquickjs::CaughtError::from_error(&ctx, e).to_string()))
    })
}

fn v8(source: &str, warmup: usize, samples: usize) -> Result<Value> {
    let started = Instant::now();
    let platform = v8::new_default_platform(0, false).make_shared();
    v8::V8::initialize_platform(platform);
    v8::V8::initialize();
    let isolate = &mut v8::Isolate::new(v8::CreateParams::default().heap_limits(0, 256 * 1024 * 1024));
    v8::scope!(let handle_scope, isolate);
    let context = v8::Context::new(handle_scope, Default::default());
    let scope = &mut v8::ContextScope::new(handle_scope, context);
    v8::tc_scope!(let scope, scope);
    let run = |scope: &mut v8::PinScope| -> Result<Value> {
        let code = v8::String::new(scope, source).context("V8 source allocation")?;
        let script = v8::Script::compile(scope, code, None).context("V8 compilation")?;
        script.run(scope).context("V8 script initialization")?;
        let load_ms = started.elapsed().as_secs_f64() * 1000.0;
        eprintln!("loaded in {load_ms:.3} ms");
        let global = context.global(scope);
        let mut functions = Vec::new();
        for name in ["benchmarkReset", "benchmarkStep", "benchmarkResult"] {
            let key = v8::String::new(scope, name).unwrap();
            let value = global.get(scope, key.into()).context("Missing benchmark function")?;
            functions.push(v8::Local::<v8::Function>::try_from(value).context("Invalid benchmark function")?);
        }
        let receiver = v8::undefined(scope).into();
        let at = Instant::now();
        functions[0].call(scope, receiver, &[]).context("V8 warmup reset")?;
        let initial_reset_ms = at.elapsed().as_secs_f64() * 1000.0;
        eprintln!("initial reset in {initial_reset_ms:.3} ms");
        let at = Instant::now();
        for _ in 0..warmup { functions[1].call(scope, receiver, &[]).context("V8 warmup")?; }
        let warmup_ms = at.elapsed().as_secs_f64() * 1000.0;
        eprintln!("warmup in {warmup_ms:.3} ms");
        let at = Instant::now();
        functions[0].call(scope, receiver, &[]).context("V8 measurement reset")?;
        let reset_ms = at.elapsed().as_secs_f64() * 1000.0;
        eprintln!("measurement reset in {reset_ms:.3} ms");
        let mut times = Vec::with_capacity(samples);
        for _ in 0..samples {
            let at = Instant::now();
            functions[1].call(scope, receiver, &[]).context("V8 measured step")?;
            times.push(at.elapsed().as_secs_f64() * 1000.0);
        }
        let value = functions[2].call(scope, receiver, &[]).context("V8 result")?;
        let state = value.to_string(scope).context("V8 result string")?.to_rust_string_lossy(scope);
        Ok(json!({"runtime":"v8", "version":v8::V8::get_version(), "binding":"v8 152.2.0", "loadMs":load_ms, "initialResetMs":initial_reset_ms, "warmupMs":warmup_ms, "resetMs":reset_ms, "stepMs":times, "state":state}))
    };
    match run(scope) {
        Ok(result) => Ok(result),
        Err(error) => {
            let exception = scope.exception().and_then(|e| e.to_string(scope)).map(|e| e.to_rust_string_lossy(scope));
            bail!("{error}: {}", exception.as_deref().unwrap_or("no JavaScript exception"))
        }
    }
}

fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 6 { bail!("Usage: mengine-script-runtime-benchmark <quickjs|v8> <script.js> <warmup steps> <sample steps> <output.json>"); }
    let source = std::fs::read_to_string(&args[2])?;
    let warmup: usize = args[3].parse()?;
    let samples: usize = args[4].parse()?;
    if samples == 0 { bail!("At least one measured step is required"); }
    let result = match args[1].as_str() {
        "quickjs" => quickjs(&source, warmup, samples)?,
        "v8" => v8(&source, warmup, samples)?,
        _ => bail!("Unknown runtime"),
    };
    std::fs::write(&args[5], serde_json::to_vec_pretty(&result)?)?;
    Ok(())
}
