use serde::Deserialize;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

pub const PLAYER_CONFIG_FILE: &str = "mengine-player.json";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedPlayerConfig {
    pub project_name: String,
    pub project_root: PathBuf,
    pub main_scene: PathBuf,
    pub startup_script: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerConfigFile {
    schema_version: u32,
    project_name: String,
    project_root: String,
    main_scene: String,
    #[serde(default)]
    startup_script: Option<String>,
}

#[derive(Debug, Error)]
pub enum PlayerConfigError {
    #[error("cannot read player config {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("invalid player config {path}: {source}")]
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
    #[error("unsupported player config schema {0}")]
    Schema(u32),
    #[error("player config requires a project name")]
    ProjectName,
    #[error("player config path must be relative and cannot escape the build: {0}")]
    UnsafePath(String),
    #[error("packaged main scene does not exist: {0}")]
    MissingScene(PathBuf),
    #[error("packaged startup script does not exist: {0}")]
    MissingScript(PathBuf),
}

fn safe_relative_path(value: &str) -> Result<PathBuf, PlayerConfigError> {
    let path = PathBuf::from(value);
    if value.trim().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(PlayerConfigError::UnsafePath(value.to_owned()));
    }
    Ok(path)
}

pub fn load_player_config(
    executable: impl AsRef<Path>,
) -> Result<Option<ResolvedPlayerConfig>, PlayerConfigError> {
    let executable = executable.as_ref();
    let Some(build_root) = executable.parent() else {
        return Ok(None);
    };
    let config_path = build_root.join(PLAYER_CONFIG_FILE);
    if !config_path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&config_path).map_err(|source| PlayerConfigError::Read {
        path: config_path.clone(),
        source,
    })?;
    let file: PlayerConfigFile =
        serde_json::from_str(&text).map_err(|source| PlayerConfigError::Json {
            path: config_path,
            source,
        })?;
    if file.schema_version != 1 {
        return Err(PlayerConfigError::Schema(file.schema_version));
    }
    let project_name = file.project_name.trim().to_owned();
    if project_name.is_empty() {
        return Err(PlayerConfigError::ProjectName);
    }
    let project_root = build_root.join(safe_relative_path(&file.project_root)?);
    let main_scene = safe_relative_path(&file.main_scene)?;
    let scene_path = project_root.join(&main_scene);
    if !scene_path.is_file() {
        return Err(PlayerConfigError::MissingScene(scene_path));
    }
    let startup_script = file
        .startup_script
        .as_deref()
        .map(safe_relative_path)
        .transpose()?
        .map(|path| project_root.join(path));
    if let Some(script) = startup_script.as_deref() {
        if !script.is_file() {
            return Err(PlayerConfigError::MissingScript(script.to_owned()));
        }
    }
    Ok(Some(ResolvedPlayerConfig {
        project_name,
        project_root,
        main_scene,
        startup_script,
    }))
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
        std::env::temp_dir().join(format!("mengine-player-config-{name}-{nonce}"))
    }

    #[test]
    fn resolves_adjacent_packaged_project() {
        let root = test_root("valid");
        std::fs::create_dir_all(root.join("Assets/Scenes")).unwrap();
        std::fs::create_dir_all(root.join("Assets/Scripts")).unwrap();
        std::fs::write(root.join("Assets/Scenes/Main.mscene"), "{}").unwrap();
        std::fs::write(root.join("Assets/Scripts/main.js"), "function onTick() {}").unwrap();
        std::fs::write(
            root.join(PLAYER_CONFIG_FILE),
            r#"{
                "schemaVersion": 1,
                "projectName": "Packaged Game",
                "projectRoot": ".",
                "mainScene": "Assets/Scenes/Main.mscene",
                "startupScript": "Assets/Scripts/main.js"
            }"#,
        )
        .unwrap();

        let config = load_player_config(root.join("Packaged Game.exe"))
            .unwrap()
            .unwrap();
        assert_eq!(config.project_name, "Packaged Game");
        assert_eq!(config.project_root, root.join("."));
        assert_eq!(
            config.main_scene,
            PathBuf::from("Assets/Scenes/Main.mscene")
        );
        assert_eq!(
            config.startup_script,
            Some(root.join("./Assets/Scripts/main.js"))
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_paths_that_escape_the_build() {
        let root = test_root("escape");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join(PLAYER_CONFIG_FILE),
            r#"{
                "schemaVersion": 1,
                "projectName": "Unsafe",
                "projectRoot": "..",
                "mainScene": "outside.mscene"
            }"#,
        )
        .unwrap();
        assert!(matches!(
            load_player_config(root.join("game.exe")),
            Err(PlayerConfigError::UnsafePath(_))
        ));
        std::fs::remove_dir_all(root).unwrap();
    }
}
