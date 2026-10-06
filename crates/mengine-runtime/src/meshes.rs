use crate::textures::resolve_project_asset_path;
use crate::frame_compiler::CompiledFrame;
use glam::{Vec3, Vec4};
use mengine_assets::{load_gltf_mesh_data, terrain_mesh, parse_gltf_pose_sample, parse_mesh_patch_key, GltfBillboardCamera, GltfPoseSource, MeshData, MeshPatchSource};
use mengine_rhi::{FrameCamera, RenderObject, Renderer, Vertex};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

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

#[derive(Default)]
pub struct RuntimeMeshCache {
    project_root: Option<PathBuf>,
    attempted: HashMap<String, FileStamp>,
    last_poll: Option<Instant>,
    poses: HashMap<String, (FileStamp, GltfPoseSource)>,
    patches: HashMap<String, (FileStamp, MeshPatchSource)>,
    pose_usage: HashMap<String, u64>,
    frame: u64,
    evicted: Vec<String>,
    billboard_views: HashMap<String, (String, GltfBillboardCamera)>,
}

impl RuntimeMeshCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            attempted: HashMap::new(),
            last_poll: None,
            poses: HashMap::new(),
            patches: HashMap::new(),
            pose_usage: HashMap::new(),
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
        for key in keys { self.billboard_views.remove(&key);self.attempted.remove(&key);self.pose_usage.remove(&key);self.evicted.push(key); }
    }

    /// MiYu: billboard nodes are sampled separately for the game, editor and each portrait camera.
    pub fn sync_frame(&mut self, renderer: &mut Renderer, frame: &mut CompiledFrame) -> Vec<MeshLoadFailure> {
        self.prepare_billboards(frame.camera,&mut frame.objects);
        for view in &mut frame.scene_views { self.prepare_billboards(view.camera,&mut view.objects); }
        let objects = frame.objects.iter().chain(frame.scene_views.iter().flat_map(|v| &v.objects)).cloned().collect::<Vec<_>>();
        self.sync(renderer,&objects)
    }

    fn prepare_billboards(&mut self, camera: FrameCamera, objects: &mut [RenderObject]) {
        let Some(root) = self.project_root.as_deref() else { return; };
        let poll = self.last_poll.is_none_or(|last| last.elapsed() >= Duration::from_millis(250));
        for object in objects {
            let key = object.mesh_key.trim();
            let Some((asset,_,_,_)) = parse_gltf_pose_sample(key) else { continue; };
            if poll || !self.poses.contains_key(asset) {
                let Some(path) = resolve_project_asset_path(root,asset) else { continue; };
                let stamp = file_stamp(&path);
                if self.poses.get(asset).is_none_or(|(old,_)| *old != stamp) {
                    let Ok(source) = GltfPoseSource::load(&path) else { continue; };
                    self.poses.insert(asset.into(),(stamp,source));
                }
            }
            if !self.poses[asset].1.has_mesh_billboards() { continue; }
            let Some(view) = billboard_camera(camera,object) else { continue; };
            let rendered = billboard_key(key,view);
            self.billboard_views.entry(rendered.clone()).or_insert_with(|| (key.into(),view));
            object.mesh_key=rendered;
        }
    }

    pub fn sync(
        &mut self,
        renderer: &mut Renderer,
        objects: &[RenderObject],
    ) -> Vec<MeshLoadFailure> {
        for key in self.evicted.drain(..) { renderer.remove_mesh(&key); }
        self.frame += 1;
        let Some(root) = self.project_root.as_deref() else {
            return Vec::new();
        };
        let mut failures = Vec::new();
        let poll = self.last_poll.is_none_or(|last| last.elapsed() >= Duration::from_millis(250));
        if poll { self.last_poll = Some(Instant::now()); }
        let mut frame_keys = HashSet::new();
        for object in objects {
            let key = object.mesh_key.trim();
            if key.starts_with("meshpatch:") {
                self.pose_usage.insert(key.to_owned(), self.frame);
                if !frame_keys.insert(key.to_owned()) { continue; }
                if !poll && self.attempted.contains_key(key) { continue; }
                let Some((asset, cells)) = parse_mesh_patch_key(key) else {
                    if should_attempt(&mut self.attempted, key, FileStamp::default()) { failures.push(MeshLoadFailure { key:key.into(), path:root.to_owned(), error:"invalid mesh patch key".into() }); }
                    continue;
                };
                let Some(path) = resolve_project_asset_path(root, asset) else {
                    if should_attempt(&mut self.attempted, key, FileStamp::default()) { failures.push(MeshLoadFailure { key:key.into(), path:root.to_owned(), error:"mesh patch path must be project-relative without '..'".into() }); }
                    continue;
                };
                let stamp = file_stamp(&path);
                if !should_attempt(&mut self.attempted, key, stamp) { continue; }
                if self.patches.get(asset).is_none_or(|(old, _)| *old != stamp) {
                    match MeshPatchSource::load(&path) {
                        Ok(source) => { self.patches.insert(asset.to_owned(), (stamp, source)); }
                        Err(error) => { failures.push(MeshLoadFailure { key:key.into(), path, error }); continue; }
                    }
                }
                match self.patches[asset].1.compose(cells) {
                    Ok(mesh) => renderer.upload_gltf_static(key, &vertices_from_mesh(&mesh), &mesh.indices),
                    Err(error) => failures.push(MeshLoadFailure { key:key.into(), path, error }),
                }
                continue;
            }
            if key.starts_with("terrain4:") || key.starts_with("terrain4r:") || key.starts_with("terrain4h:") || key.starts_with("terrain4w:") {
                self.pose_usage.insert(key.to_owned(), self.frame);
                if should_attempt(&mut self.attempted, key, FileStamp::default()) {
                    match terrain_mesh(key) {
                        Ok(mesh) => renderer.upload_gltf_static(key, &vertices_from_mesh(&mesh), &mesh.indices),
                        Err(error) => failures.push(MeshLoadFailure { key:key.into(), path:root.to_owned(), error:error.into() }),
                    }
                }
                continue;
            }
            let billboard = self.billboard_views.get(key);
            let pose = parse_gltf_pose_sample(billboard.map_or(key,|(source,_)| source));
            if pose.is_some() { self.pose_usage.insert(key.to_owned(), self.frame); }
            let asset_key = pose.map(|p| p.0).unwrap_or(key);
            let lower = asset_key.to_ascii_lowercase();
            if !lower.ends_with(".gltf") && !lower.ends_with(".glb") {
                continue;
            }
            if !frame_keys.insert(key.to_owned()) {
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
            let stamp = file_stamp(&path);
            if !should_attempt(&mut self.attempted, key, stamp) {
                continue;
            }
            let mesh = if let Some((asset, clip, frame, rate)) = pose {
                if self.poses.get(asset).is_none_or(|(old, _)| *old != stamp) {
                    match GltfPoseSource::load(&path) {
                        Ok(source) => { self.poses.insert(asset.to_owned(), (stamp, source)); }
                        Err(error) => { failures.push(MeshLoadFailure { key:key.into(), path, error:error.to_string() }); continue; }
                    }
                }
                self.poses[asset].1.sample_with_camera(clip, frame, rate, billboard.map(|(_,camera)| *camera))
            } else { load_gltf_mesh_data(&path) };
            match mesh {
                Ok(mesh) => renderer.upload_gltf_static(
                    key,
                    &vertices_from_mesh(&mesh),
                    mesh.indices.as_slice(),
                ),
                Err(error) => failures.push(MeshLoadFailure {
                    key: key.to_owned(),
                    path,
                    error: error.to_string(),
                }),
            }
        }
        if self.pose_usage.len() > 256 {
            let mut stale = self.pose_usage.iter().filter(|(_, used)| **used != self.frame).map(|(k, v)| (k.clone(), *v)).collect::<Vec<_>>();
            stale.sort_by_key(|(_, used)| *used);
            for (key, _) in stale.into_iter().take(self.pose_usage.len() - 256) { self.pose_usage.remove(&key); self.attempted.remove(&key); renderer.remove_mesh(&key); }
        }
        self.billboard_views.retain(|key,_| self.pose_usage.contains_key(key));
        self.poses.retain(|asset, _| self.pose_usage.keys().any(|key| parse_gltf_pose_sample(self.billboard_views.get(key).map_or(key,|(source,_)| source)).is_some_and(|p| p.0 == asset)));
        self.patches.retain(|asset, _| self.pose_usage.keys().any(|key| parse_mesh_patch_key(key).is_some_and(|p| p.0 == asset)));
        failures
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
        for (key,source) in [("billboard:0000000000000001:a.glb#pose=0:1@30","a.glb#pose=0:1@30"),("billboard:0000000000000002:a.glb#pose=0:1@30","a.glb#pose=0:1@30"),("billboard:0000000000000003:b.glb#pose=0:1@30","b.glb#pose=0:1@30")] { cache.billboard_views.insert(key.into(),(source.into(),camera));cache.attempted.insert(key.into(),FileStamp::default());cache.pose_usage.insert(key.into(),1); }
        cache.invalidate("a.glb");assert_eq!(cache.billboard_views.len(),1);assert_eq!(cache.attempted.len(),1);assert_eq!(cache.pose_usage.len(),1);assert_eq!(cache.evicted.len(),2);
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
