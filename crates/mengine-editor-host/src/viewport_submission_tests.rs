// Author: MiYu. Submitted viewport pixels and profiles remain bound to their original world.
use super::*;

fn project_root() -> PathBuf { Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms") }

#[test]
fn submitted_pose_picking_tracks_skin_parent_transform_and_preserves_displayed_geometry() {
    use mengine_core::generated::MeshRenderer;
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp/docs-artifacts/native-picking").join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&root).unwrap();
    let mut buffer = Vec::new();
    for value in [-0.4f32, -0.6, 0., 0.4, -0.6, 0., 0., 0.6, 0.] { buffer.extend(value.to_le_bytes()); }
    for value in [0u16, 1, 2] { buffer.extend(value.to_le_bytes()); } buffer.extend([0; 2]);
    buffer.extend([0; 24]);
    for value in [1f32, 0., 0., 0., 1., 0., 0., 0., 1., 0., 0., 0., 0., 2., 0., 0., 0., 2., 0., 0.] { buffer.extend(value.to_le_bytes()); }
    std::fs::write(root.join("pose.bin"), &buffer).unwrap();
    let document = serde_json::json!({"asset":{"version":"2.0"},"buffers":[{"uri":"pose.bin","byteLength":buffer.len()}],
        "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},{"buffer":0,"byteOffset":36,"byteLength":6},{"buffer":0,"byteOffset":44,"byteLength":24},{"buffer":0,"byteOffset":68,"byteLength":48},{"buffer":0,"byteOffset":116,"byteLength":8},{"buffer":0,"byteOffset":124,"byteLength":24}],
        "accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[-0.4,-0.6,0],"max":[0.4,0.6,0]},{"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"},{"bufferView":2,"componentType":5123,"count":3,"type":"VEC4"},{"bufferView":3,"componentType":5126,"count":3,"type":"VEC4"},{"bufferView":4,"componentType":5126,"count":2,"type":"SCALAR","min":[0],"max":[2]},{"bufferView":5,"componentType":5126,"count":2,"type":"VEC3"}],
        "meshes":[{"primitives":[{"attributes":{"POSITION":0,"JOINTS_0":2,"WEIGHTS_0":3},"indices":1}]}],"skins":[{"joints":[1]}],
        "nodes":[{"translation":[-4,0,0],"children":[1,2]},{},{"mesh":0,"skin":0}],"scenes":[{"nodes":[0]}],"scene":0,
        "animations":[{"samplers":[{"input":4,"output":5,"interpolation":"LINEAR"}],"channels":[{"sampler":0,"target":{"node":1,"path":"translation"}}]}]});
    std::fs::write(root.join("pose.gltf"), document.to_string()).unwrap();
    let mut world = World::new(); let parent = world.spawn_empty(); world.insert_component(parent, Transform { position: [4., 0., 0.], ..Default::default() });
    let entity = world.spawn_empty(); world.insert_component(entity, Transform::default()); world.set_parent(entity, Some(parent));
    world.insert_component(entity, MeshRenderer { mesh: "pose.gltf#pose=0:0@30".into(), ..Default::default() });
    let camera = EditorSceneCamera { eye: [0., 0., 5.], target: [0.; 3], orthographic: true, orthographic_size: 2., fov_y_degrees: 60. };
    let mut viewport = pollster::block_on(EditorViewportRenderer::new(root.clone(), 64, 64)).unwrap();
    let bare = viewport.submit_scene(&world, 64, 64, camera).unwrap().finish().unwrap(); assert!(bare.mesh_picking.is_none());
    viewport.with_mesh_picking();
    let old = viewport.submit_scene(&world, 64, 64, camera).unwrap();
    assert_eq!(old.mesh_picking.as_ref().unwrap().pick([0.5, 0.5], |_| true).unwrap().entity, entity.to_u64());
    world.get_component_mut::<MeshRenderer>(entity).unwrap().mesh = "pose.gltf#pose=0:30@30".into();
    let next = viewport.submit_scene(&world, 64, 64, camera).unwrap();
    assert!(next.mesh_picking.as_ref().unwrap().pick([0.5, 0.5], |_| true).is_none());
    assert_eq!(next.mesh_picking.as_ref().unwrap().pick([0.75, 0.5], |_| true).unwrap().entity, entity.to_u64());
    let next = next.finish().unwrap(); let old = old.finish().unwrap(); assert_ne!(next.rgba, old.rgba);
    world.get_component_mut::<Transform>(parent).unwrap().position[0] = 8.;
    let changed = viewport.submit_scene(&world, 64, 64, camera).unwrap().finish().unwrap(); assert!(changed.mesh_picking.as_ref().unwrap().pick([0.75, 0.5], |_| true).is_none());
    world.get_component_mut::<Transform>(parent).unwrap().position[0] = 4.;
    buffer[136..140].copy_from_slice(&3f32.to_le_bytes()); std::fs::write(root.join("pose.bin"), buffer).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(260));
    let reloaded = viewport.submit_scene(&world, 64, 64, camera).unwrap().finish().unwrap();
    assert!(reloaded.mesh_picking.as_ref().unwrap().pick([0.75, 0.5], |_| true).is_none());
    assert_eq!(reloaded.mesh_picking.as_ref().unwrap().pick([0.875, 0.5], |_| true).unwrap().entity, entity.to_u64());
    assert_eq!(next.mesh_picking.as_ref().unwrap().pick([0.75, 0.5], |_| true).unwrap().entity, entity.to_u64());
    drop(viewport); assert_eq!(old.mesh_picking.unwrap().pick([0.5, 0.5], |_| true).unwrap().entity, entity.to_u64());
    std::fs::remove_dir_all(root).unwrap();
}

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
