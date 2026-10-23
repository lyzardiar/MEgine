// Author: MiYu. Compare mesh sync behavior and warm traversal against production 0a7f7d2.
use super::*;
use super::tests::PoseFixture;

fn object(key: &str) -> RenderObject {
    RenderObject { mesh_key: key.into(), model: glam::Mat4::IDENTITY, material: Default::default(), cast_shadows: false, receive_shadows: false }
}

fn assert_cache_equal(previous: &RuntimeMeshCache, current: &RuntimeMeshCache) {
    assert_eq!(previous.attempted, current.attempted);
    assert_eq!((previous.frame, previous.pose_bytes, previous.uploads, previous.evictions), (current.frame, current.pose_bytes, current.uploads, current.evictions));
    let usage = |cache: &RuntimeMeshCache| cache.pose_usage.iter().map(|(key, used)| (key.clone(), (used.frame, used.bytes))).collect::<std::collections::BTreeMap<_, _>>();
    assert_eq!(usage(previous), usage(current));
    assert_eq!(previous.poses.keys().collect::<HashSet<_>>(), current.poses.keys().collect::<HashSet<_>>());
    assert_eq!(previous.patches.keys().collect::<HashSet<_>>(), current.patches.keys().collect::<HashSet<_>>());
    for (key, (_, source)) in &previous.poses { assert_eq!(source.sample_at_rate(0, 0, 30).unwrap().positions, current.poses[key].1.sample_at_rate(0, 0, 30).unwrap().positions); }
}

#[test]
fn repeated_keys_preserve_failures_polling_refresh_and_recovery_across_views() {
    let fixture = PoseFixture::new();
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16, 16))).unwrap();
    let mut previous = RuntimeMeshCache::new(Some(fixture.0.clone())); let mut current = RuntimeMeshCache::new(Some(fixture.0.clone()));
    let keys = ["pose.gltf#pose=0:0@30", "pose.gltf", "terrain4:0000000000000000000000000000000000000000000000000000000000000000", "meshpatch:invalid", "terrain4:invalid", "pose.gltf#pose=bad", "missing.gltf", "cube", ""];
    let main: Vec<_> = keys.iter().cycle().take(keys.len() * 10).map(|key| object(key)).collect();
    let nested: Vec<_> = keys.iter().rev().map(|key| object(&format!("  {key}  "))).collect();
    for phase in 0..5 {
        match phase { 2 => fixture.buffer(10., true), 3 => std::fs::remove_file(fixture.0.join("pose.bin")).unwrap(), 4 => fixture.buffer(20., false), _ => () }
        previous.last_poll = if phase == 1 { Some(Instant::now()) } else { None }; current.last_poll = previous.last_poll;
        previous.profile = MeshSyncProfile::default(); current.profile = MeshSyncProfile::default();
        let old_failures = previous.previous_sync_objects(&mut renderer, main.iter().chain(&nested), &mut FrameSourceChecks::default());
        let failures = current.sync_objects(&mut renderer, main.iter().chain(&nested), &mut FrameSourceChecks::default());
        assert_eq!(old_failures, failures, "phase {phase}"); assert_cache_equal(&previous, &current);
        let counts = |profile: MeshSyncProfile| (profile.file_checks, profile.source_checks, profile.geometry_builds, profile.uploads);
        assert_eq!(counts(previous.profile), counts(current.profile));
        if phase == 1 { assert!(failures.is_empty()); assert_eq!(counts(current.profile), (0, 0, 0, 0)); }
        if phase == 3 { assert_eq!(failures.len(), 1); assert_eq!(current.pose_usage["pose.gltf#pose=0:0@30"].bytes, 0); }
        if phase == 4 { assert!(failures.is_empty()); assert!(current.pose_usage["pose.gltf#pose=0:0@30"].bytes > 0); }
    }
}

#[test]
#[ignore = "manual authored-map warm mesh traversal comparison"]
fn benchmark_warm_mesh_key_dedup() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/frostbound-realms");
    let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16, 16))).unwrap();
    for scene in ["Assets/Maps/amazonia/Scenes/Main.mscene", "Assets/Scenes/Main.mscene"] {
        let mut world = mengine_core::World::new(); mengine_scene::load_scene(&root.join(scene), &mut world).unwrap();
        let hierarchy = mengine_core::TransformHierarchy::build(&world);
        let objects = crate::frame_compiler::collect_objects(&world, &hierarchy, &mut crate::materials::RuntimeMaterialCache::new(Some(root.clone())));
        let mut previous = RuntimeMeshCache::new(Some(root.clone())); let mut current = RuntimeMeshCache::new(Some(root.clone()));
        // Model the already-attempted, non-polling frame; cold loading and GPU uploads are excluded.
        for object in &objects { previous.attempted.insert(object.mesh_key.trim().into(), FileStamp::default()); current.attempted.insert(object.mesh_key.trim().into(), FileStamp::default()); }
        let mut samples = [Vec::new(), Vec::new()];
        for run in 0..11 {
            for mode in [run % 2, 1 - run % 2] {
                let started = Instant::now();
                for _ in 0..200 {
                    let cache = if mode == 0 { &mut previous } else { &mut current }; cache.last_poll = Some(Instant::now());
                    let failures = if mode == 0 { cache.previous_sync_objects(&mut renderer, objects.iter(), &mut FrameSourceChecks::default()) } else { cache.sync_objects(&mut renderer, objects.iter(), &mut FrameSourceChecks::default()) };
                    assert!(std::hint::black_box(failures).is_empty());
                }
                if run >= 2 { samples[mode].push(started.elapsed().as_secs_f64() * 1000.0 / 200.0); }
            }
        }
        assert_cache_equal(&previous, &current);
        println!("WARM_MESH_DEDUP {}", serde_json::json!({"scene":scene,"objects":objects.len(),"keys":current.attempted.len(),"samples":samples,"iterations":200,"warmups":2,"scope":"0a7f7d2 versus early GPU key dedup; warm non-polling traversal only; excludes billboard preparation, source loading, GPU uploads and IPC"}));
    }
}

// Pinned reference keeps the original parse-before-dedup order for independent comparison.
impl RuntimeMeshCache {
    fn previous_sync_objects<'a>(&mut self, renderer: &mut Renderer, objects: impl IntoIterator<Item = &'a RenderObject>, checks: &mut FrameSourceChecks) -> Vec<MeshLoadFailure> {
        for key in self.evicted.drain(..) { renderer.remove_mesh(&key); }
        self.uploads = 0; self.evictions = 0;
        self.frame += 1;
        let Some(root) = self.project_root.as_deref() else {
            return Vec::new();
        };
        let mut failures = Vec::new();
        let poll = self.last_poll.is_none_or(|last| last.elapsed() >= Duration::from_millis(250));
        if poll { self.last_poll = Some(Instant::now()); }
        let mut frame_keys = HashSet::new();
        let mut checked_poses = HashSet::new();
        for object in objects {
            let key = object.mesh_key.trim();
            if key.starts_with("meshpatch:") {
                if let Some(used) = self.pose_usage.get_mut(key) { used.frame = self.frame; } else { self.pose_usage.insert(key.into(), PoseUsage { frame:self.frame, bytes:0 }); }
                if !frame_keys.insert(key) { continue; }
                if !poll && self.attempted.contains_key(key) { continue; }
                let Some((asset, cells)) = parse_mesh_patch_key(key) else {
                    if should_attempt(&mut self.attempted, key, FileStamp::default()) { failures.push(MeshLoadFailure { key:key.into(), path:root.to_owned(), error:"invalid mesh patch key".into() }); }
                    continue;
                };
                let Some(path) = resolve_project_asset_path(root, asset) else {
                    if should_attempt(&mut self.attempted, key, FileStamp::default()) { failures.push(MeshLoadFailure { key:key.into(), path:root.to_owned(), error:"mesh patch path must be project-relative without '..'".into() }); }
                    continue;
                };
                let stamp = checks.stamp(asset, &path, &mut self.profile);
                if !should_attempt(&mut self.attempted, key, stamp) { continue; }
                if self.patches.get(asset).is_none_or(|(old, _)| *old != stamp) {
                    match { let started = Instant::now(); let source = MeshPatchSource::load(&path); self.profile.source_load_ms += started.elapsed().as_secs_f64()*1000.0; self.profile.source_loads += 1; source } {
                        Ok(source) => { self.patches.insert(asset.to_owned(), (stamp, source)); }
                        Err(error) => { failures.push(MeshLoadFailure { key:key.into(), path, error }); continue; }
                    }
                }
                match { let started = Instant::now(); let mesh = self.patches[asset].1.compose(cells); self.profile.geometry_ms += started.elapsed().as_secs_f64()*1000.0; self.profile.geometry_builds += 1; mesh } {
                    Ok(mesh) => { profile_upload(renderer, key, &mesh, &mut self.profile); record_mesh_bytes(&mut self.pose_usage, &mut self.pose_bytes, key, &mesh); self.uploads += 1; },
                    Err(error) => failures.push(MeshLoadFailure { key:key.into(), path, error }),
                }
                continue;
            }
            if key.starts_with("terrain4:") || key.starts_with("terrain4r:") || key.starts_with("terrain4h:") || key.starts_with("terrain4w:") {
                if let Some(used) = self.pose_usage.get_mut(key) { used.frame = self.frame; } else { self.pose_usage.insert(key.into(), PoseUsage { frame:self.frame, bytes:0 }); }
                if should_attempt(&mut self.attempted, key, FileStamp::default()) {
                    match { let started = Instant::now(); let mesh = terrain_mesh(key); self.profile.geometry_ms += started.elapsed().as_secs_f64()*1000.0; self.profile.geometry_builds += 1; mesh } {
                        Ok(mesh) => { profile_upload(renderer, key, &mesh, &mut self.profile); record_mesh_bytes(&mut self.pose_usage, &mut self.pose_bytes, key, &mesh); self.uploads += 1; },
                        Err(error) => failures.push(MeshLoadFailure { key:key.into(), path:root.to_owned(), error:error.into() }),
                    }
                }
                continue;
            }
            let billboard = self.billboard_views.get(key);
            let pose = parse_gltf_pose_sample(billboard.map_or(key,|(source,_)| source));
            if key.contains("#pose=") && pose.is_none() {
                if should_attempt(&mut self.attempted, key, FileStamp::default()) { failures.push(MeshLoadFailure { key: key.into(), path: root.to_owned(), error: "invalid skeletal pose reference".into() }); }
                continue;
            }
            if pose.is_some() { if let Some(used) = self.pose_usage.get_mut(key) { used.frame = self.frame; } else { self.pose_usage.insert(key.into(), PoseUsage { frame:self.frame, bytes:0 }); } }
            let asset_key = pose.map(|p| p.0).unwrap_or(key);
            let lower = asset_key.to_ascii_lowercase();
            if !lower.ends_with(".gltf") && !lower.ends_with(".glb") {
                continue;
            }
            if !frame_keys.insert(key) {
                continue;
            }
            if !poll && self.attempted.contains_key(key) { continue; }
            let Some(path) = resolve_project_asset_path(root, asset_key) else {
                if should_attempt(&mut self.attempted, key, FileStamp::default()) {
                    failures.push(MeshLoadFailure {
                        key: key.to_owned(),
                        path: root.to_owned(),
                        error: "mesh path must be project-relative without '..'".into(),
                    });
                }
                continue;
            };
            if let Some((asset, _, _, _)) = pose {
                if !checks.prepared.contains(asset) && checked_poses.insert(asset) && !checks.validate_cached_source(asset, &path, self.poses.get(asset), &mut self.profile) {
                    self.poses.remove(asset);
                    forget_pose_attempts(&mut self.attempted, &self.billboard_views, asset);
                }
            }
            let stamp = checks.stamp(asset_key, &path, &mut self.profile);
            if !should_attempt(&mut self.attempted, key, stamp) { continue; }
            let mesh = if let Some((asset, clip, frame, rate)) = pose {
                if self.poses.get(asset).is_none_or(|(old, _)| *old != stamp) {
                    match load_pose_source(&path, root, &mut self.profile) {
                        Ok(source) => { self.poses.insert(asset.to_owned(), (stamp, source)); }
                        Err(error) => { discard_failed_mesh(renderer, key, &mut self.pose_usage, &mut self.pose_bytes); failures.push(MeshLoadFailure { key:key.into(), path, error:error.to_string() }); continue; }
                    }
                }
                { let started = Instant::now(); let mesh = self.poses[asset].1.sample_with_camera(clip, frame, rate, billboard.map(|(_,camera)| *camera)); self.profile.geometry_ms += started.elapsed().as_secs_f64()*1000.0; self.profile.geometry_builds += 1; mesh }
            } else { let started = Instant::now(); let mesh = load_gltf_mesh_data(&path); self.profile.source_load_ms += started.elapsed().as_secs_f64()*1000.0; self.profile.source_loads += 1; mesh };
            match mesh {
                Ok(mesh) => { profile_upload(renderer, key, &mesh, &mut self.profile); record_mesh_bytes(&mut self.pose_usage, &mut self.pose_bytes, key, &mesh); self.uploads += 1; },
                Err(error) => { discard_failed_mesh(renderer, key, &mut self.pose_usage, &mut self.pose_bytes); failures.push(MeshLoadFailure {
                    key: key.to_owned(),
                    path,
                    error: error.to_string(),
                }); },
            }
        }
        let pruned = self.prune_poses(); self.evictions = pruned.len();
        for key in pruned { renderer.remove_mesh(&key); }
        if self.evictions > 0 && (!self.poses.is_empty() || !self.patches.is_empty()) {
            // Resolve retained sources once across cached poses, terrain and camera-specific meshes.
            let mut pose_assets = HashSet::new(); let mut patch_assets = HashSet::new();
            for key in self.pose_usage.keys() {
                let source = self.billboard_views.get(key).map_or(key.as_str(),|(source,_)| source.as_str());
                if let Some((asset,_,_,_)) = parse_gltf_pose_sample(source) { pose_assets.insert(asset); }
                if let Some((asset,_)) = parse_mesh_patch_key(key) { patch_assets.insert(asset); }
            }
            self.poses.retain(|asset, _| pose_assets.contains(asset.as_str()));
            self.patches.retain(|asset, _| patch_assets.contains(asset.as_str()));
        }
        failures
    }
}
