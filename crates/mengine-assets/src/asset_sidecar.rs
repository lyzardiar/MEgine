use mengine_core::handle::AssetId;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const ASSET_SIDECAR_SCHEMA_VERSION: u32 = 1;
const MAX_ASSET_SIDECAR_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetSidecar {
    pub schema_version: u32,
    pub guid: AssetId,
    pub importer: String,
}

impl AssetSidecar {
    pub fn new(importer: impl Into<String>) -> Self {
        Self {
            schema_version: ASSET_SIDECAR_SCHEMA_VERSION,
            guid: AssetId::new(),
            importer: importer.into(),
        }
    }
}

pub fn asset_sidecar_path(asset_path: &Path) -> PathBuf {
    let mut name: OsString = asset_path.as_os_str().to_owned();
    name.push(".meta");
    PathBuf::from(name)
}

fn sidecar_guid(value: &Value) -> Option<AssetId> {
    let raw = value
        .get("guid")
        .or_else(|| value.get("uuid"))
        .or_else(|| value.get("mengine").and_then(|mengine| mengine.get("guid")))?
        .as_str()?;
    Uuid::parse_str(raw)
        .ok()
        .filter(|guid| !guid.is_nil())
        .map(AssetId)
}

pub fn parse_asset_sidecar(bytes: &[u8], importer: &str) -> Result<AssetSidecar, String> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("asset metadata is not valid JSON: {error}"))?;
    if !value.is_object() {
        return Err("asset metadata root must be an object".into());
    }
    let guid = sidecar_guid(&value)
        .ok_or_else(|| "asset metadata does not contain a valid guid or uuid".to_string())?;
    let schema_version = match value.get("schemaVersion") {
        None => ASSET_SIDECAR_SCHEMA_VERSION,
        Some(value) => value
            .as_u64()
            .and_then(|version| u32::try_from(version).ok())
            .ok_or_else(|| "asset metadata schemaVersion must be a 32-bit integer".to_string())?,
    };
    if schema_version != ASSET_SIDECAR_SCHEMA_VERSION {
        return Err(format!(
            "unsupported asset metadata schema version {schema_version}"
        ));
    }
    let importer = value
        .get("importer")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(importer)
        .to_owned();
    Ok(AssetSidecar {
        schema_version,
        guid,
        importer,
    })
}

pub fn read_asset_sidecar(asset_path: &Path, importer: &str) -> Result<AssetSidecar, String> {
    let path = asset_sidecar_path(asset_path);
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "asset metadata must be a regular non-symlink file: {}",
            path.display()
        ));
    }
    if metadata.len() > MAX_ASSET_SIDECAR_BYTES {
        return Err(format!("asset metadata exceeds 1 MiB: {}", path.display()));
    }
    let bytes =
        std::fs::read(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    parse_asset_sidecar(&bytes, importer)
}

fn create_asset_sidecar(path: &Path, sidecar: &AssetSidecar) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(sidecar).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "asset metadata has no parent directory".to_string())?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("asset.meta");
    let temporary = parent.join(format!(".{name}.{}.tmp", Uuid::new_v4()));
    let result = (|| -> Result<(), String> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(&bytes).map_err(|error| error.to_string())?;
        file.write_all(b"\n").map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        // A hard link installs the fully synced file only if the destination
        // is still absent. It avoids both partial sidecars and race overwrites.
        std::fs::hard_link(&temporary, path).map_err(|error| error.to_string())
    })();
    let _ = std::fs::remove_file(&temporary);
    result
}

/// Reads the stable identity beside an authoring asset, creating one only when
/// the sidecar is absent. Existing invalid or foreign metadata is never
/// overwritten silently.
pub fn ensure_asset_sidecar(asset_path: &Path, importer: &str) -> Result<AssetSidecar, String> {
    let asset_metadata = std::fs::symlink_metadata(asset_path)
        .map_err(|error| format!("cannot inspect asset {}: {error}", asset_path.display()))?;
    if asset_metadata.file_type().is_symlink() || !asset_metadata.is_file() {
        return Err(format!(
            "asset must be a regular non-symlink file: {}",
            asset_path.display()
        ));
    }
    let path = asset_sidecar_path(asset_path);
    match std::fs::symlink_metadata(&path) {
        Ok(_) => read_asset_sidecar(asset_path, importer),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let sidecar = AssetSidecar::new(importer);
            match create_asset_sidecar(&path, &sidecar) {
                Ok(()) => Ok(sidecar),
                Err(_) if path.exists() => read_asset_sidecar(asset_path, importer),
                Err(error) => Err(format!("cannot create {}: {error}", path.display())),
            }
        }
        Err(error) => Err(format!("cannot inspect {}: {error}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "mengine-asset-sidecar-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn missing_sidecars_are_created_and_stable() {
        let root = fixture("stable");
        std::fs::create_dir_all(&root).unwrap();
        let asset = root.join("Hero.png");
        std::fs::write(&asset, b"image").unwrap();

        let first = ensure_asset_sidecar(&asset, "texture").unwrap();
        let second = ensure_asset_sidecar(&asset, "texture").unwrap();
        assert_eq!(first.guid, second.guid);
        assert_eq!(first.importer, "texture");
        assert!(asset_sidecar_path(&asset).is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_uuid_metadata_is_preserved_without_rewriting() {
        let root = fixture("legacy");
        std::fs::create_dir_all(&root).unwrap();
        let asset = root.join("Hero.json");
        let metadata = asset_sidecar_path(&asset);
        std::fs::write(&asset, b"{}").unwrap();
        std::fs::write(
            &metadata,
            br#"{"ver":"1.0","importer":"spine-data","uuid":"55081cc1-f44d-49fc-8ada-ee889a26ee36"}"#,
        )
        .unwrap();
        let before = std::fs::read(&metadata).unwrap();

        let sidecar = ensure_asset_sidecar(&asset, "spine-json").unwrap();
        assert_eq!(
            sidecar.guid.0,
            Uuid::parse_str("55081cc1-f44d-49fc-8ada-ee889a26ee36").unwrap()
        );
        assert_eq!(std::fs::read(&metadata).unwrap(), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_existing_metadata_is_not_destroyed() {
        let root = fixture("invalid");
        std::fs::create_dir_all(&root).unwrap();
        let asset = root.join("Hero.mmat");
        let metadata = asset_sidecar_path(&asset);
        std::fs::write(&asset, b"{}").unwrap();
        std::fs::write(&metadata, b"not json").unwrap();

        assert!(ensure_asset_sidecar(&asset, "material").is_err());
        assert_eq!(std::fs::read(&metadata).unwrap(), b"not json");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_schema_versions_and_nil_guids_are_rejected() {
        assert!(parse_asset_sidecar(
            br#"{"schemaVersion":4294967297,"guid":"bf914747-8c6a-418f-b74f-49d49114f9a2"}"#,
            "material"
        )
        .is_err());
        assert!(parse_asset_sidecar(
            br#"{"schemaVersion":1,"guid":"00000000-0000-0000-0000-000000000000"}"#,
            "material"
        )
        .is_err());
    }
}
