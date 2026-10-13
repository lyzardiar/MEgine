// Author: MiYu. QuickJS implementation of the shared script-host contract.
use crate::{bridge::NativeBindings, ScriptError};
use rquickjs::{CaughtError, Context, Ctx, Function, Object, Persistent, Runtime};
use std::{cell::Cell, rc::Rc, time::{Duration, Instant}};

pub(crate) struct ScriptVm {
    tick: Persistent<Function<'static>>,
    restore: Persistent<Function<'static>>,
    context: Context,
    _runtime: Runtime,
    deadline: Rc<Cell<Instant>>,
}
fn error(ctx: &Ctx<'_>, error: rquickjs::Error) -> ScriptError { ScriptError::Js(CaughtError::from_error(ctx, error).to_string()) }
fn float4(values: rquickjs::Array<'_>) -> rquickjs::Result<Vec<[f32; 4]>> {
    if values.len() > 8192 { return Err(rquickjs::Error::new_from_js_message("array", "float4", "sprite batch exceeds 8192 entries")); }
    values.iter::<rquickjs::Array>().map(|value| {
        let value = value?;
        if value.len() != 4 { return Err(rquickjs::Error::new_from_js_message("array", "float4", "expected four numbers")); }
        Ok([value.get(0)?, value.get(1)?, value.get(2)?, value.get(3)?])
    }).collect()
}
impl ScriptVm {
    pub fn new(bindings: NativeBindings) -> Result<Self, ScriptError> {
        let runtime = Runtime::new().map_err(|e| ScriptError::Js(e.to_string()))?;
        runtime.set_memory_limit(256 * 1024 * 1024);
        runtime.set_max_stack_size(1024 * 1024);
        let deadline = Rc::new(Cell::new(Instant::now() + Duration::from_secs(1)));
        let limit = deadline.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= limit.get())));
        let context = Context::full(&runtime).map_err(|e| ScriptError::Js(e.to_string()))?;
        let (restore, tick) = context.with(|ctx| {
            let install = || -> rquickjs::Result<_> {
                let b = bindings.clone();
                ctx.globals().set("__mengineAssetNodes", Function::new(ctx.clone(), move |a: String, o: String| b.asset_nodes(&a, &o))?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineStorage", Function::new(ctx.clone(), move |o: String, k: String, p: String| b.storage(&o, &k, &p))?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineNetwork", Function::new(ctx.clone(), move |o: String, v: String| b.network(&o, &v))?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineCommand", Function::new(ctx.clone(), move |j: String| b.command(&j))?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineSpriteBatch", Function::new(ctx.clone(), move |entity: String, instances: rquickjs::Array, colors: rquickjs::Array| -> rquickjs::Result<bool> {
                    let Ok(entity) = entity.parse::<u64>() else { return Ok(false); };
                    if instances.len() > 8192 || colors.len() > 8192 { return Ok(false); }
                    Ok(b.sprite_batch(entity, float4(instances)?, float4(colors)?))
                })?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineRequest", Function::new(ctx.clone(), move |o: String, j: String| b.request(&o, &j))?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineRevision", Function::new(ctx.clone(), move || b.revision())?)?;
                let b = bindings.clone();
                ctx.globals().set("__mengineFindEntities", Function::new(ctx.clone(), move |j: String| b.find_entities(&j))?)?;
                ctx.globals().set("__mengineSnapshot", Function::new(ctx.clone(), move || bindings.snapshot())?)?;
                let restore = Persistent::save(&ctx, ctx.eval::<Function, _>(include_str!("engine_api.js"))?);
                let tick = Persistent::save(&ctx, ctx.eval::<Function, _>("(dt, frame) => { if (typeof onTick === 'function') onTick(dt, frame); }")?);
                Ok((restore, tick))
            };
            install().map_err(|e| error(&ctx, e))
        })?;
        Ok(Self { tick, restore, context, _runtime: runtime, deadline })
    }
    pub fn eval(&mut self, source: &str) -> Result<(), ScriptError> {
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        let mut options = rquickjs::context::EvalOptions::default(); options.strict = false;
        self.context.with(|ctx| ctx.eval_with_options::<(), _>(source, options).map_err(|e| error(&ctx, e)))
    }
    pub fn tick(&mut self, dt: f32, frame: f64, budget: Duration) -> Result<(), ScriptError> {
        self.deadline.set(Instant::now() + budget);
        self.context.with(|ctx| self.tick.clone().restore(&ctx).and_then(|f| f.call::<_, ()>((dt, frame))).map_err(|e| error(&ctx, e)))
    }
    pub fn restore_snapshot(&mut self) -> Result<(), ScriptError> {
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        self.context.with(|ctx| self.restore.clone().restore(&ctx).and_then(|f| f.call::<_, ()>(())).map_err(|e| error(&ctx, e)))
    }
    pub fn set_input(&mut self, json: &str) -> Result<(), ScriptError> {
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        self.context.with(|ctx| {
            let assign = || -> rquickjs::Result<()> { let engine: Object = ctx.globals().get("engine")?; engine.set("input", ctx.json_parse(json)?) };
            assign().map_err(|e| error(&ctx, e))
        })
    }
    #[cfg(test)]
    pub fn run_gc(&mut self) { self._runtime.run_gc(); }
}
