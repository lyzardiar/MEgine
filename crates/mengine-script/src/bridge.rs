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

#[derive(Clone, Debug, PartialEq)]
pub enum ScriptRuntimeRequest {
    LoadSceneByIndex(usize),
    LoadScene(String),
    ReloadScene,
    InstantiatePrefab {
        path: String,
        parent: Option<u64>,
    },
    SetAnimatorParameter {
        entity: u64,
        name: String,
        value: JsonValue,
    },
    PlayAnimatorState {
        entity: u64,
        state: String,
    },
    SetAnimatorLayerWeight {
        entity: u64,
        layer: String,
        weight: f32,
    },
    PlayAnimatorLayerState {
        entity: u64,
        layer: String,
        state: String,
    },
    PlayAnimation {
        entity: u64,
        restart: bool,
    },
    PauseAnimation {
        entity: u64,
    },
    StopAnimation {
        entity: u64,
    },
    SeekAnimation {
        entity: u64,
        time: f32,
    },
    PlayTimeline {
        entity: u64,
        restart: bool,
    },
    PauseTimeline {
        entity: u64,
    },
    StopTimeline {
        entity: u64,
    },
    SeekTimeline {
        entity: u64,
        time: f32,
    },
    PlayAudio {
        entity: u64,
    },
    PauseAudio {
        entity: u64,
    },
    StopAudio {
        entity: u64,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct ScriptAnimationEvent {
    pub entity: u64,
    pub function: String,
    pub time: f32,
    pub parameter: Option<JsonValue>,
    pub state: Option<String>,
    pub weight: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ScriptTimelineSignal {
    pub entity: u64,
    pub track: String,
    pub signal: String,
    pub time: f32,
    pub payload: Option<JsonValue>,
}

fn pending_runtime_requests() -> &'static Mutex<Vec<ScriptRuntimeRequest>> {
    static CELL: std::sync::OnceLock<Mutex<Vec<ScriptRuntimeRequest>>> = std::sync::OnceLock::new();
    CELL.get_or_init(|| Mutex::new(Vec::new()))
}

fn queue_runtime_request(request: ScriptRuntimeRequest) -> boa_engine::JsResult<JsValue> {
    if let Ok(mut requests) = pending_runtime_requests().lock() {
        requests.push(request);
        Ok(JsValue::new(true))
    } else {
        Ok(JsValue::new(false))
    }
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
        self.notify_pair_events(
            started,
            stopped,
            "onCollisionEnter",
            "onCollisionExit",
            "3d",
        )
    }

    /// Delivers 3D sensor transitions separately from solid-body collisions.
    pub fn notify_trigger_events(
        &mut self,
        started: &[(u64, u64)],
        stopped: &[(u64, u64)],
    ) -> Result<(), ScriptError> {
        self.notify_pair_events(started, stopped, "onTriggerEnter", "onTriggerExit", "3d")
    }

    /// Delivers Rapier2D solid-contact transitions using Unity-style callback names.
    pub fn notify_collision_events_2d(
        &mut self,
        started: &[(u64, u64)],
        stopped: &[(u64, u64)],
    ) -> Result<(), ScriptError> {
        self.notify_pair_events(
            started,
            stopped,
            "onCollisionEnter2D",
            "onCollisionExit2D",
            "2d",
        )
    }

    /// Delivers Rapier2D sensor transitions using Unity-style callback names.
    pub fn notify_trigger_events_2d(
        &mut self,
        started: &[(u64, u64)],
        stopped: &[(u64, u64)],
    ) -> Result<(), ScriptError> {
        self.notify_pair_events(
            started,
            stopped,
            "onTriggerEnter2D",
            "onTriggerExit2D",
            "2d",
        )
    }

    fn notify_pair_events(
        &mut self,
        started: &[(u64, u64)],
        stopped: &[(u64, u64)],
        enter_callback: &str,
        exit_callback: &str,
        dimension: &str,
    ) -> Result<(), ScriptError> {
        if started.is_empty() && stopped.is_empty() {
            return Ok(());
        }
        let started = collision_events_json(started, dimension);
        let stopped = collision_events_json(stopped, dimension);
        self.eval(&format!(
            "for (const event of {started}) {{ if (typeof {enter_callback} === 'function') {enter_callback}(event); }}\
             for (const event of {stopped}) {{ if (typeof {exit_callback} === 'function') {exit_callback}(event); }}"
        ))
    }

    /// Delivers clip events after animation sampling and before the project's `onTick` callback.
    pub fn notify_animation_events(
        &mut self,
        events: &[ScriptAnimationEvent],
    ) -> Result<(), ScriptError> {
        if events.is_empty() {
            return Ok(());
        }
        let events = JsonValue::Array(
            events
                .iter()
                .map(|event| {
                    serde_json::json!({
                        "entity": event.entity.to_string(),
                        "function": event.function,
                        "time": event.time,
                        "parameter": event.parameter,
                        "state": event.state,
                        "weight": event.weight,
                    })
                })
                .collect(),
        );
        self.eval(&format!(
            "for (const event of {events}) {{ if (typeof onAnimationEvent === 'function') onAnimationEvent(event); }}"
        ))
    }

    /// Delivers Sequencer signal markers after timeline evaluation and before `onTick`.
    pub fn notify_timeline_signals(
        &mut self,
        signals: &[ScriptTimelineSignal],
    ) -> Result<(), ScriptError> {
        if signals.is_empty() {
            return Ok(());
        }
        let signals = JsonValue::Array(
            signals
                .iter()
                .map(|signal| {
                    serde_json::json!({
                        "entity": signal.entity.to_string(),
                        "track": signal.track,
                        "signal": signal.signal,
                        "time": signal.time,
                        "payload": signal.payload,
                    })
                })
                .collect(),
        );
        self.eval(&format!(
            "for (const event of {signals}) {{ if (typeof onTimelineSignal === 'function') onTimelineSignal(event); }}"
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

fn collision_events_json(pairs: &[(u64, u64)], dimension: &str) -> JsonValue {
    JsonValue::Array(
        pairs
            .iter()
            .map(|(first, second)| {
                serde_json::json!({
                    "firstEntity": first.to_string(),
                    "secondEntity": second.to_string(),
                    "dimension": dimension,
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

    let set_animator_layer_weight = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let layer = args
            .get_or_undefined(1)
            .to_string(ctx)?
            .to_std_string_escaped();
        let Some(weight) = args.get_or_undefined(2).as_number() else {
            return Ok(JsValue::new(false));
        };
        if layer.trim().is_empty() || !weight.is_finite() || !(0.0..=1.0).contains(&weight) {
            return Ok(JsValue::new(false));
        }
        queue_runtime_request(ScriptRuntimeRequest::SetAnimatorLayerWeight {
            entity,
            layer,
            weight: weight as f32,
        })
    });

    let play_animator_layer_state = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let layer = args
            .get_or_undefined(1)
            .to_string(ctx)?
            .to_std_string_escaped();
        let state = args
            .get_or_undefined(2)
            .to_string(ctx)?
            .to_std_string_escaped();
        if layer.trim().is_empty() || state.trim().is_empty() {
            return Ok(JsValue::new(false));
        }
        queue_runtime_request(ScriptRuntimeRequest::PlayAnimatorLayerState {
            entity,
            layer,
            state,
        })
    });

    let play_animation = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let restart = args.get_or_undefined(1).as_boolean().unwrap_or(false);
        queue_runtime_request(ScriptRuntimeRequest::PlayAnimation { entity, restart })
    });
    let pause_animation = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::PauseAnimation { entity })
    });
    let stop_animation = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::StopAnimation { entity })
    });
    let seek_animation = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let Some(time) = args.get_or_undefined(1).as_number() else {
            return Ok(JsValue::new(false));
        };
        if !time.is_finite() || time < 0.0 || time > f32::MAX as f64 {
            return Ok(JsValue::new(false));
        }
        queue_runtime_request(ScriptRuntimeRequest::SeekAnimation {
            entity,
            time: time as f32,
        })
    });

    let play_timeline = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let restart = args.get_or_undefined(1).as_boolean().unwrap_or(false);
        queue_runtime_request(ScriptRuntimeRequest::PlayTimeline { entity, restart })
    });
    let pause_timeline = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::PauseTimeline { entity })
    });
    let stop_timeline = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::StopTimeline { entity })
    });
    let seek_timeline = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let Some(time) = args.get_or_undefined(1).as_number() else {
            return Ok(JsValue::new(false));
        };
        if !time.is_finite() || time < 0.0 || time > f32::MAX as f64 {
            return Ok(JsValue::new(false));
        }
        queue_runtime_request(ScriptRuntimeRequest::SeekTimeline {
            entity,
            time: time as f32,
        })
    });

    let play_audio = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::PlayAudio { entity })
    });
    let pause_audio = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::PauseAudio { entity })
    });
    let stop_audio = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_runtime_request(ScriptRuntimeRequest::StopAudio { entity })
    });
    let instantiate_prefab = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let path = args
            .get_or_undefined(0)
            .to_string(ctx)?
            .to_std_string_escaped();
        if path.trim().is_empty() {
            return Ok(JsValue::new(false));
        }
        let parent = if args.len() < 2 {
            None
        } else {
            let Some(parent) = js_entity_id(args.get_or_undefined(1), ctx) else {
                return Ok(JsValue::new(false));
            };
            Some(parent)
        };
        queue_runtime_request(ScriptRuntimeRequest::InstantiatePrefab { path, parent })
    });

    context
        .eval(Source::from_bytes(
            b"var engine = { setClearColor: null, pushCommandJson: null, loadScene: null, reloadScene: null, instantiatePrefab: null, setAnimatorParameter: null, setAnimatorTrigger: null, playAnimatorState: null, setAnimatorLayerWeight: null, playAnimatorLayerState: null, playAnimation: null, pauseAnimation: null, stopAnimation: null, seekAnimation: null, playTimeline: null, pauseTimeline: null, stopTimeline: null, seekTimeline: null, playAudio: null, pauseAudio: null, stopAudio: null, scene: null };",
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
            boa_engine::js_string!("setAnimatorLayerWeight"),
            set_animator_layer_weight.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("playAnimatorLayerState"),
            play_animator_layer_state.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    for (name, function) in [
        ("playAnimation", play_animation),
        ("pauseAnimation", pause_animation),
        ("stopAnimation", stop_animation),
        ("seekAnimation", seek_animation),
    ] {
        engine_obj
            .set(
                boa_engine::JsString::from(name),
                function.to_js_function(context.realm()),
                false,
                context,
            )
            .map_err(|e| ScriptError::Js(format!("{e}")))?;
    }

    for (name, function) in [
        ("playTimeline", play_timeline),
        ("pauseTimeline", pause_timeline),
        ("stopTimeline", stop_timeline),
        ("seekTimeline", seek_timeline),
    ] {
        engine_obj
            .set(
                boa_engine::JsString::from(name),
                function.to_js_function(context.realm()),
                false,
                context,
            )
            .map_err(|e| ScriptError::Js(format!("{e}")))?;
    }

    for (name, function) in [
        ("playAudio", play_audio),
        ("pauseAudio", pause_audio),
        ("stopAudio", stop_audio),
    ] {
        engine_obj
            .set(
                boa_engine::JsString::from(name),
                function.to_js_function(context.realm()),
                false,
                context,
            )
            .map_err(|e| ScriptError::Js(format!("{e}")))?;
    }

    engine_obj
        .set(
            boa_engine::js_string!("instantiatePrefab"),
            instantiate_prefab.to_js_function(context.realm()),
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
            engine.instantiatePrefab("Assets/Prefabs/Enemy.prefab", "4294967297");
            "#,
        )
        .unwrap();
        assert_eq!(
            host.take_runtime_requests(),
            vec![
                ScriptRuntimeRequest::LoadSceneByIndex(1),
                ScriptRuntimeRequest::LoadScene("Level2".into()),
                ScriptRuntimeRequest::ReloadScene,
                ScriptRuntimeRequest::InstantiatePrefab {
                    path: "Assets/Prefabs/Enemy.prefab".into(),
                    parent: Some(4_294_967_297),
                },
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
            if (entered[0].dimension !== "3d") throw new Error("collision dimension missing");
            if (exited.length !== 1 || exited[0].secondEntity !== "9007199254740995") {
              throw new Error("collision exit event missing");
            }
            "#,
        )
        .unwrap();
    }

    #[test]
    fn scripts_receive_separate_2d_collision_and_trigger_hooks() {
        let mut host = ScriptHost::new().unwrap();
        host.eval(
            r#"
            var collision2D = [];
            var trigger2D = [];
            function onCollisionEnter2D(event) { collision2D.push(event); }
            function onTriggerEnter2D(event) { trigger2D.push(event); }
            "#,
        )
        .unwrap();
        host.notify_collision_events_2d(&[(7, 8)], &[]).unwrap();
        host.notify_trigger_events_2d(&[(9, 10)], &[]).unwrap();
        host.eval(
            r#"
            if (collision2D.length !== 1 || collision2D[0].dimension !== "2d") throw new Error("2D collision hook missing");
            if (trigger2D.length !== 1 || trigger2D[0].firstEntity !== "9") throw new Error("2D trigger hook missing");
            "#,
        )
        .unwrap();
    }

    #[test]
    fn scripts_receive_typed_animation_events_with_exact_entity_ids() {
        let mut host = ScriptHost::new().unwrap();
        host.eval("var animationEvents = []; function onAnimationEvent(event) { animationEvents.push(event); }")
            .unwrap();
        host.notify_animation_events(&[ScriptAnimationEvent {
            entity: 9_007_199_254_740_993,
            function: "Footstep".into(),
            time: 0.25,
            parameter: Some(serde_json::json!("left")),
            state: Some("Run".into()),
            weight: 0.75,
        }])
        .unwrap();
        host.eval(
            r#"
            if (animationEvents.length !== 1) throw new Error("animation event missing");
            const event = animationEvents[0];
            if (event.entity !== "9007199254740993" || event.function !== "Footstep" || event.parameter !== "left" || event.state !== "Run" || event.weight !== 0.75) {
              throw new Error("animation event payload mismatch");
            }
            "#,
        )
        .unwrap();
    }

    #[test]
    fn scripts_receive_timeline_signals_with_json_payloads() {
        let mut host = ScriptHost::new().unwrap();
        host.eval("var timelineSignals = []; function onTimelineSignal(event) { timelineSignals.push(event); }")
            .unwrap();
        host.notify_timeline_signals(&[ScriptTimelineSignal {
            entity: 9_007_199_254_740_993,
            track: "Gameplay".into(),
            signal: "SpawnBoss".into(),
            time: 1.25,
            payload: Some(serde_json::json!({"phase": 2})),
        }])
        .unwrap();
        host.eval(
            r#"
            if (timelineSignals.length !== 1) throw new Error("timeline signal missing");
            const event = timelineSignals[0];
            if (event.entity !== "9007199254740993" || event.track !== "Gameplay" || event.signal !== "SpawnBoss" || event.payload.phase !== 2) {
              throw new Error("timeline signal payload mismatch");
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
            if (!engine.setAnimatorLayerWeight("4294967297", "Upper", 0.35)) throw new Error("layer weight rejected");
            if (engine.setAnimatorLayerWeight(7, "Upper", 2)) throw new Error("invalid layer weight accepted");
            if (!engine.playAnimatorLayerState("4294967297", "Upper", "Wave")) throw new Error("layer state rejected");
            if (!engine.playAnimation("4294967297", true)) throw new Error("animation play rejected");
            if (!engine.pauseAnimation(7)) throw new Error("animation pause rejected");
            if (!engine.stopAnimation("4294967297")) throw new Error("animation stop rejected");
            if (!engine.seekAnimation("4294967297", 1.25)) throw new Error("animation seek rejected");
            if (engine.seekAnimation(7, -1)) throw new Error("negative animation time accepted");
            if (!engine.playTimeline("4294967297", true)) throw new Error("timeline play rejected");
            if (!engine.pauseTimeline(7)) throw new Error("timeline pause rejected");
            if (!engine.stopTimeline("4294967297")) throw new Error("timeline stop rejected");
            if (!engine.seekTimeline("4294967297", 2.5)) throw new Error("timeline seek rejected");
            if (engine.seekTimeline(7, -1)) throw new Error("negative timeline time accepted");
            if (!engine.playAudio("4294967297")) throw new Error("audio play rejected");
            if (!engine.pauseAudio(7)) throw new Error("audio pause rejected");
            if (!engine.stopAudio("4294967297")) throw new Error("audio stop rejected");
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
                ScriptRuntimeRequest::SetAnimatorLayerWeight {
                    entity: 4_294_967_297,
                    layer: "Upper".into(),
                    weight: 0.35,
                },
                ScriptRuntimeRequest::PlayAnimatorLayerState {
                    entity: 4_294_967_297,
                    layer: "Upper".into(),
                    state: "Wave".into(),
                },
                ScriptRuntimeRequest::PlayAnimation {
                    entity: 4_294_967_297,
                    restart: true,
                },
                ScriptRuntimeRequest::PauseAnimation { entity: 7 },
                ScriptRuntimeRequest::StopAnimation {
                    entity: 4_294_967_297,
                },
                ScriptRuntimeRequest::SeekAnimation {
                    entity: 4_294_967_297,
                    time: 1.25,
                },
                ScriptRuntimeRequest::PlayTimeline {
                    entity: 4_294_967_297,
                    restart: true,
                },
                ScriptRuntimeRequest::PauseTimeline { entity: 7 },
                ScriptRuntimeRequest::StopTimeline {
                    entity: 4_294_967_297,
                },
                ScriptRuntimeRequest::SeekTimeline {
                    entity: 4_294_967_297,
                    time: 2.5,
                },
                ScriptRuntimeRequest::PlayAudio {
                    entity: 4_294_967_297,
                },
                ScriptRuntimeRequest::PauseAudio { entity: 7 },
                ScriptRuntimeRequest::StopAudio {
                    entity: 4_294_967_297,
                },
            ]
        );
    }
}
