// Author: MiYu. Validate current source identity without repeating main-file metadata reads.
use super::*;
use super::tests::PoseFixture;

#[test]
fn cached_and_new_poses_keep_polling_and_refresh_changed_main_or_buffer() {
    let fixture = PoseFixture::new(); let path = fixture.0.join("pose.gltf");
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16, 16))).unwrap();
    let mut cache = RuntimeMeshCache::new(Some(fixture.0.clone()));
    let object = |frame| RenderObject { mesh_key: format!("pose.gltf#pose=0:{frame}@30"), model: glam::Mat4::IDENTITY, material: Default::default(), cast_shadows: false, receive_shadows: false };
    assert!(cache.sync(&mut renderer, &[object(0)]).is_empty());
    cache.last_poll = Some(Instant::now());
    assert!(cache.sync(&mut renderer, &[object(0)]).is_empty());
    assert_eq!((cache.sync_profile().file_checks, cache.sync_profile().source_checks, cache.stats().uploads), (0, 0, 0));
    cache.last_poll = None;
    assert!(cache.sync(&mut renderer, &[object(0)]).is_empty());
    assert_eq!((cache.sync_profile().file_checks, cache.sync_profile().source_checks, cache.stats().uploads), (0, 1, 0));
    cache.last_poll = Some(Instant::now());
    assert!(cache.sync(&mut renderer, &[object(1)]).is_empty());
    assert_eq!((cache.sync_profile().file_checks, cache.sync_profile().source_checks, cache.stats().uploads), (0, 1, 1));
    fixture.buffer(10., true); cache.last_poll = Some(Instant::now());
    assert!(cache.sync(&mut renderer, &[object(2)]).is_empty());
    assert_eq!(cache.stats().uploads, 1); assert!(!cache.attempted.contains_key("pose.gltf#pose=0:0@30"));
    assert_eq!(cache.poses["pose.gltf"].1.sample_at_rate(0, 0, 30).unwrap().positions[0][0], 9.);
    let mut doc: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    doc["nodes"][0]["translation"] = serde_json::json!([3, 0, 0]); std::fs::write(&path, doc.to_string()).unwrap();
    cache.last_poll = Some(Instant::now()); assert!(cache.sync(&mut renderer, &[object(3)]).is_empty());
    assert_eq!(cache.stats().uploads, 1); assert_eq!(cache.poses["pose.gltf"].1.sample_at_rate(0, 0, 30).unwrap().positions[0][0], 12.);
    std::fs::remove_file(&path).unwrap(); cache.last_poll = None;
    assert!(!cache.sync(&mut renderer, &[object(3)]).is_empty()); assert!(!cache.poses.contains_key("pose.gltf"));
    std::fs::write(&path, doc.to_string()).unwrap(); cache.last_poll = Some(Instant::now());
    assert!(cache.sync(&mut renderer, &[object(3)]).is_empty()); assert_eq!(cache.stats().uploads, 0);
    cache.last_poll = None;
    assert!(cache.sync(&mut renderer, &[object(3)]).is_empty()); assert_eq!(cache.stats().uploads, 1);
}

#[test]
fn render_only_source_validation_reuses_stamp_and_detects_main_changes() {
    let fixture = PoseFixture::new(); let path = fixture.0.join("pose.gltf");
    let mut doc: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    doc["images"] = serde_json::json!([{"uri":"missing.png"}]); std::fs::write(&path, doc.to_string()).unwrap();
    let mut profile = MeshSyncProfile::default();
    let cached = (file_stamp(&path), load_pose_source(&path, &fixture.0, &mut profile).unwrap());
    assert!(matches!(&cached.1, CachedPoseSource::Legacy { .. }));
    profile = MeshSyncProfile::default(); let mut checks = FrameSourceChecks::default();
    assert!(checks.validate_cached_source("pose.gltf", &path, Some(&cached), &mut profile));
    assert_eq!(checks.stamp("pose.gltf", &path, &mut profile), cached.0); assert_eq!(profile.file_checks, 0);
    std::fs::write(&path, format!("{}\n", doc)).unwrap();
    assert!(!FrameSourceChecks::default().validate_cached_source("pose.gltf", &path, Some(&cached), &mut profile));
    assert!(cached.1.validate_at(&fixture.0.join("other.gltf")).is_none());
}

#[test]
fn validated_source_stamp_does_not_reuse_metadata_observed_before_loading() {
    let fixture = PoseFixture::new(); let path = fixture.0.join("pose.gltf");
    let source = load_pose_source(&path, &fixture.0, &mut MeshSyncProfile::default()).unwrap();
    let cached = (FileStamp::default(), source); let expected = file_stamp(&path);
    let mut checks = FrameSourceChecks::default(); let mut profile = MeshSyncProfile::default();
    assert!(checks.validate_cached_source("pose.gltf", &path, Some(&cached), &mut profile));
    assert_eq!(checks.stamp("pose.gltf", &path, &mut profile), expected); assert_ne!(expected, cached.0);
    assert_eq!((profile.file_checks, profile.source_checks), (0, 1));
}

#[test]
#[ignore = "manual preserved Frostbound pose-source validation CPU benchmark"]
fn benchmark_pose_source_validation() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut assets = std::collections::BTreeSet::new();
    for name in ["human-army-models.json", "human-aviary-models.json"] {
        let catalog: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join(name)).unwrap()).unwrap();
        for model in catalog.as_object().unwrap().values() {
            for part in model["parts"].as_array().unwrap() { assets.insert(part["animatedMesh"].as_str().or_else(|| part["mesh"].as_str()).unwrap().to_owned()); }
        }
    }
    let sources: Vec<_> = assets.into_iter().take(17).map(|asset| {
        let path = resolve_project_asset_path(&root, &asset).unwrap();
        let cached = (file_stamp(&path), load_pose_source(&path, &root, &mut MeshSyncProfile::default()).unwrap());
        (asset, path, cached)
    }).collect();
    assert_eq!(sources.len(), 17);
    let validate = |shared| {
        let mut checks = FrameSourceChecks::default(); let mut profile = MeshSyncProfile::default();
        for (asset, path, cached) in &sources {
            if shared { assert!(checks.validate_cached_source(asset, path, Some(cached), &mut profile)); checks.prepared.insert(asset.clone()); }
            else {
                assert_eq!(checks.stamp(asset, path, &mut profile), cached.0);
                let started = Instant::now();
                assert!(match &cached.1 { CachedPoseSource::Shared(source) => source.is_current(), CachedPoseSource::Legacy { dependencies, .. } => dependencies.iter().all(|(path, stamp)| file_stamp(path) == *stamp) });
                profile.source_check_ms += started.elapsed().as_secs_f64() * 1000.; profile.source_checks += 1;
                checks.prepared.insert(asset.clone());
            }
        }
        std::hint::black_box(checks); profile
    };
    let before = validate(false); let after = validate(true);
    assert_eq!((before.file_checks, after.file_checks, before.source_checks, after.source_checks), (17, 0, 17, 17));
    let mut samples = [Vec::new(), Vec::new()];
    for run in 0..11 {
        for index in if run % 2 == 0 { [0, 1] } else { [1, 0] } {
            let started = Instant::now(); for _ in 0..25 { std::hint::black_box(validate(index == 1)); }
            if run > 1 { samples[index].push(started.elapsed().as_secs_f64() * 1000. / 25.); }
        }
    }
    for values in &mut samples { values.sort_by(f64::total_cmp); }
    println!("POSE_SOURCE_VALIDATION_BENCHMARK={}", serde_json::json!({"sources":sources.len(),"baseline_ms":samples[0][4],"shared_ms":samples[1][4],"baseline_main_metadata_reads":before.file_checks,"shared_main_metadata_reads":after.file_checks,"source_validations":after.source_checks,"samples":9}));
}
