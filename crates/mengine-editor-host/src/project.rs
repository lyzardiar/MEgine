use crate::{EditorCommand, EditorSession};
use mengine_core::command::WorldCommand;
use mengine_core::snapshot::WorldSnapshot;
use mengine_core::World;
use mengine_scene::save_scene;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, HashSet};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub name: String,
    #[serde(default = "default_project_version")]
    pub version: u32,
    #[serde(default, alias = "main_scene")]
    pub main_scene: Option<String>,
    #[serde(default, alias = "build_scenes")]
    pub build_scenes: Vec<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default, alias = "startup_script")]
    pub startup_script: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

fn default_project_version() -> u32 {
    1
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub project_id: Uuid,
    pub project_name: String,
    pub project_root: String,
    pub revision: u64,
    pub document_revision: u64,
    pub save_revision: u64,
    pub dirty: bool,
    pub scene_path: Option<String>,
    pub world: WorldSnapshot,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRequest {
    pub request_id: Uuid,
    pub project_id: Uuid,
    pub base_revision: u64,
    pub operation: EditorCommand,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorResult {
    pub request_id: Uuid,
    pub accepted_revision: u64,
    pub document_revision: u64,
    pub dirty: bool,
    pub world: WorldSnapshot,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorFailure {
    pub code: &'static str,
    pub message: String,
    pub current_revision: Option<u64>,
}

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("invalid project: {0}")]
    InvalidProject(String),
    #[error("invalid project name: {0}")]
    InvalidProjectName(String),
    #[error("project already exists: {0}")]
    ProjectAlreadyExists(String),
    #[error("path is outside the project: {0}")]
    InvalidPath(String),
    #[error("stale editor revision: expected {expected}, got {actual}")]
    StaleRevision { expected: u64, actual: u64 },
    #[error("project id does not match the active project")]
    ProjectMismatch,
    #[error("scene load/save commands must use the scoped project APIs")]
    UnsafeSceneCommand,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("editor: {0}")]
    Editor(#[from] anyhow::Error),
    #[error("scene: {0}")]
    Scene(#[from] mengine_scene::SceneError),
}

impl ProjectError {
    pub fn failure(&self, current_revision: Option<u64>) -> EditorFailure {
        let code = match self {
            ProjectError::InvalidProject(_) => "invalidProject",
            ProjectError::InvalidProjectName(_) => "invalidProjectName",
            ProjectError::ProjectAlreadyExists(_) => "projectAlreadyExists",
            ProjectError::InvalidPath(_) => "invalidPath",
            ProjectError::StaleRevision { .. } => "staleRevision",
            ProjectError::ProjectMismatch => "projectMismatch",
            ProjectError::UnsafeSceneCommand => "unsafeSceneCommand",
            ProjectError::Io(_) => "io",
            ProjectError::Json(_) => "json",
            ProjectError::Editor(_) => "editor",
            ProjectError::Scene(_) => "scene",
        };
        EditorFailure {
            code,
            message: self.to_string(),
            current_revision,
        }
    }
}

pub struct ProjectSession {
    project_id: Uuid,
    project_root: PathBuf,
    manifest: ProjectManifest,
    editor: EditorSession,
    revision: u64,
    document_revision: u64,
    save_revision: u64,
    scene_relative_path: Option<PathBuf>,
}

impl ProjectSession {
    pub fn create(parent: impl AsRef<Path>, name: &str) -> Result<Self, ProjectError> {
        let name = validate_project_name(name)?;
        let parent = std::fs::canonicalize(parent.as_ref())?;
        if !parent.is_dir() {
            return Err(ProjectError::InvalidProject(format!(
                "project location is not a directory: {}",
                display_path(&parent)
            )));
        }
        let project_root = parent.join(name);
        if project_root.exists() {
            return Err(ProjectError::ProjectAlreadyExists(display_path(
                &project_root,
            )));
        }

        std::fs::create_dir(&project_root)?;
        let initialized = initialize_project(&project_root, name);
        if let Err(error) = initialized {
            // This directory was created by this call and did not exist beforehand.
            let _ = std::fs::remove_dir_all(&project_root);
            return Err(error);
        }
        Self::open(&project_root)
    }

    pub fn open(root: impl AsRef<Path>) -> Result<Self, ProjectError> {
        let project_root = std::fs::canonicalize(root.as_ref())?;
        if !project_root.is_dir() {
            return Err(ProjectError::InvalidProject(format!(
                "not a directory: {}",
                project_root.display()
            )));
        }
        let manifest_path = project_root.join("project.json");
        if !manifest_path.is_file() {
            return Err(ProjectError::InvalidProject(format!(
                "project.json was not found in {}",
                display_path(&project_root)
            )));
        }
        let manifest_text = std::fs::read_to_string(&manifest_path).map_err(|error| {
            ProjectError::InvalidProject(format!(
                "cannot read {}: {error}",
                display_path(&manifest_path)
            ))
        })?;
        let mut manifest: ProjectManifest = serde_json::from_str(&manifest_text)?;
        if manifest.name.trim().is_empty() {
            return Err(ProjectError::InvalidProject(
                "project name cannot be empty".into(),
            ));
        }
        if let Some(first) = manifest.build_scenes.first().cloned() {
            match manifest.main_scene.as_deref() {
                Some(main) if main != first.as_str() => {
                    return Err(ProjectError::InvalidProject(
                        "mainScene must match the first buildScenes entry".into(),
                    ));
                }
                None => manifest.main_scene = Some(first),
                _ => {}
            }
        }

        Ok(Self {
            project_id: Uuid::new_v4(),
            project_root,
            manifest,
            editor: EditorSession::new(),
            revision: 0,
            document_revision: 0,
            save_revision: 0,
            scene_relative_path: None,
        })
    }

    pub fn current_revision(&self) -> u64 {
        self.revision
    }

    pub fn snapshot(&self) -> ProjectSnapshot {
        ProjectSnapshot {
            project_id: self.project_id,
            project_name: self.manifest.name.clone(),
            project_root: display_path(&self.project_root),
            revision: self.revision,
            document_revision: self.document_revision,
            save_revision: self.save_revision,
            dirty: self.document_revision != self.save_revision,
            scene_path: self
                .scene_relative_path
                .as_ref()
                .map(|path| path.to_string_lossy().replace('\\', "/")),
            world: self.editor.snapshot(),
        }
    }

    pub fn open_main_scene(&mut self) -> Result<Option<ProjectSnapshot>, ProjectError> {
        let Some(path) = self.manifest.main_scene.clone() else {
            return Ok(None);
        };
        self.open_scene(&path).map(Some)
    }

    pub fn build_scenes(&self) -> Vec<String> {
        if self.manifest.build_scenes.is_empty() {
            self.manifest.main_scene.iter().cloned().collect()
        } else {
            self.manifest.build_scenes.clone()
        }
    }

    pub fn save_build_scenes(&mut self, scenes: Vec<String>) -> Result<Vec<String>, ProjectError> {
        if scenes.is_empty() {
            return Err(ProjectError::InvalidProject(
                "at least one scene is required in build settings".into(),
            ));
        }
        let mut normalized = Vec::with_capacity(scenes.len());
        let mut seen = HashSet::new();
        for scene in scenes {
            let relative = normalize_relative_path(Path::new(scene.trim()))?;
            let mut components = relative.components();
            let under_scenes = components.next() == Some(Component::Normal("Assets".as_ref()))
                && components.next() == Some(Component::Normal("Scenes".as_ref()));
            if !under_scenes
                || !relative
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("mscene"))
            {
                return Err(ProjectError::InvalidPath(relative.display().to_string()));
            }
            self.resolve_existing(&relative)?;
            let portable = relative.to_string_lossy().replace('\\', "/");
            if !seen.insert(portable.to_lowercase()) {
                return Err(ProjectError::InvalidProject(format!(
                    "duplicate build scene: {portable}"
                )));
            }
            normalized.push(portable);
        }
        let mut manifest = self.manifest.clone();
        manifest.main_scene = normalized.first().cloned();
        manifest.build_scenes = normalized.clone();
        let mut bytes = serde_json::to_vec_pretty(&manifest)?;
        bytes.push(b'\n');
        write_replace_synced(&self.project_root.join("project.json"), &bytes)?;
        self.manifest = manifest;
        Ok(normalized)
    }

    pub fn open_scene(
        &mut self,
        relative_path: impl AsRef<Path>,
    ) -> Result<ProjectSnapshot, ProjectError> {
        let relative = normalize_relative_path(relative_path.as_ref())?;
        let absolute = self.resolve_existing(&relative)?;
        self.editor
            .handle_editor_command(EditorCommand::LoadScene {
                path: absolute.to_string_lossy().into_owned(),
            })?;
        self.scene_relative_path = Some(relative);
        self.revision = self.revision.saturating_add(1);
        self.document_revision = 0;
        self.save_revision = 0;
        Ok(self.snapshot())
    }

    pub fn replace_snapshot(
        &mut self,
        base_revision: u64,
        snapshot: WorldSnapshot,
    ) -> Result<ProjectSnapshot, ProjectError> {
        if base_revision != self.revision {
            return Err(ProjectError::StaleRevision {
                expected: self.revision,
                actual: base_revision,
            });
        }
        self.editor.replace_edit_snapshot(&snapshot);
        self.revision = self.revision.saturating_add(1);
        self.document_revision = self.document_revision.saturating_add(1);
        Ok(self.snapshot())
    }

    pub fn save_scene(
        &mut self,
        relative_path: Option<&Path>,
    ) -> Result<ProjectSnapshot, ProjectError> {
        let relative = match relative_path {
            Some(path) => normalize_relative_path(path)?,
            None => self.scene_relative_path.clone().ok_or_else(|| {
                ProjectError::InvalidPath("no active scene and no save path supplied".into())
            })?,
        };
        let absolute = self.resolve_for_write(&relative)?;
        self.editor
            .handle_editor_command(EditorCommand::SaveScene {
                path: absolute.to_string_lossy().into_owned(),
            })?;
        self.scene_relative_path = Some(relative);
        self.revision = self.revision.saturating_add(1);
        self.save_revision = self.document_revision;
        Ok(self.snapshot())
    }

    pub fn handle_request(&mut self, request: EditorRequest) -> Result<EditorResult, ProjectError> {
        if request.project_id != self.project_id {
            return Err(ProjectError::ProjectMismatch);
        }
        if request.base_revision != self.revision {
            return Err(ProjectError::StaleRevision {
                expected: self.revision,
                actual: request.base_revision,
            });
        }
        if matches!(
            request.operation,
            EditorCommand::SaveScene { .. } | EditorCommand::LoadScene { .. }
        ) {
            return Err(ProjectError::UnsafeSceneCommand);
        }

        let changes_document = matches!(
            request.operation,
            EditorCommand::Undo | EditorCommand::Redo | EditorCommand::ApplyBatch { .. }
        );
        self.editor.handle_editor_command(request.operation)?;
        self.revision = self.revision.saturating_add(1);
        if changes_document {
            self.document_revision = self.document_revision.saturating_add(1);
        }
        Ok(EditorResult {
            request_id: request.request_id,
            accepted_revision: self.revision,
            document_revision: self.document_revision,
            dirty: self.document_revision != self.save_revision,
            world: self.editor.snapshot(),
        })
    }

    fn resolve_existing(&self, relative: &Path) -> Result<PathBuf, ProjectError> {
        let candidate = std::fs::canonicalize(self.project_root.join(relative))?;
        self.ensure_under_root(candidate)
    }

    fn resolve_for_write(&self, relative: &Path) -> Result<PathBuf, ProjectError> {
        let candidate = self.project_root.join(relative);
        let relative_parent = relative
            .parent()
            .ok_or_else(|| ProjectError::InvalidPath(relative.to_string_lossy().into_owned()))?;

        let mut safe_parent = self.project_root.clone();
        for component in relative_parent.components() {
            let Component::Normal(value) = component else {
                return Err(ProjectError::InvalidPath(
                    relative.to_string_lossy().into_owned(),
                ));
            };
            let next = safe_parent.join(value);
            if next.exists() {
                safe_parent = self.ensure_under_root(std::fs::canonicalize(next)?)?;
                if !safe_parent.is_dir() {
                    return Err(ProjectError::InvalidPath(
                        relative.to_string_lossy().into_owned(),
                    ));
                }
            } else {
                std::fs::create_dir(&next)?;
                safe_parent = self.ensure_under_root(std::fs::canonicalize(next)?)?;
            }
        }

        Ok(safe_parent.join(
            candidate.file_name().ok_or_else(|| {
                ProjectError::InvalidPath(relative.to_string_lossy().into_owned())
            })?,
        ))
    }

    fn ensure_under_root(&self, candidate: PathBuf) -> Result<PathBuf, ProjectError> {
        if candidate.starts_with(&self.project_root) {
            Ok(candidate)
        } else {
            Err(ProjectError::InvalidPath(candidate.display().to_string()))
        }
    }
}

fn validate_project_name(name: &str) -> Result<&str, ProjectError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ProjectError::InvalidProjectName(
            "name cannot be empty".into(),
        ));
    }
    if name.chars().count() > 64 {
        return Err(ProjectError::InvalidProjectName(
            "name must not exceed 64 characters".into(),
        ));
    }
    if name == "." || name == ".." || name.ends_with(['.', ' ']) {
        return Err(ProjectError::InvalidProjectName(name.into()));
    }
    if name
        .chars()
        .any(|character| character.is_control() || r#"/\<>:"|?*"#.contains(character))
    {
        return Err(ProjectError::InvalidProjectName(format!(
            "'{name}' contains a character that is not allowed in a folder name"
        )));
    }
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .is_some_and(|suffix| suffix.len() == 1 && matches!(suffix.as_bytes()[0], b'1'..=b'9'));
    if reserved {
        return Err(ProjectError::InvalidProjectName(format!(
            "'{name}' is reserved by Windows"
        )));
    }
    Ok(name)
}

fn initialize_project(root: &Path, name: &str) -> Result<(), ProjectError> {
    for directory in [
        "Assets/Scenes",
        "Assets/Scripts",
        "Assets/Prefabs",
        "Assets/Materials",
        "Assets/Models",
        "Assets/Textures",
        "ProjectSettings",
        ".mengine/Library",
        ".mengine/Recovery",
        ".mengine/Temp",
        ".mengine/Logs",
    ] {
        std::fs::create_dir_all(root.join(directory))?;
    }

    let manifest = ProjectManifest {
        name: name.into(),
        version: default_project_version(),
        main_scene: Some("Assets/Scenes/Main.mscene".into()),
        build_scenes: vec!["Assets/Scenes/Main.mscene".into()],
        language: Some("typescript".into()),
        startup_script: Some("Assets/Scripts/Main.ts".into()),
        extra: BTreeMap::new(),
    };
    let manifest_json = serde_json::to_vec_pretty(&manifest)?;
    write_new_synced(&root.join("project.json"), &manifest_json)?;
    write_new_synced(
        &root.join("ProjectSettings/editor.json"),
        br#"{
  "gameAspect": "16:9",
  "gameOrientation": "landscape"
}"#,
    )?;
    write_new_synced(
        &root.join("ProjectSettings/sorting-layers.json"),
        br#"{
  "version": 1,
  "layers": [
    { "id": "default", "name": "Default" }
  ]
}"#,
    )?;
    write_new_synced(&root.join(".gitignore"), b".mengine/\n")?;
    write_new_synced(
        &root.join("Assets/Scripts/Main.ts"),
        b"let elapsed = 0;\nlet loadedSceneName = '';\n\nfunction onSceneLoaded(scene: EngineSceneInfo) {\n  loadedSceneName = scene.name;\n}\n\nfunction onTick(dt: number, _frame: number) {\n  elapsed += dt;\n}\n",
    )?;
    write_new_synced(
        &root.join("Assets/Scripts/mengine.d.ts"),
        br#"interface EngineSceneInfo {
  readonly name: string;
  readonly path: string;
  readonly buildIndex: number | null;
  readonly buildSceneCount: number;
}

interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): void;
  loadScene(scene: string | number): boolean;
  reloadScene(): boolean;
  instantiatePrefab(path: string, parent?: number | string): boolean;
  setAnimatorParameter(entity: number | string, name: string, value: boolean | number): boolean;
  setAnimatorTrigger(entity: number | string, name: string): boolean;
  playAnimatorState(entity: number | string, state: string): boolean;
  playAudio(entity: number | string): boolean;
  pauseAudio(entity: number | string): boolean;
  stopAudio(entity: number | string): boolean;
  scene: EngineSceneInfo | null;
}

interface PhysicsCollisionInfo {
  readonly firstEntity: string;
  readonly secondEntity: string;
  readonly dimension: '2d' | '3d';
}

interface EngineAnimationEventInfo {
  readonly entity: string;
  readonly function: string;
  readonly time: number;
  readonly parameter: boolean | number | number[] | string | null;
  readonly state: string | null;
  readonly weight: number;
}

declare const engine: EngineApi;
declare function onTick(dt: number, frame: number): void;
declare function onSceneLoaded(scene: EngineSceneInfo): void;
declare function onCollisionEnter(event: PhysicsCollisionInfo): void;
declare function onCollisionExit(event: PhysicsCollisionInfo): void;
declare function onTriggerEnter(event: PhysicsCollisionInfo): void;
declare function onTriggerExit(event: PhysicsCollisionInfo): void;
declare function onCollisionEnter2D(event: PhysicsCollisionInfo): void;
declare function onCollisionExit2D(event: PhysicsCollisionInfo): void;
declare function onTriggerEnter2D(event: PhysicsCollisionInfo): void;
declare function onTriggerExit2D(event: PhysicsCollisionInfo): void;
declare function onAnimationEvent(event: EngineAnimationEventInfo): void;
"#,
    )?;

    let mut world = World::new();
    for (entity_name, components) in [
        (
            "Main Camera",
            json!({
                "Transform": {
                    "position": [0.0, 1.5, 4.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0]
                },
                "Camera3D": { "primary": true },
                "AudioListener": { "primary": true }
            }),
        ),
        (
            "Directional Light",
            json!({
                "Transform": {
                    "position": [2.0, 4.0, 1.0],
                    "rotation": [-0.3827, 0.0, 0.0, 0.9239],
                    "scale": [1.0, 1.0, 1.0]
                },
                "DirectionalLight": { "color": [1.0, 1.0, 0.95, 1.0], "intensity": 1.0 }
            }),
        ),
        (
            "Cube",
            json!({
                "Transform": {
                    "position": [0.0, 0.5, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0]
                },
                "MeshRenderer": { "mesh": "cube", "material": "default" },
                "BoxCollider3D": {
                    "size": [1.0, 1.0, 1.0], "center": [0.0, 0.0, 0.0],
                    "is_trigger": false, "friction": 0.5, "restitution": 0.0
                },
                "PbrMaterial": { "base_color": [0.2, 0.55, 0.95, 1.0] }
            }),
        ),
    ] {
        world.commands.push(WorldCommand::Spawn {
            name: Some(entity_name.into()),
            components,
        });
    }
    world.commit();
    save_scene(&root.join("Assets/Scenes/Main.mscene"), "Main", &world)?;
    Ok(())
}

fn write_new_synced(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = OpenOptions::new().create_new(true).write(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn write_replace_synced(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "file has no parent")
    })?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let temporary = parent.join(format!(".{name}.{}.tmp", Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace_file(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    if !target.exists() {
        return std::fs::rename(source, target);
    }
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_WRITE_THROUGH};
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            source_wide.as_ptr(),
            std::ptr::null(),
            REPLACEFILE_WRITE_THROUGH,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::rename(source, target)
}

fn display_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    if let Some(unc) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        path.strip_prefix(r"\\?\").unwrap_or(&path).to_string()
    }
}

fn normalize_relative_path(path: &Path) -> Result<PathBuf, ProjectError> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(ProjectError::InvalidPath(path.display().to_string()));
    }
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => normalized.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(ProjectError::InvalidPath(path.display().to_string()));
            }
        }
    }
    if normalized.as_os_str().is_empty() {
        return Err(ProjectError::InvalidPath(path.display().to_string()));
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_location() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("mengine-project-location-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn make_project() -> PathBuf {
        let root = std::env::temp_dir().join(format!("mengine-project-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Assets/Scenes")).unwrap();
        std::fs::write(
            root.join("project.json"),
            r#"{ "name": "Test", "version": 1, "mainScene": "Assets/Scenes/Main.mscene" }"#,
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Scenes/Main.mscene"),
            r#"{
                "version": 1,
                "name": "Main",
                "world": {
                    "entities": [],
                    "frame": 0,
                    "sim_frame": 0,
                    "clear_color": [0.1, 0.1, 0.14, 1.0],
                    "selected": null
                }
            }"#,
        )
        .unwrap();
        root
    }

    #[test]
    fn rejects_parent_traversal() {
        let root = make_project();
        let session = ProjectSession::open(&root).unwrap();
        let err = session
            .resolve_for_write(Path::new("../outside.mscene"))
            .unwrap_err();
        assert!(matches!(err, ProjectError::InvalidPath(_)));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolves_nested_scene_writes_inside_the_project() {
        let root = make_project();
        let session = ProjectSession::open(&root).unwrap();
        let path = session
            .resolve_for_write(Path::new("Assets/Scenes/Nested/New.mscene"))
            .unwrap();
        assert!(path.starts_with(std::fs::canonicalize(&root).unwrap()));
        assert!(path.parent().unwrap().is_dir());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn opens_main_scene_and_tracks_save_revision() {
        let root = make_project();
        let mut session = ProjectSession::open(&root).unwrap();
        let opened = session.open_main_scene().unwrap().unwrap();
        assert_eq!(
            opened.scene_path.as_deref(),
            Some("Assets/Scenes/Main.mscene")
        );
        assert!(!opened.dirty);
        let saved = session.save_scene(None).unwrap();
        assert!(!saved.dirty);
        assert!(saved.revision > opened.revision);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replacement_is_revision_guarded_and_marks_the_scene_dirty() {
        let root = make_project();
        let mut session = ProjectSession::open(&root).unwrap();
        let opened = session.open_main_scene().unwrap().unwrap();

        let replaced = session
            .replace_snapshot(opened.revision, opened.world.clone())
            .unwrap();
        assert!(replaced.dirty);
        assert!(replaced.revision > opened.revision);

        let error = session
            .replace_snapshot(opened.revision, opened.world)
            .unwrap_err();
        assert!(matches!(
            error,
            ProjectError::StaleRevision {
                expected,
                actual
            } if expected == replaced.revision && actual == opened.revision
        ));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn creates_a_complete_project_and_opens_its_main_scene() {
        let location = make_location();
        let project_root = location.join("CreatedGame");
        let mut session = ProjectSession::create(&location, "CreatedGame").unwrap();

        assert!(project_root.join("project.json").is_file());
        assert!(project_root.join("Assets/Scenes/Main.mscene").is_file());
        assert!(project_root.join("Assets/Scripts/Main.ts").is_file());
        assert!(project_root.join("Assets/Scripts/mengine.d.ts").is_file());
        assert!(project_root.join("Assets/Models").is_dir());
        assert!(project_root.join("ProjectSettings/editor.json").is_file());
        assert!(project_root
            .join("ProjectSettings/sorting-layers.json")
            .is_file());
        let sorting_layers: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(project_root.join("ProjectSettings/sorting-layers.json"))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(sorting_layers["layers"][0]["id"], "default");
        assert!(project_root.join(".mengine/Library").is_dir());
        let manifest: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(project_root.join("project.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["name"], "CreatedGame");
        assert_eq!(manifest["mainScene"], "Assets/Scenes/Main.mscene");
        assert_eq!(manifest["startupScript"], "Assets/Scripts/Main.ts");
        assert_eq!(
            manifest["buildScenes"],
            json!(["Assets/Scenes/Main.mscene"])
        );

        let opened = session.open_main_scene().unwrap().unwrap();
        assert_eq!(
            opened.scene_path.as_deref(),
            Some("Assets/Scenes/Main.mscene")
        );
        assert_eq!(opened.world.entities.len(), 3);
        assert!(!opened.project_root.starts_with(r"\\?\"));
        std::fs::remove_dir_all(location).unwrap();
    }

    #[test]
    fn build_scene_order_updates_the_entry_point_and_preserves_unknown_manifest_fields() {
        let root = make_project();
        std::fs::write(root.join("Assets/Scenes/Level2.mscene"), "{}").unwrap();
        let mut manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(root.join("project.json")).unwrap())
                .unwrap();
        manifest["startupScript"] = json!("Assets/Scripts/start.js");
        std::fs::write(
            root.join("project.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let mut session = ProjectSession::open(&root).unwrap();
        let scenes = session
            .save_build_scenes(vec![
                "Assets/Scenes/Level2.mscene".into(),
                "Assets/Scenes/Main.mscene".into(),
            ])
            .unwrap();
        assert_eq!(scenes[0], "Assets/Scenes/Level2.mscene");
        let saved: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(root.join("project.json")).unwrap())
                .unwrap();
        assert_eq!(saved["mainScene"], "Assets/Scenes/Level2.mscene");
        assert_eq!(saved["buildScenes"], json!(scenes));
        assert_eq!(saved["startupScript"], "Assets/Scripts/start.js");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unsafe_or_existing_project_names() {
        let location = make_location();
        assert!(validate_project_name("我的游戏").is_ok());
        assert!(matches!(
            ProjectSession::create(&location, "../outside")
                .err()
                .expect("invalid name"),
            ProjectError::InvalidProjectName(_)
        ));
        assert!(matches!(
            ProjectSession::create(&location, "CON")
                .err()
                .expect("reserved name"),
            ProjectError::InvalidProjectName(_)
        ));
        std::fs::create_dir(location.join("Existing")).unwrap();
        assert!(matches!(
            ProjectSession::create(&location, "Existing")
                .err()
                .expect("existing project"),
            ProjectError::ProjectAlreadyExists(_)
        ));
        std::fs::remove_dir_all(location).unwrap();
    }

    #[test]
    fn reports_a_missing_manifest_without_extended_path_noise() {
        let location = make_location();
        let error = ProjectSession::open(&location)
            .err()
            .expect("missing manifest");
        let message = error.to_string();
        assert!(message.contains("project.json was not found"));
        assert!(!message.contains(r"\\?\"));
        std::fs::remove_dir_all(location).unwrap();
    }
}
