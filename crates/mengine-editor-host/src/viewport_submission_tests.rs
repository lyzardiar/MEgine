// Author: MiYu. Submitted viewport pixels and profiles remain bound to their original world.
use super::*;

fn project_root() -> PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms") }

#[test]
fn play_effects_freeze_step_restart_and_return_to_edit_preview() {
    use mengine_core::generated::{Camera2D, ParticleEmitter2D, TrailRenderer2D};
    let mut world = World::new();
    let camera = world.spawn_empty(); world.insert_component(camera, Transform { position: [0.0, 0.0, 10.0], ..Default::default() }); world.insert_component(camera, Camera2D::default());
    let emitter = world.spawn_empty(); world.insert_component(emitter, Transform::default());
    world.insert_component(emitter, ParticleEmitter2D { rate_over_time: 120.0, lifetime_min: 10.0, lifetime_max: 10.0, speed_min: 1.0, speed_max: 1.0, gravity: [0.0, 0.0], shape: "point".into(), ..Default::default() });
    world.insert_component(emitter, TrailRenderer2D { min_vertex_distance: 0.01, width_start: 0.5, ..Default::default() });
    let mut viewport = pollster::block_on(EditorViewportRenderer::new(project_root(), 64, 64)).unwrap();
    viewport.with_play_session(Some(1));
    let initial = viewport.render_game(&world, 64, 64).unwrap();
    world.time.elapsed = 0.125;
    let stepped = viewport.render_game(&world, 64, 64).unwrap();
    assert!(stepped.profile.counts.ui_primitives > initial.profile.counts.ui_primitives);
    assert_ne!(stepped.rgba, initial.rgba);
    for _ in 0..3 { let frozen = viewport.render_game(&world, 64, 64).unwrap(); assert_eq!(frozen.rgba, stepped.rgba); assert_eq!(frozen.profile.counts.ui_primitives, stepped.profile.counts.ui_primitives); }
    world.time.elapsed = 0.25; world.get_component_mut::<Transform>(emitter).unwrap().position[0] = 1.0;
    let moved = viewport.render_game(&world, 64, 64).unwrap(); assert_ne!(moved.rgba, stepped.rgba);
    world.time.elapsed = 0.0;
    let rewound = viewport.render_game(&world, 64, 64).unwrap(); assert_eq!(rewound.rgba, initial.rgba);
    world.time.elapsed = 0.125; viewport.render_game(&world, 64, 64).unwrap();
    viewport.with_play_session(Some(2)); assert_eq!(viewport.render_game(&world, 64, 64).unwrap().rgba, initial.rgba);
    viewport.with_play_session(None); assert_eq!(viewport.render_game(&world, 64, 64).unwrap().rgba, initial.rgba);
    std::thread::sleep(std::time::Duration::from_millis(50));
    assert!(viewport.render_game(&world, 64, 64).unwrap().profile.counts.ui_primitives > initial.profile.counts.ui_primitives);
}

#[test]
fn submitted_frames_preserve_pixels_profiles_resize_and_renderer_lifetime() {
    let mut viewport = pollster::block_on(EditorViewportRenderer::new(project_root(), 32, 24)).unwrap();
    let mut world = World::new(); world.time.clear_color = glam::Vec4::new(1.0, 0.0, 0.0, 1.0);
    world.spawn_empty();
    let expected_red = viewport.render_game(&world, 32, 24).unwrap().rgba;
    let mut red = viewport.submit_game(&world, 32, 24).unwrap(); red.profile.world_revision = Some(7);
    world.time.clear_color = glam::Vec4::new(0.0, 1.0, 0.0, 1.0); world.spawn_empty();
    let green = viewport.submit_game(&world, 41, 27).unwrap();
    let expected_green = viewport.render_game(&world, 41, 27).unwrap().rgba;
    drop(viewport); drop(world);
    let green = green.finish().unwrap(); let red = red.finish().unwrap();
    assert_eq!(red.rgba, expected_red); assert_eq!(green.rgba, expected_green);
    assert_ne!(&red.rgba[..4], &green.rgba[..4]);
    assert_eq!((red.width, red.height, red.profile.counts.entities, red.profile.world_revision), (32, 24, 1, Some(7)));
    assert_eq!((green.width, green.height, green.profile.counts.entities), (41, 27, 2));
    for frame in [red, green] {
        assert_eq!(frame.profile.total_ms, frame.profile.call_tree.total_ms);
        let stages = &frame.profile.call_tree.children.iter().find(|node| node.name == "Render backend").unwrap().children;
        assert_eq!(stages.iter().filter(|node| node.name == "Renderer.read_offscreen_rgba8").count(), 1);
        assert!(frame.profile.memory.iter().any(|category| category.name == "CPU readback RGBA" && category.bytes == frame.rgba.len() as u64));
    }
}

#[test]
fn official_effekseer_sample_repaints_the_same_paused_simulation_frame() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/effekseer-fire");
    let mut world = World::new(); mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world).unwrap();
    let mut viewport = pollster::block_on(EditorViewportRenderer::new(root, 96, 54)).unwrap();
    viewport.with_play_session(Some(4));
    for step in 0..30 { world.time.elapsed = f64::from(step) / 60.0; viewport.render_game(&world, 96, 54).unwrap(); }
    let paused = viewport.render_game(&world, 96, 54).unwrap();
    assert!(paused.profile.counts.ui_primitives > 0);
    for _ in 0..3 {
        let repeated = viewport.render_game(&world, 96, 54).unwrap();
        assert_eq!(repeated.rgba, paused.rgba);
        assert_eq!(repeated.profile.counts.ui_primitives, paused.profile.counts.ui_primitives);
    }
}

#[test]
fn play_world_mirror_is_released_before_finishing_submitted_revision() {
    use crate::{EditorPlayRuntime, PlayProject};
    use mengine_core::snapshot::WorldSnapshot;
    let runtime = Arc::new(EditorPlayRuntime::default()); let id = runtime.begin();
    runtime.start(id, String::new(), WorldSnapshot::default(), PlayProject::default()).unwrap();
    let viewport = Arc::new(std::sync::Mutex::new(pollster::block_on(EditorViewportRenderer::new(project_root(), 16, 16)).unwrap()));
    let renderer = Arc::clone(&viewport);
    let pending = runtime.submit_revision(id, Some(0), move |world| renderer.lock().unwrap().submit_game(world, 16, 16).map_err(|error| error.to_string())).unwrap();
    // This access needs the same mirror mutex and must complete while the ticket remains outstanding.
    let (tx, rx) = std::sync::mpsc::channel(); let other = runtime.clone();
    let worker = std::thread::spawn(move || { let result = other.render_revision(id, Some(0), |_| Err("mirror available".into())); tx.send(result.err().unwrap()).unwrap(); });
    assert_eq!(rx.recv_timeout(std::time::Duration::from_secs(3)).unwrap(), "mirror available"); worker.join().unwrap();
    let frame = pending.finish().unwrap(); assert_eq!(frame.profile.world_revision, Some(0));
    assert!(frame.profile.world_sync_ms.is_some()); assert!(frame.profile.simulation_ms.is_some());
}

#[test]
#[ignore = "manual native viewport two-frame pipeline benchmark"]
fn benchmark_viewport_submission_pipeline() {
    let root = project_root(); let mut world = World::new();
    mengine_scene::load_scene(&root.join("Assets/Scenes/Main.mscene"), &mut world).unwrap();
    let mut viewport = pollster::block_on(EditorViewportRenderer::new(root, 960, 540)).unwrap();
    let expected = viewport.render_game(&world, 960, 540).unwrap().rgba;
    let mut samples = [Vec::new(), Vec::new()];
    for run in 0..7 {
        for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
            let started = Instant::now(); let mut pending = std::collections::VecDeque::new(); let mut frames = Vec::new();
            for _ in 0..24 {
                if index == 0 { frames.push(viewport.render_game(&world, 960, 540).unwrap()); }
                else { pending.push_back(viewport.submit_game(&world, 960, 540).unwrap()); if pending.len() == 2 { frames.push(pending.pop_front().unwrap().finish().unwrap()); } }
            }
            while let Some(frame) = pending.pop_front() { frames.push(frame.finish().unwrap()); }
            let elapsed = started.elapsed().as_secs_f64() * 1000.0 / 24.0;
            assert_eq!(frames.len(), 24); assert!(frames.iter().all(|frame| frame.rgba == expected));
            if run > 1 { samples[index].push(elapsed); }
        }
    }
    for values in &mut samples { values.sort_by(f64::total_cmp); }
    println!("VIEWPORT_PIPELINE_BENCHMARK={}", serde_json::json!({"size":[960,540],"serial_ms_per_frame":samples[0][2],"two_in_flight_ms_per_frame":samples[1][2],"samples":5,"pixels_equal":true}));
}
