use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_gltf_mesh_data, terrain_mesh, parse_gltf_pose_sample, parse_mesh_patch_key, GltfPoseSource, MeshData, MeshPatchSource};
use mengine_rhi::{RenderObject, Renderer, Vertex};
use std::collections::{HashMap, HashSet};
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
    }

    pub fn invalidate(&mut self, key: &str) {
        let patch = parse_mesh_patch_key(key).map(|p| p.0).unwrap_or(key);
        self.patches.remove(patch);
        self.attempted.retain(|k, _| parse_mesh_patch_key(k).is_none_or(|p| p.0 != patch));
        self.attempted.remove(key.trim());
        self.poses.remove(key.split('#').next().unwrap_or(key).trim());
        let asset = key.split('#').next().unwrap_or(key).trim();
        self.attempted.retain(|k, _| parse_gltf_pose_sample(k).is_none_or(|p| p.0 != asset));
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
            let pose = parse_gltf_pose_sample(key);
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
                self.poses[asset].1.sample_at_rate(clip, frame, rate)
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
        self.poses.retain(|asset, _| self.pose_usage.keys().any(|key| parse_gltf_pose_sample(key).is_some_and(|p| p.0 == asset)));
        self.patches.retain(|asset, _| self.pose_usage.keys().any(|key| parse_mesh_patch_key(key).is_some_and(|p| p.0 == asset)));
        failures
    }
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
