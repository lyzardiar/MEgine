use mengine_core::{snapshot::{EntitySnapshot, SharedWorldSnapshot, WorldSnapshot, WorldSnapshotCache}, World};
use mengine_physics::{PhysicsWorld, PhysicsWorld2D};
use mengine_runtime::{animation::AnimationRuntime, audio::AudioRuntime, scenes::{LoadedScene, SceneManager, SceneSelector}, script_requests::ScriptRequestContext, timeline::TimelineRuntime};
use mengine_script::{ScriptHost, ScriptAnimationEvent, ScriptTimelineSignal};
pub use mengine_script::ScriptInput;
use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}, mpsc::{self, Sender}};
use std::time::{Duration, Instant};
use std::collections::{HashMap, VecDeque};
use crate::viewport::{EditorViewportFrame, EditorViewportProfileNode};

type RenderPlayWorld = Box<dyn FnOnce(&World) -> Result<EditorViewportFrame, String> + Send>;

#[derive(Default)]
pub struct PlayProject {
    pub root: Option<PathBuf>,
    pub scene: PathBuf,
    pub name: String,
    pub build_scenes: Vec<PathBuf>,
}

/// Complete frame metadata and ordered entity IDs, with only changed entity payloads.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayWorldUpdate {
    pub quit_requested: bool,
    pub snapshot: WorldSnapshot,
    pub entity_order: Vec<u64>,
    pub base_revision: u64,
    pub revision: u64,
    pub reset: bool,
}

#[derive(Default)]
struct PlaySnapshotStream {
    entities: HashMap<u64, Arc<EntitySnapshot>>,
    revision: u64,
}

impl PlaySnapshotStream {
    fn update(&mut self, mut snapshot: SharedWorldSnapshot, reset: bool) -> PlayWorldUpdate {
        let base_revision = self.revision;
        self.revision += 1;
        let mut entity_order = Vec::with_capacity(snapshot.entities.len());
        let mut current = HashMap::with_capacity(snapshot.entities.len());
        let mut changed = Vec::new();
        for entity in snapshot.entities.drain(..) {
            entity_order.push(entity.entity);
            if reset || !self.entities.get(&entity.entity).is_some_and(|previous| Arc::ptr_eq(previous, &entity) || previous == &entity) { changed.push(entity.clone()); }
            current.insert(entity.entity, entity);
        }
        self.entities = current;
        snapshot.entities = changed;
        PlayWorldUpdate { snapshot: snapshot.into_owned(), entity_order, base_revision, revision: self.revision, reset, quit_requested: false }
    }
}

const PLAY_VIEWPORT_REVISION_EXPIRED: &str = "Play viewport revision expired";

#[derive(Default)]
struct PlayRenderHistory {
    checkpoints: VecDeque<(u64, SharedWorldSnapshot, f64, Vec<EditorViewportProfileNode>)>,
    materialized: Option<(u64, mengine_scene::SharedSnapshotWorld)>,
}

impl PlayRenderHistory {
    fn record(&mut self, revision: u64, snapshot: SharedWorldSnapshot, step_ms: f64, stages: Vec<EditorViewportProfileNode>) {
        self.checkpoints.push_back((revision, snapshot, step_ms, stages));
        while self.checkpoints.len() > 3 { self.checkpoints.pop_front(); }
    }

    fn world<'a>(&'a mut self, live: &'a World, revision: u64) -> Result<(&'a World, f64, Vec<EditorViewportProfileNode>), String> {
        let (_, snapshot, step_ms, stages) = self.checkpoints.iter().find(|(id, ..)| *id == revision).ok_or_else(|| PLAY_VIEWPORT_REVISION_EXPIRED.to_string())?;
        let profile = (*step_ms, stages.clone());
        if self.checkpoints.back().is_some_and(|(id, ..)| *id == revision) { return Ok((live, profile.0, profile.1)); }
        if self.materialized.as_ref().is_none_or(|(id, _)| *id != revision) {
            let (_, world) = self.materialized.get_or_insert_with(|| (revision, mengine_scene::SharedSnapshotWorld::default()));
            world.update(snapshot);
            self.materialized.as_mut().unwrap().0 = revision;
        }
        Ok((self.materialized.as_ref().expect("historical render world").1.world(), profile.0, profile.1))
    }
}

enum Request {
    Start { generation: u64, source: String, snapshot: WorldSnapshot, project: PlayProject, reply: Sender<Result<WorldSnapshot, String>> },
    Step { generation: u64, snapshot: Option<WorldSnapshot>, input: ScriptInput, dt: f32, reply: Sender<Result<WorldSnapshot, String>> },
    StepUpdate { generation: u64, snapshot: Option<WorldSnapshot>, input: ScriptInput, dt: f32, reply: Sender<Result<PlayWorldUpdate, String>> },
    Render { generation: u64, revision: Option<u64>, render: RenderPlayWorld, reply: Sender<Result<EditorViewportFrame, String>> },
    Stop { generation: u64 },
}

/// QuickJS stays on one worker thread. Native rendering and editor IPC never own its GC context.
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
                        let result = session.as_mut().filter(|(id, _)| *id == generation).ok_or_else(|| "Play Mode is not initialized".to_string()).and_then(|(_, session)| { session.render_history = PlayRenderHistory::default(); session.step(snapshot, input, dt).map(SharedWorldSnapshot::into_owned) });
                        if result.is_err() { session = None; }
                        let _ = reply.send(result);
                    }
                    Request::StepUpdate { generation, snapshot, input, dt, reply } => {
                        if current.load(Ordering::SeqCst) != generation { let _ = reply.send(Err("Play session expired".into())); continue; }
                        let reset = snapshot.is_some();
                        let result = session.as_mut().filter(|(id, _)| *id == generation).ok_or_else(|| "Play Mode is not initialized".to_string()).and_then(|(_, session)| {
                            let snapshot = session.step(snapshot, input, dt)?;
                            let started = Instant::now();
                            let checkpoint = snapshot.clone();
                            let mut update = session.snapshot_stream.update(snapshot, reset);
                            update.quit_requested = session.quit_requested;
                            let total_ms = started.elapsed().as_secs_f64() * 1000.0;
                            session.step_ms += total_ms;
                            session.step_stages.push(EditorViewportProfileNode { name: "Snapshot delta".into(), total_ms, self_ms: total_ms, calls: 1, children: Vec::new() });
                            session.render_history.record(update.revision, checkpoint, session.step_ms, session.step_stages.clone());
                            Ok(update)
                        });
                        if result.is_err() { session = None; }
                        let _ = reply.send(result);
                    }
                    Request::Render { generation, revision, render, reply } => {
                        let result = session.as_mut().filter(|(id, _)| *id == generation && current.load(Ordering::SeqCst) == generation)
                            .ok_or_else(|| "Play session expired".to_string()).and_then(|(_, session)| {
                                let world_sync_started = Instant::now();
                                let (world, step_ms, stages) = match revision {
                                    Some(revision) => session.render_history.world(&session.world, revision)?,
                                    None => (&session.world, session.step_ms, session.step_stages.clone()),
                                };
                                let world_sync_ms = world_sync_started.elapsed().as_secs_f64() * 1000.0;
                                let mut frame = render(world)?;
                                frame.profile.world_sync_ms = Some(world_sync_ms);
                                frame.profile.simulation_ms = Some(step_ms);
                                frame.profile.simulation_stages = stages;
                                frame.profile.world_revision = revision;
                                Ok(frame)
                            });
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
        self.advance(generation, Some(snapshot), input, dt)
    }

    pub fn advance(&self, generation: u64, snapshot: Option<WorldSnapshot>, input: ScriptInput, dt: f32) -> Result<WorldSnapshot, String> {
        if !dt.is_finite() || dt <= 0.0 || dt > 1.0 { return Err("Play step delta must be in (0, 1]".into()); }
        let (reply, result) = mpsc::channel();
        self.sender.send(Request::Step { generation, snapshot, input, dt, reply }).map_err(|error| error.to_string())?;
        result.recv_timeout(Duration::from_secs(15)).map_err(|error| format!("Play step: {error}"))?
    }

    pub fn stop(&self) { self.begin(); }

    pub fn stop_session(&self, generation: u64) {
        if self.generation.compare_exchange(generation, generation + 1, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
            let _ = self.sender.send(Request::Stop { generation: generation + 1 });
        }
    }

    /// Revisioned IPC stream; explicit editor edits force a complete response.
    pub fn advance_update(&self, generation: u64, snapshot: Option<WorldSnapshot>, input: ScriptInput, dt: f32) -> Result<PlayWorldUpdate, String> {
        if !dt.is_finite() || dt <= 0.0 || dt > 1.0 { return Err("Play step delta must be in (0, 1]".into()); }
        let (reply, result) = mpsc::channel();
        self.sender.send(Request::StepUpdate { generation, snapshot, input, dt, reply }).map_err(|error| error.to_string())?;
        result.recv_timeout(Duration::from_secs(15)).map_err(|error| format!("Play step: {error}"))?
    }

    /// Render on the owning worker so each view uses the live world without a scene round trip.
    pub fn render(&self, generation: u64, render: impl FnOnce(&World) -> Result<EditorViewportFrame, String> + Send + 'static) -> Result<EditorViewportFrame, String> {
        self.render_revision(generation, None, render)
    }

    /// A browser-owned UI frame can request its exact retained world revision.
    pub fn render_revision(&self, generation: u64, revision: Option<u64>, render: impl FnOnce(&World) -> Result<EditorViewportFrame, String> + Send + 'static) -> Result<EditorViewportFrame, String> {
        let (reply, result) = mpsc::channel();
        self.sender.send(Request::Render { generation, revision, render: Box::new(render), reply }).map_err(|error| error.to_string())?;
        result.recv_timeout(Duration::from_secs(15)).map_err(|error| format!("Play rendering: {error}"))?
    }
}

struct PlaySession {
    quit_requested: bool,
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
    step_ms: f64,
    step_stages: Vec<EditorViewportProfileNode>,
    snapshot_stream: PlaySnapshotStream,
    snapshot_cache: WorldSnapshotCache,
    render_history: PlayRenderHistory,
}

impl PlaySession {
    fn new(source: &str, initial: WorldSnapshot, project: PlayProject) -> Result<Self, String> {
        let mut world = World::new();
        mengine_scene::apply_snapshot(&mut world, &initial);
        let initial = WorldSnapshot::from_world(&world);
        let mut scenes = SceneManager::new(project.root.clone(), project.build_scenes, false);
        let initial_scene = scenes.set_current(&project.scene, project.name);
        let mut script = ScriptHost::new().map_err(|error| error.to_string())?;
        if let Some(root) = project.root.as_deref() { script.set_storage_root(mengine_script::project_storage_root(root)); script.set_project_root(root.to_path_buf()); }
        script.sync_world(&world).map_err(|error| error.to_string())?;
        script.eval(source).map_err(|error| error.to_string())?;
        script.notify_scene_loaded(&initial_scene.name, &initial_scene.path.to_string_lossy().replace('\\', "/"), initial_scene.build_index, initial_scene.build_scene_count).map_err(|error| error.to_string())?;
        let mut snapshot_cache = WorldSnapshotCache::default();
        let mut render_history = PlayRenderHistory::default();
        render_history.record(0, snapshot_cache.capture(&world), 0.0, Vec::new());
        Ok(Self { quit_requested: false, world, script, initial, initial_scene, animations: AnimationRuntime::new(project.root.clone()), timelines: TimelineRuntime::new(project.root.clone()), audio: AudioRuntime::new(project.root.clone()), root: project.root, scenes, physics2d: PhysicsWorld2D::new(), physics3d: PhysicsWorld::new(), step_ms: 0.0, step_stages: Vec::new(), snapshot_stream: PlaySnapshotStream::default(), snapshot_cache, render_history })
    }

    fn step(&mut self, snapshot: Option<WorldSnapshot>, input: ScriptInput, dt: f32) -> Result<SharedWorldSnapshot, String> {
        let started = Instant::now();
        self.step_stages.clear();
        let stages = &mut self.step_stages;
        let mut stage_started = started;
        let mut stage = |name: &str| {
            let total_ms = stage_started.elapsed().as_secs_f64() * 1000.0;
            stages.push(EditorViewportProfileNode { name: name.into(), total_ms, self_ms: total_ms, calls: 1, children: Vec::new() });
            stage_started = Instant::now();
        };
        let world = &mut self.world;
        let elapsed = world.time.elapsed + f64::from(dt);
        if let Some(snapshot) = snapshot {
            mengine_scene::reconcile_snapshot(world, &snapshot);
        } else {
            world.time.frame += 1;
            world.time.sim_frame += 1;
        }
        world.time.elapsed = elapsed;
        world.time.delta = dt;
        stage("Reconcile");
        self.script.set_input(&input).map_err(|error| error.to_string())?;
        stage("Input");
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
        stage("Physics and collision callbacks");
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
        stage("Animation, timeline and audio");
        self.script.tick(world, dt).map_err(|error| error.to_string())?;
        for request in self.script.take_runtime_requests() {
            if request == mengine_script::ScriptRuntimeRequest::Quit { self.quit_requested = true; break; }
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
        stage("Script and runtime requests");
        let snapshot = self.snapshot_cache.capture(world);
        stage("Snapshot export");
        self.step_ms = started.elapsed().as_secs_f64() * 1000.0;
        Ok(snapshot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retained_view_revisions_render_exact_clocks_and_reject_expiry_or_old_sessions() {
        let runtime = EditorPlayRuntime::default();
        let id = runtime.begin();
        runtime.start(id, "function onTick(dt, frame) { engine.setClearColor(frame, 0, 0, 1); }".into(), WorldSnapshot::default(), PlayProject::default()).unwrap();
        let verify = |revision, expected| {
            let error = runtime.render_revision(id, Some(revision), move |world| {
                assert_eq!(world.time.frame, expected);
                Err(format!("verified frame {expected}"))
            }).err().unwrap();
            assert_eq!(error, format!("verified frame {expected}"));
        };
        verify(0, 0);
        for revision in 1..=2 { assert_eq!(runtime.advance_update(id, None, ScriptInput::default(), 0.01).unwrap().revision, revision); }
        verify(0, 0); verify(1, 1); verify(2, 2);
        runtime.advance_update(id, None, ScriptInput::default(), 0.01).unwrap();
        assert_eq!(runtime.render_revision(id, Some(0), |_| panic!("expired render must not execute")).err().unwrap(), PLAY_VIEWPORT_REVISION_EXPIRED);
        verify(1, 1); verify(3, 3);
        runtime.stop();
        assert_eq!(runtime.render_revision(id, Some(3), |_| panic!("old session must not execute")).err().unwrap(), "Play session expired");
    }

    #[test]
    fn historical_views_keep_parent_links_and_component_values_after_slot_reuse() {
        use mengine_core::generated::{Name, Transform};
        use mengine_core::Parent;
        let mut world = World::new();
        let root = world.spawn_empty(); let child = world.spawn_empty();
        world.insert_component(root, Name { value: "root".into() });
        world.insert_component(child, Name { value: "child".into() });
        world.insert_component(child, Transform { position: [4.0, 5.0, 6.0], ..Transform::default() });
        world.set_parent(child, Some(root));
        let mut snapshots = WorldSnapshotCache::default(); let mut history = PlayRenderHistory::default();
        history.record(0, snapshots.capture(&world), 0.0, Vec::new());
        world.despawn(child); let recycled = world.spawn_empty();
        world.insert_component(recycled, Name { value: "replacement".into() });
        history.record(1, snapshots.capture(&world), 1.0, Vec::new());
        let (older, _, _) = history.world(&world, 0).unwrap();
        let child = older.iter_entities().find(|entity| older.get_component::<Name>(*entity).is_some_and(|name| name.value == "child")).unwrap();
        let parent = older.get_component::<Parent>(child).unwrap().entity;
        assert_eq!(older.get_component::<Name>(parent).unwrap().value, "root");
        assert_eq!(older.get_component::<Transform>(child).unwrap().position, [4.0, 5.0, 6.0]);
        assert!(std::ptr::eq(history.world(&world, 1).unwrap().0, &world));
        assert_eq!(history.checkpoints.len(), 2);
        let cache = history.materialized.as_ref().unwrap().0;
        assert_eq!(cache, 0);
    }

    #[test]
    fn named_entity_queries_are_available_in_editor_startup_and_scene_loaded() {
        let runtime = EditorPlayRuntime::default();
        let id = runtime.begin();
        let initial: WorldSnapshot = serde_json::from_value(serde_json::json!({"entities":[{"entity":1,"name":"Owl","components":{}}]})).unwrap();
        let source = "if(engine.findEntitiesByName(['Owl']).length!==1) throw Error('startup lookup'); function onSceneLoaded() { if(engine.findEntitiesByName(['Owl']).length!==1) throw Error('scene lookup'); } function onTick() { if(engine.findEntitiesByName(['Owl']).length!==1) throw Error('tick lookup'); }";
        runtime.start(id, source.into(), initial, PlayProject::default()).unwrap();
        runtime.advance(id, None, ScriptInput::default(), 0.1).unwrap();
        runtime.stop();
    }

    #[test]
    fn snapshot_stream_reconstructs_mutations_removal_reuse_and_editor_reset() {
        let mut world = World::new();
        let first = world.spawn_empty();
        let second = world.spawn_empty();
        world.set_component_value(first, "Transform", serde_json::json!({"position":[1,2,3]}));
        world.set_component_value(second, "ProjectBehaviour", serde_json::json!({"text":"保留自定义数据"}));
        let mut stream = PlaySnapshotStream::default();
        let mut cache = WorldSnapshotCache::default();
        let mut reconstructed = HashMap::new();
        for step in 0..5 {
            world.time.frame += 1;
            if step == 2 {
                world.get_component_mut::<mengine_core::generated::Transform>(first).unwrap().position[0] = 8.0;
                world.set_editor_state(first, 7, false);
                world.set_entity_metadata(first, "Hero".into(), 3);
                world.set_parent(second, Some(first));
            }
            if step == 3 { world.despawn(first); world.spawn_empty(); }
            let expected = WorldSnapshot::from_world(&world);
            let update = stream.update(cache.capture(&world), step == 4);
            assert_eq!((update.base_revision, update.revision), (step, step + 1));
            if step == 1 { assert!(update.snapshot.entities.is_empty()); }
            if step == 4 { assert_eq!(update.snapshot, expected); reconstructed.clear(); }
            let mut actual = update.snapshot;
            for entity in actual.entities.drain(..) { reconstructed.insert(entity.entity, entity); }
            actual.entities = update.entity_order.iter().map(|id| reconstructed[id].clone()).collect();
            assert_eq!(actual, expected);
            reconstructed.retain(|id, _| update.entity_order.contains(id));
        }
    }

    #[test]
    fn retained_snapshot_stream_tracks_steps_and_forces_reset_after_explicit_edits() {
        let runtime = EditorPlayRuntime::default();
        let id = runtime.begin();
        let initial: WorldSnapshot = serde_json::from_value(serde_json::json!({"entities":[{"entity":1,"name":"Original","components":{"Custom":{"value":4}}}]})).unwrap();
        let initial = runtime.start(id, "function onTick() { engine.setClearColor(0.2,0.3,0.4,1); }".into(), initial, PlayProject::default()).unwrap();
        let first = runtime.advance_update(id, None, ScriptInput::default(), 0.1).unwrap();
        assert_eq!(first.snapshot.entities, initial.entities);
        let second = runtime.advance_update(id, None, ScriptInput::default(), 0.1).unwrap();
        assert!(second.snapshot.entities.is_empty());
        assert_eq!((second.base_revision, second.revision, second.snapshot.frame), (1, 2, 2));
        let mut edited = initial;
        edited.entities[0].name = Some("Inspector edit".into());
        let result = runtime.advance_update(id, Some(edited), ScriptInput::default(), 0.1).unwrap();
        assert!(result.reset);
        assert_eq!(result.snapshot.entities[0].name.as_deref(), Some("Inspector edit"));
        runtime.stop();
        assert!(runtime.advance_update(id, None, ScriptInput::default(), 0.1).is_err());
        let next = runtime.begin();
        runtime.start(next, "".into(), WorldSnapshot::default(), PlayProject::default()).unwrap();
        runtime.stop_session(id);
        assert!(runtime.advance_update(next, None, ScriptInput::default(), 0.1).is_ok());
        runtime.stop_session(next);
        assert!(runtime.advance_update(next, None, ScriptInput::default(), 0.1).is_err());
    }

    #[test]
    fn retained_world_advances_clock_and_accepts_explicit_edits() {
        let runtime = EditorPlayRuntime::default();
        let id = runtime.begin();
        runtime.start(id, "function onTick(dt, frame) { if (frame !== engine.snapshot.frame) throw Error('clock mismatch'); engine.setClearColor(frame, engine.snapshot.clear_color[1], dt, 1); }".into(), WorldSnapshot::default(), PlayProject::default()).unwrap();
        let first = runtime.advance(id, None, ScriptInput::default(), 0.125).unwrap();
        let mut second = runtime.advance(id, None, ScriptInput::default(), 0.125).unwrap();
        assert_eq!((first.frame, second.frame, second.sim_frame, second.elapsed), (1, 2, 2, 0.25));
        second.clear_color[1] = 0.75;
        second.frame += 1;
        let edited = runtime.advance(id, Some(second), ScriptInput::default(), 0.125).unwrap();
        assert_eq!(edited.clear_color, [3.0, 0.75, 0.125, 1.0]);
        let retained = runtime.advance(id, None, ScriptInput::default(), 0.125).unwrap();
        assert_eq!(retained.clear_color, [4.0, 0.75, 0.125, 1.0]);
        runtime.stop();
        assert!(runtime.advance(id, None, ScriptInput::default(), 0.125).is_err());
    }

    #[test]
    #[ignore = "manual sample performance measurement; requires MENGINE_SAMPLE_ROOT"]
    fn measure_sample_script_frames() {
        let root = PathBuf::from(std::env::var("MENGINE_SAMPLE_ROOT").expect("sample root"));
        let value: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
        let snapshot: WorldSnapshot = serde_json::from_value(value["world"].clone()).unwrap();
        let source = match std::env::var("MENGINE_COMPILED_SCRIPT") {
            Ok(path) => serde_json::from_slice::<serde_json::Value>(&std::fs::read(path).unwrap()).unwrap()["source"].as_str().unwrap().to_owned(),
            Err(_) => std::fs::read_to_string(root.join("Assets/Scripts/Main.js")).unwrap(),
        };
        let runtime = EditorPlayRuntime::default();
        let mut snapshot = runtime.start(runtime.begin(), source, snapshot, PlayProject { root: Some(root), name: "Sample performance".into(), ..Default::default() }).unwrap();
        let warmup: u32 = std::env::var("MENGINE_WARMUP_FRAMES").ok().and_then(|value| value.parse().ok()).unwrap_or(0);
        for frame in 0..warmup {
            let mut input = ScriptInput::default();
            if frame == 1 { input.key("Enter".into(), true); }
            snapshot = runtime.advance(runtime.generation(), None, input, 1.0 / 60.0).unwrap();
        }
        let start = std::time::Instant::now();
        for frame in 0..60 {
            let mut input = ScriptInput::default();
            if warmup == 0 && frame == 1 { input.key("Enter".into(), true); }
            snapshot = runtime.advance(runtime.generation(), None, input, 1.0 / 60.0).unwrap();
        }
        println!("60 retained-world frames in {:?}; {:.2} ms/frame (simulation, bridge and snapshot export; excludes rendering); frame {}", start.elapsed(), start.elapsed().as_secs_f64() * 1000.0 / 60.0, snapshot.frame);
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
