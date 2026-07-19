use mengine_core::handle::AssetId;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use crate::ensure_asset_sidecar;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AssetMeta {
    pub id: AssetId,
    pub path: PathBuf,
    pub kind: String,
    pub imported: Option<PathBuf>,
}

#[derive(Default)]
pub struct AssetRegistry {
    by_path: HashMap<PathBuf, AssetId>,
    meta: HashMap<AssetId, AssetMeta>,
    revisions: HashMap<AssetId, Option<(SystemTime, u64)>>,
    root: PathBuf,
}

impl AssetRegistry {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            by_path: HashMap::new(),
            meta: HashMap::new(),
            revisions: HashMap::new(),
            root: root.into(),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn insert(&mut self, path: PathBuf, kind: &str, id: AssetId) -> Result<AssetId, String> {
        if let Some(id) = self.by_path.get(&path) {
            return Ok(*id);
        }
        if let Some(existing) = self.meta.get(&id) {
            return Err(format!(
                "asset GUID {} is already registered by {}",
                id.0,
                existing.path.display()
            ));
        }
        self.by_path.insert(path.clone(), id);
        let absolute = if path.is_absolute() {
            path.clone()
        } else {
            self.root.join(&path)
        };
        let revision = std::fs::metadata(absolute)
            .ok()
            .filter(|metadata| metadata.is_file())
            .map(|metadata| {
                (
                    metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                    metadata.len(),
                )
            });
        self.revisions.insert(id, revision);
        self.meta.insert(
            id,
            AssetMeta {
                id,
                path,
                kind: kind.into(),
                imported: None,
            },
        );
        Ok(id)
    }

    /// Registers a disk asset using the GUID persisted in its sibling `.meta`
    /// file. Relative paths are resolved from the registry root.
    pub fn register_persisted(&mut self, path: PathBuf, kind: &str) -> Result<AssetId, String> {
        if let Some(id) = self.by_path.get(&path) {
            return Ok(*id);
        }
        let absolute = if path.is_absolute() {
            path.clone()
        } else {
            self.root.join(&path)
        };
        let id = ensure_asset_sidecar(&absolute, kind)?.guid;
        self.insert(path, kind, id)
    }

    /// Backward-compatible transient registration for virtual or generated
    /// assets. Disk assets must use `register_persisted` so metadata errors are
    /// returned instead of being hidden behind a random fallback GUID.
    pub fn register(&mut self, path: PathBuf, kind: &str) -> AssetId {
        self.insert(path, kind, AssetId::new())
            .expect("new transient asset GUID must be unique")
    }

    pub fn get(&self, id: AssetId) -> Option<&AssetMeta> {
        self.meta.get(&id)
    }

    pub fn id_for(&self, path: &Path) -> Option<AssetId> {
        self.by_path.get(path).copied()
    }

    /// Returns only assets whose file revision changed since the previous scan,
    /// including a file that was deleted. Each revision is reported once.
    pub fn scan_hot_reload(&mut self) -> Vec<AssetId> {
        let mut dirty = Vec::new();
        for (id, meta) in &self.meta {
            let absolute = if meta.path.is_absolute() {
                meta.path.clone()
            } else {
                self.root.join(&meta.path)
            };
            let revision = std::fs::metadata(absolute)
                .ok()
                .filter(|metadata| metadata.is_file())
                .map(|metadata| {
                    (
                        metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                        metadata.len(),
                    )
                });
            if self.revisions.get(id).cloned().unwrap_or(None) != revision {
                dirty.push(*id);
                self.revisions.insert(*id, revision);
            }
        }
        dirty
    }

    pub fn shared(root: impl Into<PathBuf>) -> Arc<RwLock<Self>> {
        Arc::new(RwLock::new(Self::new(root)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn persisted_registration_survives_registry_recreation() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-registry-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        std::fs::write(root.join("Assets/Hero.mmat"), b"{}").unwrap();
        let relative = PathBuf::from("Assets/Hero.mmat");

        let first = AssetRegistry::new(&root)
            .register_persisted(relative.clone(), "material")
            .unwrap();
        let second = AssetRegistry::new(&root)
            .register_persisted(relative, "material")
            .unwrap();
        assert_eq!(first, second);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicate_persisted_guids_are_rejected() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-registry-duplicate-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        for name in ["A.mmat", "B.mmat"] {
            std::fs::write(root.join("Assets").join(name), b"{}").unwrap();
            std::fs::write(
                root.join("Assets").join(format!("{name}.meta")),
                br#"{"schemaVersion":1,"guid":"bf914747-8c6a-418f-b74f-49d49114f9a2"}"#,
            )
            .unwrap();
        }
        let mut registry = AssetRegistry::new(&root);
        registry
            .register_persisted(PathBuf::from("Assets/A.mmat"), "material")
            .unwrap();
        assert!(registry
            .register_persisted(PathBuf::from("Assets/B.mmat"), "material")
            .unwrap_err()
            .contains("already registered"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hot_reload_reports_each_modified_or_deleted_revision_once() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-registry-reload-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        let asset = root.join("Assets/Hero.mmat");
        std::fs::write(&asset, b"{}").unwrap();
        let mut registry = AssetRegistry::new(&root);
        let id = registry
            .register_persisted(PathBuf::from("Assets/Hero.mmat"), "material")
            .unwrap();
        assert!(registry.scan_hot_reload().is_empty());

        std::fs::write(&asset, b"{\"roughness\":0.5}").unwrap();
        assert_eq!(registry.scan_hot_reload(), vec![id]);
        assert!(registry.scan_hot_reload().is_empty());
        std::fs::remove_file(&asset).unwrap();
        assert_eq!(registry.scan_hot_reload(), vec![id]);
        assert!(registry.scan_hot_reload().is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
