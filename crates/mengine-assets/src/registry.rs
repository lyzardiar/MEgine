use mengine_core::handle::AssetId;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

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
    root: PathBuf,
}

impl AssetRegistry {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            by_path: HashMap::new(),
            meta: HashMap::new(),
            root: root.into(),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn register(&mut self, path: PathBuf, kind: &str) -> AssetId {
        if let Some(id) = self.by_path.get(&path) {
            return *id;
        }
        let id = AssetId::new();
        self.by_path.insert(path.clone(), id);
        self.meta.insert(
            id,
            AssetMeta {
                id,
                path,
                kind: kind.into(),
                imported: None,
            },
        );
        id
    }

    pub fn get(&self, id: AssetId) -> Option<&AssetMeta> {
        self.meta.get(&id)
    }

    pub fn id_for(&self, path: &Path) -> Option<AssetId> {
        self.by_path.get(path).copied()
    }

    /// Hot-reload stub: re-stat and mark dirty (Phase 3).
    pub fn scan_hot_reload(&self) -> Vec<AssetId> {
        let mut dirty = Vec::new();
        for (id, meta) in &self.meta {
            if meta.path.exists() {
                dirty.push(*id);
            }
        }
        dirty
    }

    pub fn shared(root: impl Into<PathBuf>) -> Arc<RwLock<Self>> {
        Arc::new(RwLock::new(Self::new(root)))
    }
}
