// Author: MiYu. Measure source loading, geometry generation and GPU mesh uploads.
use crate::textures::resolve_project_asset_path;
use crate::frame_compiler::CompiledFrame;
use glam::{Vec3, Vec4};
use mengine_assets::{load_gltf_mesh_data, terrain_mesh, parse_gltf_pose_sample, parse_mesh_patch_key, GltfBillboardCamera, GltfPoseSource, SharedGltfPoseSource, AssetError, MeshData, MeshPatchSource};
use mengine_rhi::{FrameCamera, RenderObject, Renderer, Vertex};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};
use std::sync::Arc;
#[path = "mesh_source_poll.rs"]
mod source_poll;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MeshLoadFailure {
    pub key: String,
    pub path: PathBuf,
    pub error: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct FileStamp {
    modified: Option<SystemTime>,
    length: Option<u64>,
}

// MiYu: retain animation cycles by logical GPU bytes, with an entry guard for tiny/failed meshes.
const POSE_CACHE_BYTES: usize = 64 * 1024 * 1024;
const POSE_CACHE_ENTRIES: usize = 8192;
#[derive(Clone, Copy, Debug, Default)]
struct PoseUsage { frame: u64, bytes: usize }

#[derive(Clone, Copy, Debug, Default)]
pub struct MeshCacheStats { pub entries: usize, pub bytes: usize, pub uploads: usize, pub evictions: usize }

#[derive(Clone, Copy, Debug, Default)]
pub struct MeshSyncProfile { pub file_check_ms: f64, pub file_checks: u32, pub source_check_ms: f64, pub source_checks: u32, pub source_load_ms: f64, pub source_loads: u32, pub source_reuse_ms: f64, pub source_reuses: u32, pub geometry_ms: f64, pub geometry_builds: u32, pub upload_ms: f64, pub uploads: u32, pub vertex_conversion_ms: f64, pub vertex_buffer_ms: f64, pub index_buffer_ms: f64, pub bounds_ms: f64, pub index_buffer_reuses: usize, pub vertex_buffer_reuses: usize }


// One validation snapshot per sync call, shared by its main camera and embedded views.
#[derive(Default)]
struct FrameSourceChecks { stamps: HashMap<String, FileStamp>, prepared: HashSet<String> }
impl FrameSourceChecks {
    fn stamp(&mut self, asset: &str, path: &Path, profile: &mut MeshSyncProfile) -> FileStamp { *self.stamps.entry(asset.into()).or_insert_with(|| profile_file_stamp(path, profile)) }
    // Source validation supplies the main-file stamp belonging to the loaded version, including load-time races.
    fn validate_cached_source(&mut self, asset: &str, path: &Path, cached: Option<&(FileStamp, CachedPoseSource)>, profile: &mut MeshSyncProfile) -> bool {
        let Some((_, source)) = cached else { return false; };
        let Some(stamp) = profile_source_stamp(source, path, profile) else { return false; };
        self.stamps.insert(asset.into(), stamp); true
    }
}

// Validated sources are shared; legacy render-only loads never enter the script source pool.
enum CachedPoseSource { Shared(Arc<SharedGltfPoseSource>), Legacy { source: GltfPoseSource, dependencies: Vec<(PathBuf, FileStamp)> } }
impl std::ops::Deref for CachedPoseSource {
    type Target = GltfPoseSource;
    fn deref(&self) -> &Self::Target { match self { Self::Shared(source) => source, Self::Legacy { source, .. } => source } }
}
impl CachedPoseSource { fn validate_at(&self, path: &Path) -> Option<FileStamp> { match self { Self::Shared(source) => source.validate_at(path).map(|(modified, length)| FileStamp { modified: Some(modified), length: Some(length) }), Self::Legacy { dependencies, .. } => { let (main, stamp) = dependencies.first()?; (main == path && dependencies.iter().all(|(path, stamp)| file_stamp(path) == *stamp)).then_some(*stamp) } } } }
fn profile_source_stamp(source: &CachedPoseSource, path: &Path, profile: &mut MeshSyncProfile) -> Option<FileStamp> {
    let started = Instant::now(); let stamp = source.validate_at(path);
    profile.source_check_ms += started.elapsed().as_secs_f64()*1000.; profile.source_checks += 1; stamp
}
fn load_render_only_source(path: &Path) -> Result<CachedPoseSource, AssetError> {
    let dependency_paths = GltfPoseSource::load(path)?.dependency_paths(path);
    let dependencies: Vec<_> = dependency_paths.into_iter().map(|path| { let stamp = file_stamp(&path); (path, stamp) }).collect();
    let source = GltfPoseSource::load(path)?;
    if source.dependency_paths(path).iter().ne(dependencies.iter().map(|(path, _)| path)) || !dependencies.iter().all(|(path, stamp)| file_stamp(path) == *stamp) { return Err(AssetError::Gltf("pose dependencies changed while loading".into())); }
    Ok(CachedPoseSource::Legacy { source, dependencies })
}
fn load_pose_source(path: &Path, root: &Path, profile: &mut MeshSyncProfile) -> Result<CachedPoseSource, AssetError> {
    let started = Instant::now();
    let loaded = SharedGltfPoseSource::load(path, root);
    if loaded.as_ref().is_ok_and(|load| load.reused) {
        profile.source_reuse_ms += started.elapsed().as_secs_f64()*1000.; profile.source_reuses += 1;
        return loaded.map(|load| CachedPoseSource::Shared(load.source));
    }
    let result = match loaded { Ok(load) => Ok(CachedPoseSource::Shared(load.source)), Err(_) => load_render_only_source(path) };
    profile.source_load_ms += started.elapsed().as_secs_f64()*1000.; profile.source_loads += 1;
    result
}
fn forget_pose_attempts(attempted: &mut HashMap<String, FileStamp>, views: &HashMap<String, (String, GltfBillboardCamera)>, asset: &str) {
    attempted.retain(|key, _| parse_gltf_pose_sample(views.get(key).map_or(key.as_str(), |(source, _)| source)).is_none_or(|pose| pose.0 != asset));
}
fn discard_failed_mesh(renderer: &mut Renderer, key: &str, usage: &mut HashMap<String, PoseUsage>, bytes: &mut usize) {
    renderer.remove_mesh(key);
    if let Some(entry) = usage.get_mut(key) { *bytes -= entry.bytes; entry.bytes = 0; }
}

#[derive(Default)]
pub struct RuntimeMeshCache {
    #[cfg(test)]
    sequential_source_checks: bool,
    project_root: Option<PathBuf>,
    attempted: HashMap<String, FileStamp>,
    last_poll: Option<Instant>,
    poses: HashMap<String, (FileStamp, CachedPoseSource)>,
    patches: HashMap<String, (FileStamp, MeshPatchSource)>,
    pose_usage: HashMap<String, PoseUsage>,
    pose_bytes: usize,
    uploads: usize,
    profile: MeshSyncProfile,
    evictions: usize,
    frame: u64,
    evicted: Vec<String>,
    billboard_views: HashMap<String, (String, GltfBillboardCamera)>,
}

impl RuntimeMeshCache {
    /// Reupload through the same validated sources after enabling CPU geometry retention.
    pub fn invalidate_uploaded_geometry(&mut self) { self.attempted.clear(); }

    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            #[cfg(test)]
            sequential_source_checks: false,
            project_root,
            attempted: HashMap::new(),
            last_poll: None,
            poses: HashMap::new(),
            patches: HashMap::new(),
            pose_usage: HashMap::new(),
            pose_bytes: 0,
            uploads: 0,
            profile: MeshSyncProfile::default(),
            evictions: 0,
            frame: 0,
            evicted: Vec::new(),
            billboard_views: HashMap::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.attempted.clear();
        self.last_poll = None;
        self.poses.clear();
        self.patches.clear();
        self.evicted.extend(self.pose_usage.keys().cloned());
        self.pose_usage.clear();
        self.pose_bytes = 0;
        self.billboard_views.clear();
    }

    pub fn invalidate(&mut self, key: &str) {
        let patch = parse_mesh_patch_key(key).map(|p| p.0).unwrap_or(key);
        self.patches.remove(patch);
        self.attempted.retain(|k, _| parse_mesh_patch_key(k).is_none_or(|p| p.0 != patch));
        self.attempted.remove(key.trim());
        self.poses.remove(key.split('#').next().unwrap_or(key).trim());
        let asset = key.split('#').next().unwrap_or(key).trim();
        self.attempted.retain(|k, _| parse_gltf_pose_sample(k).is_none_or(|p| p.0 != asset));
        let keys = self.billboard_views.iter().filter(|(_, (source, _))| parse_gltf_pose_sample(source).is_some_and(|p| p.0 == asset)).map(|(k,_)| k.clone()).collect::<Vec<_>>();
        for key in keys { self.billboard_views.remove(&key);self.attempted.remove(&key);if let Some(used)=self.pose_usage.remove(&key) {self.pose_bytes-=used.bytes;}self.evicted.push(key); }
    }

    pub fn stats(&self) -> MeshCacheStats { MeshCacheStats { entries:self.pose_usage.len(), bytes:self.pose_bytes, uploads:self.uploads, evictions:self.evictions } }

    pub fn sync_profile(&self) -> MeshSyncProfile { self.profile }

    fn prune_poses(&mut self) -> Vec<String> {
        if self.pose_usage.len() <= POSE_CACHE_ENTRIES && self.pose_bytes <= POSE_CACHE_BYTES { return Vec::new(); }
        let mut stale = self.pose_usage.iter().filter(|(_, used)| used.frame != self.frame).map(|(key, used)| (key.clone(), used.frame)).collect::<Vec<_>>();
        stale.sort_by_key(|(_, frame)| *frame);
        let mut removed = Vec::new();
        for (key, _) in stale {
            if self.pose_usage.len() <= POSE_CACHE_ENTRIES && self.pose_bytes <= POSE_CACHE_BYTES { break; }
            self.pose_bytes -= self.pose_usage.remove(&key).unwrap().bytes;
            self.attempted.remove(&key); self.billboard_views.remove(&key); removed.push(key);
        }
        removed
    }

    /// MiYu: billboard nodes are sampled separately for the game, editor and each portrait camera.
    pub fn sync_frame(&mut self, renderer: &mut Renderer, frame: &mut CompiledFrame) -> Vec<MeshLoadFailure> {
        self.profile = MeshSyncProfile::default();
        let mut checks = FrameSourceChecks::default();
        self.validate_polled_sources(frame.objects.iter().chain(frame.scene_views.iter().flat_map(|view| &view.objects)), &mut checks);
        self.prepare_billboards(frame.camera,&mut frame.objects,&mut checks);
        for view in &mut frame.scene_views { self.prepare_billboards(view.camera,&mut view.objects,&mut checks); }
        self.sync_objects(renderer,frame.objects.iter().chain(frame.scene_views.iter().flat_map(|v| &v.objects)), &mut checks)
    }

    fn prepare_billboards(&mut self, camera: FrameCamera, objects: &mut [RenderObject], checks: &mut FrameSourceChecks) {
        let Some(root) = self.project_root.clone() else { return; };
        let poll = self.last_poll.is_none_or(|last| last.elapsed() >= Duration::from_millis(250));
        // Borrow unchanged ordinary keys; apply camera-specific replacements after the scan.
        let mut checked_assets = HashMap::new(); let mut ordinary_keys = HashSet::new(); let mut replacements = Vec::new();
        for (index, object) in objects.iter().enumerate() {
            let key = object.mesh_key.trim();
            if ordinary_keys.contains(key) { continue; }
            if !self.prepare_billboard_source(&root, key, poll, &mut checked_assets, checks) { ordinary_keys.insert(key); continue; }
            let Some(view) = billboard_camera(camera,object) else { continue; };
            let rendered = billboard_key(key,view);
            self.billboard_views.entry(rendered.clone()).or_insert_with(|| (key.into(),view));
            replacements.push((index, rendered));
        }
        for (index, key) in replacements { objects[index].mesh_key = key; }
    }

    fn prepare_billboard_source(&mut self, root: &Path, key: &str, poll: bool, checked_assets: &mut HashMap<String, bool>, checks: &mut FrameSourceChecks) -> bool {
        let Some((asset,_,_,_)) = parse_gltf_pose_sample(key) else { return false; };
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
            if !ready { return false; }
        }
        self.poses[asset].1.has_mesh_billboards()
    }

    pub fn sync(
        &mut self,
        renderer: &mut Renderer,
        objects: &[RenderObject],
    ) -> Vec<MeshLoadFailure> {
        self.profile = MeshSyncProfile::default();
        let mut checks = FrameSourceChecks::default();
        self.validate_polled_sources(objects.iter(), &mut checks);
        self.sync_objects(renderer,objects.iter(), &mut checks)
    }

    fn sync_objects<'a>(&mut self, renderer: &mut Renderer, objects: impl IntoIterator<Item = &'a RenderObject>, checks: &mut FrameSourceChecks) -> Vec<MeshLoadFailure> {
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
            if object.material.particle.is_some() { continue; }
            let key = object.mesh_key.trim();
            // Main and embedded views share GPU keys; parse and touch usage once per frame.
            if !frame_keys.insert(key) { continue; }
            if key.starts_with("meshpatch:") {
                if let Some(used) = self.pose_usage.get_mut(key) { used.frame = self.frame; } else { self.pose_usage.insert(key.into(), PoseUsage { frame:self.frame, bytes:0 }); }
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

fn record_mesh_bytes(usage: &mut HashMap<String, PoseUsage>, total: &mut usize, key: &str, mesh: &MeshData) {
    if let Some(used) = usage.get_mut(key) {
        *total -= used.bytes;
        used.bytes = mesh.positions.len() * std::mem::size_of::<Vertex>() + mesh.indices.len() * std::mem::size_of::<u32>();
        *total += used.bytes;
    }
}

fn billboard_camera(camera: FrameCamera, object: &RenderObject) -> Option<GltfBillboardCamera> {
    let mut model = object.model;model.w_axis=Vec4::W;
    let view = camera.view.inverse();
    let camera = GltfBillboardCamera { model, look:view.transform_vector3(-Vec3::Z).normalize_or_zero(), up:view.transform_vector3(Vec3::Y).normalize_or_zero() };
    (model.is_finite() && model.determinant().abs() >= 1e-12 && camera.look.is_finite() && camera.up.is_finite()).then_some(camera)
}

fn billboard_key(source: &str, camera: GltfBillboardCamera) -> String {
    let mut hash = std::collections::hash_map::DefaultHasher::new();source.hash(&mut hash);
    for value in camera.model.to_cols_array().into_iter().chain(camera.look.to_array()).chain(camera.up.to_array()) { (if value == 0.0 { 0 } else { value.to_bits() }).hash(&mut hash); }
    format!("billboard:{:016x}:{source}",hash.finish())
}

/// MiYu: resolve the authored asset behind an internal camera-specific GPU mesh key.
pub fn source_mesh_reference(key: &str) -> &str {
    key.strip_prefix("billboard:").and_then(|s| s.split_once(':')).filter(|(hash,_)| hash.len()==16 && hash.bytes().all(|b| b.is_ascii_hexdigit())).map_or(key,|(_,source)| source)
}

fn vertices_from_mesh(mesh: &MeshData) -> Vec<Vertex> {
    mesh.positions
        .iter()
        .enumerate()
        .map(|(index, position)| Vertex {
            position: *position,
            normal: mesh.normals.get(index).copied().unwrap_or([0.0, 1.0, 0.0]),
            uv: mesh.uvs.get(index).copied().unwrap_or([0.0, 0.0]),
        })
        .collect()
}

fn profile_file_stamp(path: &Path, profile: &mut MeshSyncProfile) -> FileStamp {
    let started = Instant::now(); let stamp = file_stamp(path);
    profile.file_check_ms += started.elapsed().as_secs_f64()*1000.0; profile.file_checks += 1; stamp
}

fn profile_upload(renderer: &mut Renderer, key: &str, mesh: &MeshData, profile: &mut MeshSyncProfile) {
    let started = Instant::now(); let vertices = vertices_from_mesh(mesh);
    profile.vertex_conversion_ms += started.elapsed().as_secs_f64()*1000.0;
    let upload = renderer.upload_gltf_static_profiled(key, &vertices, &mesh.indices);
    profile.vertex_buffer_ms += upload.vertex_buffer_ms; profile.index_buffer_ms += upload.index_buffer_ms; profile.bounds_ms += upload.bounds_ms;
    profile.index_buffer_reuses += usize::from(upload.index_buffer_reused);
    profile.vertex_buffer_reuses += usize::from(upload.vertex_buffer_reused);
    drop(vertices);
    profile.upload_ms += started.elapsed().as_secs_f64()*1000.0; profile.uploads += 1;
}

fn file_stamp(path: &Path) -> FileStamp {
    match std::fs::metadata(path) {
        Ok(metadata) => FileStamp {
            modified: metadata.modified().ok(),
            length: Some(metadata.len()),
        },
        Err(_) => FileStamp::default(),
    }
}

fn should_attempt(cache: &mut HashMap<String, FileStamp>, key: &str, stamp: FileStamp) -> bool {
    if cache.get(key) == Some(&stamp) {
        return false;
    }
    cache.insert(key.to_owned(), stamp);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pose_byte_accounting_replaces_uploaded_geometry_without_counting_static_keys() {
        let mut usage = HashMap::from([("pose".into(), PoseUsage::default())]); let mut total = 0;
        let mut mesh = MeshData { positions:vec![[0.0;3];3], normals:vec![], uvs:vec![], indices:vec![0,1,2] };
        record_mesh_bytes(&mut usage, &mut total, "pose", &mesh);
        assert_eq!(total, 3*std::mem::size_of::<Vertex>()+12);
        record_mesh_bytes(&mut usage, &mut total, "static", &mesh); assert_eq!(usage.len(),1);
        mesh.positions.push([0.0;3]); record_mesh_bytes(&mut usage, &mut total, "pose", &mesh);
        assert_eq!(total, 4*std::mem::size_of::<Vertex>()+12); assert_eq!(total,usage["pose"].bytes);
    }

    #[test]
    fn byte_budget_evicts_only_unused_meshes_and_keeps_an_oversized_active_frame() {
        let mut cache = RuntimeMeshCache::new(None); cache.frame=2;
        cache.pose_usage.insert("old".into(),PoseUsage { frame:1,bytes:POSE_CACHE_BYTES });
        cache.pose_usage.insert("active".into(),PoseUsage { frame:2,bytes:POSE_CACHE_BYTES+1 });
        cache.pose_bytes=2*POSE_CACHE_BYTES+1; cache.attempted.insert("old".into(),FileStamp::default());
        assert_eq!(cache.prune_poses(),vec!["old"]); assert!(!cache.attempted.contains_key("old"));
        assert_eq!(cache.stats().entries,1); assert_eq!(cache.stats().bytes,POSE_CACHE_BYTES+1);
        assert!(cache.prune_poses().is_empty());
        cache.frame=3; assert_eq!(cache.prune_poses(),vec!["active"]); assert_eq!(cache.pose_bytes,0);
    }

    #[test]
    fn ordinary_invalidation_keeps_resident_bytes_until_replacement_or_project_change() {
        let mut cache = RuntimeMeshCache::new(Some("project".into()));
        for key in ["a.glb#pose=0:0@30","meshpatch:Assets/a.mpatch#00080"] {
            cache.pose_usage.insert(key.into(),PoseUsage { frame:1,bytes:128 }); cache.pose_bytes+=128;
            cache.attempted.insert(key.into(),FileStamp::default());
        }
        cache.invalidate("a.glb"); cache.invalidate("Assets/a.mpatch");
        assert!(cache.attempted.is_empty()); assert_eq!(cache.stats().bytes,256);
        cache.set_project_root(None); assert_eq!(cache.stats().bytes,0); assert_eq!(cache.stats().entries,0); assert_eq!(cache.evicted.len(),2);
    }

    #[test]
    fn billboard_views_share_translated_actors_but_separate_camera_rotation_and_scale() {
        let camera=FrameCamera { view:glam::Mat4::look_at_rh(Vec3::new(0.0,3.0,4.0),Vec3::ZERO,Vec3::Y),proj:glam::Mat4::IDENTITY,position:Vec3::new(0.0,3.0,4.0) };
        let mut object=RenderObject { mesh_key:"a.glb#pose=0:1@30".into(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false };
        let key=billboard_key(&object.mesh_key,billboard_camera(camera,&object).unwrap());
        assert_eq!(source_mesh_reference(&key),object.mesh_key);
        object.model.w_axis=Vec3::new(8.0,0.0,3.0).extend(1.0);assert_eq!(key,billboard_key(&object.mesh_key,billboard_camera(camera,&object).unwrap()));
        object.model=glam::Mat4::from_rotation_y(0.8);assert_ne!(key,billboard_key(&object.mesh_key,billboard_camera(camera,&object).unwrap()));
        object.model=glam::Mat4::from_scale(Vec3::new(1.0,2.0,3.0));assert_ne!(key,billboard_key(&object.mesh_key,billboard_camera(camera,&object).unwrap()));
        object.model=glam::Mat4::IDENTITY;let mut portrait=camera;portrait.view=glam::Mat4::look_at_rh(Vec3::new(4.0,0.0,0.0),Vec3::ZERO,Vec3::Y);assert_ne!(key,billboard_key(&object.mesh_key,billboard_camera(portrait,&object).unwrap()));
        object.model=glam::Mat4::from_scale(Vec3::ZERO);assert!(billboard_camera(camera,&object).is_none());
    }
    #[test]
    fn changed_billboard_assets_invalidate_every_camera_and_keep_other_models() {
        let mut cache=RuntimeMeshCache::new(None);
        let camera=GltfBillboardCamera { model:glam::Mat4::IDENTITY,look:-Vec3::Z,up:Vec3::Y };
        for (key,source) in [("billboard:0000000000000001:a.glb#pose=0:1@30","a.glb#pose=0:1@30"),("billboard:0000000000000002:a.glb#pose=0:1@30","a.glb#pose=0:1@30"),("billboard:0000000000000003:b.glb#pose=0:1@30","b.glb#pose=0:1@30")] { cache.billboard_views.insert(key.into(),(source.into(),camera));cache.attempted.insert(key.into(),FileStamp::default());cache.pose_usage.insert(key.into(),PoseUsage { frame:1, bytes:64 });cache.pose_bytes+=64; }
        cache.invalidate("a.glb");assert_eq!(cache.pose_bytes,64);assert_eq!(cache.billboard_views.len(),1);assert_eq!(cache.attempted.len(),1);assert_eq!(cache.pose_usage.len(),1);assert_eq!(cache.evicted.len(),2);
    }

    #[test]
    fn invalidation_removes_every_sampling_rate_for_the_changed_asset() {
        let mut cache = RuntimeMeshCache::new(None);
        for key in ["a.glb", "a.glb#pose=0:4", "a.glb#pose=0:10@30", "a.glb#pose=1:20@60", "b.glb#pose=0:10@30"] { cache.attempted.insert(key.into(), FileStamp::default()); }
        cache.invalidate("a.glb");
        assert_eq!(cache.attempted.keys().cloned().collect::<Vec<_>>(), vec!["b.glb#pose=0:10@30"]);
    }

    #[test]
    fn patch_invalidation_removes_all_placements_for_the_changed_source() {
        let mut cache = RuntimeMeshCache::new(None);
        for key in ["meshpatch:Assets/a.mpatch#00080", "meshpatch:Assets/a.mpatch#fff80", "meshpatch:Assets/b.mpatch#00080"] { cache.attempted.insert(key.into(), FileStamp::default()); }
        cache.invalidate("Assets/a.mpatch");
        assert_eq!(cache.attempted.keys().cloned().collect::<Vec<_>>(), vec!["meshpatch:Assets/b.mpatch#00080"]);
    }

    pub(super) struct PoseFixture(pub(super) PathBuf);
    impl PoseFixture {
        pub(super) fn new() -> Self {
            let root=std::env::temp_dir().join(format!("mengine-shared-mesh-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&root).unwrap();
            let doc=serde_json::json!({"asset":{"version":"2.0"},"buffers":[{"uri":"pose.bin","byteLength":36}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36}],"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[-1,-1,0],"max":[1,1,0]}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"animations":[{"samplers":[],"channels":[]}]});
            std::fs::write(root.join("pose.gltf"),doc.to_string()).unwrap();let fixture=Self(root);fixture.buffer(0.,false);fixture
        }
        pub(super) fn buffer(&self, offset: f32, padding: bool) {
            let mut values=vec![-1.+offset,-1.,0.,1.+offset,-1.,0.,offset,1.,0.];if padding {values.push(0.);}
            std::fs::write(self.0.join("pose.bin"),values.iter().flat_map(|value|value.to_le_bytes()).collect::<Vec<_>>()).unwrap();
        }
    }
    impl Drop for PoseFixture {fn drop(&mut self) {let _=std::fs::remove_dir_all(&self.0);}}

    #[test]
    fn shared_views_refresh_gpu_poses_when_only_a_buffer_changes_and_recover_after_removal() {
        let fixture=PoseFixture::new();let path=fixture.0.join("pose.gltf");let original_stamp=file_stamp(&path);
        let mut renderer=pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).unwrap();
        let object=|key: &str| RenderObject {mesh_key:key.into(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false};
        let mut first=RuntimeMeshCache::new(Some(fixture.0.clone()));let mut second=RuntimeMeshCache::new(Some(fixture.0.clone()));
        let key="pose.gltf#pose=0:0@30";let mut objects=vec![object(key)];
        assert!(first.sync(&mut renderer,&objects).is_empty());assert_eq!(first.sync_profile().source_loads,1);assert!(first.pose_bytes>0);
        assert!(second.sync(&mut renderer,&objects).is_empty());assert_eq!(second.sync_profile().source_reuses,1);assert_eq!(second.sync_profile().source_loads,0);
        let (CachedPoseSource::Shared(a),CachedPoseSource::Shared(b))=(&first.poses["pose.gltf"].1,&second.poses["pose.gltf"].1) else {panic!("views must share validated sources");};assert!(Arc::ptr_eq(a,b));
        fixture.buffer(10.,true);assert_eq!(file_stamp(&path),original_stamp);
        first.last_poll=None;
        let camera=FrameCamera {view:glam::Mat4::IDENTITY,proj:glam::Mat4::IDENTITY,position:Vec3::Z};
        first.prepare_billboards(camera,&mut objects,&mut FrameSourceChecks::default());assert!(!first.attempted.contains_key(key));
        assert!(first.sync(&mut renderer,&objects).is_empty());assert_eq!(first.stats().uploads,1);
        assert_eq!(first.poses["pose.gltf"].1.sample_at_rate(0,0,30).unwrap().positions[0][0],9.);
        second.last_poll=None;assert!(second.sync(&mut renderer,&objects).is_empty());assert_eq!(second.stats().uploads,1);
        assert_eq!(second.sync_profile().source_reuses,1);
        std::fs::remove_file(fixture.0.join("pose.bin")).unwrap();second.last_poll=None;
        assert!(!second.sync(&mut renderer,&objects).is_empty());assert_eq!(second.pose_bytes,0);assert!(!second.poses.contains_key("pose.gltf"));
        fixture.buffer(20.,false);second.last_poll=None;
        assert!(second.sync(&mut renderer,&objects).is_empty());assert_eq!(second.stats().uploads,1);
        assert_eq!(second.poses["pose.gltf"].1.sample_at_rate(0,0,30).unwrap().positions[0][0],19.);
    }

    #[test]
    fn missing_texture_render_fallback_tracks_buffer_changes_and_returns_to_shared_loading() {
        let fixture=PoseFixture::new();let path=fixture.0.join("pose.gltf");
        let mut doc:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();doc["images"]=serde_json::json!([{"uri":"missing.png"}]);std::fs::write(&path,doc.to_string()).unwrap();
        let mut profile=MeshSyncProfile::default();let source=load_pose_source(&path,&fixture.0,&mut profile).unwrap();
        assert!(matches!(&source,CachedPoseSource::Legacy {..}));assert!(source.validate_at(&path).is_some());assert!(SharedGltfPoseSource::load(&path,&fixture.0).is_err());
        fixture.buffer(10.,true);assert!(source.validate_at(&path).is_none());
        let updated=load_pose_source(&path,&fixture.0,&mut profile).unwrap();assert_eq!(updated.sample_at_rate(0,0,30).unwrap().positions[0][0],9.);
        std::fs::write(fixture.0.join("missing.png"),b"texture handled by texture loader").unwrap();assert!(updated.validate_at(&path).is_none());
        assert!(matches!(load_pose_source(&path,&fixture.0,&mut profile).unwrap(),CachedPoseSource::Shared(_)));
    }

    #[test]
    fn multiview_frame_validates_each_source_once_and_recovers_missing_buffers() {
        let fixture=PoseFixture::new();let path=fixture.0.join("pose.gltf");
        let mut doc:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();doc["nodes"][0]["extras"]=serde_json::json!({"mengineBillboard":{"flags":8}});std::fs::write(&path,doc.to_string()).unwrap();
        let stamp=file_stamp(&path);
        let cameras=[0.,0.7,1.4].map(|angle|FrameCamera {view:glam::Mat4::from_rotation_y(angle),proj:glam::Mat4::IDENTITY,position:Vec3::Z});
        let objects=||vec![RenderObject {mesh_key:"pose.gltf#pose=0:0@30".into(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false}];
        let clear=mengine_rhi::ClearColor {r:0.,g:0.,b:0.,a:1.};
        let frame=||CompiledFrame {profile_stages:vec![],clear,camera:cameras[0],objects:objects(),lighting:Default::default(),ui:mengine_rhi::UiBatchPlan::build(vec![]),controls:vec![],texture_failures:vec![],font_failures:vec![],has_authored_camera:true,scene_views:cameras[1..].iter().enumerate().map(|(i,camera)|mengine_rhi::SceneTextureFrame {key:format!("preview{i}"),size:[16,16],clear,camera:*camera,objects:objects(),lighting:Default::default()}).collect(),view_resources:vec![]};
        let mut renderer=pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).unwrap();let mut cache=RuntimeMeshCache::new(Some(fixture.0.clone()));
        let mut initial=frame();assert!(cache.sync_frame(&mut renderer,&mut initial).is_empty());assert_eq!(cache.stats().uploads,3);assert_eq!(cache.sync_profile().file_checks,1);
        let work=cache.sync_profile();let upload_parts=[work.vertex_conversion_ms,work.vertex_buffer_ms,work.index_buffer_ms,work.bounds_ms];
        assert_eq!(work.uploads,3);assert!(upload_parts.iter().all(|ms|ms.is_finite()&&*ms>=0.0));assert!(upload_parts.iter().sum::<f64>()<=work.upload_ms+0.001);
        let keys=initial.objects.iter().chain(initial.scene_views.iter().flat_map(|v|&v.objects)).map(|o|o.mesh_key.clone()).collect::<HashSet<_>>();assert_eq!(keys.len(),3);assert!(keys.iter().all(|key|key.starts_with("billboard:")));
        cache.last_poll=None;assert!(cache.sync_frame(&mut renderer,&mut frame()).is_empty());assert_eq!(cache.stats().uploads,0);assert_eq!(cache.sync_profile().source_checks,1);assert_eq!(cache.sync_profile().file_checks,0);
        fixture.buffer(10.,true);cache.last_poll=None;assert!(cache.sync_frame(&mut renderer,&mut frame()).is_empty());assert_eq!(cache.stats().uploads,3);assert_eq!(cache.sync_profile().source_checks,1);assert_eq!(file_stamp(&path),stamp);
        assert_eq!(cache.poses["pose.gltf"].1.sample_at_rate(0,0,30).unwrap().positions[0][0],9.);
        std::fs::remove_file(fixture.0.join("pose.bin")).unwrap();cache.last_poll=None;
        assert!(!cache.sync_frame(&mut renderer,&mut frame()).is_empty());assert!(keys.iter().all(|key|!cache.attempted.contains_key(key)));assert!(!cache.poses.contains_key("pose.gltf"));
        fixture.buffer(20.,false);assert!(cache.sync_frame(&mut renderer,&mut frame()).is_empty());assert_eq!(cache.stats().uploads,3);assert!(cache.pose_bytes>0);assert_eq!(file_stamp(&path),stamp);
        assert_eq!(cache.poses["pose.gltf"].1.sample_at_rate(0,0,30).unwrap().positions[0][0],19.);
    }

    #[test]
    fn buffer_refresh_invalidates_every_camera_specific_billboard_pose() {
        let fixture=PoseFixture::new();let path=fixture.0.join("pose.gltf");
        let mut doc:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();doc["nodes"][0]["extras"]=serde_json::json!({"mengineBillboard":{"flags":8}});std::fs::write(&path,doc.to_string()).unwrap();
        let mut renderer=pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).unwrap();let mut cache=RuntimeMeshCache::new(Some(fixture.0.clone()));
        let objects=||vec![RenderObject {mesh_key:"pose.gltf#pose=0:0@30".into(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false}];
        let cameras=[glam::Mat4::IDENTITY,glam::Mat4::from_rotation_y(1.)].map(|view|FrameCamera {view,proj:glam::Mat4::IDENTITY,position:Vec3::Z});
        let mut keys=Vec::new();
        for camera in cameras {
            let mut scene=objects();cache.prepare_billboards(camera,&mut scene,&mut FrameSourceChecks::default());assert!(scene[0].mesh_key.starts_with("billboard:"));keys.push(scene[0].mesh_key.clone());
            assert!(cache.sync(&mut renderer,&scene).is_empty());assert_eq!(cache.stats().uploads,1);
        }
        assert_ne!(keys[0],keys[1]);fixture.buffer(2.,true);cache.last_poll=None;
        let mut scene=objects();cache.prepare_billboards(cameras[0],&mut scene,&mut FrameSourceChecks::default());assert!(keys.iter().all(|key|!cache.attempted.contains_key(key)));
        assert!(cache.sync(&mut renderer,&scene).is_empty());assert_eq!(cache.stats().uploads,1);
        let mut scene=objects();cache.prepare_billboards(cameras[1],&mut scene,&mut FrameSourceChecks::default());assert_eq!(scene[0].mesh_key,keys[1]);
        assert!(cache.sync(&mut renderer,&scene).is_empty());assert_eq!(cache.stats().uploads,1);
    }

    #[test]
    fn main_and_nested_views_keep_used_sources_while_evicting_stale_meshes() {
        let root = std::env::temp_dir().join(format!("mengine-mesh-sync-{}",uuid::Uuid::new_v4())); std::fs::create_dir_all(&root).unwrap();
        let source_path = root.join("a.gltf"); std::fs::write(&source_path,r#"{"asset":{"version":"2.0"},"scenes":[{"nodes":[]}]}"#).unwrap();
        let mut renderer = pollster::block_on(Renderer::new_headless(winit::dpi::PhysicalSize::new(16,16))).expect("GPU for mesh cache acceptance");
        let mut cache = RuntimeMeshCache::new(Some(root.clone())); cache.last_poll = Some(Instant::now());
        let stamp = file_stamp(&source_path);
        for asset in ["a.gltf","unused.gltf"] { cache.poses.insert(asset.into(),(stamp,load_render_only_source(&source_path).unwrap())); }
        let pose = "a.gltf#pose=0:1@30"; let billboard = "billboard:0000000000000001:a.gltf#pose=0:2@30";
        let camera = FrameCamera { view:glam::Mat4::IDENTITY,proj:glam::Mat4::IDENTITY,position:Vec3::Z };
        cache.billboard_views.insert(billboard.into(),("a.gltf#pose=0:2@30".into(),GltfBillboardCamera { model:glam::Mat4::IDENTITY,look:-Vec3::Z,up:Vec3::Y }));
        for key in [pose,billboard] { cache.attempted.insert(key.into(),stamp); }
        for id in 0..POSE_CACHE_ENTRIES+44 { let key = format!("terrain4:{id:064x}"); cache.pose_usage.insert(key.clone(),PoseUsage::default()); cache.attempted.insert(key,FileStamp::default()); }
        let preview = format!("terrain4:{:064x}",POSE_CACHE_ENTRIES+45);
        let object = |key: &str| RenderObject { mesh_key:key.into(),model:glam::Mat4::IDENTITY,material:Default::default(),cast_shadows:false,receive_shadows:false };
        let mut frame = CompiledFrame { profile_stages:vec![],clear:mengine_rhi::ClearColor { r:0.0,g:0.0,b:0.0,a:1.0 },camera,objects:vec![object(pose)],lighting:Default::default(),ui:mengine_rhi::UiBatchPlan::build(vec![]),controls:vec![],texture_failures:vec![],font_failures:vec![],has_authored_camera:true,scene_views:vec![mengine_rhi::SceneTextureFrame { key:"preview".into(),size:[16,16],clear:mengine_rhi::ClearColor { r:0.0,g:0.0,b:0.0,a:1.0 },camera,objects:vec![object(billboard),object(&preview)],lighting:Default::default() }],view_resources:vec![] };
        assert!(cache.sync_frame(&mut renderer,&mut frame).is_empty());
        assert_eq!(cache.pose_usage.len(),POSE_CACHE_ENTRIES); assert_eq!(cache.poses.keys().collect::<Vec<_>>(),["a.gltf"]);
        for key in [pose,billboard,&preview] { assert_eq!(cache.pose_usage.get(key).map(|used| used.frame),Some(1)); assert!(cache.attempted.contains_key(key)); }
        assert!(cache.billboard_views.contains_key(billboard));
        assert!(cache.sync_frame(&mut renderer,&mut frame).is_empty());
        for key in [pose,billboard,&preview] { assert_eq!(cache.pose_usage.get(key).map(|used| used.frame),Some(2)); }
        cache.invalidate("a.gltf"); assert!(!cache.poses.contains_key("a.gltf")); assert!(!cache.billboard_views.contains_key(billboard));
        std::fs::remove_file(&source_path).unwrap(); std::fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn converts_imported_channels_to_rhi_vertices() {
        let vertices = vertices_from_mesh(&MeshData {
            positions: vec![[1.0, 2.0, 3.0]],
            normals: vec![[0.0, 0.0, 1.0]],
            uvs: vec![[0.25, 0.75]],
            indices: vec![0],
        });
        assert_eq!(vertices.len(), 1);
        assert_eq!(vertices[0].position, [1.0, 2.0, 3.0]);
        assert_eq!(vertices[0].normal, [0.0, 0.0, 1.0]);
        assert_eq!(vertices[0].uv, [0.25, 0.75]);
    }

    #[test]
    fn retries_only_when_the_model_file_stamp_changes() {
        let mut attempts = HashMap::new();
        let initial = FileStamp {
            modified: None,
            length: Some(10),
        };
        assert!(should_attempt(&mut attempts, "model", initial));
        assert!(!should_attempt(&mut attempts, "model", initial));
        assert!(should_attempt(
            &mut attempts,
            "model",
            FileStamp {
                length: Some(11),
                ..initial
            }
        ));
    }
}

#[cfg(test)]
#[path = "mesh_source_validation_tests.rs"]
mod source_validation_tests;

#[cfg(test)]
#[path = "mesh_sync_dedup_tests.rs"]
mod sync_dedup_tests;

#[cfg(test)]
#[path = "mesh_billboard_prepare_tests.rs"]
mod billboard_prepare_tests;

#[cfg(test)]
#[path = "mesh_parallel_validation_tests.rs"]
mod parallel_validation_tests;
