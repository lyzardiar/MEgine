use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum VfsError {
    #[error("invalid virtual asset path: {0}")]
    InvalidPath(String),
    #[error("asset not found: {0}")]
    NotFound(String),
    #[error("io error reading '{path}': {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("unsupported VFS operation: {0}")]
    Unsupported(String),
}

/// Normalizes a virtual asset path using forward slashes and rejects traversal segments (`..`).
pub fn normalize_vfs_path(raw: &str) -> Result<String, VfsError> {
    let trimmed = raw.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err(VfsError::InvalidPath(raw.to_string()));
    }
    let mut parts = Vec::new();
    for segment in trimmed.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains('\0') {
            return Err(VfsError::InvalidPath(raw.to_string()));
        }
        parts.push(segment);
    }
    if parts.is_empty() {
        return Err(VfsError::InvalidPath(raw.to_string()));
    }
    Ok(parts.join("/"))
}

/// Read-only asset source abstraction (local filesystem, Android APK AssetManager,
/// iOS Bundle, packed archive, or preloaded Web/Memory cache).
pub trait AssetSource: Send + Sync {
    fn name(&self) -> &str;
    fn exists(&self, normalized_path: &str) -> bool;
    fn read_bytes(&self, normalized_path: &str) -> Result<Vec<u8>, VfsError>;
}

pub struct LocalFsSource {
    label: String,
    root: PathBuf,
}

impl LocalFsSource {
    pub fn new(label: impl Into<String>, root: impl Into<PathBuf>) -> Self {
        Self {
            label: label.into(),
            root: root.into(),
        }
    }

    fn resolve(&self, normalized_path: &str) -> Option<PathBuf> {
        let rel = Path::new(normalized_path);
        if rel
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
        {
            return None;
        }
        Some(self.root.join(rel))
    }
}

impl AssetSource for LocalFsSource {
    fn name(&self) -> &str {
        &self.label
    }

    fn exists(&self, normalized_path: &str) -> bool {
        self.resolve(normalized_path)
            .is_some_and(|path| path.is_file())
    }

    fn read_bytes(&self, normalized_path: &str) -> Result<Vec<u8>, VfsError> {
        let Some(path) = self.resolve(normalized_path) else {
            return Err(VfsError::InvalidPath(normalized_path.to_string()));
        };
        if !path.is_file() {
            return Err(VfsError::NotFound(normalized_path.to_string()));
        }
        std::fs::read(&path).map_err(|source| VfsError::Io {
            path: normalized_path.to_string(),
            source,
        })
    }
}

#[derive(Default)]
pub struct MemoryFsSource {
    label: String,
    entries: HashMap<String, Vec<u8>>,
}

impl MemoryFsSource {
    pub fn new(label: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            entries: HashMap::new(),
        }
    }

    pub fn insert(&mut self, path: &str, bytes: Vec<u8>) -> Result<(), VfsError> {
        let normalized = normalize_vfs_path(path)?;
        self.entries.insert(normalized, bytes);
        Ok(())
    }
}

impl AssetSource for MemoryFsSource {
    fn name(&self) -> &str {
        &self.label
    }

    fn exists(&self, normalized_path: &str) -> bool {
        self.entries.contains_key(normalized_path)
    }

    fn read_bytes(&self, normalized_path: &str) -> Result<Vec<u8>, VfsError> {
        self.entries
            .get(normalized_path)
            .cloned()
            .ok_or_else(|| VfsError::NotFound(normalized_path.to_string()))
    }
}

/// Layered Virtual File System: highest-priority mounted source wins.
#[derive(Default)]
pub struct VirtualFileSystem {
    mounts: Vec<Box<dyn AssetSource>>,
}

impl VirtualFileSystem {
    pub fn new() -> Self {
        Self::default()
    }

    /// Push a source on top of existing mounts (overrides lower mounts).
    pub fn mount_overlay(&mut self, source: Box<dyn AssetSource>) {
        self.mounts.push(source);
    }

    pub fn exists(&self, path: &str) -> bool {
        let Ok(normalized) = normalize_vfs_path(path) else {
            return false;
        };
        self.mounts.iter().rev().any(|src| src.exists(&normalized))
    }

    pub fn read_bytes(&self, path: &str) -> Result<Vec<u8>, VfsError> {
        let normalized = normalize_vfs_path(path)?;
        for source in self.mounts.iter().rev() {
            if source.exists(&normalized) {
                return source.read_bytes(&normalized);
            }
        }
        Err(VfsError::NotFound(normalized))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vfs_rejects_traversal_and_resolves_overlay_priority() {
        assert!(normalize_vfs_path("../secret.txt").is_err());
        assert_eq!(normalize_vfs_path("Assets\\Scenes\\Main.mscene").unwrap(), "Assets/Scenes/Main.mscene");

        let mut base = MemoryFsSource::new("base");
        base.insert("Assets/config.json", b"base".to_vec()).unwrap();
        let mut patch = MemoryFsSource::new("patch");
        patch.insert("Assets/config.json", b"patch".to_vec()).unwrap();

        let mut vfs = VirtualFileSystem::new();
        vfs.mount_overlay(Box::new(base));
        vfs.mount_overlay(Box::new(patch));

        assert_eq!(vfs.read_bytes("Assets\\config.json").unwrap(), b"patch");
        assert!(vfs.exists("Assets/config.json"));
        assert!(!vfs.exists("Assets/missing.json"));
    }
}
