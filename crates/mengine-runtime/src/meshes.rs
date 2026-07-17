use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_gltf_mesh_data, MeshData};
use mengine_rhi::{RenderObject, Renderer, Vertex};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

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
}

impl RuntimeMeshCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            attempted: HashMap::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.attempted.clear();
    }

    pub fn invalidate(&mut self, key: &str) {
        self.attempted.remove(key.trim());
    }

    pub fn sync(
        &mut self,
        renderer: &mut Renderer,
        objects: &[RenderObject],
    ) -> Vec<MeshLoadFailure> {
        let Some(root) = self.project_root.as_deref() else {
            return Vec::new();
        };
        let mut failures = Vec::new();
        let mut frame_keys = HashSet::new();
        for object in objects {
            let key = object.mesh_key.trim();
            let lower = key.to_ascii_lowercase();
            if !lower.ends_with(".gltf") && !lower.ends_with(".glb") {
                continue;
            }
            if !frame_keys.insert(key.to_owned()) {
                continue;
            }
            let Some(path) = resolve_project_asset_path(root, key) else {
                if should_attempt(&mut self.attempted, key, FileStamp::default()) {
                    failures.push(MeshLoadFailure {
                        key: key.to_owned(),
                        path: root.to_owned(),
                        error: "mesh path must be project-relative without '..'".into(),
                    });
                }
                continue;
            };
            if !should_attempt(&mut self.attempted, key, file_stamp(&path)) {
                continue;
            }
            match load_gltf_mesh_data(&path) {
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
