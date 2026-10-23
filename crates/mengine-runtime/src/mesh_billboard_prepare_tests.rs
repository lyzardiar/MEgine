// Author: MiYu. Compare per-view billboard preparation against production 0076a12.
use super::*;
use super::tests::PoseFixture;

fn assert_prepared_equal(previous: &RuntimeMeshCache, current: &RuntimeMeshCache, before: &[RenderObject], after: &[RenderObject]) {
    assert_eq!(before.iter().map(|o| &o.mesh_key).collect::<Vec<_>>(), after.iter().map(|o| &o.mesh_key).collect::<Vec<_>>());
    assert_eq!(previous.attempted, current.attempted);
    assert_eq!(previous.poses.keys().collect::<HashSet<_>>(), current.poses.keys().collect::<HashSet<_>>());
    assert_eq!(previous.billboard_views.keys().collect::<HashSet<_>>(), current.billboard_views.keys().collect::<HashSet<_>>());
    for (key, (source, view)) in &previous.billboard_views {
        let (other_source, other_view) = &current.billboard_views[key]; assert_eq!(source, other_source);
        assert_eq!(view.model, other_view.model); assert_eq!(view.look, other_view.look); assert_eq!(view.up, other_view.up);
    }
}

#[test]
fn source_decisions_preserve_per_object_cameras_and_polling_recovery() {
    let fixture = PoseFixture::new(); let path = fixture.0.join("pose.gltf");
    let mut doc: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    doc["nodes"][0]["extras"] = serde_json::json!({"mengineBillboard":{"flags":8}}); std::fs::write(&path, doc.to_string()).unwrap();
    let mut previous = RuntimeMeshCache::new(Some(fixture.0.clone())); let mut current = RuntimeMeshCache::new(Some(fixture.0.clone()));
    let object = |key: &str, model| RenderObject { mesh_key: key.into(), model, material: Default::default(), cast_shadows: false, receive_shadows: false };
    let original: Vec<_> = [glam::Mat4::IDENTITY, glam::Mat4::from_translation(Vec3::X), glam::Mat4::from_rotation_y(0.7), glam::Mat4::from_scale(Vec3::new(1., 2., 3.)), glam::Mat4::from_scale(Vec3::ZERO)].into_iter().flat_map(|model| ["pose.gltf#pose=0:0@30", "pose.gltf#pose=0:1@30", "  pose.gltf#pose=0:0@30  ", "pose.gltf#pose=bad", "pose.gltf", "missing.gltf#pose=0:0@30"].map(|key| object(key, model))).collect();
    for phase in 0..6 {
        match phase { 2 => fixture.buffer(10., true), 3 => std::fs::remove_file(fixture.0.join("pose.bin")).unwrap(), 4 => fixture.buffer(20., false), 5 => { doc["nodes"][0]["extras"] = serde_json::json!({}); std::fs::write(&path, doc.to_string()).unwrap(); }, _ => () }
        previous.last_poll = if phase == 1 { Some(Instant::now()) } else { None }; current.last_poll = previous.last_poll;
        previous.profile = MeshSyncProfile::default(); current.profile = MeshSyncProfile::default();
        let mut old_checks = FrameSourceChecks::default(); let mut checks = FrameSourceChecks::default();
        for angle in [0., 0.8] {
            let camera = FrameCamera { view: glam::Mat4::from_rotation_y(angle), proj: glam::Mat4::IDENTITY, position: Vec3::Z };
            let mut before = original.clone(); let mut after = original.clone();
            previous.previous_prepare_billboards(camera, &mut before, &mut old_checks); current.prepare_billboards(camera, &mut after, &mut checks);
            assert_prepared_equal(&previous, &current, &before, &after);
            let count = after.iter().filter(|o| o.mesh_key.starts_with("billboard:")).count();
            assert_eq!(count, if phase == 3 || phase == 5 { 0 } else { 12 });
            if count > 0 { assert_eq!(after[0].mesh_key, after[6].mesh_key); assert_ne!(after[0].mesh_key, after[12].mesh_key); assert_ne!(after[0].mesh_key, after[18].mesh_key); }
        }
        assert_eq!(old_checks.stamps, checks.stamps); assert_eq!(old_checks.prepared, checks.prepared);
        assert_eq!((previous.profile.file_checks, previous.profile.source_checks), (current.profile.file_checks, current.profile.source_checks));
    }
}

#[test]
#[ignore = "manual authored-map billboard preparation comparison"]
fn benchmark_billboard_source_decisions() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let camera = FrameCamera { view: glam::Mat4::look_at_rh(Vec3::new(0., 3., 4.), Vec3::ZERO, Vec3::Y), proj: glam::Mat4::IDENTITY, position: Vec3::new(0., 3., 4.) };
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let mut world = mengine_core::World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = mengine_core::TransformHierarchy::build(&world);
        let objects = crate::frame_compiler::collect_objects(&world, &hierarchy, &mut crate::materials::RuntimeMaterialCache::new(Some(root.clone())));
        let mut previous = RuntimeMeshCache::new(Some(root.clone())); let mut current = RuntimeMeshCache::new(Some(root.clone()));
        let mut before = objects.clone(); let mut after = objects.clone();
        previous.previous_prepare_billboards(camera, &mut before, &mut FrameSourceChecks::default()); current.prepare_billboards(camera, &mut after, &mut FrameSourceChecks::default());
        assert_prepared_equal(&previous, &current, &before, &after);
        let billboards = after.iter().filter(|o| o.mesh_key.starts_with("billboard:")).count();
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for mode in [run % 2, 1 - run % 2] {
                let mut elapsed = Duration::ZERO;
                for _ in 0..100 {
                    let mut frame_objects = objects.clone(); let cache = if mode == 0 { &mut previous } else { &mut current };
                    cache.last_poll = Some(Instant::now()); cache.profile = MeshSyncProfile::default(); let mut checks = FrameSourceChecks::default();
                    let started = Instant::now();
                    if mode == 0 { cache.previous_prepare_billboards(camera, &mut frame_objects, &mut checks); } else { cache.prepare_billboards(camera, &mut frame_objects, &mut checks); }
                    elapsed += started.elapsed(); std::hint::black_box(&frame_objects);
                    assert_eq!(cache.profile.source_loads, 0); assert_eq!(cache.profile.file_checks, 0);
                }
                if run >= 2 { samples[mode].push(elapsed.as_secs_f64() * 1000.0 / 100.0); }
            }
        }
        assert_prepared_equal(&previous, &current, &before, &after);
        println!("BILLBOARD_SOURCE_DECISIONS {}", serde_json::json!({"scene":scene,"objects":objects.len(),"billboards":billboards,"sources":current.poses.len(),"samples":samples,"iterations":100,"warmups":2,"scope":"0076a12 versus per-view source-key decisions; warmed sources, no file poll; excludes object cloning, GPU sync and IPC"}));
    }
}

impl RuntimeMeshCache {
    fn previous_prepare_billboards(&mut self, camera: FrameCamera, objects: &mut [RenderObject], checks: &mut FrameSourceChecks) {
        let Some(root) = self.project_root.as_deref() else { return; };
        let poll = self.last_poll.is_none_or(|last| last.elapsed() >= Duration::from_millis(250));
        let mut checked_assets = HashMap::new();
        for object in objects {
            let key = object.mesh_key.trim();
            let Some((asset,_,_,_)) = parse_gltf_pose_sample(key) else { continue; };
            if poll || !self.poses.contains_key(asset) {
                let ready = if let Some(ready) = checked_assets.get(asset) { *ready } else {
                    let ready = if checks.prepared.contains(asset) { true } else if let Some(path) = resolve_project_asset_path(root,asset) {
                        if checks.validate_cached_source(asset, &path, self.poses.get(asset), &mut self.profile) { true } else {
                            let stamp = checks.stamp(asset, &path, &mut self.profile);
                            forget_pose_attempts(&mut self.attempted, &self.billboard_views, asset);
                            self.poses.remove(asset);
                            match load_pose_source(&path, root, &mut self.profile) { Ok(source) => { self.poses.insert(asset.into(),(stamp,source)); true }, Err(_) => false }
                        }
                    } else { false };
                    if ready { checks.prepared.insert(asset.to_owned()); }
                    checked_assets.insert(asset.to_owned(),ready); ready
                };
                if !ready { continue; }
            }
            if !self.poses[asset].1.has_mesh_billboards() { continue; }
            let Some(view) = billboard_camera(camera,object) else { continue; };
            let rendered = billboard_key(key,view);
            self.billboard_views.entry(rendered.clone()).or_insert_with(|| (key.into(),view));
            object.mesh_key=rendered;
        }
    }
}
