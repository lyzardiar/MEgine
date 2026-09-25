use mengine_core::{snapshot::WorldSnapshot, World};
use mengine_physics::{PhysicsWorld, PhysicsWorld2D};
use mengine_runtime::{animation::AnimationRuntime, audio::AudioRuntime, scenes::{LoadedScene, SceneManager, SceneSelector}, script_requests::ScriptRequestContext, timeline::TimelineRuntime};
use mengine_script::{ScriptHost, ScriptAnimationEvent, ScriptTimelineSignal};
pub use mengine_script::ScriptInput;
use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}, mpsc::{self, Sender}};
use std::time::Duration;

#[derive(Default)]
pub struct PlayProject {
    pub root: Option<PathBuf>,
    pub scene: PathBuf,
    pub name: String,
    pub build_scenes: Vec<PathBuf>,
}

enum Request {
    Start { generation: u64, source: String, snapshot: WorldSnapshot, project: PlayProject, reply: Sender<Result<WorldSnapshot, String>> },
    Step { generation: u64, snapshot: WorldSnapshot, input: ScriptInput, dt: f32, reply: Sender<Result<WorldSnapshot, String>> },
    Stop { generation: u64 },
}

/// Boa stays on one worker thread. Native rendering and editor IPC never own its GC context.
pub struct EditorPlayRuntime { sender: Sender<Request>, generation: Arc<AtomicU64> }

impl Default for EditorPlayRuntime {
    fn default() -> Self {
        let (sender, receiver) = mpsc::channel();
        let generation = Arc::new(AtomicU64::new(0));
        let current = generation.clone();
        std::thread::Builder::new().name("mengine-editor-play".into()).spawn(move || {
            let mut session: Option<(u64, PlaySession)> = None;
            while let Ok(request) = receiver.recv() {
                match request {
                    Request::Start { generation, source, snapshot, project, reply } => {
                        if current.load(Ordering::SeqCst) != generation { let _ = reply.send(Err("Play initialization was superseded".into())); continue; }
                        session = None;
                        let result = PlaySession::new(&source, snapshot, project).and_then(|value| {
                            if current.load(Ordering::SeqCst) != generation { return Err("Play initialization was superseded".into()); }
                            let snapshot = WorldSnapshot::from_world(&value.world); session = Some((generation, value)); Ok(snapshot)
                        });
                        let _ = reply.send(result);
                    }
                    Request::Step { generation, snapshot, input, dt, reply } => {
                        if current.load(Ordering::SeqCst) != generation { let _ = reply.send(Err("Play session expired".into())); continue; }
                        let result = session.as_mut().filter(|(id, _)| *id == generation).ok_or_else(|| "Play Mode is not initialized".to_string()).and_then(|(_, session)| session.step(snapshot, input, dt));
                        if result.is_err() { session = None; }
                        let _ = reply.send(result);
                    }
                    Request::Stop { generation } => { if current.load(Ordering::SeqCst) == generation { session = None; } }
                }
            }
        }).expect("create editor script worker");
        Self { sender, generation }
    }
}

impl EditorPlayRuntime {
    pub fn generation(&self) -> u64 { self.generation.load(Ordering::SeqCst) }

    pub fn begin(&self) -> u64 {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = self.sender.send(Request::Stop { generation });
        generation
    }

    pub fn start(&self, generation: u64, source: String, snapshot: WorldSnapshot, project: PlayProject) -> Result<WorldSnapshot, String> {
        let (reply, result) = mpsc::channel();
        self.sender.send(Request::Start { generation, source, snapshot, project, reply }).map_err(|error| error.to_string())?;
        result.recv_timeout(Duration::from_secs(15)).map_err(|error| format!("Play initialization: {error}"))?
    }

    pub fn step(&self, generation: u64, snapshot: WorldSnapshot, input: ScriptInput, dt: f32) -> Result<WorldSnapshot, String> {
        if !dt.is_finite() || dt <= 0.0 || dt > 1.0 { return Err("Play step delta must be in (0, 1]".into()); }
        let (reply, result) = mpsc::channel();
        self.sender.send(Request::Step { generation, snapshot, input, dt, reply }).map_err(|error| error.to_string())?;
        result.recv_timeout(Duration::from_secs(15)).map_err(|error| format!("Play step: {error}"))?
    }

    pub fn stop(&self) { self.begin(); }
}

struct PlaySession {
    world: World,
    script: ScriptHost,
    initial: WorldSnapshot,
    initial_scene: LoadedScene,
    root: Option<PathBuf>,
    scenes: SceneManager,
    animations: AnimationRuntime,
    timelines: TimelineRuntime,
    audio: AudioRuntime,
    physics2d: PhysicsWorld2D,
    physics3d: PhysicsWorld,
}

impl PlaySession {
    fn new(source: &str, initial: WorldSnapshot, project: PlayProject) -> Result<Self, String> {
        let mut world = World::new();
        mengine_scene::apply_snapshot(&mut world, &initial);
        let initial = WorldSnapshot::from_world(&world);
        let mut scenes = SceneManager::new(project.root.clone(), project.build_scenes, false);
        let initial_scene = scenes.set_current(&project.scene, project.name);
        let mut script = ScriptHost::new().map_err(|error| error.to_string())?;
        script.inject_snapshot_json(&serde_json::to_string(&initial).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
        script.eval(source).map_err(|error| error.to_string())?;
        script.notify_scene_loaded(&initial_scene.name, &initial_scene.path.to_string_lossy().replace('\\', "/"), initial_scene.build_index, initial_scene.build_scene_count).map_err(|error| error.to_string())?;
        Ok(Self { world, script, initial, initial_scene, animations: AnimationRuntime::new(project.root.clone()), timelines: TimelineRuntime::new(project.root.clone()), audio: AudioRuntime::new(project.root.clone()), root: project.root, scenes, physics2d: PhysicsWorld2D::new(), physics3d: PhysicsWorld::new() })
    }

    fn step(&mut self, snapshot: WorldSnapshot, input: ScriptInput, dt: f32) -> Result<WorldSnapshot, String> {
        let world = &mut self.world;
        let elapsed = world.time.elapsed + f64::from(dt);
        mengine_scene::reconcile_snapshot(world, &snapshot);
        world.time.elapsed = elapsed;
        world.time.delta = dt;
        self.script.set_input(&input).map_err(|error| error.to_string())?;
        // Bound substeps so Agent stepping and realtime Play use the same collision solver.
        let steps = (dt / (1.0 / 60.0)).ceil().max(1.0) as u32;
        for _ in 0..steps {
            let two = self.physics2d.step(world, dt / steps as f32);
            let three = self.physics3d.step(world, dt / steps as f32);
            if !two.started.is_empty() || !two.stopped.is_empty() || !two.trigger_started.is_empty() || !two.trigger_stopped.is_empty() || !three.started.is_empty() || !three.stopped.is_empty() || !three.trigger_started.is_empty() || !three.trigger_stopped.is_empty() {
                self.script.sync_world(world).map_err(|error| error.to_string())?;
            }
            let pairs = |pairs: &[mengine_physics::CollisionPair]| pairs.iter().map(|pair| (pair.first.to_u64(), pair.second.to_u64())).collect::<Vec<_>>();
            self.script.notify_collision_events_2d(&pairs(&two.started), &pairs(&two.stopped)).map_err(|error| error.to_string())?;
            self.script.notify_trigger_events_2d(&pairs(&two.trigger_started), &pairs(&two.trigger_stopped)).map_err(|error| error.to_string())?;
            self.script.notify_collision_events(&pairs(&three.started), &pairs(&three.stopped)).map_err(|error| error.to_string())?;
            self.script.notify_trigger_events(&pairs(&three.trigger_started), &pairs(&three.trigger_stopped)).map_err(|error| error.to_string())?;
        }
        for failure in self.timelines.update(world, dt) { log::error!("Timeline '{}': {}", failure.asset, failure.error); }
        for failure in self.animations.update(world, dt) { log::error!("Animation '{}': {}", failure.clip, failure.error); }
        for failure in self.animations.apply_timeline_blends(world, &self.timelines.animation_blends()) { log::error!("Animation blend '{}': {}", failure.clip, failure.error); }
        for failure in self.audio.update(world) { log::error!("Audio '{}': {}", failure.clip, failure.error); }
        // The editor viewport owns particle simulation; drain timeline commands until its seek bridge is available.
        self.timelines.take_particle_commands();
        let events = self.animations.take_events().into_iter().map(|event| ScriptAnimationEvent { entity: event.entity.to_u64(), function: event.function, time: event.time, parameter: event.parameter.and_then(|value| serde_json::to_value(value).ok()), state: event.state, weight: event.weight }).collect::<Vec<_>>();
        let signals = self.timelines.take_signals().into_iter().map(|event| ScriptTimelineSignal { entity: event.entity.to_u64(), track: event.track, signal: event.signal, time: event.time, payload: event.payload }).collect::<Vec<_>>();
        if !events.is_empty() || !signals.is_empty() { self.script.sync_world(world).map_err(|error| error.to_string())?; }
        self.script.notify_animation_events(&events).map_err(|error| error.to_string())?;
        self.script.notify_timeline_signals(&signals).map_err(|error| error.to_string())?;
        self.script.tick(world, dt).map_err(|error| error.to_string())?;
        for request in self.script.take_runtime_requests() {
            let Some(selector) = (ScriptRequestContext { world, project_root: self.root.as_deref(), animations: &mut self.animations, timelines: &mut self.timelines, audio: &mut self.audio }).apply(request) else { continue; };
            let loaded = if selector == SceneSelector::Reload && self.scenes.current() == Some(self.initial_scene.path.as_path()) {
                mengine_scene::apply_snapshot(world, &self.initial);
                Ok(self.initial_scene.clone())
            } else { self.scenes.load(selector, world) };
            match loaded {
                Ok(scene) => {
                    self.physics2d.clear(); self.physics3d.clear(); self.audio.clear();
                    self.animations = AnimationRuntime::new(self.root.clone());
                    self.timelines = TimelineRuntime::new(self.root.clone());
                    self.script.sync_world(world).map_err(|error| error.to_string())?;
                    self.script.notify_scene_loaded(&scene.name, &scene.path.to_string_lossy().replace('\\', "/"), scene.build_index, scene.build_scene_count).map_err(|error| error.to_string())?;
                }
                Err(error) => log::error!("scene switch rejected: {error}"),
            }
        }
        Ok(WorldSnapshot::from_world(world))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "manual sample performance measurement; requires MENGINE_SAMPLE_ROOT"]
    fn measure_sample_script_frames() {
        let root = PathBuf::from(std::env::var("MENGINE_SAMPLE_ROOT").expect("sample root"));
        let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
        let snapshot: WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
        let source = std::fs::read_to_string(root.join("Assets/Scripts/Main.js")).unwrap();
        let runtime = EditorPlayRuntime::default();
        let mut snapshot = runtime.start(runtime.begin(), source, snapshot, PlayProject { root: Some(root), name: "Sample performance".into(), ..Default::default() }).unwrap();
        let start = std::time::Instant::now();
        for frame in 0..60 {
            let mut input = ScriptInput::default();
            if frame == 1 { input.key("Enter".into(), true); }
            input.keys.insert("KeyW".into());
            snapshot = runtime.step(runtime.generation(), snapshot, input, 0.1).unwrap();
        }
        println!("60 sample frames in {:?}; {:.2} ms/frame (debug CPU simulation, excludes rendering)", start.elapsed(), start.elapsed().as_secs_f64() * 1000.0 / 60.0);
        runtime.stop();
    }

    #[test]
    fn worker_executes_scripts_and_input_without_modifying_authored_snapshot() {
        let runtime = EditorPlayRuntime::default();
        let authored = WorldSnapshot::default();
        let original_color = authored.clear_color;
        let authored = runtime.start(runtime.begin(), "function onTick() { if (engine.input.keys.includes('KeyD')) engine.setClearColor(0.9, 0.2, 0.1, 1); }".into(), authored.clone(), PlayProject { name: "Test".into(), ..Default::default() }).unwrap();
        let mut input = ScriptInput::default();
        input.key("KeyD".into(), true);
        let result = runtime.step(runtime.generation(), authored.clone(), input, 1.0 / 60.0).unwrap();
        assert_eq!(result.clear_color, [0.9, 0.2, 0.1, 1.0]);
        assert_eq!(authored.clear_color, original_color);
        runtime.stop();
        assert!(runtime.step(runtime.generation(), authored, ScriptInput::default(), 0.016).is_err());
    }

    #[test]
    fn worker_advances_native_2d_physics_and_restarts_from_authored_state() {
        let runtime = EditorPlayRuntime::default();
        let authored: WorldSnapshot = serde_json::from_value(serde_json::json!({"entities":[{
            "entity": 1, "name": "Falling Box", "components": {
                "Transform": { "position":[0,5,0], "rotation":[0,0,0,1], "scale":[1,1,1] },
                "Rigidbody2D": { "body_type":"Dynamic", "gravity_scale":1 },
                "BoxCollider2D": { "size":[1,1] }
            }
        }]})).unwrap();
        let authored = runtime.start(runtime.begin(), String::new(), authored.clone(), PlayProject { name: "Physics".into(), ..Default::default() }).unwrap();
        let advanced = runtime.step(runtime.generation(), authored.clone(), ScriptInput::default(), 0.5).unwrap();
        assert!(advanced.entities[0].components["Transform"]["position"][1].as_f64().unwrap() < 4.0);
        assert_eq!(advanced.elapsed, 0.5);
        assert_eq!(authored.entities[0].components["Transform"]["position"][1].as_f64(), Some(5.0));
        runtime.stop();
        let authored = runtime.start(runtime.begin(), String::new(), authored.clone(), PlayProject { name: "Physics".into(), ..Default::default() }).unwrap();
        let restarted = runtime.step(runtime.generation(), authored, ScriptInput::default(), 0.5).unwrap();
        assert_eq!(advanced, restarted);
    }
    #[test]
    fn scene_requests_use_project_paths_and_build_order_and_keep_play_alive() {
        let root = std::env::temp_dir().join(format!("mengine-play-scenes-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Assets/Scenes")).unwrap();
        let world = World::new();
        mengine_scene::save_scene(&root.join("Assets/Scenes/Second.mscene"), "Second", &world).unwrap();
        let runtime = EditorPlayRuntime::default();
        let project = PlayProject { root: Some(root.clone()), scene: "Assets/Scenes/First.mscene".into(), name: "First".into(), build_scenes: vec!["Assets/Scenes/First.mscene".into(), "Assets/Scenes/Second.mscene".into()] };
        let _ = runtime.start(runtime.begin(), "function onTick() { if (engine.scene.buildIndex === 0) engine.loadScene(1); else engine.setClearColor(engine.scene.buildIndex, engine.scene.buildSceneCount, engine.scene.path === 'Assets/Scenes/Second.mscene' ? 1 : 0, 1); }".into(), WorldSnapshot::default(), project).unwrap();
        let next = runtime.step(runtime.generation(), WorldSnapshot::default(), ScriptInput::default(), 0.016).unwrap();
        let next = runtime.step(runtime.generation(), next, ScriptInput::default(), 0.016).unwrap();
        assert_eq!(next.clear_color, [1.0, 2.0, 1.0, 1.0]);
        runtime.stop();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expired_initialization_and_steps_do_not_replace_the_current_session() {
        let runtime = EditorPlayRuntime::default();
        let old = runtime.begin();
        let current = runtime.begin();
        runtime.start(current, "function onTick() { engine.setClearColor(1,0,0,1); }".into(), WorldSnapshot::default(), PlayProject::default()).unwrap();
        assert!(runtime.start(old, String::new(), WorldSnapshot::default(), PlayProject::default()).is_err());
        assert!(runtime.step(old, WorldSnapshot::default(), ScriptInput::default(), 0.016).is_err());
        assert_eq!(runtime.step(current, WorldSnapshot::default(), ScriptInput::default(), 0.016).unwrap().clear_color, [1.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn deleting_one_entity_keeps_script_references_and_other_entity_ids_stable() {
        let runtime = EditorPlayRuntime::default();
        let authored: WorldSnapshot = serde_json::from_value(serde_json::json!({"entities":[
            {"entity":10,"name":"First","components":{}}, {"entity":30,"name":"Survivor","components":{}}
        ]})).unwrap();
        let initial = runtime.start(runtime.begin(), "const target = engine.snapshot.entities.find(e => e.name === 'Survivor').entity; let first = true; function onTick() { if(first) { engine.pushCommandJson(JSON.stringify({op:'despawn', entity:engine.snapshot.entities[0].entity})); first = false; } else { if (!engine.snapshot.entities.some(e => e.entity === target)) throw Error('identity lost'); engine.setClearColor(1,0,0,1); } }".into(), authored, PlayProject::default()).unwrap();
        let survivor = initial.entities[1].entity;
        let deleted = runtime.step(runtime.generation(), initial, ScriptInput::default(), 0.016).unwrap();
        let next = runtime.step(runtime.generation(), deleted, ScriptInput::default(), 0.016).unwrap();
        assert_eq!(next.entities.len(), 1);
        assert_eq!(next.entities[0].entity, survivor);
        assert_eq!(next.clear_color, [1.0, 0.0, 0.0, 1.0]);
    }

}
