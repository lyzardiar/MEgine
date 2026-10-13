// Author: MiYu. V8 implementation used by both editor and standalone ScriptHost.
use crate::{bridge::NativeBindings, ScriptError};
use std::{sync::{Once, atomic::Ordering}, time::Duration};
#[path = "v8_limits.rs"]
mod limits;
use limits::{HeapLimit, Isolate, Watchdog};

pub(crate) struct ScriptVm {
    // Stop the timer, release Globals and callback data, then dispose the exited isolate.
    watchdog: Watchdog,
    tick: Option<v8::Global<v8::Function>>,
    restore: Option<v8::Global<v8::Function>>,
    context: v8::Global<v8::Context>,
    isolate: Isolate,
    heap_limit: Box<HeapLimit>,
}
impl ScriptVm {
    pub fn new(bindings: NativeBindings) -> Result<Self, ScriptError> {
        static INITIALIZE: Once = Once::new();
        INITIALIZE.call_once(|| {
            v8::V8::initialize_platform(v8::new_default_platform(0, false).make_shared());
            v8::V8::initialize();
        });
        let mut isolate = Isolate::new();
        let (context, handle, heap_limit) = {
            let entered = isolate.enter();
            let handle = entered.isolate.thread_safe_handle();
            let heap_limit = Box::new(HeapLimit { exhausted: false.into(), handle: handle.clone() });
            entered.isolate.add_near_heap_limit_callback(limits::near_heap_limit, (&*heap_limit as *const HeapLimit).cast_mut().cast());
            entered.isolate.set_microtasks_policy(v8::MicrotasksPolicy::Explicit);
            entered.isolate.set_slot(bindings);
            v8::scope!(let scope, &mut *entered.isolate);
            let context = v8::Context::new(scope, Default::default());
            (v8::Global::new(scope, context), handle, heap_limit)
        };
        let watchdog = match Watchdog::new(handle) {
            Ok(watchdog) => watchdog,
            Err(error) => { isolate.enter().isolate.remove_near_heap_limit_callback(limits::near_heap_limit, 0); return Err(error); }
        };
        let mut vm = Self { watchdog, tick: None, restore: None, context, isolate, heap_limit };
        let (restore, tick) = vm.with_scope(Duration::from_secs(1), |scope| {
            let global = scope.get_current_context().global(scope);
            for (id, name) in ["__mengineAssetNodes", "__mengineStorage", "__mengineNetwork", "__mengineCommand", "__mengineSpriteBatch", "__mengineRequest", "__mengineRevision", "__mengineFindEntities", "__mengineSnapshot"].iter().enumerate() {
                let key = v8::String::new(scope, name)?;
                let data = v8::Integer::new(scope, id as i32);
                let function = v8::Function::builder(native_callback).data(data.into()).build(scope)?;
                global.set(scope, key.into(), function.into())?;
            }
            let restore = run(scope, include_str!("engine_api.js"))?;
            let restore = v8::Local::<v8::Function>::try_from(restore).ok()?;
            let restore = v8::Global::new(scope, restore);
            let tick = run(scope, "(dt, frame) => { if (typeof onTick === 'function') onTick(dt, frame); }")?;
            let tick = v8::Local::<v8::Function>::try_from(tick).ok()?;
            Some((restore, v8::Global::new(scope, tick)))
        })?;
        vm.restore = Some(restore); vm.tick = Some(tick);
        Ok(vm)
    }
    fn with_scope<T>(&mut self, budget: Duration, execute: impl FnOnce(&mut v8::PinScope) -> Option<T>) -> Result<T, ScriptError> {
        if self.heap_limit.exhausted.load(Ordering::Relaxed) { return Err(ScriptError::Js("V8 heap limit exceeded; recreate ScriptHost".into())); }
        let deadline = self.watchdog.arm(budget);
        let result = {
            let entered = self.isolate.enter();
            v8::scope!(let scope, &mut *entered.isolate);
            let context = v8::Local::new(scope, &self.context);
            let scope = &mut v8::ContextScope::new(scope, context);
            v8::tc_scope!(let scope, scope);
            match execute(scope) {
                Some(value) => Ok(value),
                None => {
                    // Formatting a thrown object's message can run JS, so it stays inside the deadline.
                    let message = scope.exception().and_then(|e| e.to_string(scope)).map(|s| s.to_rust_string_lossy(scope));
                    Err(ScriptError::Js(if scope.has_terminated() { "V8 execution interrupted".into() } else { message.unwrap_or_else(|| "V8 execution failed".into()) }))
                }
            }
        };
        drop(deadline);
        if self.heap_limit.exhausted.load(Ordering::Relaxed) { return Err(ScriptError::Js("V8 heap limit exceeded; recreate ScriptHost".into())); }
        if self.watchdog.timed_out() { return Err(ScriptError::Js("V8 execution deadline exceeded".into())); }
        result
    }
    pub fn eval(&mut self, source: &str) -> Result<(), ScriptError> { self.with_scope(Duration::from_secs(1), |scope| run(scope, source).map(|_| ())) }
    pub fn tick(&mut self, dt: f32, frame: f64, budget: Duration) -> Result<(), ScriptError> {
        let tick = self.tick.as_ref().unwrap().clone();
        self.with_scope(budget, |scope| {
            let callback = v8::Local::new(scope, &tick);
            let receiver = v8::undefined(scope).into();
            let dt = v8::Number::new(scope, dt as f64).into(); let frame = v8::Number::new(scope, frame).into();
            callback.call(scope, receiver, &[dt, frame]).map(|_| ())
        })
    }
    pub fn restore_snapshot(&mut self) -> Result<(), ScriptError> {
        let restore = self.restore.as_ref().unwrap().clone();
        self.with_scope(Duration::from_secs(1), |scope| {
            let callback = v8::Local::new(scope, &restore); let receiver = v8::undefined(scope).into();
            callback.call(scope, receiver, &[]).map(|_| ())
        })
    }
    pub fn set_input(&mut self, json: &str) -> Result<(), ScriptError> {
        self.with_scope(Duration::from_secs(1), |scope| {
            let global = scope.get_current_context().global(scope); let key = v8::String::new(scope, "engine")?;
            let engine = global.get(scope, key.into())?.to_object(scope)?;
            let json = v8::String::new(scope, json)?; let input = v8::json::parse(scope, json)?;
            let key = v8::String::new(scope, "input")?;
            engine.set(scope, key.into(), input).filter(|set| *set).map(|_| ())
        })
    }
    #[cfg(test)]
    pub fn run_gc(&mut self) { let entered = self.isolate.enter(); entered.isolate.low_memory_notification(); }
}

fn run<'s>(scope: &mut v8::PinScope<'s, '_>, source: &str) -> Option<v8::Local<'s, v8::Value>> {
    let code = v8::String::new(scope, source)?;
    v8::Script::compile(scope, code, None)?.run(scope)
}
fn argument(scope: &mut v8::PinScope, args: &v8::FunctionCallbackArguments, index: i32) -> Option<String> {
    let value = args.get(index);
    if value.is_string() { value.to_string(scope).map(|s| s.to_rust_string_lossy(scope)) } else { type_error(scope, "expected string argument"); None }
}
fn type_error(scope: &mut v8::PinScope, message: &str) {
    if let Some(message) = v8::String::new(scope, message) { let exception = v8::Exception::type_error(scope, message); scope.throw_exception(exception); }
}
fn float4(scope: &mut v8::PinScope, value: v8::Local<v8::Value>) -> Option<Vec<[f32; 4]>> {
    let Ok(array) = v8::Local::<v8::Array>::try_from(value) else { type_error(scope, "expected array"); return None; };
    let length = array.length();
    if length > 8192 { type_error(scope, "sprite batch exceeds 8192 entries"); return None; }
    let mut values = Vec::with_capacity(length as usize);
    for i in 0..length {
        let value = array.get_index(scope, i)?;
        let Ok(row) = v8::Local::<v8::Array>::try_from(value) else { type_error(scope, "expected float4 array"); return None; };
        if row.length() != 4 { type_error(scope, "expected four numbers"); return None; }
        let mut components = [0.0; 4];
        for (j, component) in components.iter_mut().enumerate() {
            let value = row.get_index(scope, j as u32)?;
            if !value.is_number() { type_error(scope, "expected number"); return None; }
            *component = value.number_value(scope)? as f32;
        }
        values.push(components);
    }
    Some(values)
}
fn native_callback(scope: &mut v8::PinScope, args: v8::FunctionCallbackArguments, mut result: v8::ReturnValue) {
    let Some(bindings) = scope.get_slot::<NativeBindings>().cloned() else { return; };
    let Some(id) = args.data().int32_value(scope) else { return; };
    let text = match id {
        0 => { let (Some(a), Some(b)) = (argument(scope, &args, 0), argument(scope, &args, 1)) else { return; }; bindings.asset_nodes(&a, &b) }
        1 => { let (Some(a), Some(b), Some(c)) = (argument(scope, &args, 0), argument(scope, &args, 1), argument(scope, &args, 2)) else { return; }; bindings.storage(&a, &b, &c) }
        2 => { let (Some(a), Some(b)) = (argument(scope, &args, 0), argument(scope, &args, 1)) else { return; }; bindings.network(&a, &b) }
        3 => { if let Some(json) = argument(scope, &args, 0) { bindings.command(&json); } return; }
        4 => {
            let Some(entity) = argument(scope, &args, 0) else { return; };
            let Ok(entity) = entity.parse::<u64>() else { result.set_bool(false); return; };
            for i in [1, 2] {
                let Ok(array) = v8::Local::<v8::Array>::try_from(args.get(i)) else { type_error(scope, "expected array"); return; };
                if array.length() > 8192 { result.set_bool(false); return; }
            }
            let Some(instances) = float4(scope, args.get(1)) else { return; }; let Some(colors) = float4(scope, args.get(2)) else { return; };
            result.set_bool(bindings.sprite_batch(entity, instances, colors)); return;
        }
        5 => { let (Some(a), Some(b)) = (argument(scope, &args, 0), argument(scope, &args, 1)) else { return; }; result.set_bool(bindings.request(&a, &b)); return; }
        6 => { result.set_double(bindings.revision()); return; }
        7 => { let Some(json) = argument(scope, &args, 0) else { return; }; bindings.find_entities(&json) }
        8 => bindings.snapshot(),
        _ => return,
    };
    if let Some(value) = v8::String::new(scope, &text) { result.set(value.into()); }
}
