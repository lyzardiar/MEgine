//! MiYu: bounded project-scoped JSON files shared by Editor Play and packaged players.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MAX_BYTES: usize = 262_144;

pub fn project_storage_root(project: &Path) -> PathBuf {
    let name = std::fs::read(project.join("project.json")).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).and_then(|v| v["storageId"].as_str().filter(|s| !s.is_empty()).map(str::to_owned)).unwrap_or_else(|| project.canonicalize().unwrap_or_else(|_| project.to_path_buf()).to_string_lossy().into_owned());
    let hash = name.bytes().fold(0xcbf29ce484222325_u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x100000001b3));
    let base = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("XDG_DATA_HOME")).map(PathBuf::from).unwrap_or_else(|| std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join(".local/share"));
    base.join("MEngine/UserData").join(format!("{hash:016x}"))
}

pub(crate) fn operate(root: Option<&Path>, operation: &str, key: &str, payload: &str) -> String {
    let result = (|| -> Result<Value, String> {
        let root = root.ok_or("Project storage is not configured")?;
        if key.is_empty() || key.len() > 64 || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') { return Err("Storage key must contain 1-64 ASCII letters, digits, '-' or '_'".into()); }
        let path = root.join(format!("{key}.json"));
        if std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) { return Err("Storage symlinks are not allowed".into()); }
        match operation {
            "load" => {
                let metadata = match std::fs::metadata(&path) { Ok(m) => m, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Value::Null), Err(e) => return Err(e.to_string()) };
                if metadata.len() > MAX_BYTES as u64 { return Err("Stored JSON exceeds 256 KiB".into()); }
                serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
            }
            "save" => {
                if payload.len() > MAX_BYTES { return Err("JSON exceeds 256 KiB".into()); }
                let value: Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
                std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
                if !path.exists() && std::fs::read_dir(root).map_err(|e| e.to_string())?.filter_map(Result::ok).filter(|e| e.path().extension().is_some_and(|x| x == "json")).count() >= 64 { return Err("Project storage limit is 64 JSON files".into()); }
                static SERIAL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                let serial = SERIAL.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
                let temp = root.join(format!("{key}-{}-{time}-{serial}.tmp", std::process::id()));
                let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
                use std::io::Write;
                let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
                let write = file.write_all(&bytes).and_then(|_| file.sync_all());
                drop(file);
                let result = write.and_then(|_| std::fs::rename(&temp, &path));
                if result.is_err() { let _ = std::fs::remove_file(&temp); }
                result.map_err(|e| e.to_string())?;
                Ok(Value::Bool(true))
            }
            _ => Err("Unknown storage operation".into()),
        }
    })();
    match result { Ok(value) => json!({"ok":true,"value":value}), Err(error) => json!({"ok":false,"error":error}) }.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_id_shares_packaged_saves_without_colliding_on_display_names() {
        let root = std::env::temp_dir().join(format!("mengine-storage-id-{}", std::process::id()));
        let a = root.join("editor"); let b = root.join("player");
        for p in [&a, &b] { std::fs::create_dir_all(p).unwrap(); std::fs::write(p.join("project.json"), r#"{"name":"Game"}"#).unwrap(); }
        assert_ne!(project_storage_root(&a), project_storage_root(&b));
        for p in [&a, &b] { std::fs::write(p.join("project.json"), r#"{"name":"Game","storageId":"example-game-unique-id"}"#).unwrap(); }
        assert_eq!(project_storage_root(&a), project_storage_root(&b));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn persists_json_and_rejects_traversal_and_oversized_writes() {
        let root = std::env::temp_dir().join(format!("mengine-storage-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let call = |op: &str, key: &str, data: &str| serde_json::from_str::<Value>(&operate(Some(&root), op, key, data)).unwrap();
        assert_eq!(call("load", "map", "")["value"], Value::Null);
        assert_eq!(call("save", "map", r#"{"terrain":[0,1,2]}"#)["ok"], true);
        assert_eq!(call("save", "map", r#"{"terrain":[2,1,0]}"#)["ok"], true);
        assert_eq!(call("load", "map", "")["value"]["terrain"][0], 2);
        for key in ["../map", "C:\\map", "a/b", "", "map.json"] { assert_eq!(call("save", key, "{}")["ok"], false); }
        assert_eq!(call("save", "map", &" ".repeat(MAX_BYTES + 1))["ok"], false);
        assert_eq!(call("save", "map", "not json")["ok"], false);
        assert_eq!(call("load", "map", "")["value"]["terrain"][0], 2);
        std::fs::remove_dir_all(root).unwrap();
    }
}
