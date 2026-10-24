// Author: MiYu. Compare scheduled source checks with grouped polling without weakening pose validation.
use super::*;
use super::super::tests::PoseFixture;

impl RuntimeMeshCache {
    // Reference a585976: no deadline lookups or periodic preparation for this test-only path.
    pub(super) fn validate_grouped_sources<'a>(&mut self, objects: impl Iterator<Item = &'a RenderObject>, checks: &mut FrameSourceChecks) {
        if self.poses.len() < MIN_SOURCES || self.last_poll.is_some_and(|last| last.elapsed() < SOURCE_INTERVAL) { return; }
        let Some(root) = self.project_root.as_deref() else { return; };
        let started = Instant::now(); let mut seen = HashSet::new();
        let sources = objects.filter_map(|object| {
            let key = object.mesh_key.trim(); let key = self.billboard_views.get(key).map_or(key, |(source, _)| source.as_str());
            let (asset, _, _, _) = parse_gltf_pose_sample(key)?;
            if !seen.insert(asset) { return None; }
            let (_, source) = self.poses.get(asset)?; let path = resolve_project_asset_path(root, asset)?;
            Some((asset, path, source))
        }).collect::<Vec<_>>();
        if sources.len() < MIN_SOURCES { return; }
        let jobs = sources.chunks(sources.len().div_ceil(MAX_JOBS)).collect::<Vec<_>>();
        let results = mengine_jobs::JobSystem::new().parallel_map(jobs, |sources| sources.iter().map(|(asset, path, source)| ((*asset).to_owned(), source.validate_at(path))).collect::<Vec<_>>());
        self.profile.source_check_ms += started.elapsed().as_secs_f64() * 1000.; self.profile.source_checks += sources.len() as u32;
        for (asset, stamp) in results.into_iter().flatten() { if let Some(stamp) = stamp { checks.prepared.insert(asset.clone()); checks.stamps.insert(asset, stamp); } }
    }
}

#[test]
fn source_deadlines_remain_future_bounded_and_spread_checks() {
    let epoch = Instant::now();
    for index in 0..4000 {
        let phase = Duration::from_nanos(index * 62_499);
        let now = epoch + Duration::from_nanos(index * 1_250_003);
        let next = next_pose_check(epoch, phase, now);
        assert!(next > now && next.duration_since(now) <= SOURCE_INTERVAL);
    }
    let mut deadlines = (0..256).map(|index| (epoch, Duration::from_micros(index * 976))).collect::<Vec<_>>();
    let mut counts = Vec::new();
    for frame in 0..120 {
        let now = epoch + Duration::from_micros(frame * 16_667);
        let mut count = 0;
        for (deadline, phase) in &mut deadlines { if *deadline <= now { count += 1; *deadline = next_pose_check(epoch, *phase, now); } }
        counts.push(count);
    }
    assert_eq!(counts[0], 256); assert!(counts[1..].iter().max().unwrap() <= &18);
    let paused = epoch + Duration::from_secs(5); assert!(deadlines.iter().all(|(deadline, _)| *deadline < paused));
    let mut cache = RuntimeMeshCache::new(None);
    for index in 0..256 { cache.schedule_pose_check(&format!("source{index}.glb"), epoch, false); }
    let phases = cache.pose_checks.values().map(|check| check.phase).collect::<std::collections::BTreeSet<_>>();
    assert_eq!(phases, (0..4).map(|slot| Duration::from_micros(slot * 62_500)).collect());
}

#[test]
fn deadlines_preserve_multiview_pixels_immediate_new_poses_and_failure_recovery() {
    let fixture = PoseFixture::new(); let original = std::fs::read(fixture.0.join("pose.gltf")).unwrap();
    for index in 0..64 {
        let mut doc: serde_json::Value = serde_json::from_slice(&original).unwrap();
        if index % 2 == 1 { doc["images"] = serde_json::json!([{"uri":"missing-render-only.png"}]); }
        if index == 0 { doc["nodes"][0]["extras"] = serde_json::json!({"mengineBillboard":{"flags":8}}); }
        std::fs::write(fixture.0.join(format!("source{index}.gltf")), doc.to_string()).unwrap();
    }
    let saved_three = std::fs::read(fixture.0.join("source3.gltf")).unwrap();
    let object = |index, frame| RenderObject { mesh_key:format!("source{index}.gltf#pose=0:{frame}@30"), model:glam::Mat4::from_scale_rotation_translation(Vec3::splat(0.08), glam::Quat::IDENTITY, Vec3::new((index % 8) as f32 * 0.22 - 0.8, (index / 8) as f32 * 0.22 - 0.8, 0.)), material:mengine_rhi::RenderMaterial { unlit:true, ..Default::default() }.into(), cast_shadows:false, receive_shadows:false };
    let camera = FrameCamera { view:glam::Mat4::IDENTITY, proj:glam::Mat4::IDENTITY, position:Vec3::Z }; let clear = mengine_rhi::ClearColor { r:0., g:0., b:0., a:1. };
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(64, 64))).unwrap(); let target = renderer.create_offscreen_target(winit::dpi::PhysicalSize::new(64, 64));
    let mut previous = RuntimeMeshCache::new(Some(fixture.0.clone())); previous.grouped_source_checks = true;
    let mut current = RuntimeMeshCache::new(Some(fixture.0.clone()));
    for phase in 0..9 {
        if phase == 2 {
            let path = fixture.0.join("source0.gltf"); let mut doc: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            doc["nodes"][0]["translation"] = serde_json::json!([0.2,0,0]); std::fs::write(path, doc.to_string()).unwrap(); std::fs::remove_file(fixture.0.join("source3.gltf")).unwrap();
        }
        if phase == 3 { std::fs::write(fixture.0.join("source3.gltf"), &saved_three).unwrap(); }
        if phase == 6 { previous.invalidate("source2.gltf"); current.invalidate("source2.gltf"); }
        if phase == 7 { previous.set_project_root(None); current.set_project_root(None); }
        if phase == 8 { previous.set_project_root(Some(fixture.0.clone())); current.set_project_root(Some(fixture.0.clone())); }
        let now = Instant::now();
        for check in current.pose_checks.values_mut() { check.next = if phase == 5 { now - Duration::from_millis(1) } else { now + Duration::from_secs(1) }; }
        if phase == 2 { for name in ["source0.gltf", "source3.gltf"] { current.pose_checks.get_mut(name).unwrap().next = now - Duration::from_millis(1); } }
        let mut results = Vec::new();
        for cache in [&mut previous, &mut current] {
            cache.last_poll = if cache.grouped_source_checks && matches!(phase, 0 | 2 | 3 | 5 | 8) { None } else { Some(Instant::now()) };
            let mut objects = (0..64).map(|index| object(index, 0)).collect::<Vec<_>>(); if phase >= 4 { objects.push(object(1, 1)); }
            let mut frame = CompiledFrame { profile_stages:vec![], clear, camera, objects:objects[..32].to_vec(), lighting:Default::default(), ui:mengine_rhi::UiBatchPlan::build(vec![]), controls:vec![], texture_failures:vec![], font_failures:vec![], has_authored_camera:true, scene_views:vec![mengine_rhi::SceneTextureFrame { key:"phased-view".into(), size:[32,32], clear, camera, objects:objects[16..].to_vec(), lighting:Default::default() }], view_resources:vec![] };
            let failures = cache.sync_frame(&mut renderer, &mut frame); let profile = cache.sync_profile();
            renderer.submit_frame_to(&frame.render_frame(), mengine_rhi::RenderTarget::Offscreen(&target)).unwrap();
            results.push((failures, renderer.read_offscreen_rgba8(&target).unwrap(), profile.source_checks));
        }
        assert_eq!(results[0].0, results[1].0, "phase {phase}"); assert!(results[0].1 == results[1].1, "RGBA differs at phase {phase}");
        assert_eq!(previous.attempted, current.attempted); assert_eq!(previous.pose_bytes, current.pose_bytes); assert_eq!(previous.uploads, current.uploads);
        assert_eq!(previous.poses.keys().collect::<HashSet<_>>(), current.poses.keys().collect::<HashSet<_>>());
        if phase == 1 { assert_eq!(results[1].2, 0); }
        if phase == 2 { assert_eq!(results[1].2, 2); assert_eq!(current.pose_checks.len(), 63); }
        if phase == 4 { assert_eq!(results[1].2, 1, "new pose validates immediately between periodic checks"); }
        if phase == 5 { assert_eq!(results[1].2, 64, "all overdue sources validate when rendering resumes"); }
        if phase == 7 { assert!(current.pose_checks.is_empty()); assert!(current.pose_check_epoch.is_none()); assert!(current.pose_poll_sources.is_empty()); }
    }
    current.last_poll = None;
    current.validate_polled_sources([object(0, 0)].iter(), &mut FrameSourceChecks::default());
    assert_eq!(current.pose_poll_sources.iter().map(|(asset, _)| asset.as_str()).collect::<Vec<_>>(), ["source0.gltf"]);
    let CachedPoseSource::Shared(source) = &current.poses["source0.gltf"].1 else { panic!("shared source expected") }; let weak = Arc::downgrade(source);
    drop(previous); drop(current); assert!(weak.upgrade().is_none());
}

#[test]
#[ignore = "manual real-file cadence comparison on preserved map sources"]
fn benchmark_phased_pose_source_checks() {
    let root = PathBuf::from(std::env::var_os("MENGINE_METADATA_PROJECT").expect("Set MENGINE_METADATA_PROJECT"));
    let paths = PathBuf::from(std::env::var_os("MENGINE_METADATA_PATHS").expect("Set MENGINE_METADATA_PATHS"));
    let mut previous = RuntimeMeshCache::new(Some(root.clone())); previous.grouped_source_checks = true; let mut current = RuntimeMeshCache::new(Some(root.clone())); let mut keys = Vec::new();
    for path in std::fs::read_to_string(paths).unwrap().lines().map(PathBuf::from) {
        let asset = path.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/"); let source = load_pose_source(&path, &root, &mut MeshSyncProfile::default()).unwrap();
        let other = load_pose_source(&path, &root, &mut MeshSyncProfile::default()).unwrap(); let stamp = file_stamp(&path);
        assert!(matches!(source, CachedPoseSource::Shared(_))); previous.poses.insert(asset.clone(), (stamp, source)); current.poses.insert(asset.clone(), (stamp, other)); keys.push(format!("{asset}#pose=0:0@30"));
    }
    assert_eq!(keys.len(), 196);
    let objects = keys.iter().cycle().take(5376).map(|key| RenderObject { mesh_key:key.clone(), model:glam::Mat4::IDENTITY, material:Default::default(), cast_shadows:false, receive_shadows:false }).collect::<Vec<_>>();
    let camera = FrameCamera { view:glam::Mat4::IDENTITY, proj:glam::Mat4::IDENTITY, position:Vec3::Z };
    let start = Instant::now(); previous.last_poll = Some(start); current.last_poll = Some(start);
    for key in previous.poses.keys() { current.schedule_pose_check(key, start, false); }
    let mut samples = [Vec::new(), Vec::new()]; let mut calls = [Vec::new(), Vec::new()]; let mut expected: Option<Vec<String>> = None;
    for frame in 0..180 {
        let target = start + Duration::from_secs_f64(frame as f64 / 60.); if let Some(delay) = target.checked_duration_since(Instant::now()) { std::thread::sleep(delay); }
        for mode in [frame % 2, 1 - frame % 2] {
            let cache = if mode == 0 { &mut previous } else { &mut current }; cache.profile = MeshSyncProfile::default(); let mut checks = FrameSourceChecks::default(); let mut view_objects = objects.clone();
            let started = Instant::now(); cache.validate_polled_sources(view_objects.iter(), &mut checks); cache.prepare_billboards(camera, &mut view_objects, &mut checks); cache.record_loaded_pose_checks(&checks);
            if cache.last_poll.is_none_or(|last| last.elapsed() >= SOURCE_INTERVAL) { cache.last_poll = Some(Instant::now()); }
            let elapsed = started.elapsed().as_secs_f64() * 1000.;
            if let Some(expected) = &expected { assert!(view_objects.iter().zip(expected).all(|(object, key)| object.mesh_key == *key), "prepared keys differ at frame {frame}, mode {mode}"); }
            else { expected = Some(view_objects.iter().map(|object| object.mesh_key.clone()).collect()); }
            assert!(cache.profile.source_loads == 0 && cache.profile.source_reuses == 0);
            if frame >= 30 { samples[mode].push(elapsed); calls[mode].push(cache.profile.source_checks); }
        }
    }
    println!("PHASED_POSE_SOURCES={}", serde_json::json!({"sources":196,"objects":5376,"samples_ms":samples,"calls":calls,"warmup_frames":30,"measured_frames":150,"hz":60,"scope":"source polling and billboard preparation; real files; no sync/upload/GPU/VM/IPC/FPS"}));
}
