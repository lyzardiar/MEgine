use crate::{ScriptError, ScriptInput};
use mengine_core::{command::{CommandBuffer, WorldCommand}, snapshot::WorldSnapshot, World};
use rquickjs::{CaughtError, Context, Ctx, Function, Object, Persistent, Runtime};
use rquickjs::context::EvalOptions;
use serde_json::Value as JsonValue;
use std::{cell::{Cell, RefCell}, rc::Rc, time::{Duration, Instant}};

#[derive(Default)]
struct ScriptSnapshot {
    revision: u64,
    world: Option<WorldSnapshot>,
    json: Option<String>,
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



/// One QuickJS runtime per host; editor and standalone players execute the same engine API.
pub struct ScriptHost {
    // Persistent functions must be released before their owning context and runtime.
    tick_callback: Option<Persistent<Function<'static>>>,
    restore_snapshot: Persistent<Function<'static>>,
    context: Context,
    _runtime: Runtime,
    deadline: Rc<Cell<Instant>>,
    commands: Rc<RefCell<CommandBuffer>>,
    requests: Rc<RefCell<Vec<ScriptRuntimeRequest>>>,
    snapshot: Rc<RefCell<ScriptSnapshot>>,
}

fn script_error(ctx: &Ctx<'_>, error: rquickjs::Error) -> ScriptError {
    ScriptError::Js(CaughtError::from_error(ctx, error).to_string())
}

fn parse_command(json: &str) -> Option<WorldCommand> {
    // Deserialize large component arrays once, without serde's tagged-enum buffer.
    #[derive(serde::Deserialize)]
    struct ComponentCommand { op: String, entity: u64, component: String, value: JsonValue }
    if let Ok(command) = serde_json::from_str::<ComponentCommand>(json) {
        if command.op == "setComponent" {
            return Some(WorldCommand::SetComponent { entity: command.entity, component: command.component, value: command.value });
        }
    }
    serde_json::from_str(json).ok()
}

fn read_float4_array(values: rquickjs::Array<'_>) -> rquickjs::Result<Vec<[f32; 4]>> {
    values.iter::<rquickjs::Array>().map(|value| {
        let value = value?;
        if value.len() != 4 { return Err(rquickjs::Error::new_from_js_message("array", "float4", "expected four numbers")); }
        Ok([value.get(0)?, value.get(1)?, value.get(2)?, value.get(3)?])
    }).collect()
}

impl ScriptHost {
    pub fn new() -> Result<Self, ScriptError> {
        let runtime = Runtime::new().map_err(|error| ScriptError::Js(error.to_string()))?;
        runtime.set_memory_limit(256 * 1024 * 1024);
        runtime.set_max_stack_size(1024 * 1024);
        let deadline = Rc::new(Cell::new(Instant::now() + Duration::from_secs(1)));
        let limit = deadline.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= limit.get())));
        let context = Context::full(&runtime).map_err(|error| ScriptError::Js(error.to_string()))?;
        let commands = Rc::new(RefCell::new(CommandBuffer::new()));
        let requests = Rc::new(RefCell::new(Vec::new()));
        let snapshot = Rc::new(RefCell::new(ScriptSnapshot::default()));
        let restore_snapshot = context.with(|ctx| {
            let install = || -> rquickjs::Result<Persistent<Function<'static>>> {
                let pending = commands.clone();
                ctx.globals().set("__mengineCommand", Function::new(ctx.clone(), move |json: String| {
                    if let Some(command) = parse_command(&json) { pending.borrow_mut().push(command); }
                })?)?;
                let pending = commands.clone();
                ctx.globals().set("__mengineSpriteBatch", Function::new(ctx.clone(), move |entity: String, instances: rquickjs::Array, colors: rquickjs::Array| -> rquickjs::Result<bool> {
                    let Ok(entity) = entity.parse::<u64>() else { return Ok(false); };
                    if instances.len() > 8192 || colors.len() > 8192 { return Ok(false); }
                    let instances = read_float4_array(instances)?;
                    let colors = read_float4_array(colors)?;
                    if !instances.iter().chain(&colors).flatten().all(|value| value.is_finite()) { return Ok(false); }
                    pending.borrow_mut().push(WorldCommand::SetSpriteBatchData { entity, instances, colors });
                    Ok(true)
                })?)?;
                let pending = requests.clone();
                ctx.globals().set("__mengineRequest", Function::new(ctx.clone(), move |operation: String, json: String| {
                    let request = serde_json::from_str::<Vec<JsonValue>>(&json).ok().and_then(|args| runtime_request(&operation, &args));
                    if let Some(request) = request { pending.borrow_mut().push(request); true } else { false }
                })?)?;
                let state = snapshot.clone();
                ctx.globals().set("__mengineRevision", Function::new(ctx.clone(), move || state.borrow().revision as f64)?)?;
                let state = snapshot.clone();
                ctx.globals().set("__mengineSnapshot", Function::new(ctx.clone(), move || {
                    let mut state = state.borrow_mut();
                    if state.json.is_none() { state.json = Some(serde_json::to_string(&state.world).expect("world snapshot serializes")); }
                    state.json.as_ref().unwrap().clone()
                })?)?;
                Ok(Persistent::save(&ctx, ctx.eval::<Function, _>(include_str!("engine_api.js"))?))
            };
            install().map_err(|error| script_error(&ctx, error))
        })?;
        let mut host = Self { tick_callback: None, restore_snapshot, context, _runtime: runtime, deadline, commands, requests, snapshot };
        host.set_input(&ScriptInput::default())?;
        Ok(host)
    }

    pub fn eval(&mut self, source: &str) -> Result<(), ScriptError> {
        self.tick_callback = None;
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        let mut options = EvalOptions::default();
        options.strict = false;
        self.context.with(|ctx| ctx.eval_with_options::<(), _>(source, options).map_err(|error| script_error(&ctx, error)))
    }

    pub fn load_file(&mut self, path: &std::path::Path) -> Result<(), ScriptError> { self.eval(&std::fs::read_to_string(path)?) }

    pub fn tick(&mut self, world: &mut World, dt: f32) -> Result<(), ScriptError> {
        self.sync_world(world)?;
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        let result = self.context.with(|ctx| {
            let mut invoke = || -> rquickjs::Result<()> {
                if self.tick_callback.is_none() {
                    let callback: Function = ctx.eval("(dt, frame) => { if (typeof onTick === 'function') onTick(dt, frame); }")?;
                    self.tick_callback = Some(Persistent::save(&ctx, callback));
                }
                self.tick_callback.as_ref().unwrap().clone().restore(&ctx)?.call::<_, ()>((dt, world.time.frame as f64))
            };
            invoke().map_err(|error| script_error(&ctx, error))
        });
        if let Err(error) = result {
            self.commands.borrow_mut().drain(); self.requests.borrow_mut().clear();
            return Err(error);
        }
        for command in self.commands.borrow_mut().drain() { world.commands.push(command); }
        world.commit();
        Ok(())
    }

    pub fn sync_world(&mut self, world: &World) -> Result<(), ScriptError> {
        let mut state = self.snapshot.borrow_mut();
        state.revision += 1;
        state.world = Some(WorldSnapshot::from_world(world));
        state.json = None;
        drop(state);
        self.restore_snapshot_properties()
    }

    pub fn inject_snapshot_json(&mut self, json: &str) -> Result<(), ScriptError> {
        serde_json::from_str::<JsonValue>(json).map_err(|error| ScriptError::Other(error.to_string()))?;
        let mut state = self.snapshot.borrow_mut();
        state.revision += 1; state.world = None; state.json = Some(json.to_owned());
        drop(state);
        self.restore_snapshot_properties()
    }

    fn restore_snapshot_properties(&self) -> Result<(), ScriptError> {
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        self.context.with(|ctx| {
            self.restore_snapshot.clone().restore(&ctx).and_then(|restore| restore.call::<_, ()>(())).map_err(|error| script_error(&ctx, error))
        })
    }

    pub fn set_input(&mut self, input: &ScriptInput) -> Result<(), ScriptError> {
        let json = serde_json::to_string(input).map_err(|error| ScriptError::Other(error.to_string()))?;
        self.deadline.set(Instant::now() + Duration::from_secs(1));
        self.context.with(|ctx| {
            let assign = || -> rquickjs::Result<()> {
                let engine: Object = ctx.globals().get("engine")?;
                engine.set("input", ctx.json_parse(json)?)
            };
            assign().map_err(|error| script_error(&ctx, error))
        })
    }

    pub fn take_runtime_requests(&mut self) -> Vec<ScriptRuntimeRequest> { std::mem::take(&mut *self.requests.borrow_mut()) }

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
    fn default() -> Self { Self::new().expect("ScriptHost") }
}

fn entity_id(value: &JsonValue) -> Option<u64> {
    if let Some(id) = value.as_str() { return id.parse().ok(); }
    value.as_u64().or_else(|| value.as_f64().filter(|n| n.is_finite() && *n >= 0.0 && n.fract() == 0.0).map(|n| n as u64))
}

fn runtime_request(operation: &str, args: &[JsonValue]) -> Option<ScriptRuntimeRequest> {
    use ScriptRuntimeRequest::*;
    let arg = |index| args.get(index).unwrap_or(&JsonValue::Null);
    let text = |index| arg(index).as_str().filter(|value| !value.trim().is_empty()).map(str::to_owned);
    let entity = || entity_id(arg(0));
    let time = || arg(1).as_f64().filter(|time| *time >= 0.0 && *time <= f64::from(f32::MAX)).map(|time| time as f32);
    let restart = || arg(1).as_bool().unwrap_or(false);
    Some(match operation {
        "loadScene" if arg(0).is_number() => LoadSceneByIndex(usize::try_from(entity()?).ok()?),
        "loadScene" => LoadScene(text(0)?),
        "reloadScene" => ReloadScene,
        "instantiatePrefab" => InstantiatePrefab { path: text(0)?, parent: if args.len() < 2 { None } else { Some(entity_id(arg(1))?) } },
        "setAnimatorParameter" => { let value = arg(2); if !value.is_boolean() && !value.is_number() { return None; } SetAnimatorParameter { entity: entity()?, name: text(1)?, value: value.clone() } },
        "setAnimatorTrigger" => SetAnimatorParameter { entity: entity()?, name: text(1)?, value: JsonValue::Bool(true) },
        "playAnimatorState" => PlayAnimatorState { entity: entity()?, state: text(1)? },
        "setAnimatorLayerWeight" => SetAnimatorLayerWeight { entity: entity()?, layer: text(1)?, weight: arg(2).as_f64().filter(|weight| (0.0..=1.0).contains(weight))? as f32 },
        "playAnimatorLayerState" => PlayAnimatorLayerState { entity: entity()?, layer: text(1)?, state: text(2)? },
        "playAnimation" => PlayAnimation { entity: entity()?, restart: restart() },
        "pauseAnimation" => PauseAnimation { entity: entity()? },
        "stopAnimation" => StopAnimation { entity: entity()? },
        "seekAnimation" => SeekAnimation { entity: entity()?, time: time()? },
        "playTimeline" => PlayTimeline { entity: entity()?, restart: restart() },
        "pauseTimeline" => PauseTimeline { entity: entity()? },
        "stopTimeline" => StopTimeline { entity: entity()? },
        "seekTimeline" => SeekTimeline { entity: entity()?, time: time()? },
        "playAudio" => PlayAudio { entity: entity()? },
        "pauseAudio" => PauseAudio { entity: entity()? },
        "stopAudio" => StopAudio { entity: entity()? },
        "seekAudio" => SeekAudio { entity: entity()?, time: time()? },
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sprite_batch_arrays_commit_in_command_order_and_preserve_authored_properties() {
        use mengine_core::generated::SpriteBatch2D;
        let mut host = ScriptHost::new().unwrap();
        let mut world = World::new();
        let entity = world.spawn_empty();
        world.insert_component(entity, SpriteBatch2D { sprite: "Assets/bullet.png".into(), size: [2.0, 3.0], ..Default::default() });
        host.eval(&format!("var data = [[1,2,0,1]]; if (!engine.setSpriteBatchData({}n, data, [[1,0,0,1]])) throw Error('batch rejected'); data[0][0] = 9;", entity.to_u64())).unwrap();
        host.tick(&mut world, 0.016).unwrap();
        let batch = world.get_component::<SpriteBatch2D>(entity).unwrap();
        assert_eq!(batch.instances, vec![[1.0, 2.0, 0.0, 1.0]]);
        assert_eq!(batch.colors, vec![[1.0, 0.0, 0.0, 1.0]]);
        assert_eq!(batch.sprite, "Assets/bullet.png");
        assert_eq!(batch.size, [2.0, 3.0]);
        assert_eq!(world.component_value(entity, "SpriteBatch2D").unwrap()["instances"][0][0].as_f64(), Some(1.0));
        host.eval(&format!("if(engine.setSpriteBatchData({}, [[NaN,0,0,1]])) throw Error('invalid batch accepted'); if(engine.setSpriteBatchData({}, new Array(8193).fill([0,0,0,1]))) throw Error('oversized batch accepted'); engine.setSpriteBatchData({}, []); engine.pushCommandJson('{{\"op\":\"removeComponent\",\"entity\":{},\"component\":\"SpriteBatch2D\"}}'); engine.setSpriteBatchData({}, [[0,0,0,1]]);", entity.to_u64(), entity.to_u64(), entity.to_u64(), entity.to_u64(), entity.to_u64())).unwrap();
        host.tick(&mut world, 0.016).unwrap();
        assert!(world.get_component::<SpriteBatch2D>(entity).is_none());
        host.eval(&format!("function onTick() {{ engine.setSpriteBatchData({}, [[0,0,0,1]]); throw Error('abort'); }}", entity.to_u64())).unwrap();
        assert!(host.tick(&mut world, 0.016).is_err());
        assert!(host.commands.borrow().is_empty());
    }

    #[test]
    fn component_command_fast_path_preserves_command_deserialization() {
        for json in [r#"{"value":{"instances":[[1,2,3,4]]},"entity":9007199254740993,"op":"setComponent","component":"SpriteBatch2D"}"#, r#"{"op":"setClearColor","r":1,"g":0,"b":0,"a":1}"#, r#"{"op":"despawn","entity":1}"#, r#"{"op":"setComponent","entity":1,"component":"Text","value":null}"#, r#"{"op":"setComponent","entity":-1,"component":"Text","value":{}}"#, r#"{"op":"unknown"}"#] {
            let expected = serde_json::from_str::<WorldCommand>(json).ok().map(|value| serde_json::to_value(value).unwrap());
            assert_eq!(parse_command(json).map(|value| serde_json::to_value(value).unwrap()), expected);
        }
    }

    #[test]
    fn runtime_requests_preserve_exact_ids_and_string_coercion() {
        let mut host = ScriptHost::new().unwrap();
        host.eval("if (!engine.playAudio(9007199254740993n) || !engine.setAnimatorTrigger({toString: () => '9007199254740993'}, 42) || !engine.instantiatePrefab({toString: () => 'Bird'}, 9007199254740993n)) throw Error('coercion'); if (engine.seekAudio(1n, 2n)) throw Error('invalid time');").unwrap();
        assert_eq!(host.take_runtime_requests(), vec![
            ScriptRuntimeRequest::PlayAudio { entity: 9_007_199_254_740_993 },
            ScriptRuntimeRequest::SetAnimatorParameter { entity: 9_007_199_254_740_993, name: "42".into(), value: JsonValue::Bool(true) },
            ScriptRuntimeRequest::InstantiatePrefab { path: "Bird".into(), parent: Some(9_007_199_254_740_993) },
        ]);
    }

    #[test]
    fn snapshot_sync_restores_deleted_and_redefined_properties() {
        let mut host = ScriptHost::new().unwrap();
        let mut world = World::new();
        host.eval("delete engine.snapshot; Object.defineProperty(globalThis, 'lastSnapshot', {value: 'replaced', configurable: true});").unwrap();
        host.tick(&mut world, 0.016).unwrap();
        host.eval("if (engine.snapshot.frame !== 0 || JSON.parse(lastSnapshot).frame !== 0) throw Error('missing snapshot'); delete lastSnapshot;").unwrap();
        host.inject_snapshot_json("{\"frame\":42}").unwrap();
        host.eval("if (engine.snapshot.frame !== 42 || JSON.parse(lastSnapshot).frame !== 42) throw Error('missing injected snapshot');").unwrap();
    }

    #[test]
    fn runaway_ticks_abort_without_leaking_commands_and_the_host_recovers() {
        let mut host = ScriptHost::new().unwrap();
        let mut world = World::new();
        let color = world.time.clear_color;
        host.eval("function onTick() { engine.setClearColor(1,0,0,1); engine.reloadScene(); while(true) {} }").unwrap();
        assert!(host.tick(&mut world, 0.016).is_err());
        assert_eq!(world.time.clear_color, color);
        assert!(host.take_runtime_requests().is_empty());
        host.eval("onTick = () => engine.setClearColor(0,1,0,1);").unwrap();
        host.tick(&mut world, 0.016).unwrap();
        host._runtime.run_gc();
        host.tick(&mut world, 0.016).unwrap();
        assert_eq!(world.time.clear_color.y, 1.0);
    }

    #[test]
    fn cached_tick_dispatch_preserves_lexical_hooks_input_and_fresh_snapshots() {
        let mut host = ScriptHost::new().unwrap();
        let mut world = World::new();
        host.eval("let onTick = (dt, frame) => { if (frame !== engine.snapshot.frame || frame !== JSON.parse(lastSnapshot).frame) throw Error('stale clock'); if (!engine.input.keys.includes('quoted\\\"')) throw Error('input mismatch'); engine.setClearColor(frame, dt, 0, 1); }; ").unwrap();
        let mut input = ScriptInput::default();
        input.key("quoted\"".into(), true);
        host.set_input(&input).unwrap();
        for frame in 1..=3 {
            world.time.frame = frame;
            host.tick(&mut world, 0.125).unwrap();
            assert_eq!(world.time.clear_color.x, frame as f32);
            assert_eq!(world.time.clear_color.y, 0.125);
        }
        host.eval("onTick = () => { engine.setClearColor(9,9,9,1); throw Error('failed'); };").unwrap();
        assert!(host.tick(&mut world, 0.125).is_err());
        host.eval("onTick = undefined;").unwrap();
        host.tick(&mut world, 0.125).unwrap();
        assert_eq!(world.time.clear_color.x, 3.0);
    }

    #[test]
    fn snapshot_conversion_is_lazy_and_frame_values_remain_isolated() {
        let mut host = ScriptHost::new().unwrap();
        let mut world = World::new();
        host.eval("function onTick() {};").unwrap();
        host.tick(&mut world, 0.016).unwrap();
        assert!(host.snapshot.borrow().json.is_none());
        host.eval("const previous = engine.snapshot; if (previous !== engine.snapshot) throw Error('unstable snapshot'); previous.frame = 999; lastSnapshot = 'local';").unwrap();
        world.time.frame = 2;
        host.tick(&mut world, 0.016).unwrap();
        host.eval("if (engine.snapshot === previous || engine.snapshot.frame !== 2 || previous.frame !== 999 || JSON.parse(lastSnapshot).frame !== 2) throw Error('frame isolation'); engine.snapshot = {frame: 9}; if(engine.snapshot.frame !== 9) throw Error('assignment');").unwrap();
        host.sync_world(&world).unwrap();
        host.eval("if(engine.snapshot.frame !== 2) throw Error('next frame must replace assignment');").unwrap();
    }

    #[test]
    fn snapshots_preserve_data_without_evaluating_scene_text() {
        let mut host = ScriptHost::new().unwrap();
        let data = serde_json::json!({"entities":[{"name":"quoted\"\\\n角色", "components":{"Text":{"text":"'; throw new Error('not code'); //"}}}], "frame":42});
        let encoded = data.to_string();
        host.inject_snapshot_json(&encoded).unwrap();
        host.eval("if (engine.snapshot.frame !== 42 || engine.snapshot.entities[0].name !== JSON.parse(lastSnapshot).entities[0].name) throw new Error('snapshot mismatch');").unwrap();
        host.inject_snapshot_json("{\"entities\":[],\"frame\":43}").unwrap();
        host.eval("if (engine.snapshot.frame !== 43 || engine.snapshot.entities.length !== 0 || JSON.parse(lastSnapshot).frame !== 43) throw new Error('stale snapshot');").unwrap();
    }

    fn request_test_guard() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn hosts_keep_commands_and_runtime_requests_in_their_own_contexts() {
        let mut first = ScriptHost::new().unwrap();
        let mut second = ScriptHost::new().unwrap();
        first.eval("engine.setClearColor(1, 0, 0, 1); engine.loadScene('First');").unwrap();
        second.eval("engine.setClearColor(0, 1, 0, 1); engine.loadScene('Second');").unwrap();
        let mut first_world = World::new();
        let mut second_world = World::new();
        second.tick(&mut second_world, 0.016).unwrap();
        first.tick(&mut first_world, 0.016).unwrap();
        assert_eq!(first_world.time.clear_color.x, 1.0);
        assert_eq!(first_world.time.clear_color.y, 0.0);
        assert_eq!(second_world.time.clear_color.y, 1.0);
        assert_eq!(first.take_runtime_requests(), vec![ScriptRuntimeRequest::LoadScene("First".into())]);
        assert_eq!(second.take_runtime_requests(), vec![ScriptRuntimeRequest::LoadScene("Second".into())]);
    }

    #[test]
    fn script_reads_world_and_input_edges_and_reports_failed_ticks() {
        let mut host = ScriptHost::new().unwrap();
        let mut world = World::new();
        let mut input = ScriptInput::default();
        input.key("KeyD".into(), true);
        input.key("KeyD".into(), true);
        input.pointer = [120.0, 60.0];
        input.viewport = [800, 600];
        input.button(0, true);
        host.set_input(&input).unwrap();
        host.eval("function onTick() { if (engine.snapshot.entities.length !== 0 || engine.input.keys[0] !== 'KeyD' || engine.input.pressedKeys.length !== 1 || engine.input.pressedButtons[0] !== 0 || engine.input.pointer[0] !== 120) throw new Error('frame input missing'); }").unwrap();
        host.tick(&mut world, 1.0 / 60.0).unwrap();
        input.finish_frame();
        assert_eq!(input.keys.len(), 1);
        assert!(input.pressed_keys.is_empty());
        input.release_all();
        assert!(input.keys.is_empty());
        assert!(input.released_keys.contains("KeyD"));
        host.eval("function onTick() { engine.setClearColor(1, 0, 0, 1); engine.reloadScene(); throw new Error('sample failed'); }").unwrap();
        let before = world.time.clear_color;
        assert!(host.tick(&mut world, 0.016).unwrap_err().to_string().contains("sample failed"));
        assert_eq!(world.time.clear_color, before);
        assert!(host.take_runtime_requests().is_empty());
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
}
