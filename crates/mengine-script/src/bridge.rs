use crate::ScriptError;
use boa_engine::{Context, JsArgs, JsError, JsValue, NativeFunction, Source};
use mengine_core::command::{CommandBuffer, WorldCommand};
use mengine_core::World;
use serde_json::Value as JsonValue;
use std::sync::Mutex;

fn pending() -> &'static Mutex<CommandBuffer> {
    static CELL: std::sync::OnceLock<Mutex<CommandBuffer>> = std::sync::OnceLock::new();
    CELL.get_or_init(|| Mutex::new(CommandBuffer::new()))
}

/// Embeds a JS engine and exposes `engine` global for tick scripts.
pub struct ScriptHost {
    context: Context,
}

impl ScriptHost {
    pub fn new() -> Result<Self, ScriptError> {
        let mut context = Context::default();
        register_engine(&mut context)?;
        Ok(Self { context })
    }

    pub fn eval(&mut self, source: &str) -> Result<(), ScriptError> {
        self.context
            .eval(Source::from_bytes(source.as_bytes()))
            .map(|_| ())
            .map_err(|e| ScriptError::Js(format!("{e}")))
    }

    pub fn load_file(&mut self, path: &std::path::Path) -> Result<(), ScriptError> {
        let src = std::fs::read_to_string(path)?;
        self.eval(&src)
    }

    pub fn tick(&mut self, world: &mut World, dt: f32) -> Result<(), ScriptError> {
        let code = format!(
            "if (typeof onTick === 'function') {{ onTick({dt}, {}); }}",
            world.time.frame
        );
        let _ = self.context.eval(Source::from_bytes(code.as_bytes()));

        if let Ok(mut buf) = pending().lock() {
            for cmd in buf.drain() {
                world.commands.push(cmd);
            }
        }
        world.commit();
        Ok(())
    }

    pub fn inject_snapshot_json(&mut self, json: &str) -> Result<(), ScriptError> {
        let escaped = json.replace('\\', "\\\\").replace('\'', "\\'");
        let code = format!("var lastSnapshot = '{escaped}';");
        self.eval(&code)
    }

    pub fn push_json_commands(world: &mut World, value: JsonValue) {
        if let JsonValue::Array(arr) = value {
            for item in arr {
                if let Ok(cmd) = serde_json::from_value::<WorldCommand>(item) {
                    world.commands.push(cmd);
                }
            }
            world.commit();
        }
    }
}

impl Default for ScriptHost {
    fn default() -> Self {
        Self::new().expect("ScriptHost")
    }
}

fn register_engine(context: &mut Context) -> Result<(), ScriptError> {
    let set_clear = NativeFunction::from_copy_closure(|_this, args, _ctx| {
        let r = args.get_or_undefined(0).as_number().unwrap_or(0.0) as f32;
        let g = args.get_or_undefined(1).as_number().unwrap_or(0.0) as f32;
        let b = args.get_or_undefined(2).as_number().unwrap_or(0.0) as f32;
        let a = args.get_or_undefined(3).as_number().unwrap_or(1.0) as f32;
        if let Ok(mut buf) = pending().lock() {
            buf.set_clear_color(r, g, b, a);
        }
        Ok(JsValue::undefined())
    });

    let push_cmd = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let s = args
            .get_or_undefined(0)
            .to_string(ctx)
            .map_err(JsError::from)?
            .to_std_string_escaped();
        if let Ok(cmd) = serde_json::from_str::<WorldCommand>(&s) {
            if let Ok(mut buf) = pending().lock() {
                buf.push(cmd);
            }
        }
        Ok(JsValue::undefined())
    });

    context
        .eval(Source::from_bytes(
            b"var engine = { setClearColor: null, pushCommandJson: null };",
        ))
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    let engine = context
        .global_object()
        .get(boa_engine::js_string!("engine"), context)
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    let engine_obj = engine
        .as_object()
        .ok_or_else(|| ScriptError::Js("engine not object".into()))?;

    engine_obj
        .set(
            boa_engine::js_string!("setClearColor"),
            set_clear.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("pushCommandJson"),
            push_cmd.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    Ok(())
}
