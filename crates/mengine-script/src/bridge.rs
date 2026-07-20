use crate::ScriptError;
use boa_engine::{Context, JsArgs, JsValue, NativeFunction, Source};
use mengine_core::command::{CommandBuffer, WorldCommand};
use mengine_core::World;
use serde_json::Value as JsonValue;
use std::sync::{Arc, Mutex};

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
    SeekAudio {
        entity: u64,
        time: f32,
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

/// Embeds a JS engine and exposes `engine` global for tick scripts.
///
/// Each host owns an isolated command buffer and runtime-request queue so
/// multiple hosts never share mutable state.
pub struct ScriptHost {
    context: Context,
    commands: Arc<Mutex<CommandBuffer>>,
    requests: Arc<Mutex<Vec<ScriptRuntimeRequest>>>,
    /// Latest world snapshot for read queries (findByName, getComponent, etc.).
    snapshot: Arc<Mutex<Option<JsonValue>>>,
}

impl ScriptHost {
    pub fn new() -> Result<Self, ScriptError> {
        let commands = Arc::new(Mutex::new(CommandBuffer::new()));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let snapshot = Arc::new(Mutex::new(None));
        let mut context = Context::default();
        register_engine(
            &mut context,
            Arc::clone(&commands),
            Arc::clone(&requests),
            Arc::clone(&snapshot),
        )?;
        Ok(Self {
            context,
            commands,
            requests,
            snapshot,
        })
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

    /// Injects per-frame input and time state into the JS `engine.input` and
    /// `engine.time` objects. Call this before `tick` each frame.
    pub fn inject_frame_context(
        &mut self,
        input_json: &str,
        time_json: &str,
    ) -> Result<(), ScriptError> {
        self.eval(&format!(
            "engine.input = {input_json}; engine.time = {time_json};"
        ))
    }

    /// Updates the world snapshot used by read-query native functions
    /// (findByName, getComponent, getEntities).
    pub fn update_snapshot(&mut self, snapshot: JsonValue) {
        if let Ok(mut guard) = self.snapshot.lock() {
            *guard = Some(snapshot);
        }
    }

    pub fn tick(&mut self, world: &mut World, dt: f32) -> Result<(), ScriptError> {
        let code = format!(
            "if (typeof onTick === 'function') {{ onTick({dt}, {}); }}",
            world.time.frame
        );
        let _ = self.context.eval(Source::from_bytes(code.as_bytes()));

        if let Ok(mut buf) = self.commands.lock() {
            for cmd in buf.drain() {
                world.commands.push(cmd);
            }
        }
        world.commit();
        Ok(())
    }

    pub fn inject_snapshot_json(&mut self, json: &str) -> Result<(), ScriptError> {
        // Use JSON.parse for safe injection instead of fragile string escaping.
        let code = format!("var lastSnapshot = JSON.parse({});", serde_json::to_string(json).unwrap_or_else(|_| "\"{}\"".into()));
        self.eval(&code)
    }

    pub fn take_runtime_requests(&mut self) -> Vec<ScriptRuntimeRequest> {
        self.requests
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

fn queue_request(
    requests: &Arc<Mutex<Vec<ScriptRuntimeRequest>>>,
    request: ScriptRuntimeRequest,
) -> boa_engine::JsResult<JsValue> {
    if let Ok(mut queue) = requests.lock() {
        queue.push(request);
        Ok(JsValue::new(true))
    } else {
        Ok(JsValue::new(false))
    }
}

/// Creates a `NativeFunction` from a closure that captures only pure-Rust types.
///
/// # Safety justification
/// The closures passed here capture `Arc<Mutex<CommandBuffer>>` and
/// `Arc<Mutex<Vec<ScriptRuntimeRequest>>> - neither contains Boa GC-traceable
/// values, so the `unsafe` contract of `NativeFunction::from_closure` is upheld.
fn native_fn<F>(closure: F) -> NativeFunction
where
    F: Fn(&JsValue, &[JsValue], &mut Context) -> boa_engine::JsResult<JsValue> + 'static,
{
    // SAFETY: captures are Arc<Mutex<T>> with T: pure Rust data, no JS-traceable types.
    unsafe { NativeFunction::from_closure(closure) }
}

fn register_engine(
    context: &mut Context,
    commands: Arc<Mutex<CommandBuffer>>,
    requests: Arc<Mutex<Vec<ScriptRuntimeRequest>>>,
    snapshot: Arc<Mutex<Option<JsonValue>>>,
) -> Result<(), ScriptError> {
    let cmd_buf = Arc::clone(&commands);
    let set_clear = native_fn(move |_this, args, _ctx| {
        let r = args.get_or_undefined(0).as_number().unwrap_or(0.0) as f32;
        let g = args.get_or_undefined(1).as_number().unwrap_or(0.0) as f32;
        let b = args.get_or_undefined(2).as_number().unwrap_or(0.0) as f32;
        let a = args.get_or_undefined(3).as_number().unwrap_or(1.0) as f32;
        if let Ok(mut buf) = cmd_buf.lock() {
            buf.set_clear_color(r, g, b, a);
        }
        Ok(JsValue::undefined())
    });

    let cmd_buf = Arc::clone(&commands);
    let push_cmd = native_fn(move |_this, args, ctx| {
        let s = args
            .get_or_undefined(0)
            .to_string(ctx)?
            .to_std_string_escaped();
        if let Ok(cmd) = serde_json::from_str::<WorldCommand>(&s) {
            if let Ok(mut buf) = cmd_buf.lock() {
                buf.push(cmd);
            }
        }
        Ok(JsValue::undefined())
    });

    let req = Arc::clone(&requests);
    let load_scene = native_fn(move |_this, args, ctx| {
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
        queue_request(&req, request)
    });

    let req = Arc::clone(&requests);
    let reload_scene = native_fn(move |_this, _args, _ctx| {
        queue_request(&req, ScriptRuntimeRequest::ReloadScene)
    });

    let req = Arc::clone(&requests);
    let set_animator_parameter = native_fn(move |_this, args, ctx| {
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
        queue_request(
            &req,
            ScriptRuntimeRequest::SetAnimatorParameter {
                entity,
                name,
                value,
            },
        )
    });

    let req = Arc::clone(&requests);
    let set_animator_trigger = native_fn(move |_this, args, ctx| {
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
        queue_request(
            &req,
            ScriptRuntimeRequest::SetAnimatorParameter {
                entity,
                name,
                value: JsonValue::Bool(true),
            },
        )
    });

    let req = Arc::clone(&requests);
    let play_animator_state = native_fn(move |_this, args, ctx| {
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
        queue_request(&req, ScriptRuntimeRequest::PlayAnimatorState { entity, state })
    });

    let req = Arc::clone(&requests);
    let set_animator_layer_weight = native_fn(move |_this, args, ctx| {
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
        queue_request(
            &req,
            ScriptRuntimeRequest::SetAnimatorLayerWeight {
                entity,
                layer,
                weight: weight as f32,
            },
        )
    });

    let req = Arc::clone(&requests);
    let play_animator_layer_state = native_fn(move |_this, args, ctx| {
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
        queue_request(
            &req,
            ScriptRuntimeRequest::PlayAnimatorLayerState {
                entity,
                layer,
                state,
            },
        )
    });

    let req = Arc::clone(&requests);
    let play_animation = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let restart = args.get_or_undefined(1).as_boolean().unwrap_or(false);
        queue_request(&req, ScriptRuntimeRequest::PlayAnimation { entity, restart })
    });
    let req = Arc::clone(&requests);
    let pause_animation = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::PauseAnimation { entity })
    });
    let req = Arc::clone(&requests);
    let stop_animation = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::StopAnimation { entity })
    });
    let req = Arc::clone(&requests);
    let seek_animation = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let Some(time) = args.get_or_undefined(1).as_number() else {
            return Ok(JsValue::new(false));
        };
        if !time.is_finite() || time < 0.0 || time > f32::MAX as f64 {
            return Ok(JsValue::new(false));
        }
        queue_request(
            &req,
            ScriptRuntimeRequest::SeekAnimation {
                entity,
                time: time as f32,
            },
        )
    });

    let req = Arc::clone(&requests);
    let play_timeline = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let restart = args.get_or_undefined(1).as_boolean().unwrap_or(false);
        queue_request(&req, ScriptRuntimeRequest::PlayTimeline { entity, restart })
    });
    let req = Arc::clone(&requests);
    let pause_timeline = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::PauseTimeline { entity })
    });
    let req = Arc::clone(&requests);
    let stop_timeline = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::StopTimeline { entity })
    });
    let req = Arc::clone(&requests);
    let seek_timeline = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let Some(time) = args.get_or_undefined(1).as_number() else {
            return Ok(JsValue::new(false));
        };
        if !time.is_finite() || time < 0.0 || time > f32::MAX as f64 {
            return Ok(JsValue::new(false));
        }
        queue_request(
            &req,
            ScriptRuntimeRequest::SeekTimeline {
                entity,
                time: time as f32,
            },
        )
    });

    let req = Arc::clone(&requests);
    let play_audio = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::PlayAudio { entity })
    });
    let req = Arc::clone(&requests);
    let pause_audio = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::PauseAudio { entity })
    });
    let req = Arc::clone(&requests);
    let stop_audio = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        queue_request(&req, ScriptRuntimeRequest::StopAudio { entity })
    });
    let req = Arc::clone(&requests);
    let seek_audio = native_fn(move |_this, args, ctx| {
        let Some(entity) = js_entity_id(args.get_or_undefined(0), ctx) else {
            return Ok(JsValue::new(false));
        };
        let Some(time) = args.get_or_undefined(1).as_number() else {
            return Ok(JsValue::new(false));
        };
        if !time.is_finite() || time < 0.0 || time > f32::MAX as f64 {
            return Ok(JsValue::new(false));
        }
        queue_request(
            &req,
            ScriptRuntimeRequest::SeekAudio {
                entity,
                time: time as f32,
            },
        )
    });
    let req = Arc::clone(&requests);
    let instantiate_prefab = native_fn(move |_this, args, ctx| {
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
        queue_request(&req, ScriptRuntimeRequest::InstantiatePrefab { path, parent })
    });

    // World query native functions (read from the latest snapshot).
    let snap = Arc::clone(&snapshot);
    let find_by_name = native_fn(move |_this, args, ctx| {
        let name = args
            .get_or_undefined(0)
            .to_string(ctx)?
            .to_std_string_escaped();
        let guard = snap.lock().map_err(|_| {
            boa_engine::JsError::from_opaque(JsValue::new(boa_engine::JsString::from("snapshot lock poisoned")))
        })?;
        let Some(snapshot) = guard.as_ref() else {
            return Ok(JsValue::null());
        };
        let entities = snapshot
            .get("entities")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        for entity in &entities {
            if entity.get("name").and_then(|v| v.as_str()) == Some(name.as_str()) {
                if let Some(id) = entity.get("entity").and_then(|v| v.as_u64()) {
                    return Ok(JsValue::new(boa_engine::JsString::from(id.to_string())));
                }
            }
        }
        Ok(JsValue::null())
    });

    let snap = Arc::clone(&snapshot);
    let get_component = native_fn(move |_this, args, ctx| {
        let entity_str = args
            .get_or_undefined(0)
            .to_string(ctx)?
            .to_std_string_escaped();
        let component_name = args
            .get_or_undefined(1)
            .to_string(ctx)?
            .to_std_string_escaped();
        let Ok(entity_id) = entity_str.parse::<u64>() else {
            return Ok(JsValue::null());
        };
        let guard = snap.lock().map_err(|_| {
            boa_engine::JsError::from_opaque(JsValue::new(boa_engine::JsString::from("snapshot lock poisoned")))
        })?;
        let Some(snapshot) = guard.as_ref() else {
            return Ok(JsValue::null());
        };
        let entities = snapshot
            .get("entities")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        for entity in &entities {
            if entity.get("entity").and_then(|v| v.as_u64()) == Some(entity_id) {
                if let Some(components) = entity.get("components").and_then(|v| v.as_object()) {
                    if let Some(value) = components.get(&component_name) {
                        let json_str = serde_json::to_string(value).unwrap_or_default();
                        return ctx.eval(Source::from_bytes(json_str.as_bytes()));
                    }
                }
                return Ok(JsValue::null());
            }
        }
        Ok(JsValue::null())
    });

    let snap = Arc::clone(&snapshot);
    let get_entities = native_fn(move |_this, _args, _ctx| {
        let guard = snap.lock().map_err(|_| {
            boa_engine::JsError::from_opaque(JsValue::new(boa_engine::JsString::from("snapshot lock poisoned")))
        })?;
        let Some(snapshot) = guard.as_ref() else {
            return Ok(JsValue::new(boa_engine::JsString::from("[]")));
        };
        let entities = snapshot
            .get("entities")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let ids: Vec<String> = entities
            .iter()
            .filter_map(|e| e.get("entity").and_then(|v| v.as_u64()))
            .map(|id| format!("\"{id}\""))
            .collect();
        Ok(JsValue::new(boa_engine::JsString::from(format!("[{}]", ids.join(",")))))
    });

    context
        .eval(Source::from_bytes(
            b"var engine = { setClearColor: null, pushCommandJson: null, loadScene: null, reloadScene: null, instantiatePrefab: null, setAnimatorParameter: null, setAnimatorTrigger: null, playAnimatorState: null, setAnimatorLayerWeight: null, playAnimatorLayerState: null, playAnimation: null, pauseAnimation: null, stopAnimation: null, seekAnimation: null, playTimeline: null, pauseTimeline: null, stopTimeline: null, seekTimeline: null, playAudio: null, pauseAudio: null, stopAudio: null, seekAudio: null, scene: null, input: null, time: null, findByName: null, getComponent: null, getEntities: null };",
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
        ("seekAudio", seek_audio),
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

    engine_obj
        .set(
            boa_engine::js_string!("findByName"),
            find_by_name.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("getComponent"),
            get_component.to_js_function(context.realm()),
            false,
            context,
        )
        .map_err(|e| ScriptError::Js(format!("{e}")))?;

    engine_obj
        .set(
            boa_engine::js_string!("getEntities"),
            get_entities.to_js_function(context.realm()),
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

    #[test]
    fn scripts_request_scene_changes_and_receive_scene_context() {
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
            if (!engine.seekAudio("4294967297", 3.75)) throw new Error("audio seek rejected");
            if (engine.seekAudio(7, -1)) throw new Error("negative audio time accepted");
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
                ScriptRuntimeRequest::SeekAudio {
                    entity: 4_294_967_297,
                    time: 3.75,
                },
            ]
        );
    }

    #[test]
    fn two_hosts_are_isolated() {
        let mut host_a = ScriptHost::new().unwrap();
        let mut host_b = ScriptHost::new().unwrap();
        host_a.eval("engine.loadScene(1);").unwrap();
        host_b.eval("engine.loadScene(2);").unwrap();
        assert_eq!(
            host_a.take_runtime_requests(),
            vec![ScriptRuntimeRequest::LoadSceneByIndex(1)]
        );
        assert_eq!(
            host_b.take_runtime_requests(),
            vec![ScriptRuntimeRequest::LoadSceneByIndex(2)]
        );
    }
}
