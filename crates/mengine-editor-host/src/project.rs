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
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use uuid::Uuid;

const SCENE_RECOVERY_SCHEMA_VERSION: u32 = 1;
const SCENE_RECOVERY_PATH: &str = ".mengine/Recovery/scene.recovery.json";
const MAX_SCENE_RECOVERY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ASSET_RENAME_UPDATES: usize = 256;
const MAX_ASSET_RENAME_UPDATE_BYTES: usize = 32 * 1024 * 1024;
const MAX_ASSET_DUPLICATE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildAssetMode {
    #[default]
    All,
    Referenced,
}

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
    #[serde(default, alias = "asset_mode")]
    pub asset_mode: BuildAssetMode,
    #[serde(default, alias = "always_include")]
    pub always_include: Vec<String>,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneRecoveryInfo {
    pub scene_path: String,
    pub scene_name: String,
    pub recorded_at_ms: u64,
    pub document_revision: u64,
    pub entity_count: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRenameUpdate {
    pub source_path: String,
    pub expected_revision: String,
    pub contents: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRenameRequest {
    pub source_path: String,
    pub destination_path: String,
    pub expected_source_revision: String,
    pub expected_guid: Uuid,
    #[serde(default)]
    pub updates: Vec<AssetRenameUpdate>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRenameResult {
    pub source_path: String,
    pub destination_path: String,
    pub updated_paths: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDuplicateRequest {
    pub source_path: String,
    pub destination_path: String,
    pub expected_source_revision: String,
    pub expected_guid: Uuid,
    pub contents: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDuplicateResult {
    pub source_path: String,
    pub destination_path: String,
    pub guid: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneRecoveryRecord {
    schema_version: u32,
    scene_path: String,
    recorded_at_ms: u64,
    document_revision: u64,
    world: WorldSnapshot,
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
    #[error("scene changed on disk since it was opened: {0}; reload it before saving")]
    ExternalSceneModification(String),
    #[error("asset transaction failed: {0}")]
    AssetTransaction(String),
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
            ProjectError::ExternalSceneModification(_) => "externalSceneModification",
            ProjectError::AssetTransaction(_) => "assetTransaction",
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
    scene_disk_revision: Option<String>,
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
        manifest.always_include =
            normalize_build_asset_paths(&project_root, &manifest.always_include)?;

        Ok(Self {
            project_id: Uuid::new_v4(),
            project_root,
            manifest,
            editor: EditorSession::new(),
            revision: 0,
            document_revision: 0,
            save_revision: 0,
            scene_relative_path: None,
            scene_disk_revision: None,
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

    pub fn build_asset_mode(&self) -> BuildAssetMode {
        self.manifest.asset_mode
    }

    pub fn always_include(&self) -> Vec<String> {
        self.manifest.always_include.clone()
    }

    pub fn save_build_asset_settings(
        &mut self,
        asset_mode: BuildAssetMode,
        paths: Vec<String>,
    ) -> Result<Vec<String>, ProjectError> {
        let normalized = normalize_build_asset_paths(&self.project_root, &paths)?;
        let mut manifest = self.manifest.clone();
        manifest.asset_mode = asset_mode;
        manifest.always_include = normalized.clone();
        let mut bytes = serde_json::to_vec_pretty(&manifest)?;
        bytes.push(b'\n');
        write_replace_synced(&self.project_root.join("project.json"), &bytes)?;
        self.manifest = manifest;
        Ok(normalized)
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

    pub fn rename_scene(
        &mut self,
        old_path: impl AsRef<Path>,
        new_path: impl AsRef<Path>,
    ) -> Result<ProjectSnapshot, ProjectError> {
        let old_relative = normalize_scene_asset_path(old_path.as_ref())?;
        let new_relative = normalize_scene_asset_path(new_path.as_ref())?;
        if old_relative == new_relative {
            return Ok(self.snapshot());
        }
        let old_portable = old_relative.to_string_lossy().replace('\\', "/");
        let renaming_active_scene = self.scene_relative_path.as_ref().is_some_and(|scene| {
            scene
                .to_string_lossy()
                .replace('\\', "/")
                .eq_ignore_ascii_case(&old_portable)
        });

        let source_metadata = std::fs::symlink_metadata(self.project_root.join(&old_relative))?;
        if source_metadata.file_type().is_symlink() || !source_metadata.is_file() {
            return Err(ProjectError::InvalidPath(
                old_relative.display().to_string(),
            ));
        }
        let source = self.resolve_existing(&old_relative)?;
        if renaming_active_scene && scene_file_revision(&source)? != self.scene_disk_revision {
            return Err(ProjectError::ExternalSceneModification(old_portable));
        }
        let target = self.resolve_for_write(&new_relative)?;
        if target.exists() {
            if !same_existing_file(&source, &target)? {
                return Err(ProjectError::InvalidProject(format!(
                    "scene already exists: {}",
                    new_relative.display()
                )));
            }
        }
        mengine_assets::ensure_asset_sidecar(&source, "scene").map_err(|error| {
            ProjectError::InvalidProject(format!(
                "cannot preserve scene asset identity for {old_portable}: {error}"
            ))
        })?;
        let source_sidecar = mengine_assets::asset_sidecar_path(&source);
        let target_sidecar = mengine_assets::asset_sidecar_path(&target);
        if target_sidecar.exists() && !same_existing_file(&source_sidecar, &target_sidecar)? {
            return Err(ProjectError::InvalidProject(format!(
                "scene metadata already exists: {}",
                target_sidecar.display()
            )));
        }
        let original_scene_bytes = std::fs::read(&source)?;
        let mut renamed_scene: serde_json::Value = serde_json::from_slice(&original_scene_bytes)?;
        let renamed_scene_object = renamed_scene.as_object_mut().ok_or_else(|| {
            ProjectError::InvalidProject(format!(
                "scene must contain a JSON object: {}",
                old_relative.display()
            ))
        })?;
        renamed_scene_object.insert(
            "name".into(),
            serde_json::Value::String(
                new_relative
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Untitled")
                    .to_string(),
            ),
        );
        let mut renamed_scene_bytes = serde_json::to_vec_pretty(&renamed_scene)?;
        renamed_scene_bytes.push(b'\n');

        let new_portable = new_relative.to_string_lossy().replace('\\', "/");
        let mut manifest = self.manifest.clone();
        if manifest
            .main_scene
            .as_deref()
            .is_some_and(|scene| scene.eq_ignore_ascii_case(&old_portable))
        {
            manifest.main_scene = Some(new_portable.clone());
        }
        for scene in &mut manifest.build_scenes {
            if scene.eq_ignore_ascii_case(&old_portable) {
                *scene = new_portable.clone();
            }
        }
        let manifest_changed = manifest.main_scene != self.manifest.main_scene
            || manifest.build_scenes != self.manifest.build_scenes;
        let manifest_bytes = if manifest_changed {
            let mut bytes = serde_json::to_vec_pretty(&manifest)?;
            bytes.push(b'\n');
            Some(bytes)
        } else {
            None
        };

        rename_file_case_aware(&source, &target)?;
        if let Err(error) = rename_file_case_aware(&source_sidecar, &target_sidecar) {
            if let Err(rollback) = rename_file_case_aware(&target, &source) {
                return Err(ProjectError::InvalidProject(format!(
                    "scene metadata rename failed ({error}) and scene rollback failed ({rollback})"
                )));
            }
            return Err(ProjectError::Io(error));
        }
        if let Err(error) = write_replace_synced(&target, &renamed_scene_bytes) {
            let metadata_rollback = rename_file_case_aware(&target_sidecar, &source_sidecar);
            let scene_rollback = rename_file_case_aware(&target, &source);
            if metadata_rollback.is_err() || scene_rollback.is_err() {
                return Err(ProjectError::InvalidProject(format!(
                    "scene rename could not update the scene name ({error}) and rollback failed (metadata: {:?}, scene: {:?})",
                    metadata_rollback.err(),
                    scene_rollback.err()
                )));
            }
            return Err(ProjectError::Io(error));
        }
        if let Some(bytes) = manifest_bytes {
            if let Err(error) =
                write_replace_synced(&self.project_root.join("project.json"), &bytes)
            {
                let content_rollback = write_replace_synced(&target, &original_scene_bytes);
                let metadata_rollback = rename_file_case_aware(&target_sidecar, &source_sidecar);
                let path_rollback = rename_file_case_aware(&target, &source);
                if content_rollback.is_err() || metadata_rollback.is_err() || path_rollback.is_err()
                {
                    return Err(ProjectError::InvalidProject(format!(
                        "scene rename could not update project.json ({error}) and rollback failed (content: {:?}, metadata: {:?}, scene: {:?})",
                        content_rollback.err(),
                        metadata_rollback.err(),
                        path_rollback.err()
                    )));
                }
                return Err(ProjectError::Io(error));
            }
            self.manifest = manifest;
        }
        if renaming_active_scene {
            self.scene_relative_path = Some(new_relative);
            self.scene_disk_revision = scene_file_revision(&target)?;
        }
        self.revision = self.revision.saturating_add(1);
        Ok(self.snapshot())
    }

    pub fn delete_scene(
        &mut self,
        relative_path: impl AsRef<Path>,
    ) -> Result<ProjectSnapshot, ProjectError> {
        let relative = normalize_scene_asset_path(relative_path.as_ref())?;
        let portable = relative.to_string_lossy().replace('\\', "/");
        if self.scene_relative_path.as_ref().is_some_and(|scene| {
            scene
                .to_string_lossy()
                .replace('\\', "/")
                .eq_ignore_ascii_case(&portable)
        }) {
            return Err(ProjectError::InvalidProject(
                "the active scene cannot be deleted; open another scene first".into(),
            ));
        }
        if self
            .build_scenes()
            .iter()
            .any(|scene| scene.eq_ignore_ascii_case(&portable))
        {
            return Err(ProjectError::InvalidProject(
                "the scene is included in Build Settings; remove it before deleting".into(),
            ));
        }
        let metadata = std::fs::symlink_metadata(self.project_root.join(&relative))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(ProjectError::InvalidPath(relative.display().to_string()));
        }
        let absolute = self.resolve_existing(&relative)?;
        let sidecar = mengine_assets::asset_sidecar_path(&absolute);
        if sidecar.exists() {
            let metadata = std::fs::symlink_metadata(&sidecar)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(ProjectError::InvalidProject(format!(
                    "scene metadata must be a regular file before deletion: {}",
                    sidecar.display()
                )));
            }
        }
        std::fs::remove_file(absolute)?;
        if sidecar.exists() {
            std::fs::remove_file(sidecar)?;
        }
        self.revision = self.revision.saturating_add(1);
        Ok(self.snapshot())
    }

    pub fn rename_asset(
        &mut self,
        request: AssetRenameRequest,
    ) -> Result<AssetRenameResult, ProjectError> {
        let source_relative = normalize_asset_file_path(Path::new(&request.source_path))?;
        let destination_relative = normalize_asset_file_path(Path::new(&request.destination_path))?;
        let source_portable = portable_path(&source_relative);
        let destination_portable = portable_path(&destination_relative);
        if source_portable == destination_portable {
            return Err(ProjectError::AssetTransaction(
                "source and destination paths are identical".into(),
            ));
        }
        if source_relative
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("mscene"))
        {
            return Err(ProjectError::AssetTransaction(
                "scenes must use the scene-aware rename command".into(),
            ));
        }
        if !same_asset_extension(&source_relative, &destination_relative) {
            return Err(ProjectError::AssetTransaction(
                "asset rename must preserve the file extension".into(),
            ));
        }
        if request.updates.len() > MAX_ASSET_RENAME_UPDATES {
            return Err(ProjectError::AssetTransaction(format!(
                "asset rename affects more than {MAX_ASSET_RENAME_UPDATES} files"
            )));
        }
        let update_bytes = request
            .updates
            .iter()
            .try_fold(0usize, |total, update| {
                total.checked_add(update.contents.len())
            })
            .ok_or_else(|| ProjectError::AssetTransaction("update size overflow".into()))?;
        if update_bytes > MAX_ASSET_RENAME_UPDATE_BYTES {
            return Err(ProjectError::AssetTransaction(
                "asset rename updates exceed 32 MiB".into(),
            ));
        }

        let source = self.resolve_regular_asset(&source_relative)?;
        let source_revision = scene_file_revision(&source)?.ok_or_else(|| {
            ProjectError::AssetTransaction(format!("asset not found: {source_portable}"))
        })?;
        if source_revision != request.expected_source_revision {
            return Err(ProjectError::AssetTransaction(format!(
                "asset changed on disk since preview: {source_portable}"
            )));
        }
        let source_sidecar = mengine_assets::asset_sidecar_path(&source);
        let sidecar = mengine_assets::read_asset_sidecar(&source, "asset")
            .map_err(ProjectError::AssetTransaction)?;
        if sidecar.guid.0 != request.expected_guid {
            return Err(ProjectError::AssetTransaction(format!(
                "asset identity changed on disk since preview: {source_portable}"
            )));
        }

        let (destination, created_directories) =
            self.prepare_asset_destination(&destination_relative)?;
        if destination.exists() && !same_existing_file(&source, &destination)? {
            return Err(ProjectError::AssetTransaction(format!(
                "destination asset already exists: {destination_portable}"
            )));
        }
        let destination_sidecar = mengine_assets::asset_sidecar_path(&destination);
        if destination_sidecar.exists()
            && !same_existing_file(&source_sidecar, &destination_sidecar)?
        {
            return Err(ProjectError::AssetTransaction(format!(
                "destination metadata already exists: {}",
                display_path(&destination_sidecar)
            )));
        }
        let source_sprite_import = path_with_suffix(&source, ".sprite.json");
        let destination_sprite_import = path_with_suffix(&destination, ".sprite.json");
        let moves_sprite_import = match std::fs::symlink_metadata(&source_sprite_import) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                return Err(ProjectError::AssetTransaction(format!(
                    "sprite import sidecar must be a regular file: {}",
                    display_path(&source_sprite_import)
                )));
            }
            Ok(_) => true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => return Err(ProjectError::Io(error)),
        };
        if moves_sprite_import
            && destination_sprite_import.exists()
            && !same_existing_file(&source_sprite_import, &destination_sprite_import)?
        {
            return Err(ProjectError::AssetTransaction(format!(
                "destination sprite import sidecar already exists: {}",
                display_path(&destination_sprite_import)
            )));
        }

        let mut seen_updates = HashSet::new();
        let mut prepared_updates = Vec::with_capacity(request.updates.len() + 1);
        for update in request.updates {
            let relative = normalize_asset_file_path(Path::new(&update.source_path))?;
            let portable = portable_path(&relative);
            let key = portable.to_lowercase();
            if !seen_updates.insert(key) {
                return Err(ProjectError::AssetTransaction(format!(
                    "duplicate asset update: {portable}"
                )));
            }
            if portable.to_lowercase().ends_with(".meta")
                || portable.eq_ignore_ascii_case(&format!("{source_portable}.sprite.json"))
                || portable.eq_ignore_ascii_case(&destination_portable)
            {
                return Err(ProjectError::AssetTransaction(format!(
                    "asset update targets a transaction-owned path: {portable}"
                )));
            }
            let path = self.resolve_regular_asset(&relative)?;
            let revision = scene_file_revision(&path)?.ok_or_else(|| {
                ProjectError::AssetTransaction(format!("update source is missing: {portable}"))
            })?;
            if revision != update.expected_revision {
                return Err(ProjectError::AssetTransaction(format!(
                    "referencing asset changed on disk since preview: {portable}"
                )));
            }
            let target = if portable.eq_ignore_ascii_case(&source_portable) {
                destination.clone()
            } else {
                path.clone()
            };
            prepared_updates.push(PreparedAssetUpdate {
                portable,
                original_path: path,
                target_path: target,
                expected_revision: Some(update.expected_revision),
                contents: update.contents.into_bytes(),
                original_contents: Vec::new(),
                staged_path: None,
                committed: false,
            });
        }

        let manifest_path = self.project_root.join("project.json");
        let manifest_revision = scene_file_revision(&manifest_path)?.ok_or_else(|| {
            ProjectError::AssetTransaction("project.json disappeared during rename".into())
        })?;
        let manifest_original = std::fs::read(&manifest_path)?;
        let mut manifest: ProjectManifest = serde_json::from_slice(&manifest_original)?;
        let manifest_changed = rewrite_manifest_asset_references(
            &mut manifest,
            &source_portable,
            &destination_portable,
        );
        let manifest_contents = if manifest_changed {
            let mut bytes = serde_json::to_vec_pretty(&manifest)?;
            bytes.push(b'\n');
            Some(bytes)
        } else {
            None
        };

        let create_destination_directories = (|| -> Result<(), ProjectError> {
            for directory in &created_directories {
                std::fs::create_dir(directory)?;
                let canonical = std::fs::canonicalize(directory)?;
                self.ensure_under_root(canonical)?;
            }
            Ok(())
        })();
        if let Err(error) = create_destination_directories {
            remove_empty_directories(&created_directories);
            return Err(error);
        }

        let prepared = (|| -> Result<(), ProjectError> {
            for update in &mut prepared_updates {
                update.original_contents = std::fs::read(&update.original_path)?;
                update.staged_path =
                    Some(stage_synced_file(&update.target_path, &update.contents)?);
            }
            if let Some(contents) = &manifest_contents {
                prepared_updates.push(PreparedAssetUpdate {
                    portable: "project.json".into(),
                    original_path: manifest_path.clone(),
                    target_path: manifest_path.clone(),
                    expected_revision: Some(manifest_revision.clone()),
                    contents: contents.clone(),
                    original_contents: manifest_original.clone(),
                    staged_path: Some(stage_synced_file(&manifest_path, contents)?),
                    committed: false,
                });
            }
            if scene_file_revision(&source)?.as_deref() != Some(&request.expected_source_revision) {
                return Err(ProjectError::AssetTransaction(format!(
                    "asset changed while rename was being prepared: {source_portable}"
                )));
            }
            let current_sidecar = mengine_assets::read_asset_sidecar(&source, "asset")
                .map_err(ProjectError::AssetTransaction)?;
            if current_sidecar.guid.0 != request.expected_guid {
                return Err(ProjectError::AssetTransaction(format!(
                    "asset identity changed while rename was being prepared: {source_portable}"
                )));
            }
            if moves_sprite_import {
                let metadata = std::fs::symlink_metadata(&source_sprite_import)?;
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err(ProjectError::AssetTransaction(format!(
                        "sprite import sidecar changed while rename was being prepared: {}",
                        display_path(&source_sprite_import)
                    )));
                }
            }
            for update in &prepared_updates {
                if update.portable == "project.json" {
                    if scene_file_revision(&manifest_path)?.as_deref()
                        != update.expected_revision.as_deref()
                    {
                        return Err(ProjectError::AssetTransaction(
                            "project.json changed while rename was being prepared".into(),
                        ));
                    }
                } else if !update.portable.eq_ignore_ascii_case(&source_portable)
                    && scene_file_revision(&update.original_path)?.as_deref()
                        != update.expected_revision.as_deref()
                {
                    return Err(ProjectError::AssetTransaction(format!(
                        "referencing asset changed while rename was being prepared: {}",
                        update.portable
                    )));
                }
            }
            Ok(())
        })();
        if let Err(error) = prepared {
            cleanup_staged_updates(&prepared_updates);
            remove_empty_directories(&created_directories);
            return Err(error);
        }

        let mut asset_moved = false;
        let mut metadata_moved = false;
        let mut sprite_import_moved = false;
        let committed = (|| -> Result<(), ProjectError> {
            rename_file_case_aware(&source, &destination)?;
            asset_moved = true;
            rename_file_case_aware(&source_sidecar, &destination_sidecar)?;
            metadata_moved = true;
            if moves_sprite_import {
                rename_file_case_aware(&source_sprite_import, &destination_sprite_import)?;
                sprite_import_moved = true;
            }
            for update in &mut prepared_updates {
                let staged = update.staged_path.as_ref().ok_or_else(|| {
                    ProjectError::AssetTransaction("asset update was not staged".into())
                })?;
                replace_file(staged, &update.target_path)?;
                update.committed = true;
            }
            Ok(())
        })();

        if let Err(error) = committed {
            let mut rollback_errors = Vec::new();
            for update in prepared_updates
                .iter()
                .rev()
                .filter(|update| update.committed)
            {
                if let Err(rollback) =
                    write_replace_synced(&update.target_path, &update.original_contents)
                {
                    rollback_errors.push(format!("{}: {rollback}", update.portable));
                }
            }
            if sprite_import_moved {
                if let Err(rollback) =
                    rename_file_case_aware(&destination_sprite_import, &source_sprite_import)
                {
                    rollback_errors.push(format!("sprite import: {rollback}"));
                }
            }
            if metadata_moved {
                if let Err(rollback) = rename_file_case_aware(&destination_sidecar, &source_sidecar)
                {
                    rollback_errors.push(format!("metadata: {rollback}"));
                }
            }
            if asset_moved {
                if let Err(rollback) = rename_file_case_aware(&destination, &source) {
                    rollback_errors.push(format!("asset: {rollback}"));
                }
            }
            cleanup_staged_updates(&prepared_updates);
            remove_empty_directories(&created_directories);
            if rollback_errors.is_empty() {
                return Err(error);
            }
            return Err(ProjectError::AssetTransaction(format!(
                "{error}; rollback also failed: {}",
                rollback_errors.join(", ")
            )));
        }

        cleanup_staged_updates(&prepared_updates);
        if manifest_changed {
            self.manifest = manifest;
        }
        self.revision = self.revision.saturating_add(1);
        let mut updated_paths = prepared_updates
            .iter()
            .filter(|update| update.portable != "project.json")
            .map(|update| {
                if update.portable.eq_ignore_ascii_case(&source_portable) {
                    destination_portable.clone()
                } else {
                    update.portable.clone()
                }
            })
            .collect::<Vec<_>>();
        if manifest_changed {
            updated_paths.push("project.json".into());
        }
        updated_paths.sort();
        updated_paths.dedup();
        Ok(AssetRenameResult {
            source_path: source_portable,
            destination_path: destination_portable,
            updated_paths,
        })
    }

    pub fn duplicate_asset(
        &mut self,
        request: AssetDuplicateRequest,
    ) -> Result<AssetDuplicateResult, ProjectError> {
        let source_relative = normalize_asset_file_path(Path::new(&request.source_path))?;
        let destination_relative = normalize_asset_file_path(Path::new(&request.destination_path))?;
        let source_portable = portable_path(&source_relative);
        let destination_portable = portable_path(&destination_relative);
        if source_portable.eq_ignore_ascii_case(&destination_portable) {
            return Err(ProjectError::AssetTransaction(
                "duplicate destination must differ from the source".into(),
            ));
        }
        if source_relative
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("mscene"))
        {
            return Err(ProjectError::AssetTransaction(
                "scenes must use Save As instead of generic duplication".into(),
            ));
        }
        if !same_asset_extension(&source_relative, &destination_relative) {
            return Err(ProjectError::AssetTransaction(
                "asset duplication must preserve the file extension".into(),
            ));
        }
        if request
            .contents
            .as_ref()
            .is_some_and(|contents| contents.len() > MAX_ASSET_RENAME_UPDATE_BYTES)
        {
            return Err(ProjectError::AssetTransaction(
                "duplicate rewritten contents exceed 32 MiB".into(),
            ));
        }

        let source = self.resolve_regular_asset(&source_relative)?;
        let source_metadata = std::fs::symlink_metadata(&source)?;
        if source_metadata.len() > MAX_ASSET_DUPLICATE_BYTES {
            return Err(ProjectError::AssetTransaction(
                "source asset exceeds the 512 MiB duplication limit".into(),
            ));
        }
        if scene_file_revision(&source)?.as_deref() != Some(&request.expected_source_revision) {
            return Err(ProjectError::AssetTransaction(format!(
                "asset changed on disk since duplicate preview: {source_portable}"
            )));
        }
        let sidecar = mengine_assets::read_asset_sidecar(&source, "asset")
            .map_err(ProjectError::AssetTransaction)?;
        if sidecar.guid.0 != request.expected_guid {
            return Err(ProjectError::AssetTransaction(format!(
                "asset identity changed on disk since duplicate preview: {source_portable}"
            )));
        }
        let source_sidecar = mengine_assets::asset_sidecar_path(&source);
        let source_sidecar_revision = scene_file_revision(&source_sidecar)?.ok_or_else(|| {
            ProjectError::AssetTransaction("source asset metadata disappeared".into())
        })?;
        let (new_guid, duplicated_sidecar) = duplicate_sidecar_bytes(&source_sidecar)?;

        let (destination, created_directories) =
            self.prepare_asset_destination(&destination_relative)?;
        let destination_sidecar = mengine_assets::asset_sidecar_path(&destination);
        let source_sprite_import = path_with_suffix(&source, ".sprite.json");
        let destination_sprite_import = path_with_suffix(&destination, ".sprite.json");
        for target in [
            &destination,
            &destination_sidecar,
            &destination_sprite_import,
        ] {
            match std::fs::symlink_metadata(target) {
                Ok(_) => {
                    return Err(ProjectError::AssetTransaction(format!(
                        "duplicate target already exists: {}",
                        display_path(target)
                    )));
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(ProjectError::Io(error)),
            }
        }
        let sprite_import_revision = match std::fs::symlink_metadata(&source_sprite_import) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                return Err(ProjectError::AssetTransaction(format!(
                    "sprite import sidecar must be a regular file: {}",
                    display_path(&source_sprite_import)
                )));
            }
            Ok(metadata) if metadata.len() > MAX_ASSET_DUPLICATE_BYTES => {
                return Err(ProjectError::AssetTransaction(
                    "sprite import sidecar exceeds the duplication limit".into(),
                ));
            }
            Ok(_) => scene_file_revision(&source_sprite_import)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(ProjectError::Io(error)),
        };
        let copies_sprite_import = sprite_import_revision.is_some();

        let create_directories = (|| -> Result<(), ProjectError> {
            for directory in &created_directories {
                std::fs::create_dir(directory)?;
                self.ensure_under_root(std::fs::canonicalize(directory)?)?;
            }
            Ok(())
        })();
        if let Err(error) = create_directories {
            remove_empty_directories(&created_directories);
            return Err(error);
        }

        let mut staged = Vec::new();
        let prepared = (|| -> Result<(), ProjectError> {
            staged.push(if let Some(contents) = &request.contents {
                stage_synced_file(&destination, contents.as_bytes())?
            } else {
                stage_synced_copy(&source, &destination)?
            });
            staged.push(stage_synced_file(
                &destination_sidecar,
                &duplicated_sidecar,
            )?);
            if copies_sprite_import {
                staged.push(stage_synced_copy(
                    &source_sprite_import,
                    &destination_sprite_import,
                )?);
            }
            if scene_file_revision(&source)?.as_deref() != Some(&request.expected_source_revision) {
                return Err(ProjectError::AssetTransaction(format!(
                    "asset changed while duplicate was being prepared: {source_portable}"
                )));
            }
            let current_sidecar = mengine_assets::read_asset_sidecar(&source, "asset")
                .map_err(ProjectError::AssetTransaction)?;
            if current_sidecar.guid.0 != request.expected_guid {
                return Err(ProjectError::AssetTransaction(format!(
                    "asset identity changed while duplicate was being prepared: {source_portable}"
                )));
            }
            if scene_file_revision(&source_sidecar)?.as_deref() != Some(&source_sidecar_revision) {
                return Err(ProjectError::AssetTransaction(
                    "asset metadata changed while duplicate was being prepared".into(),
                ));
            }
            if copies_sprite_import {
                let metadata = std::fs::symlink_metadata(&source_sprite_import)?;
                if metadata.file_type().is_symlink() || !metadata.is_file() {
                    return Err(ProjectError::AssetTransaction(
                        "sprite import sidecar changed while duplicate was being prepared".into(),
                    ));
                }
                if scene_file_revision(&source_sprite_import)? != sprite_import_revision {
                    return Err(ProjectError::AssetTransaction(
                        "sprite import sidecar changed while duplicate was being prepared".into(),
                    ));
                }
            }
            Ok(())
        })();
        if let Err(error) = prepared {
            cleanup_paths(&staged);
            remove_empty_directories(&created_directories);
            return Err(error);
        }

        let targets = if copies_sprite_import {
            vec![
                destination.clone(),
                destination_sidecar.clone(),
                destination_sprite_import,
            ]
        } else {
            vec![destination.clone(), destination_sidecar]
        };
        let mut installed: Vec<PathBuf> = Vec::new();
        for (temporary, target) in staged.iter().zip(&targets) {
            if let Err(error) = install_staged_new(temporary, target) {
                let mut rollback_errors = Vec::new();
                for installed_path in installed.iter().rev() {
                    if let Err(rollback) = std::fs::remove_file(installed_path) {
                        rollback_errors
                            .push(format!("{}: {rollback}", display_path(installed_path)));
                    }
                }
                cleanup_paths(&staged);
                remove_empty_directories(&created_directories);
                if rollback_errors.is_empty() {
                    return Err(ProjectError::Io(error));
                }
                return Err(ProjectError::AssetTransaction(format!(
                    "duplicate install failed ({error}); rollback also failed: {}",
                    rollback_errors.join(", ")
                )));
            }
            installed.push(target.to_path_buf());
        }
        cleanup_paths(&staged);
        self.revision = self.revision.saturating_add(1);
        Ok(AssetDuplicateResult {
            source_path: source_portable,
            destination_path: destination_portable,
            guid: new_guid,
        })
    }

    pub fn open_scene(
        &mut self,
        relative_path: impl AsRef<Path>,
    ) -> Result<ProjectSnapshot, ProjectError> {
        let relative = normalize_relative_path(relative_path.as_ref())?;
        let absolute = self.resolve_existing(&relative)?;
        let mut disk_revision = None;
        for attempt in 0..2 {
            let before = scene_file_revision(&absolute)?.ok_or_else(|| {
                ProjectError::InvalidPath(relative.to_string_lossy().into_owned())
            })?;
            self.editor
                .handle_editor_command(EditorCommand::LoadScene {
                    path: absolute.to_string_lossy().into_owned(),
                })?;
            let after = scene_file_revision(&absolute)?.ok_or_else(|| {
                ProjectError::InvalidPath(relative.to_string_lossy().into_owned())
            })?;
            if before == after {
                disk_revision = Some(after);
                break;
            }
            if attempt == 1 {
                return Err(ProjectError::ExternalSceneModification(
                    relative.to_string_lossy().replace('\\', "/"),
                ));
            }
        }
        self.scene_relative_path = Some(relative);
        self.scene_disk_revision = disk_revision;
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
        let changes_document = WorldSnapshot::from_world(&self.editor.edit_world) != snapshot;
        if changes_document {
            self.editor.replace_edit_snapshot(&snapshot);
        }
        self.revision = self.revision.saturating_add(1);
        if changes_document {
            self.document_revision = self.document_revision.saturating_add(1);
        }
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
        let saving_active_scene = self.scene_relative_path.as_ref().is_some_and(|current| {
            current
                .to_string_lossy()
                .eq_ignore_ascii_case(&relative.to_string_lossy())
        });
        if saving_active_scene && scene_file_revision(&absolute)? != self.scene_disk_revision {
            return Err(ProjectError::ExternalSceneModification(
                relative.to_string_lossy().replace('\\', "/"),
            ));
        }
        let scene_name = relative
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| ProjectError::InvalidPath(relative.display().to_string()))?
            .to_string();
        let previous_scene_name = std::mem::replace(&mut self.editor.scene_name, scene_name);
        if let Err(error) = self.editor.handle_editor_command(EditorCommand::SaveScene {
            path: absolute.to_string_lossy().into_owned(),
        }) {
            self.editor.scene_name = previous_scene_name;
            return Err(ProjectError::Editor(error));
        }
        self.scene_relative_path = Some(relative);
        self.scene_disk_revision = scene_file_revision(&absolute)?;
        self.revision = self.revision.saturating_add(1);
        self.save_revision = self.document_revision;
        // The scene is already durable at this point. A stale recovery file is
        // undesirable, but cleanup failure must not turn a successful save into
        // a reported save failure.
        let _ = self.discard_scene_recovery();
        Ok(self.snapshot())
    }

    pub fn write_scene_recovery(&self) -> Result<Option<SceneRecoveryInfo>, ProjectError> {
        if self.document_revision == self.save_revision {
            self.discard_scene_recovery()?;
            return Ok(None);
        }
        let relative = self.scene_relative_path.as_ref().ok_or_else(|| {
            ProjectError::InvalidPath("cannot recover an unnamed scene; save it once first".into())
        })?;
        let relative = normalize_scene_asset_path(relative)?;
        let scene_path = relative.to_string_lossy().replace('\\', "/");
        let recorded_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u64::MAX as u128) as u64;
        let record = SceneRecoveryRecord {
            schema_version: SCENE_RECOVERY_SCHEMA_VERSION,
            scene_path,
            recorded_at_ms,
            document_revision: self.document_revision,
            world: WorldSnapshot::from_world(&self.editor.edit_world),
        };
        let mut bytes = serde_json::to_vec_pretty(&record)?;
        bytes.push(b'\n');
        let path = self.resolve_for_write(Path::new(SCENE_RECOVERY_PATH))?;
        if path.exists() {
            let metadata = std::fs::symlink_metadata(&path)?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(ProjectError::InvalidPath(display_path(&path)));
            }
        }
        write_replace_synced(&path, &bytes)?;
        Ok(Some(scene_recovery_info(&record)))
    }

    pub fn scene_recovery_info(&self) -> Result<Option<SceneRecoveryInfo>, ProjectError> {
        self.read_scene_recovery()
            .map(|record| record.map(|record| scene_recovery_info(&record)))
    }

    pub fn restore_scene_recovery(&mut self) -> Result<ProjectSnapshot, ProjectError> {
        let record = self.read_scene_recovery()?.ok_or_else(|| {
            ProjectError::InvalidProject("no scene recovery checkpoint is available".into())
        })?;
        let relative = normalize_scene_asset_path(Path::new(&record.scene_path))?;
        let absolute = self.resolve_for_write(&relative)?;
        self.editor.replace_edit_snapshot(&record.world);
        self.editor.scene_name = relative
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled")
            .to_string();
        self.editor.scene_path = Some(absolute.to_string_lossy().into_owned());
        self.scene_relative_path = Some(relative);
        self.scene_disk_revision = scene_file_revision(&absolute)?;
        self.revision = self.revision.saturating_add(1);
        self.document_revision = record
            .document_revision
            .max(self.document_revision.saturating_add(1))
            .max(self.save_revision.saturating_add(1));
        Ok(self.snapshot())
    }

    pub fn discard_scene_recovery(&self) -> Result<(), ProjectError> {
        let path = self.project_root.join(SCENE_RECOVERY_PATH);
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(ProjectError::Io(error)),
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(ProjectError::InvalidPath(display_path(&path)));
        }
        std::fs::remove_file(path)?;
        Ok(())
    }

    fn read_scene_recovery(&self) -> Result<Option<SceneRecoveryRecord>, ProjectError> {
        let path = self.project_root.join(SCENE_RECOVERY_PATH);
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(ProjectError::Io(error)),
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(ProjectError::InvalidPath(display_path(&path)));
        }
        if metadata.len() > MAX_SCENE_RECOVERY_BYTES {
            return Err(ProjectError::InvalidProject(format!(
                "scene recovery file exceeds {} MiB",
                MAX_SCENE_RECOVERY_BYTES / 1024 / 1024
            )));
        }
        let record: SceneRecoveryRecord = serde_json::from_slice(&std::fs::read(&path)?)?;
        if record.schema_version != SCENE_RECOVERY_SCHEMA_VERSION {
            return Err(ProjectError::InvalidProject(format!(
                "unsupported scene recovery schema: {}",
                record.schema_version
            )));
        }
        let relative = normalize_scene_asset_path(Path::new(&record.scene_path))?;
        self.resolve_for_write(&relative)?;
        Ok(Some(record))
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

    fn resolve_regular_asset(&self, relative: &Path) -> Result<PathBuf, ProjectError> {
        let requested = self.project_root.join(relative);
        let metadata = std::fs::symlink_metadata(&requested)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(ProjectError::InvalidPath(portable_path(relative)));
        }
        self.resolve_existing(relative)
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

        let target =
            safe_parent.join(candidate.file_name().ok_or_else(|| {
                ProjectError::InvalidPath(relative.to_string_lossy().into_owned())
            })?);
        match std::fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                Err(ProjectError::InvalidPath(display_path(&target)))
            }
            Ok(_) => Ok(target),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(target),
            Err(error) => Err(ProjectError::Io(error)),
        }
    }

    fn ensure_under_root(&self, candidate: PathBuf) -> Result<PathBuf, ProjectError> {
        if candidate.starts_with(&self.project_root) {
            Ok(candidate)
        } else {
            Err(ProjectError::InvalidPath(candidate.display().to_string()))
        }
    }

    fn prepare_asset_destination(
        &self,
        relative: &Path,
    ) -> Result<(PathBuf, Vec<PathBuf>), ProjectError> {
        let parent = relative
            .parent()
            .ok_or_else(|| ProjectError::InvalidPath(relative.display().to_string()))?;
        let mut current = self.project_root.clone();
        let mut created = Vec::new();
        for component in parent.components() {
            let Component::Normal(segment) = component else {
                return Err(ProjectError::InvalidPath(relative.display().to_string()));
            };
            current.push(segment);
            match std::fs::symlink_metadata(&current) {
                Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                    return Err(ProjectError::InvalidPath(display_path(&current)));
                }
                Ok(_) => {
                    self.ensure_under_root(std::fs::canonicalize(&current)?)?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    created.push(current.clone());
                }
                Err(error) => return Err(ProjectError::Io(error)),
            }
        }
        let target = self.project_root.join(relative);
        match std::fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
                Err(ProjectError::InvalidPath(display_path(&target)))
            }
            Ok(_) => Ok((target, created)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((target, created)),
            Err(error) => Err(ProjectError::Io(error)),
        }
    }
}

struct PreparedAssetUpdate {
    portable: String,
    original_path: PathBuf,
    target_path: PathBuf,
    expected_revision: Option<String>,
    contents: Vec<u8>,
    original_contents: Vec<u8>,
    staged_path: Option<PathBuf>,
    committed: bool,
}

fn portable_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn path_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_owned();
    value.push(suffix);
    PathBuf::from(value)
}

fn valid_asset_segment(segment: &str) -> bool {
    if segment.is_empty()
        || segment.starts_with('.')
        || segment.ends_with(['.', ' '])
        || segment.chars().count() > 240
        || segment
            .chars()
            .any(|value| value.is_control() || r#"<>:"/\|?*"#.contains(value))
    {
        return false;
    }
    let stem = segment
        .split('.')
        .next()
        .unwrap_or(segment)
        .to_ascii_uppercase();
    !matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn normalize_asset_file_path(path: &Path) -> Result<PathBuf, ProjectError> {
    let normalized = normalize_relative_path(path)?;
    let mut components = normalized.components();
    if components.next() != Some(Component::Normal("Assets".as_ref())) {
        return Err(ProjectError::InvalidPath(normalized.display().to_string()));
    }
    let mut count = 1usize;
    for component in components {
        let Component::Normal(value) = component else {
            return Err(ProjectError::InvalidPath(normalized.display().to_string()));
        };
        let Some(segment) = value.to_str() else {
            return Err(ProjectError::InvalidPath(normalized.display().to_string()));
        };
        if !valid_asset_segment(segment) {
            return Err(ProjectError::InvalidPath(normalized.display().to_string()));
        }
        count += 1;
    }
    let portable = portable_path(&normalized);
    if count < 2
        || portable.to_ascii_lowercase().ends_with(".meta")
        || portable.to_ascii_lowercase().ends_with(".sprite.json")
        || normalized.extension().is_none()
    {
        return Err(ProjectError::InvalidPath(portable));
    }
    Ok(normalized)
}

fn same_asset_extension(left: &Path, right: &Path) -> bool {
    match (
        left.extension().and_then(|value| value.to_str()),
        right.extension().and_then(|value| value.to_str()),
    ) {
        (Some(left), Some(right)) => left.eq_ignore_ascii_case(right),
        _ => false,
    }
}

fn rewrite_asset_reference(value: &mut String, source: &str, destination: &str) -> bool {
    let marker = value.find('#').unwrap_or(value.len());
    if !value[..marker]
        .replace('\\', "/")
        .eq_ignore_ascii_case(source)
    {
        return false;
    }
    *value = format!("{destination}{}", &value[marker..]);
    true
}

fn rewrite_manifest_extra(value: &mut serde_json::Value, source: &str, destination: &str) -> bool {
    match value {
        serde_json::Value::String(value) => rewrite_asset_reference(value, source, destination),
        serde_json::Value::Array(values) => {
            let mut changed = false;
            for value in values {
                changed |= rewrite_manifest_extra(value, source, destination);
            }
            changed
        }
        serde_json::Value::Object(values) => {
            let mut changed = false;
            for value in values.values_mut() {
                changed |= rewrite_manifest_extra(value, source, destination);
            }
            changed
        }
        _ => false,
    }
}

fn rewrite_manifest_asset_references(
    manifest: &mut ProjectManifest,
    source: &str,
    destination: &str,
) -> bool {
    let mut changed = false;
    if let Some(path) = &mut manifest.main_scene {
        changed |= rewrite_asset_reference(path, source, destination);
    }
    for path in &mut manifest.build_scenes {
        changed |= rewrite_asset_reference(path, source, destination);
    }
    if let Some(path) = &mut manifest.startup_script {
        changed |= rewrite_asset_reference(path, source, destination);
    }
    for path in &mut manifest.always_include {
        changed |= rewrite_asset_reference(path, source, destination);
    }
    for value in manifest.extra.values_mut() {
        changed |= rewrite_manifest_extra(value, source, destination);
    }
    changed
}

fn stage_synced_file(target: &Path, contents: &[u8]) -> std::io::Result<PathBuf> {
    let parent = target.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "asset update has no parent",
        )
    })?;
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let temporary = parent.join(format!(".{name}.rename.{}.tmp", Uuid::new_v4()));
    if let Err(error) = write_new_synced(&temporary, contents) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(temporary)
}

fn stage_synced_copy(source: &Path, target: &Path) -> std::io::Result<PathBuf> {
    let parent = target.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "duplicate target has no parent",
        )
    })?;
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let temporary = parent.join(format!(".{name}.duplicate.{}.tmp", Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut input = std::fs::File::open(source)?;
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        std::io::copy(&mut input, &mut output)?;
        output.sync_all()
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(temporary)
}

fn install_staged_new(temporary: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::hard_link(temporary, target)?;
    let _ = std::fs::remove_file(temporary);
    Ok(())
}

fn cleanup_paths(paths: &[PathBuf]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}

fn duplicate_sidecar_bytes(path: &Path) -> Result<(Uuid, Vec<u8>), ProjectError> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err(ProjectError::AssetTransaction(format!(
            "asset metadata cannot be duplicated: {}",
            display_path(path)
        )));
    }
    let mut value: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)?;
    let object = value.as_object_mut().ok_or_else(|| {
        ProjectError::AssetTransaction("asset metadata root must be an object".into())
    })?;
    let new_guid = Uuid::new_v4();
    let identity = serde_json::Value::String(new_guid.to_string());
    let mut replaced = false;
    for key in ["guid", "uuid"] {
        if object.contains_key(key) {
            object.insert(key.into(), identity.clone());
            replaced = true;
        }
    }
    if let Some(mengine) = object
        .get_mut("mengine")
        .and_then(serde_json::Value::as_object_mut)
    {
        if mengine.contains_key("guid") {
            mengine.insert("guid".into(), identity.clone());
            replaced = true;
        }
    }
    if !replaced {
        object.insert("guid".into(), identity);
    }
    let mut bytes = serde_json::to_vec_pretty(&value)?;
    bytes.push(b'\n');
    Ok((new_guid, bytes))
}

fn cleanup_staged_updates(updates: &[PreparedAssetUpdate]) {
    for update in updates {
        if let Some(path) = &update.staged_path {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn remove_empty_directories(directories: &[PathBuf]) {
    for directory in directories.iter().rev() {
        let _ = std::fs::remove_dir(directory);
    }
}

fn scene_recovery_info(record: &SceneRecoveryRecord) -> SceneRecoveryInfo {
    SceneRecoveryInfo {
        scene_path: record.scene_path.clone(),
        scene_name: Path::new(&record.scene_path)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled")
            .to_string(),
        recorded_at_ms: record.recorded_at_ms,
        document_revision: record.document_revision,
        entity_count: record.world.entities.len(),
    }
}

fn scene_file_revision(path: &Path) -> Result<Option<String>, ProjectError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(ProjectError::Io(error)),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ProjectError::InvalidPath(display_path(path)));
    }
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    Ok(Some(format!("{modified_ns:x}-{:x}", metadata.len())))
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
        asset_mode: BuildAssetMode::All,
        always_include: Vec::new(),
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
  playAnimation(entity: number | string, restart?: boolean): boolean;
  pauseAnimation(entity: number | string): boolean;
  stopAnimation(entity: number | string): boolean;
  seekAnimation(entity: number | string, time: number): boolean;
  playTimeline(entity: number | string, restart?: boolean): boolean;
  pauseTimeline(entity: number | string): boolean;
  stopTimeline(entity: number | string): boolean;
  seekTimeline(entity: number | string, time: number): boolean;
  playAudio(entity: number | string): boolean;
  pauseAudio(entity: number | string): boolean;
  stopAudio(entity: number | string): boolean;
  seekAudio(entity: number | string, time: number): boolean;
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

interface EngineTimelineSignalInfo {
  readonly entity: string;
  readonly track: string;
  readonly signal: string;
  readonly time: number;
  readonly payload: unknown;
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
declare function onTimelineSignal(event: EngineTimelineSignalInfo): void;
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

fn normalize_scene_asset_path(path: &Path) -> Result<PathBuf, ProjectError> {
    let normalized = normalize_relative_path(path)?;
    let components = normalized.components().collect::<Vec<_>>();
    let valid_parent = components.len() == 3
        && components[0] == Component::Normal("Assets".as_ref())
        && components[1] == Component::Normal("Scenes".as_ref());
    let valid_extension = normalized
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("mscene"));
    let Some(stem) = normalized.file_stem().and_then(|value| value.to_str()) else {
        return Err(ProjectError::InvalidPath(normalized.display().to_string()));
    };
    if !valid_parent || !valid_extension {
        return Err(ProjectError::InvalidPath(normalized.display().to_string()));
    }
    validate_project_name(stem)?;
    Ok(normalized)
}

fn rename_file_case_aware(source: &Path, target: &Path) -> std::io::Result<()> {
    if source == target {
        return Ok(());
    }
    if !target.exists() {
        return std::fs::rename(source, target);
    }
    let metadata = std::fs::symlink_metadata(target)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "scene rename target is not the source file",
        ));
    }
    if !same_existing_file(source, target)? {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "scene rename target already exists",
        ));
    }
    let parent = source.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "scene has no parent")
    })?;
    let temporary = parent.join(format!(".scene-rename.{}.tmp", Uuid::new_v4()));
    std::fs::rename(source, &temporary)?;
    if let Err(error) = std::fs::rename(&temporary, target) {
        let _ = std::fs::rename(&temporary, source);
        return Err(error);
    }
    Ok(())
}

#[cfg(windows)]
fn same_existing_file(left: &Path, right: &Path) -> std::io::Result<bool> {
    let left = std::fs::canonicalize(left)?;
    let right = std::fs::canonicalize(right)?;
    Ok(left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase())
}

#[cfg(unix)]
fn same_existing_file(left: &Path, right: &Path) -> std::io::Result<bool> {
    use std::os::unix::fs::MetadataExt;
    let left = std::fs::metadata(left)?;
    let right = std::fs::metadata(right)?;
    Ok(left.dev() == right.dev() && left.ino() == right.ino())
}

#[cfg(not(any(windows, unix)))]
fn same_existing_file(left: &Path, right: &Path) -> std::io::Result<bool> {
    Ok(std::fs::canonicalize(left)? == std::fs::canonicalize(right)?)
}

fn normalize_build_asset_paths(
    project_root: &Path,
    paths: &[String],
) -> Result<Vec<String>, ProjectError> {
    if paths.len() > 256 {
        return Err(ProjectError::InvalidProject(
            "alwaysInclude supports at most 256 paths".into(),
        ));
    }
    let mut normalized = Vec::with_capacity(paths.len());
    let mut seen = HashSet::new();
    for path in paths {
        let portable_input = path.trim().replace('\\', "/");
        let relative = normalize_relative_path(Path::new(&portable_input))?;
        let under_content = matches!(
            relative.components().next(),
            Some(Component::Normal(value)) if value == "Assets" || value == "Scripts"
        );
        if !under_content {
            return Err(ProjectError::InvalidPath(relative.display().to_string()));
        }
        let absolute = std::fs::canonicalize(project_root.join(&relative))?;
        if !absolute.starts_with(project_root) {
            return Err(ProjectError::InvalidPath(relative.display().to_string()));
        }
        let portable = relative.to_string_lossy().replace('\\', "/");
        if portable.to_lowercase().ends_with(".meta") {
            return Err(ProjectError::InvalidProject(format!(
                "alwaysInclude cannot package editor asset metadata: {portable}"
            )));
        }
        if !seen.insert(portable.to_lowercase()) {
            return Err(ProjectError::InvalidProject(format!(
                "duplicate alwaysInclude path: {portable}"
            )));
        }
        normalized.push(portable);
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
    fn project_writes_reject_existing_non_file_targets() {
        let root = make_project();
        let session = ProjectSession::open(&root).unwrap();
        std::fs::create_dir(root.join("Assets/Scenes/Blocked.mscene")).unwrap();
        assert!(matches!(
            session.resolve_for_write(Path::new("Assets/Scenes/Blocked.mscene")),
            Err(ProjectError::InvalidPath(_))
        ));
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
    fn save_as_updates_the_serialized_scene_name() {
        let root = make_project();
        let mut session = ProjectSession::open(&root).unwrap();
        session.open_main_scene().unwrap();
        let saved = session
            .save_scene(Some(Path::new("Assets/Scenes/CopiedScene.mscene")))
            .unwrap();
        assert_eq!(
            saved.scene_path.as_deref(),
            Some("Assets/Scenes/CopiedScene.mscene")
        );
        let file: serde_json::Value = serde_json::from_slice(
            &std::fs::read(root.join("Assets/Scenes/CopiedScene.mscene")).unwrap(),
        )
        .unwrap();
        assert_eq!(file["name"], "CopiedScene");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn scene_save_refuses_to_overwrite_an_external_change() {
        let root = make_project();
        let main = root.join("Assets/Scenes/Main.mscene");
        let mut session = ProjectSession::open(&root).unwrap();
        let opened = session.open_main_scene().unwrap().unwrap();
        let mut changed = opened.world;
        changed.clear_color = [0.8, 0.3, 0.1, 1.0];
        session.replace_snapshot(opened.revision, changed).unwrap();

        let external = br#"{
            "version": 1,
            "name": "External",
            "world": {
                "entities": [],
                "frame": 0,
                "sim_frame": 0,
                "clear_color": [0.2, 0.8, 0.3, 1.0],
                "selected": null
            }
        }"#;
        std::fs::write(&main, external).unwrap();
        assert!(matches!(
            session
                .rename_scene(
                    "Assets/Scenes/Main.mscene",
                    "Assets/Scenes/RenamedExternallyChanged.mscene"
                )
                .unwrap_err(),
            ProjectError::ExternalSceneModification(_)
        ));
        assert!(main.is_file());
        let error = session.save_scene(None).unwrap_err();
        assert!(matches!(error, ProjectError::ExternalSceneModification(_)));
        assert_eq!(std::fs::read(&main).unwrap(), external);

        let reloaded = session.open_main_scene().unwrap().unwrap();
        assert_eq!(reloaded.world.clear_color, [0.2, 0.8, 0.3, 1.0]);
        session.save_scene(None).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replacement_is_revision_guarded_and_marks_the_scene_dirty() {
        let root = make_project();
        let mut session = ProjectSession::open(&root).unwrap();
        let opened = session.open_main_scene().unwrap().unwrap();

        let unchanged = session
            .replace_snapshot(opened.revision, opened.world.clone())
            .unwrap();
        assert!(!unchanged.dirty);

        let mut changed = opened.world.clone();
        changed.clear_color = [0.8, 0.2, 0.3, 1.0];

        let replaced = session
            .replace_snapshot(unchanged.revision, changed)
            .unwrap();
        assert!(replaced.dirty);
        assert!(replaced.revision > unchanged.revision);

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
    fn dirty_scene_recovery_survives_restart_and_is_cleared_by_save() {
        let root = make_project();
        let expected_color = [0.72, 0.18, 0.44, 1.0];
        {
            let mut session = ProjectSession::open(&root).unwrap();
            let opened = session.open_main_scene().unwrap().unwrap();
            assert!(session.write_scene_recovery().unwrap().is_none());

            let mut changed = opened.world;
            changed.clear_color = expected_color;
            session.replace_snapshot(opened.revision, changed).unwrap();
            let info = session.write_scene_recovery().unwrap().unwrap();
            assert_eq!(info.scene_path, "Assets/Scenes/Main.mscene");
            assert_eq!(info.scene_name, "Main");
            assert_eq!(info.entity_count, 0);
            assert!(info.recorded_at_ms > 0);
            assert!(root.join(SCENE_RECOVERY_PATH).is_file());
        }

        let mut reopened = ProjectSession::open(&root).unwrap();
        let saved = reopened.open_main_scene().unwrap().unwrap();
        assert_ne!(saved.world.clear_color, expected_color);
        let info = reopened.scene_recovery_info().unwrap().unwrap();
        assert_eq!(info.scene_name, "Main");
        let restored = reopened.restore_scene_recovery().unwrap();
        assert_eq!(restored.world.clear_color, expected_color);
        assert!(restored.dirty);
        assert_eq!(
            restored.scene_path.as_deref(),
            Some("Assets/Scenes/Main.mscene")
        );

        let saved = reopened.save_scene(None).unwrap();
        assert!(!saved.dirty);
        assert!(!root.join(SCENE_RECOVERY_PATH).exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_scene_recovery_is_never_applied_and_can_be_discarded() {
        let root = make_project();
        let recovery_path = root.join(SCENE_RECOVERY_PATH);
        std::fs::create_dir_all(recovery_path.parent().unwrap()).unwrap();
        std::fs::write(&recovery_path, br#"{"schemaVersion":999}"#).unwrap();
        let mut session = ProjectSession::open(&root).unwrap();
        session.open_main_scene().unwrap();

        assert!(session.scene_recovery_info().is_err());
        assert!(session.restore_scene_recovery().is_err());
        session.discard_scene_recovery().unwrap();
        assert!(!recovery_path.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recovery_can_recreate_a_scene_file_that_was_deleted_after_checkpointing() {
        let root = make_project();
        let scratch = root.join("Assets/Scenes/Scratch.mscene");
        std::fs::copy(root.join("Assets/Scenes/Main.mscene"), &scratch).unwrap();
        {
            let mut session = ProjectSession::open(&root).unwrap();
            let opened = session.open_scene("Assets/Scenes/Scratch.mscene").unwrap();
            let mut changed = opened.world;
            changed.clear_color = [0.15, 0.65, 0.35, 1.0];
            session.replace_snapshot(opened.revision, changed).unwrap();
            session.write_scene_recovery().unwrap().unwrap();
        }
        std::fs::remove_file(&scratch).unwrap();

        let mut reopened = ProjectSession::open(&root).unwrap();
        reopened.open_main_scene().unwrap();
        let restored = reopened.restore_scene_recovery().unwrap();
        assert_eq!(
            restored.scene_path.as_deref(),
            Some("Assets/Scenes/Scratch.mscene")
        );
        assert!(restored.dirty);
        reopened.save_scene(None).unwrap();
        assert!(scratch.is_file());
        assert!(!root.join(SCENE_RECOVERY_PATH).exists());
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
        let engine_types =
            std::fs::read_to_string(project_root.join("Assets/Scripts/mengine.d.ts")).unwrap();
        assert!(engine_types.contains("playAnimation(entity:"));
        assert!(engine_types.contains("seekAnimation(entity:"));
        assert!(engine_types.contains("playTimeline(entity:"));
        assert!(engine_types.contains("seekTimeline(entity:"));
        assert!(engine_types.contains("seekAudio(entity:"));
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
        assert_eq!(manifest["assetMode"], "all");
        assert_eq!(manifest["alwaysInclude"], json!([]));
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
    fn scene_rename_and_delete_preserve_session_and_build_settings_invariants() {
        let root = make_project();
        let main = root.join("Assets/Scenes/Main.mscene");
        std::fs::copy(&main, root.join("Assets/Scenes/Level2.mscene")).unwrap();
        std::fs::copy(&main, root.join("Assets/Scenes/Scratch.mscene")).unwrap();
        std::fs::copy(&main, root.join("Assets/Scenes/Collision.mscene")).unwrap();
        let main_guid = mengine_assets::ensure_asset_sidecar(&main, "scene")
            .unwrap()
            .guid;
        let scratch = root.join("Assets/Scenes/Scratch.mscene");
        let scratch_sidecar = mengine_assets::asset_sidecar_path(&scratch);
        mengine_assets::ensure_asset_sidecar(&scratch, "scene").unwrap();
        let mut session = ProjectSession::open(&root).unwrap();
        session
            .save_build_scenes(vec![
                "Assets/Scenes/Main.mscene".into(),
                "Assets/Scenes/Level2.mscene".into(),
            ])
            .unwrap();
        session.open_main_scene().unwrap();

        let renamed = session
            .rename_scene("Assets/Scenes/Main.mscene", "Assets/Scenes/Renamed.mscene")
            .unwrap();
        assert_eq!(
            renamed.scene_path.as_deref(),
            Some("Assets/Scenes/Renamed.mscene")
        );
        assert!(!root.join("Assets/Scenes/Main.mscene").exists());
        assert!(!root.join("Assets/Scenes/Main.mscene.meta").exists());
        let renamed_path = root.join("Assets/Scenes/Renamed.mscene");
        assert!(renamed_path.is_file());
        assert_eq!(
            mengine_assets::read_asset_sidecar(&renamed_path, "scene")
                .unwrap()
                .guid,
            main_guid
        );
        let renamed_scene: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&renamed_path).unwrap()).unwrap();
        assert_eq!(renamed_scene["name"], "Renamed");
        let manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("project.json")).unwrap()).unwrap();
        assert_eq!(manifest["mainScene"], "Assets/Scenes/Renamed.mscene");
        assert_eq!(
            manifest["buildScenes"],
            json!([
                "Assets/Scenes/Renamed.mscene",
                "Assets/Scenes/Level2.mscene"
            ])
        );

        let case_renamed = session
            .rename_scene(
                "Assets/Scenes/Renamed.mscene",
                "Assets/Scenes/RENAMED.mscene",
            )
            .unwrap();
        assert_eq!(
            case_renamed.scene_path.as_deref(),
            Some("Assets/Scenes/RENAMED.mscene")
        );
        assert!(root.join("Assets/Scenes/RENAMED.mscene").is_file());
        assert_eq!(
            mengine_assets::read_asset_sidecar(&root.join("Assets/Scenes/RENAMED.mscene"), "scene")
                .unwrap()
                .guid,
            main_guid
        );

        let active_error = session
            .delete_scene("Assets/Scenes/RENAMED.mscene")
            .unwrap_err();
        assert!(active_error.to_string().contains("active scene"));
        let build_error = session
            .delete_scene("Assets/Scenes/Level2.mscene")
            .unwrap_err();
        assert!(build_error.to_string().contains("Build Settings"));
        assert!(session
            .rename_scene(
                "Assets/Scenes/Level2.mscene",
                "Assets/Scenes/Collision.mscene"
            )
            .is_err());
        assert!(root.join("Assets/Scenes/Level2.mscene").is_file());
        assert!(root.join("Assets/Scenes/Collision.mscene").is_file());

        session
            .delete_scene("Assets/Scenes/Scratch.mscene")
            .unwrap();
        assert!(!root.join("Assets/Scenes/Scratch.mscene").exists());
        assert!(!scratch_sidecar.exists());
        assert!(session
            .delete_scene("Assets/Scenes/../Collision.mscene")
            .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_rename_moves_identity_sidecars_and_updates_references_atomically() {
        let root = make_project();
        std::fs::create_dir_all(root.join("Assets/Sprites")).unwrap();
        std::fs::create_dir_all(root.join("Assets/Prefabs")).unwrap();
        let source = root.join("Assets/Sprites/Hero.png");
        let sprite_import = root.join("Assets/Sprites/Hero.png.sprite.json");
        let prefab = root.join("Assets/Prefabs/Hero.prefab");
        std::fs::write(&source, b"image-bytes").unwrap();
        std::fs::write(&sprite_import, br#"{"version":1,"mode":"single"}"#).unwrap();
        std::fs::write(&prefab, br#"{"sprite":"Assets/Sprites/Hero.png#Idle"}"#).unwrap();
        let guid = mengine_assets::ensure_asset_sidecar(&source, "texture")
            .unwrap()
            .guid
            .0;
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("project.json")).unwrap()).unwrap();
        manifest["alwaysInclude"] = json!(["Assets/Sprites/Hero.png"]);
        std::fs::write(
            root.join("project.json"),
            serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();
        let mut session = ProjectSession::open(&root).unwrap();
        let result = session
            .rename_asset(AssetRenameRequest {
                source_path: "Assets/Sprites/Hero.png".into(),
                destination_path: "Assets/Characters/Hero/Hero.png".into(),
                expected_source_revision: scene_file_revision(&source).unwrap().unwrap(),
                expected_guid: guid,
                updates: vec![AssetRenameUpdate {
                    source_path: "Assets/Prefabs/Hero.prefab".into(),
                    expected_revision: scene_file_revision(&prefab).unwrap().unwrap(),
                    contents: r#"{"sprite":"Assets/Characters/Hero/Hero.png#Idle"}"#.into(),
                }],
            })
            .unwrap();
        let destination = root.join("Assets/Characters/Hero/Hero.png");
        assert_eq!(result.destination_path, "Assets/Characters/Hero/Hero.png");
        assert!(!source.exists());
        assert!(!mengine_assets::asset_sidecar_path(&source).exists());
        assert!(!sprite_import.exists());
        assert_eq!(std::fs::read(&destination).unwrap(), b"image-bytes");
        assert_eq!(
            mengine_assets::read_asset_sidecar(&destination, "texture")
                .unwrap()
                .guid
                .0,
            guid
        );
        assert!(root
            .join("Assets/Characters/Hero/Hero.png.sprite.json")
            .is_file());
        assert_eq!(
            std::fs::read_to_string(&prefab).unwrap(),
            r#"{"sprite":"Assets/Characters/Hero/Hero.png#Idle"}"#
        );
        let saved_manifest: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("project.json")).unwrap()).unwrap();
        assert_eq!(
            saved_manifest["alwaysInclude"],
            json!(["Assets/Characters/Hero/Hero.png"])
        );
        assert_eq!(
            session.always_include(),
            vec!["Assets/Characters/Hero/Hero.png"]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_rename_rejects_stale_dependencies_without_partial_moves() {
        let root = make_project();
        std::fs::create_dir_all(root.join("Assets/Materials")).unwrap();
        let source = root.join("Assets/Materials/Hero.mmat");
        let dependent = root.join("Assets/Materials/Hero.minst");
        std::fs::write(&source, b"{}").unwrap();
        std::fs::write(&dependent, br#"{"parent":"Assets/Materials/Hero.mmat"}"#).unwrap();
        let guid = mengine_assets::ensure_asset_sidecar(&source, "material")
            .unwrap()
            .guid
            .0;
        let original_dependent = std::fs::read(&dependent).unwrap();
        let mut session = ProjectSession::open(&root).unwrap();
        let error = session
            .rename_asset(AssetRenameRequest {
                source_path: "Assets/Materials/Hero.mmat".into(),
                destination_path: "Assets/Renamed/Hero.mmat".into(),
                expected_source_revision: scene_file_revision(&source).unwrap().unwrap(),
                expected_guid: guid,
                updates: vec![AssetRenameUpdate {
                    source_path: "Assets/Materials/Hero.minst".into(),
                    expected_revision: "stale".into(),
                    contents: "{}".into(),
                }],
            })
            .unwrap_err();
        assert!(error.to_string().contains("changed on disk since preview"));
        assert!(source.is_file());
        assert!(mengine_assets::asset_sidecar_path(&source).is_file());
        assert_eq!(std::fs::read(&dependent).unwrap(), original_dependent);
        assert!(!root.join("Assets/Renamed").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_duplicate_copies_import_data_and_assigns_a_new_stable_identity() {
        let root = make_project();
        std::fs::create_dir_all(root.join("Assets/Models")).unwrap();
        let source = root.join("Assets/Models/Hero.gltf");
        let source_import = root.join("Assets/Models/Hero.gltf.sprite.json");
        std::fs::write(&source, br#"{"buffers":[{"uri":"Hero.bin"}]}"#).unwrap();
        std::fs::write(&source_import, br#"{"version":1,"custom":true}"#).unwrap();
        let original_guid = mengine_assets::ensure_asset_sidecar(&source, "model")
            .unwrap()
            .guid
            .0;
        let source_sidecar = mengine_assets::asset_sidecar_path(&source);
        let mut metadata: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&source_sidecar).unwrap()).unwrap();
        metadata["pluginSettings"] = json!({ "quality": "high" });
        std::fs::write(
            &source_sidecar,
            serde_json::to_vec_pretty(&metadata).unwrap(),
        )
        .unwrap();
        let mut session = ProjectSession::open(&root).unwrap();
        let result = session
            .duplicate_asset(AssetDuplicateRequest {
                source_path: "Assets/Models/Hero.gltf".into(),
                destination_path: "Assets/Characters/Hero Copy.gltf".into(),
                expected_source_revision: scene_file_revision(&source).unwrap().unwrap(),
                expected_guid: original_guid,
                contents: Some(r#"{"buffers":[{"uri":"../Models/Hero.bin"}]}"#.into()),
            })
            .unwrap();
        let destination = root.join("Assets/Characters/Hero Copy.gltf");
        assert!(source.is_file());
        assert_eq!(
            std::fs::read_to_string(&destination).unwrap(),
            r#"{"buffers":[{"uri":"../Models/Hero.bin"}]}"#
        );
        assert_ne!(result.guid, original_guid);
        assert_eq!(
            mengine_assets::read_asset_sidecar(&destination, "model")
                .unwrap()
                .guid
                .0,
            result.guid
        );
        let duplicate_metadata: serde_json::Value = serde_json::from_slice(
            &std::fs::read(mengine_assets::asset_sidecar_path(&destination)).unwrap(),
        )
        .unwrap();
        assert_eq!(
            duplicate_metadata["pluginSettings"],
            json!({ "quality": "high" })
        );
        assert_eq!(
            std::fs::read(root.join("Assets/Characters/Hero Copy.gltf.sprite.json")).unwrap(),
            std::fs::read(source_import).unwrap()
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn build_asset_settings_are_normalized_and_atomically_saved() {
        let root = make_project();
        std::fs::create_dir_all(root.join("Assets/Prefabs/Dynamic")).unwrap();
        std::fs::write(root.join("Assets/Prefabs/Dynamic/Enemy.prefab"), "{}").unwrap();
        let mut session = ProjectSession::open(&root).unwrap();
        let paths = session
            .save_build_asset_settings(
                BuildAssetMode::Referenced,
                vec!["Assets\\Prefabs\\Dynamic".into()],
            )
            .unwrap();
        assert_eq!(paths, vec!["Assets/Prefabs/Dynamic"]);
        assert_eq!(session.build_asset_mode(), BuildAssetMode::Referenced);
        assert_eq!(session.always_include(), paths);
        let saved: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(root.join("project.json")).unwrap())
                .unwrap();
        assert_eq!(saved["assetMode"], "referenced");
        assert_eq!(saved["alwaysInclude"], json!(["Assets/Prefabs/Dynamic"]));
        assert!(session
            .save_build_asset_settings(
                BuildAssetMode::Referenced,
                vec![
                    "Assets/Prefabs/Dynamic".into(),
                    "Assets/Prefabs/Dynamic".into()
                ],
            )
            .is_err());
        std::fs::write(root.join("Assets/Prefabs/Dynamic/Enemy.prefab.meta"), "{}").unwrap();
        assert!(session
            .save_build_asset_settings(
                BuildAssetMode::Referenced,
                vec!["Assets/Prefabs/Dynamic/Enemy.prefab.meta".into()]
            )
            .unwrap_err()
            .to_string()
            .contains("editor asset metadata"));
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
