use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::{BufReader, Read};
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

pub const BUILD_MANIFEST_FILE: &str = "mengine-build.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildManifest {
    schema_version: u32,
    #[serde(default)]
    content_hash: Option<String>,
    files: Vec<BuildFile>,
}

#[derive(Debug, Deserialize)]
struct BuildFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BuildIntegrity {
    pub file_count: usize,
    pub byte_count: u64,
}

#[derive(Debug, Error)]
pub enum BuildManifestError {
    #[error("cannot read build manifest {path}: {source}")]
    ReadManifest {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("invalid build manifest {path}: {source}")]
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
    #[error("unsupported build manifest schema {0}")]
    Schema(u32),
    #[error("unsafe build manifest path: {0}")]
    UnsafePath(String),
    #[error("duplicate build manifest path: {0}")]
    DuplicatePath(String),
    #[error("invalid SHA-256 for build file {path}: {value}")]
    InvalidHash { path: String, value: String },
    #[error("invalid packaged content SHA-256: {0}")]
    InvalidContentHash(String),
    #[error("packaged content fingerprint mismatch: expected {expected}, found {actual}")]
    ContentHash { expected: String, actual: String },
    #[error("packaged build file is missing or not a regular file: {0}")]
    MissingFile(PathBuf),
    #[error("packaged build file size mismatch for {path}: expected {expected}, found {actual}")]
    Size {
        path: PathBuf,
        expected: u64,
        actual: u64,
    },
    #[error("cannot read packaged build file {path}: {source}")]
    ReadFile {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("packaged build file hash mismatch: {0}")]
    Hash(PathBuf),
    #[error("cannot scan packaged build directory {path}: {source}")]
    Scan {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("packaged build contains an unlisted file: {0}")]
    UnlistedFile(PathBuf),
}

fn safe_relative_path(value: &str) -> Result<PathBuf, BuildManifestError> {
    let normalized = value.replace('\\', "/");
    let path = PathBuf::from(&normalized);
    if value.trim().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(BuildManifestError::UnsafePath(value.to_owned()));
    }
    Ok(path)
}

fn verify_no_unlisted_files(
    build_root: &Path,
    current: &Path,
    listed: &HashSet<String>,
) -> Result<(), BuildManifestError> {
    let entries = std::fs::read_dir(current).map_err(|source| BuildManifestError::Scan {
        path: current.to_owned(),
        source,
    })?;
    for entry in entries {
        let entry = entry.map_err(|source| BuildManifestError::Scan {
            path: current.to_owned(),
            source,
        })?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|source| BuildManifestError::Scan {
                path: path.clone(),
                source,
            })?;
        if file_type.is_symlink() {
            return Err(BuildManifestError::UnlistedFile(path));
        }
        if file_type.is_dir() {
            verify_no_unlisted_files(build_root, &path, listed)?;
            continue;
        }
        if !file_type.is_file() {
            return Err(BuildManifestError::UnlistedFile(path));
        }
        let relative = path
            .strip_prefix(build_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if relative.eq_ignore_ascii_case(BUILD_MANIFEST_FILE) {
            continue;
        }
        if !listed.contains(&relative.to_lowercase()) {
            return Err(BuildManifestError::UnlistedFile(path));
        }
    }
    Ok(())
}

fn sha256(path: &Path) -> Result<String, BuildManifestError> {
    let file = std::fs::File::open(path).map_err(|source| BuildManifestError::ReadFile {
        path: path.to_owned(),
        source,
    })?;
    let mut reader = BufReader::new(file);
    let mut buffer = [0_u8; 64 * 1024];
    let mut digest = Sha256::new();
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|source| BuildManifestError::ReadFile {
                path: path.to_owned(),
                source,
            })?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn decode_sha256(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut decoded = [0_u8; 32];
    for (index, output) in decoded.iter_mut().enumerate() {
        let offset = index * 2;
        *output = u8::from_str_radix(&value[offset..offset + 2], 16).ok()?;
    }
    Some(decoded)
}

fn build_content_hash(files: &[BuildFile]) -> Result<String, BuildManifestError> {
    let mut files = files.iter().collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.as_bytes().cmp(right.path.as_bytes()));
    let mut digest = Sha256::new();
    for entry in files {
        let hash = decode_sha256(&entry.sha256).ok_or_else(|| BuildManifestError::InvalidHash {
            path: entry.path.clone(),
            value: entry.sha256.clone(),
        })?;
        digest.update((entry.path.len() as u64).to_le_bytes());
        digest.update(entry.path.as_bytes());
        digest.update(entry.size.to_le_bytes());
        digest.update(hash);
    }
    Ok(format!("{:x}", digest.finalize()))
}

pub fn verify_build_manifest(
    build_root: impl AsRef<Path>,
) -> Result<BuildIntegrity, BuildManifestError> {
    let build_root = build_root.as_ref();
    let manifest_path = build_root.join(BUILD_MANIFEST_FILE);
    let text = std::fs::read_to_string(&manifest_path).map_err(|source| {
        BuildManifestError::ReadManifest {
            path: manifest_path.clone(),
            source,
        }
    })?;
    let manifest: BuildManifest =
        serde_json::from_str(&text).map_err(|source| BuildManifestError::Json {
            path: manifest_path,
            source,
        })?;
    if manifest.schema_version != 1 {
        return Err(BuildManifestError::Schema(manifest.schema_version));
    }

    let mut paths = HashSet::new();
    let mut byte_count = 0_u64;
    for entry in &manifest.files {
        let relative = safe_relative_path(&entry.path)?;
        if relative == Path::new(BUILD_MANIFEST_FILE) {
            return Err(BuildManifestError::UnsafePath(entry.path.clone()));
        }
        let key = entry.path.replace('\\', "/").to_lowercase();
        if !paths.insert(key) {
            return Err(BuildManifestError::DuplicatePath(entry.path.clone()));
        }
        if decode_sha256(&entry.sha256).is_none() {
            return Err(BuildManifestError::InvalidHash {
                path: entry.path.clone(),
                value: entry.sha256.clone(),
            });
        }
        let path = build_root.join(relative);
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| BuildManifestError::MissingFile(path.clone()))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(BuildManifestError::MissingFile(path));
        }
        if metadata.len() != entry.size {
            return Err(BuildManifestError::Size {
                path,
                expected: entry.size,
                actual: metadata.len(),
            });
        }
        if sha256(&path)? != entry.sha256.to_lowercase() {
            return Err(BuildManifestError::Hash(path));
        }
        byte_count = byte_count.saturating_add(entry.size);
    }
    if let Some(expected) = manifest.content_hash.as_deref() {
        if decode_sha256(expected).is_none() {
            return Err(BuildManifestError::InvalidContentHash(expected.to_owned()));
        }
        let actual = build_content_hash(&manifest.files)?;
        if actual != expected.to_lowercase() {
            return Err(BuildManifestError::ContentHash {
                expected: expected.to_lowercase(),
                actual,
            });
        }
    }
    verify_no_unlisted_files(build_root, build_root, &paths)?;
    Ok(BuildIntegrity {
        file_count: manifest.files.len(),
        byte_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mengine-build-manifest-{name}-{nonce}"))
    }

    fn write_manifest(root: &Path, file: &str, bytes: &[u8]) {
        let hash = format!("{:x}", Sha256::digest(bytes));
        std::fs::write(
            root.join(BUILD_MANIFEST_FILE),
            format!(
                r#"{{"schemaVersion":1,"files":[{{"path":"{file}","size":{},"sha256":"{hash}"}}]}}"#,
                bytes.len()
            ),
        )
        .unwrap();
    }

    #[test]
    fn validates_file_size_and_sha256() {
        let root = test_root("valid");
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        let bytes = b"scene";
        std::fs::write(root.join("Assets/Main.mscene"), bytes).unwrap();
        write_manifest(&root, "Assets/Main.mscene", bytes);
        assert_eq!(
            verify_build_manifest(&root).unwrap(),
            BuildIntegrity {
                file_count: 1,
                byte_count: 5,
            }
        );
        std::fs::write(root.join("Assets/Main.mscene"), b"other").unwrap();
        assert!(matches!(
            verify_build_manifest(&root),
            Err(BuildManifestError::Hash(_))
        ));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn validates_aggregate_packaged_content_fingerprint() {
        let root = test_root("content-hash");
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        let bytes = b"scene";
        let path = "Assets/Main.mscene";
        let file_hash = format!("{:x}", Sha256::digest(bytes));
        std::fs::write(root.join(path), bytes).unwrap();
        let files = vec![BuildFile {
            path: path.into(),
            size: bytes.len() as u64,
            sha256: file_hash.clone(),
        }];
        let content_hash = build_content_hash(&files).unwrap();
        std::fs::write(
            root.join(BUILD_MANIFEST_FILE),
            format!(
                r#"{{"schemaVersion":1,"contentHash":"{content_hash}","files":[{{"path":"{path}","size":{},"sha256":"{file_hash}"}}]}}"#,
                bytes.len()
            ),
        )
        .unwrap();
        assert!(verify_build_manifest(&root).is_ok());

        let invalid = "0".repeat(64);
        let text = std::fs::read_to_string(root.join(BUILD_MANIFEST_FILE))
            .unwrap()
            .replace(&content_hash, &invalid);
        std::fs::write(root.join(BUILD_MANIFEST_FILE), text).unwrap();
        assert!(matches!(
            verify_build_manifest(&root),
            Err(BuildManifestError::ContentHash { .. })
        ));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_files_missing_from_the_manifest() {
        let root = test_root("unlisted");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("player.bin"), b"player").unwrap();
        write_manifest(&root, "player.bin", b"player");
        std::fs::write(root.join("stale.bin"), b"stale").unwrap();
        assert!(matches!(
            verify_build_manifest(&root),
            Err(BuildManifestError::UnlistedFile(_))
        ));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_traversal_and_duplicate_paths() {
        let root = test_root("unsafe");
        std::fs::create_dir_all(&root).unwrap();
        let hash = "0".repeat(64);
        std::fs::write(
            root.join(BUILD_MANIFEST_FILE),
            format!(
                r#"{{"schemaVersion":1,"files":[{{"path":"../outside","size":0,"sha256":"{hash}"}}]}}"#
            ),
        )
        .unwrap();
        assert!(matches!(
            verify_build_manifest(&root),
            Err(BuildManifestError::UnsafePath(_))
        ));
        std::fs::remove_dir_all(root).unwrap();
    }
}
