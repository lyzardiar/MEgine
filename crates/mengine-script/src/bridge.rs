use crate::ScriptError;
use boa_engine::{Context, JsArgs, JsValue, NativeFunction, Source};
use mengine_core::command::{CommandBuffer, WorldCommand};
use mengine_core::World;
use serde_json::Value as JsonValue;
use std::sync::Mutex;

fn pending() -> &'static Mutex<CommandBuffer> {
    static CELL: std::sync::OnceLock<Mutex<CommandBuffer>> = std::sync::OnceLock::new();
    CELL.get_or_init(|| Mutex::new(CommandBuffer::new()))
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ScriptRuntimeRequest {
    LoadSceneByIndex(usize),
    LoadScene(String),
    ReloadScene,
    SetAnimatorParameter {
        entity: u64,
        name: String,
        value: JsonValue,
    },
    PlayAnimatorState {
        entity: u64,
        state: String,
    },
}

fn pending_runtime_requests() -> &'static Mutex<Vec<ScriptRuntimeRequest>> {
    static CELL: std::sync::OnceLock<Mutex<Vec<ScriptRuntimeRequest>>> = std::sync::OnceLock::new();
    CELL.get_or_init(|| Mutex::new(Vec::new()))
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

    pub fn take_runtime_requests(&mut self) -> Vec<ScriptRuntimeRequest> {
        pending_runtime_requests()
            .lock()
            .map(|mut requests| std::mem::take(&mut *requests))
            .unwrap_or_default()
    }

    pub fn notify_scene_loaded(
        &mut self,
        name: &str,
        path: &str,
        build_index: Option<usize>,
        build_scene_count: usize,
    ) -> Result<(), ScriptError> {
        let scene = serde_json::json!({
            "name": name,
            "path": path,
            "buildIndex": build_index,
            "buildSceneCount": build_scene_count,
        });
        self.eval(&format!(
            "engine.scene = {scene}; if (typeof onSceneLoaded === 'function') {{ onSceneLoaded(engine.scene); }}"
        ))
    }

    /// Delivers fixed-step collision transitions to the project's global script hooks.
    /// Entity identifiers are strings so generation/index-packed `u64` values remain exact in JS.
    pub fn notify_collision_events(
        &mut self,
        started: &[(u64, u64)],
        stopped: &[(u64, u64)],
    ) -> Result<(), ScriptError> {
        if started.is_empty() && stopped.is_empty() {
            return Ok(());
        }
        let started = collision_events_json(started);
        let stopped = collision_events_json(stopped);
        self.eval(&format!(
            "for (const event of {started}) {{ if (typeof onCollisionEnter === 'function') onCollisionEnter(event); }}\
             for (const event of {stopped}) {{ if (typeof onCollisionExit === 'function') onCollisionExit(event); }}"
        ))
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

fn collision_events_json(pairs: &[(u64, u64)]) -> JsonValue {
    JsonValue::Array(
        pairs
            .iter()
            .map(|(first, second)| {
                serde_json::json!({
                    "firstEntity": first.to_string(),
                    "secondEntity": second.to_string(),
                })
            })
            .collect(),
    )
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
            .to_string(ctx)?
            .to_std_string_escaped();
        if let Ok(cmd) = serde_json::from_str::<WorldCommand>(&s) {
            if let Ok(mut buf) = pending().lock() {
                buf.push(cmd);
            }
        }
        Ok(JsValue::undefined())
    });

    let load_scene = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let value = args.get_or_undefined(0);
        let request = if let Some(index) = value.as_number() {
            if !index.is_finite() || index < 0.0 || index.fract() != 0.0 {
                return Ok(JsValue::new(false));
            }
            ScriptRuntimeRequest::LoadSceneByIndex(index as usize)
        } else {
            let reference = value.to_string(ctx)?.to_std_string_escaped();
            if reference.trim().is_empty() {
                return Ok(JsValue::new(false));
            }
            ScriptRuntimeRequest::LoadScene(reference)
        };
        if let Ok(mut requests) = pending_runtime_requests().lock() {
            requests.push(request);
            Ok(JsValue::new(true))
        } else {
            Ok(JsValue::new(false))
        }
    });

    let reload_scene = NativeFunction::from_copy_closure(|_this, _args, _ctx| {
        if let Ok(mut requests) = pending_runtime_requests().lock() {
            requests.push(ScriptRuntimeRequest::ReloadScene);
            Ok(JsValue::new(true))
        } else {
            Ok(JsValue::new(false))
        }
    });

    let set_animator_parameter = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let name = args
            .get_or_undefined(1)
            .to_string(ctx)?
            .to_std_string_escaped();
        if name.trim().is_empty() {
            return Ok(JsValue::new(false));
        }
        let raw = args.get_or_undefined(2);
        let value = if let Some(value) = raw.as_boolean() {
            JsonValue::Bool(value)
        } else if let Some(value) = raw.as_number() {
            if !value.is_finite() {
                return Ok(JsValue::new(false));
            }
            serde_json::Number::from_f64(value)
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null)
        } else {
            return Ok(JsValue::new(false));
        };
        if let Ok(mut requests) = pending_runtime_requests().lock() {
            requests.push(ScriptRuntimeRequest::SetAnimatorParameter {
                entity,
                name,
                value,
            });
            Ok(JsValue::new(true))
        } else {
            Ok(JsValue::new(false))
        }
    });

    let set_animator_trigger = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let name = args
            .get_or_undefined(1)
            .to_string(ctx)?
            .to_std_string_escaped();
        if name.trim().is_empty() {
            return Ok(JsValue::new(false));
        }
        if let Ok(mut requests) = pending_runtime_requests().lock() {
            requests.push(ScriptRuntimeRequest::SetAnimatorParameter {
                entity,
                name,
                value: JsonValue::Bool(true),
            });
            Ok(JsValue::new(true))
        } else {
            Ok(JsValue::new(false))
        }
    });

    let play_animator_state = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let state = args
            .get_or_undefined(1)
            .to_string(ctx)?
            .to_std_string_escaped();
        if state.trim().is_empty() {
            return Ok(JsValue::new(false));
        }
        if let Ok(mut requests) = pending_runtime_requests().lock() {
            requests.push(ScriptRuntimeRequest::PlayAnimatorState { entity, state });
            Ok(JsValue::new(true))
        } else {
            Ok(JsValue::new(false))
        }
    });

    context
        .eval(Source::from_bytes(
            b"var engine = { setClearColor: null, pushCommandJson: null, loadScene: null, reloadScene: null, setAnimatorParameter: null, setAnimatorTrigger: null, playAnimatorState: null, scene: null };",
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
            boa_engine::js_string!("setAnimatorParameter"),
            set_animator_parameter.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("setAnimatorTrigger"),
            set_animator_trigger.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("playAnimatorState"),
            play_animator_state.to_js_function(context.realm()),
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

    engine_obj
        .set(
            boa_engine::js_string!("loadScene"),
            load_scene.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("reloadScene"),
            reload_scene.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    Ok(())
}

fn js_entity_id(value: &JsValue, context: &mut Context) -> Option<u64> {
    if let Some(number) = value.as_number() {
        return (number.is_finite() && number >= 0.0 && number.fract() == 0.0)
            .then_some(number as u64);
    }
    value
        .to_string(context)
        .ok()?
        .to_std_string_escaped()
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_test_guard() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn scripts_request_scene_changes_and_receive_scene_context() {
        let _guard = request_test_guard();
        let mut host = ScriptHost::new().unwrap();
        host.eval(
            r#"
            var loadedScene = null;
            function onSceneLoaded(scene) { loadedScene = scene; }
            engine.loadScene(1);
            engine.loadScene("Level2");
            engine.reloadScene();
            "#,
        )
        .unwrap();
        assert_eq!(
            host.take_runtime_requests(),
            vec![
                ScriptRuntimeRequest::LoadSceneByIndex(1),
                ScriptRuntimeRequest::LoadScene("Level2".into()),
                ScriptRuntimeRequest::ReloadScene,
            ]
        );
        host.notify_scene_loaded("Level 2", "Assets/Scenes/Level2.mscene", Some(1), 2)
            .unwrap();
        host.eval(
            r#"
            if (!loadedScene || loadedScene.name !== "Level 2" || engine.scene.buildIndex !== 1) {
              throw new Error("scene context not delivered");
            }
            "#,
        )
        .unwrap();
    }

    #[test]
    fn scripts_receive_exact_collision_entity_ids() {
        let mut host = ScriptHost::new().unwrap();
        host.eval(
            r#"
            var entered = [];
            var exited = [];
            function onCollisionEnter(event) { entered.push(event); }
            function onCollisionExit(event) { exited.push(event); }
            "#,
        )
        .unwrap();
        host.notify_collision_events(
            &[(9_007_199_254_740_993, 42)],
            &[(11, 9_007_199_254_740_995)],
        )
        .unwrap();
        host.eval(
            r#"
            if (entered.length !== 1 || entered[0].firstEntity !== "9007199254740993" || entered[0].secondEntity !== "42") {
              throw new Error("collision enter event lost entity precision");
            }
            if (exited.length !== 1 || exited[0].secondEntity !== "9007199254740995") {
              throw new Error("collision exit event missing");
            }
            "#,
        )
        .unwrap();
    }

    #[test]
    fn scripts_can_drive_animator_parameters_triggers_and_states() {
        let _guard = request_test_guard();
        let mut host = ScriptHost::new().unwrap();
        host.eval(
            r#"
            if (!engine.setAnimatorParameter("4294967297", "Speed", 1.5)) throw new Error("parameter rejected");
            if (!engine.setAnimatorParameter(7, "Grounded", true)) throw new Error("bool rejected");
            if (!engine.setAnimatorTrigger("4294967297", "Jump")) throw new Error("trigger rejected");
            if (!engine.playAnimatorState("4294967297", "Land")) throw new Error("state rejected");
            "#,
        )
        .unwrap();
        assert_eq!(
            host.take_runtime_requests(),
            vec![
                ScriptRuntimeRequest::SetAnimatorParameter {
                    entity: 4_294_967_297,
                    name: "Speed".into(),
                    value: serde_json::json!(1.5),
                },
                ScriptRuntimeRequest::SetAnimatorParameter {
                    entity: 7,
                    name: "Grounded".into(),
                    value: serde_json::json!(true),
                },
                ScriptRuntimeRequest::SetAnimatorParameter {
                    entity: 4_294_967_297,
                    name: "Jump".into(),
                    value: serde_json::json!(true),
                },
                ScriptRuntimeRequest::PlayAnimatorState {
                    entity: 4_294_967_297,
                    state: "Land".into(),
                },
            ]
        );
    }
}
