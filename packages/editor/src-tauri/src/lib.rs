use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{
    AssetDeleteSnapshot, AssetDuplicateRequest, AssetDuplicateResult, AssetRenameRequest,
    AssetRenameResult, AssetRestoreRequest, AssetRestoreResult, AssetTrashInventory,
    AssetTrashRequest, AssetTrashResult, BuildAssetMode, EditorFailure, EditorRequest,
    EditorResult, ProjectSession, ProjectSnapshot, SceneRecoveryInfo,
};
use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{path::BaseDirectory, Emitter, Manager, State};

mod agent_bridge;
use agent_bridge::{agent_bridge_broadcast, agent_bridge_respond, spawn_bridge_server, BridgeHub};

struct AppState {
    project: Mutex<Option<ProjectSession>>,
    active_build: Arc<Mutex<Option<ActiveBuild>>>,
    next_build_id: AtomicU64,
}

#[derive(Clone)]
struct ActiveBuild {
    id: u64,
    cancelled: Arc<AtomicBool>,
    cancel_file: PathBuf,
    cancellable: bool,
}

struct ActiveBuildGuard {
    active_build: Arc<Mutex<Option<ActiveBuild>>>,
    id: u64,
    cancel_file: PathBuf,
}

impl Drop for ActiveBuildGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.cancel_file);
        let mut active = self.active_build.lock();
        if active.as_ref().is_some_and(|build| build.id == self.id) {
            *active = None;
        }
    }
}

struct OwnedTemporaryDirectory {
    path: PathBuf,
}

impl Drop for OwnedTemporaryDirectory {
    fn drop(&mut self) {
        match std::fs::symlink_metadata(&self.path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                let _ = std::fs::remove_file(&self.path);
            }
            Ok(metadata) if metadata.is_dir() => {
                let _ = std::fs::remove_dir_all(&self.path);
            }
            _ => {}
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAssetInfo {
    id: String,
    guid: Option<String>,
    name: String,
    folder: String,
    rel_path: String,
    kind: String,
    revision: String,
    size: u64,
    meta_status: String,
    meta_error: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAssetReadResult {
    contents: Vec<u8>,
    revision: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAssetWriteResult {
    revision: String,
    asset: Option<ProjectAssetInfo>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSpriteInfo {
    id: String,
    name: String,
    folder: String,
    rel_path: String,
    texture_id: String,
    slice_name: Option<String>,
    rect: Option<[u32; 4]>,
    pivot: Option<[f32; 2]>,
    pixels_per_unit: Option<f32>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSceneInfo {
    name: String,
    updated_at: u64,
    json: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SceneRecoveryCheckpoint {
    snapshot: ProjectSnapshot,
    recovery: Option<SceneRecoveryInfo>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBuildSettings {
    main_scene: Option<String>,
    scenes: Vec<String>,
    available_scenes: Vec<String>,
    asset_mode: BuildAssetMode,
    always_include: Vec<String>,
    shader_variant_limit: u32,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSortingLayer {
    id: String,
    name: String,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSortingLayers {
    version: u32,
    layers: Vec<ProjectSortingLayer>,
}

impl Default for ProjectSortingLayers {
    fn default() -> Self {
        Self {
            version: 1,
            layers: vec![ProjectSortingLayer {
                id: "default".into(),
                name: "Default".into(),
            }],
        }
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPlayerResult {
    build_id: u64,
    output_dir: String,
    executable: String,
    file_count: usize,
    content_hash: String,
    artifact_signed: bool,
    artifact_signing_key_id: Option<String>,
    profile: String,
    platform: String,
    architecture: String,
    engine_version: String,
    scene_count: usize,
    validated_asset_files: usize,
    asset_references: usize,
    audited_scenes: usize,
    audited_prefabs: usize,
    audited_materials: usize,
    audited_material_instances: usize,
    audited_surface_shaders: usize,
    shader_variants: usize,
    shader_variant_limit: usize,
    surface_shader_variants: Vec<BuildShaderVariantResult>,
    asset_mode: String,
    omitted_asset_files: usize,
    omitted_asset_bytes: u64,
    stripped_editor_entities: usize,
    packaged_bytes: u64,
    manifest_path: String,
    content_categories: Vec<BuildContentCategoryResult>,
    largest_files: Vec<BuildContentFileResult>,
    comparison: Option<BuildComparisonResult>,
    build_cache: Option<BuildCacheResult>,
    incremental_patch: Option<BuildPatchResult>,
    stage_timings: Vec<BuildStageTimingResult>,
    total_duration_ms: u64,
    toolchain: String,
    history_entry: Option<BuildHistoryEntry>,
    log: String,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BuildShaderVariantResult {
    shader: String,
    enabled_keywords: Vec<String>,
    blend: String,
    double_sided: bool,
    depth_write: bool,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryEntry {
    id: String,
    recorded_at_ms: u64,
    content_hash: String,
    artifact_signed: bool,
    artifact_signing_key_id: Option<String>,
    profile: String,
    platform: String,
    architecture: String,
    engine_version: String,
    project_name: String,
    project_version: String,
    file_count: usize,
    packaged_bytes: u64,
    output_dir: String,
    manifest_path: String,
    record_path: String,
    published: bool,
    total_duration_ms: u64,
    toolchain: String,
    content_available: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryListResult {
    entries: Vec<BuildHistoryEntry>,
    invalid_records: usize,
    retention_limit: usize,
}

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RestoreBuildHistoryResult {
    history_id: String,
    output_dir: String,
    manifest_path: String,
    content_hash: String,
    file_count: usize,
    packaged_bytes: u64,
    signing_key_id: String,
    replaced_existing: bool,
    cleanup_warning: Option<String>,
    log: String,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryPatchResult {
    output_dir: String,
    manifest_path: String,
    from_content_hash: String,
    to_content_hash: String,
    from_artifact_hash: String,
    to_artifact_hash: String,
    changed_files: usize,
    removed_files: usize,
    unchanged_files: usize,
    payload_bytes: u64,
    reused_bytes: u64,
    signing_key_id: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPatchInventoryEntry {
    id: String,
    source: String,
    created_at_ms: u64,
    base_available: bool,
    #[serde(flatten)]
    patch: BuildHistoryPatchResult,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPatchInventoryResult {
    entries: Vec<BuildPatchInventoryEntry>,
    invalid_patches: usize,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifyBuildPatchResult {
    patch_id: String,
    base_history_id: String,
    from_content_hash: String,
    to_content_hash: String,
    signing_key_id: String,
    log: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryRecord {
    schema_version: u32,
    id: String,
    recorded_at_ms: u64,
    total_duration_ms: u64,
    toolchain: String,
    manifest: serde_json::Value,
    #[serde(default)]
    content_store: Option<BuildHistoryContentStore>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryContentStore {
    schema_version: u32,
    file_count: usize,
    total_bytes: u64,
}

const BUILD_HISTORY_SCHEMA_VERSION: u32 = 2;
const BUILD_CONTENT_STORE_SCHEMA_VERSION: u32 = 1;
const MAX_BUILD_HISTORY_ENTRIES: usize = 50;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildCacheResult {
    enabled: bool,
    hits: usize,
    misses: usize,
    reused_bytes: u64,
    stored_bytes: u64,
    recovered_entries: usize,
    failures: usize,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildPatchResult {
    generated: bool,
    output_dir: Option<String>,
    manifest_path: Option<String>,
    from_content_hash: Option<String>,
    to_content_hash: Option<String>,
    changed_files: Option<usize>,
    removed_files: Option<usize>,
    payload_bytes: Option<u64>,
    reused_bytes: Option<u64>,
    reason: Option<String>,
    error: Option<String>,
}

const BUILD_CACHE_REPORT_PREFIX: &str = "MENGINE_BUILD_CACHE ";
const BUILD_PATCH_REPORT_PREFIX: &str = "MENGINE_BUILD_PATCH ";

fn extract_build_reports(
    stdout: &[u8],
) -> (Option<BuildCacheResult>, Option<BuildPatchResult>, String) {
    let stdout = String::from_utf8_lossy(stdout);
    let mut cache_report = None;
    let mut patch_report = None;
    let mut log_lines = Vec::new();
    for line in stdout.lines() {
        if let Some(json) = line.strip_prefix(BUILD_CACHE_REPORT_PREFIX) {
            match serde_json::from_str::<BuildCacheResult>(json) {
                Ok(parsed) => cache_report = Some(parsed),
                Err(_) => log_lines.push(line),
            }
        } else if let Some(json) = line.strip_prefix(BUILD_PATCH_REPORT_PREFIX) {
            match serde_json::from_str::<BuildPatchResult>(json) {
                Ok(parsed) => patch_report = Some(parsed),
                Err(_) => log_lines.push(line),
            }
        } else {
            log_lines.push(line);
        }
    }
    (
        cache_report,
        patch_report,
        log_lines.join("\n").trim().to_owned(),
    )
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildProgressEvent {
    build_id: u64,
    stage: String,
    label: String,
    stage_index: usize,
    stage_count: usize,
    status: String,
    elapsed_ms: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildStageTimingResult {
    stage: String,
    label: String,
    duration_ms: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildContentCategoryResult {
    category: String,
    files: usize,
    bytes: u64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildContentFileResult {
    path: String,
    size: u64,
    category: String,
    included_by: Vec<String>,
}

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildComparisonResult {
    previous_content_hash: String,
    added_files: usize,
    removed_files: usize,
    changed_files: usize,
    unchanged_files: usize,
    byte_delta: i64,
    changes: Vec<BuildFileChangeResult>,
}

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildFileChangeResult {
    path: String,
    kind: String,
    category: String,
    previous_size: Option<u64>,
    current_size: Option<u64>,
    byte_delta: i64,
}

#[derive(Debug)]
struct BuildFileSnapshot {
    size: u64,
    sha256: String,
    category: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildSdkRuntimes {
    debug: String,
    release: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildSdkManifest {
    schema_version: u32,
    platform: String,
    architecture: String,
    cli_version: String,
    node: String,
    cli: String,
    runtimes: BuildSdkRuntimes,
}

#[derive(Debug)]
struct BuildSdk {
    root: PathBuf,
    node: PathBuf,
    cli: PathBuf,
    runtime: PathBuf,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RunPlayerResult {
    executable: String,
    process_id: u32,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifyPlayerResult {
    executable: String,
    content_hash: String,
    file_count: usize,
    packaged_bytes: u64,
    log: String,
}

fn find_engine_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    loop {
        let cargo = current.join("Cargo.toml");
        let runtime = current.join("crates/mengine-runtime/Cargo.toml");
        if cargo.is_file() && runtime.is_file() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn node_platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn node_arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "ia32",
        other => other,
    }
}

fn command_failure(label: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if detail.is_empty() {
        format!("{label} failed with exit code {:?}", output.status.code())
    } else {
        format!("{label} failed: {detail}")
    }
}

fn build_sdk_file(root: &Path, relative: &str, label: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "Build SDK contains an unsafe {label} path: {relative}"
        ));
    }
    let path = root.join(relative_path);
    let metadata =
        std::fs::symlink_metadata(&path).map_err(|error| format!("Build SDK {label}: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "Build SDK {label} must be a regular non-symlink file"
        ));
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Build SDK {label}: {error}"))?;
    if !canonical.starts_with(root) {
        return Err(format!("Build SDK {label} escapes the SDK directory"));
    }
    Ok(canonical)
}

fn child_process_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let raw = path.to_string_lossy();
        if let Some(relative) = raw.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{relative}"));
        }
        if let Some(relative) = raw.strip_prefix(r"\\?\") {
            return PathBuf::from(relative);
        }
    }
    path.to_path_buf()
}

fn load_build_sdk(root: &Path, profile: &str) -> Result<BuildSdk, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Build SDK directory: {error}"))?;
    if !canonical_root.is_dir() {
        return Err("Build SDK path must be a directory".into());
    }
    let manifest_path = build_sdk_file(&canonical_root, "sdk.json", "manifest")?;
    let manifest: BuildSdkManifest = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .map_err(|error| format!("cannot read Build SDK manifest: {error}"))?,
    )
    .map_err(|error| format!("invalid Build SDK manifest: {error}"))?;
    if manifest.schema_version != 1 {
        return Err(format!(
            "unsupported Build SDK schema version {}",
            manifest.schema_version
        ));
    }
    if manifest.cli_version != env!("CARGO_PKG_VERSION") {
        return Err(format!(
            "Build SDK version mismatch: expected {}, found {}",
            env!("CARGO_PKG_VERSION"),
            manifest.cli_version
        ));
    }
    if manifest.platform != node_platform_name() || manifest.architecture != node_arch_name() {
        return Err(format!(
            "Build SDK host mismatch: expected {}-{}, found {}-{}",
            node_platform_name(),
            node_arch_name(),
            manifest.platform,
            manifest.architecture
        ));
    }
    let runtime = if profile == "debug" {
        &manifest.runtimes.debug
    } else {
        &manifest.runtimes.release
    };
    Ok(BuildSdk {
        node: build_sdk_file(&canonical_root, &manifest.node, "Node runtime")?,
        cli: build_sdk_file(&canonical_root, &manifest.cli, "CLI")?,
        runtime: build_sdk_file(&canonical_root, runtime, "player runtime")?,
        root: canonical_root,
    })
}

fn read_previous_build_manifest(output_dir: &Path) -> Option<serde_json::Value> {
    let output_metadata = std::fs::symlink_metadata(output_dir).ok()?;
    if output_metadata.file_type().is_symlink() || !output_metadata.is_dir() {
        return None;
    }
    let path = output_dir.join("mengine-build.json");
    let metadata = std::fs::symlink_metadata(&path).ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 64 * 1024 * 1024
    {
        return None;
    }
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

fn build_file_snapshots(
    manifest: &serde_json::Value,
) -> Result<(String, BTreeMap<String, BuildFileSnapshot>), String> {
    let content_hash = manifest
        .get("contentHash")
        .and_then(serde_json::Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "build comparison manifest has an invalid contentHash".to_string())?
        .to_ascii_lowercase();
    let files = manifest
        .get("files")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "build comparison manifest does not contain files".to_string())?;
    let mut snapshots = BTreeMap::new();
    for file in files {
        let path = file
            .get("path")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "build comparison file does not contain path".to_string())?;
        let size = file
            .get("size")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| format!("build comparison file {path} does not contain size"))?;
        let sha256 = file
            .get("sha256")
            .and_then(serde_json::Value::as_str)
            .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .ok_or_else(|| format!("build comparison file {path} has an invalid sha256"))?
            .to_ascii_lowercase();
        let category = file
            .get("category")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("build comparison file {path} does not contain category"))?
            .to_string();
        if snapshots
            .insert(
                path.to_string(),
                BuildFileSnapshot {
                    size,
                    sha256,
                    category,
                },
            )
            .is_some()
        {
            return Err(format!(
                "build comparison manifest contains duplicate path {path}"
            ));
        }
    }
    Ok((content_hash, snapshots))
}

fn signed_byte_delta(current: u64, previous: u64) -> i64 {
    let delta = i128::from(current) - i128::from(previous);
    delta.clamp(i128::from(i64::MIN), i128::from(i64::MAX)) as i64
}

fn compare_build_manifests(
    previous_manifest: &serde_json::Value,
    current_manifest: &serde_json::Value,
) -> Result<BuildComparisonResult, String> {
    let (previous_content_hash, mut previous) = build_file_snapshots(previous_manifest)?;
    let (_, current) = build_file_snapshots(current_manifest)?;
    let previous_bytes = previous
        .values()
        .fold(0_u64, |total, file| total.saturating_add(file.size));
    let current_bytes = current
        .values()
        .fold(0_u64, |total, file| total.saturating_add(file.size));
    let mut added_files = 0;
    let mut changed_files = 0;
    let mut unchanged_files = 0;
    let mut changes = Vec::new();
    for (path, current_file) in current {
        if let Some(previous_file) = previous.remove(&path) {
            if current_file.size == previous_file.size
                && current_file.sha256 == previous_file.sha256
            {
                unchanged_files += 1;
            } else {
                changed_files += 1;
                changes.push(BuildFileChangeResult {
                    path,
                    kind: "changed".into(),
                    category: current_file.category,
                    previous_size: Some(previous_file.size),
                    current_size: Some(current_file.size),
                    byte_delta: signed_byte_delta(current_file.size, previous_file.size),
                });
            }
        } else {
            added_files += 1;
            changes.push(BuildFileChangeResult {
                path,
                kind: "added".into(),
                category: current_file.category,
                previous_size: None,
                current_size: Some(current_file.size),
                byte_delta: signed_byte_delta(current_file.size, 0),
            });
        }
    }
    let removed_files = previous.len();
    for (path, previous_file) in previous {
        changes.push(BuildFileChangeResult {
            path,
            kind: "removed".into(),
            category: previous_file.category,
            previous_size: Some(previous_file.size),
            current_size: None,
            byte_delta: signed_byte_delta(0, previous_file.size),
        });
    }
    changes.sort_by(|left, right| {
        right
            .byte_delta
            .unsigned_abs()
            .cmp(&left.byte_delta.unsigned_abs())
            .then_with(|| left.path.cmp(&right.path))
    });
    changes.truncate(20);
    Ok(BuildComparisonResult {
        previous_content_hash,
        added_files,
        removed_files,
        changed_files,
        unchanged_files,
        byte_delta: signed_byte_delta(current_bytes, previous_bytes),
        changes,
    })
}

fn build_history_dir(project_root: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    let engine_dir = project_root.join(".mengine");
    let history_dir = engine_dir.join("build-history");
    for directory in [&engine_dir, &history_dir] {
        match std::fs::symlink_metadata(directory) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(format!(
                        "build history directory must be a regular directory: {}",
                        directory.display()
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
                std::fs::create_dir(directory).map_err(|error| {
                    format!(
                        "cannot create build history directory {}: {error}",
                        directory.display()
                    )
                })?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(format!(
                    "cannot inspect build history directory {}: {error}",
                    directory.display()
                ));
            }
        }
    }
    Ok(Some(history_dir))
}

fn valid_build_history_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn safe_build_segment(value: &str, label: &str) -> Result<String, String> {
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(format!(
            "build history manifest contains an invalid {label}"
        ));
    }
    Ok(value.to_string())
}

fn history_manifest_string(manifest: &serde_json::Value, field: &str) -> Result<String, String> {
    manifest
        .get(field)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("build history manifest does not contain {field}"))
}

fn history_project_version(manifest: &serde_json::Value) -> Result<String, String> {
    let version = manifest
        .get("project")
        .and_then(|project| project.get("version"))
        .ok_or_else(|| "build history manifest does not contain project.version".to_string())?;
    match version {
        serde_json::Value::String(value) if !value.is_empty() => Ok(value.clone()),
        serde_json::Value::Number(value) => Ok(value.to_string()),
        _ => Err("build history manifest has an invalid project.version".into()),
    }
}

fn build_artifact_signature_key_id(manifest: &serde_json::Value) -> Result<Option<String>, String> {
    let Some(signature) = manifest.get("signature") else {
        return Ok(None);
    };
    let signature = signature
        .as_object()
        .ok_or_else(|| "build manifest signature must be an object".to_string())?;
    if signature
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
        || signature
            .get("algorithm")
            .and_then(serde_json::Value::as_str)
            != Some("ed25519")
    {
        return Err("build manifest has an unsupported artifact signature".into());
    }
    let key_id = signature
        .get("keyId")
        .and_then(serde_json::Value::as_str)
        .filter(|value| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        })
        .ok_or_else(|| "build manifest signature has an invalid keyId".to_string())?;
    let value = signature
        .get("value")
        .and_then(serde_json::Value::as_str)
        .filter(|value| {
            value.len() == 88
                && value.ends_with("==")
                && value[..86]
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'/')
        })
        .ok_or_else(|| "build manifest signature has an invalid Ed25519 value".to_string())?;
    debug_assert_eq!(value.len(), 88);
    Ok(Some(key_id.to_string()))
}

fn build_history_record_path(history_dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_build_history_id(id) {
        return Err("invalid build history id".into());
    }
    Ok(history_dir.join(format!("{id}.json")))
}

fn read_build_history_record(path: &Path, expected_id: &str) -> Result<BuildHistoryRecord, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("cannot inspect build history record: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("build history record must be a regular non-symlink file".into());
    }
    if metadata.len() > 32 * 1024 * 1024 {
        return Err("build history record exceeds 32 MiB".into());
    }
    let record: BuildHistoryRecord = serde_json::from_slice(
        &std::fs::read(path)
            .map_err(|error| format!("cannot read build history record: {error}"))?,
    )
    .map_err(|error| format!("invalid build history record: {error}"))?;
    if !(1..=BUILD_HISTORY_SCHEMA_VERSION).contains(&record.schema_version) {
        return Err(format!(
            "unsupported build history schema version: {}",
            record.schema_version
        ));
    }
    if record.id != expected_id || !valid_build_history_id(&record.id) {
        return Err("build history record id does not match its file name".into());
    }
    if !matches!(record.toolchain.as_str(), "bundled-sdk" | "source-checkout") {
        return Err("build history record contains an invalid toolchain".into());
    }
    Ok(record)
}

fn build_history_entry(
    project_root: &Path,
    record_path: &Path,
    record: &BuildHistoryRecord,
) -> Result<BuildHistoryEntry, String> {
    if !matches!(record.toolchain.as_str(), "bundled-sdk" | "source-checkout") {
        return Err("build history record contains an invalid toolchain".into());
    }
    let (content_hash, files) = build_file_snapshots(&record.manifest)?;
    let artifact_signing_key_id = build_artifact_signature_key_id(&record.manifest)?;
    let profile = safe_build_segment(
        &history_manifest_string(&record.manifest, "profile")?,
        "profile",
    )?;
    if !matches!(profile.as_str(), "debug" | "release") {
        return Err("build history manifest contains an unsupported profile".into());
    }
    let platform = safe_build_segment(
        &history_manifest_string(&record.manifest, "platform")?,
        "platform",
    )?;
    let architecture = safe_build_segment(
        &history_manifest_string(&record.manifest, "architecture")?,
        "architecture",
    )?;
    let output_dir = project_root
        .join("Builds")
        .join(format!("{platform}-{architecture}-{profile}"));
    let project = record
        .manifest
        .get("project")
        .ok_or_else(|| "build history manifest does not contain project".to_string())?;
    let project_name = project
        .get("name")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "build history manifest does not contain project.name".to_string())?;
    let packaged_bytes = files
        .values()
        .fold(0_u64, |total, file| total.saturating_add(file.size));
    let declared_bytes = record
        .manifest
        .get("contentSummary")
        .and_then(|summary| summary.get("totalBytes"))
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| {
            "build history manifest does not contain contentSummary.totalBytes".to_string()
        })?;
    if declared_bytes != packaged_bytes {
        return Err("build history manifest contentSummary.totalBytes does not match files".into());
    }
    let content_available = match &record.content_store {
        Some(content_store) => {
            if content_store.schema_version != BUILD_CONTENT_STORE_SCHEMA_VERSION
                || content_store.file_count != files.len()
                || content_store.total_bytes != packaged_bytes
            {
                return Err("build history content store summary does not match files".into());
            }
            build_content_files_available(project_root, &files)?
        }
        None => false,
    };
    Ok(BuildHistoryEntry {
        id: record.id.clone(),
        recorded_at_ms: record.recorded_at_ms,
        content_hash,
        artifact_signed: artifact_signing_key_id.is_some(),
        artifact_signing_key_id,
        profile,
        platform,
        architecture,
        engine_version: history_manifest_string(&record.manifest, "engineVersion")?,
        project_name,
        project_version: history_project_version(&record.manifest)?,
        file_count: files.len(),
        packaged_bytes,
        manifest_path: output_dir
            .join("mengine-build.json")
            .to_string_lossy()
            .into_owned(),
        output_dir: output_dir.to_string_lossy().into_owned(),
        record_path: record_path.to_string_lossy().into_owned(),
        published: false,
        total_duration_ms: record.total_duration_ms,
        toolchain: record.toolchain.clone(),
        content_available,
    })
}

fn scan_build_history(project_root: &Path) -> Result<BuildHistoryListResult, String> {
    let Some(history_dir) = build_history_dir(project_root, false)? else {
        return Ok(BuildHistoryListResult {
            entries: Vec::new(),
            invalid_records: 0,
            retention_limit: MAX_BUILD_HISTORY_ENTRIES,
        });
    };
    let mut entries = Vec::new();
    let mut published_manifests = BTreeMap::<String, Option<serde_json::Value>>::new();
    let mut invalid_records = 0;
    for item in std::fs::read_dir(&history_dir)
        .map_err(|error| format!("cannot read build history directory: {error}"))?
    {
        let Ok(item) = item else {
            invalid_records += 1;
            continue;
        };
        let path = item.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|value| value.to_str()) else {
            invalid_records += 1;
            continue;
        };
        if !valid_build_history_id(id) {
            invalid_records += 1;
            continue;
        }
        let Ok(record) = read_build_history_record(&path, id) else {
            invalid_records += 1;
            continue;
        };
        match build_history_entry(project_root, &path, &record) {
            Ok(entry) => {
                let published_manifest = published_manifests
                    .entry(entry.output_dir.clone())
                    .or_insert_with(|| read_previous_build_manifest(Path::new(&entry.output_dir)));
                let matches_published = published_manifest
                    .as_ref()
                    .is_some_and(|manifest| manifest == &record.manifest);
                entries.push((entry, matches_published));
            }
            Err(_) => invalid_records += 1,
        }
    }
    entries.sort_by(|(left, _), (right, _)| {
        right
            .recorded_at_ms
            .cmp(&left.recorded_at_ms)
            .then_with(|| right.id.cmp(&left.id))
    });
    let mut published_targets = HashSet::<String>::new();
    for (entry, matches_published) in &mut entries {
        if !published_targets.contains(&entry.output_dir) && *matches_published {
            entry.published = true;
            published_targets.insert(entry.output_dir.clone());
        }
    }
    Ok(BuildHistoryListResult {
        entries: entries.into_iter().map(|(entry, _)| entry).collect(),
        invalid_records,
        retention_limit: MAX_BUILD_HISTORY_ENTRIES,
    })
}

fn list_build_history(project_root: &Path) -> Result<Vec<BuildHistoryEntry>, String> {
    Ok(scan_build_history(project_root)?.entries)
}

fn write_build_history_record(path: &Path, record: &BuildHistoryRecord) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(record).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "build history record has no parent".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(".build-history.{}.{nonce}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&contents)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        drop(file);
        replace_file_atomically(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|error| format!("cannot write build history record: {error}"))
}

fn prune_build_history(project_root: &Path, retained_entries: usize) -> Result<(), String> {
    let entries = list_build_history(project_root)?;
    for entry in entries.iter().skip(retained_entries) {
        let path = Path::new(&entry.record_path);
        let metadata = std::fs::symlink_metadata(path)
            .map_err(|error| format!("cannot inspect old build history record: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("old build history record is not a regular file".into());
        }
        std::fs::remove_file(path)
            .map_err(|error| format!("cannot remove old build history record: {error}"))?;
    }
    Ok(())
}

fn build_content_store_dir(project_root: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    let engine_dir = project_root.join(".mengine");
    let content_dir = engine_dir.join("build-content");
    let sha_dir = content_dir.join("sha256");
    for directory in [&engine_dir, &content_dir, &sha_dir] {
        match std::fs::symlink_metadata(directory) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(format!(
                        "build content store must use regular directories: {}",
                        directory.display()
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
                std::fs::create_dir(directory).map_err(|error| {
                    format!(
                        "cannot create build content store directory {}: {error}",
                        directory.display()
                    )
                })?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(format!(
                    "cannot inspect build content store directory {}: {error}",
                    directory.display()
                ));
            }
        }
    }
    Ok(Some(sha_dir))
}

fn build_content_files_available(
    project_root: &Path,
    files: &BTreeMap<String, BuildFileSnapshot>,
) -> Result<bool, String> {
    let Some(store_root) = build_content_store_dir(project_root, false)? else {
        return Ok(false);
    };
    for file in files.values() {
        let path = store_root.join(&file.sha256[..2]).join(&file.sha256);
        match std::fs::symlink_metadata(&path) {
            Ok(metadata)
                if !metadata.file_type().is_symlink()
                    && metadata.is_file()
                    && metadata.len() == file.size => {}
            Ok(_) => return Ok(false),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => {
                return Err(format!(
                    "cannot inspect archived build content {}: {error}",
                    path.display()
                ));
            }
        }
    }
    Ok(true)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("cannot open {} for hashing: {error}", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("cannot hash {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn safe_build_content_path(path: &str) -> Result<&Path, String> {
    if path.is_empty()
        || path.eq_ignore_ascii_case("mengine-build.json")
        || path.contains('\\')
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(format!(
            "unsafe or reserved build history content path: {path}"
        ));
    }
    let relative = Path::new(path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!(
            "unsafe or reserved build history content path: {path}"
        ));
    }
    Ok(relative)
}

fn store_build_content_blob(
    store_root: &Path,
    source: &Path,
    expected_size: u64,
    expected_hash: &str,
) -> Result<(), String> {
    let shard = store_root.join(&expected_hash[..2]);
    match std::fs::symlink_metadata(&shard) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(format!(
                "build content shard must be a regular directory: {}",
                shard.display()
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(&shard).map_err(|error| {
                format!(
                    "cannot create build content shard {}: {error}",
                    shard.display()
                )
            })?;
        }
        Err(error) => {
            return Err(format!(
                "cannot inspect build content shard {}: {error}",
                shard.display()
            ));
        }
    }
    let target = shard.join(expected_hash);
    if let Ok(metadata) = std::fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!(
                "build content blob must be a regular file: {}",
                target.display()
            ));
        }
        if metadata.len() == expected_size && sha256_file(&target)? == expected_hash {
            if sha256_file(source)? != expected_hash {
                return Err(format!(
                    "published build file hash does not match manifest: {}",
                    source.display()
                ));
            }
            return Ok(());
        }
    }

    use std::io::{Read, Write};
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = shard.join(format!(
        ".{expected_hash}.{}.{nonce}.tmp",
        std::process::id()
    ));
    let result = (|| -> Result<(), String> {
        let mut input = std::fs::File::open(source)
            .map_err(|error| format!("cannot open build content {}: {error}", source.display()))?;
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| {
                format!(
                    "cannot create build content blob {}: {error}",
                    temporary.display()
                )
            })?;
        let mut digest = Sha256::new();
        let mut total = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = input
                .read(&mut buffer)
                .map_err(|error| format!("cannot read build content: {error}"))?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|error| format!("cannot write build content blob: {error}"))?;
            digest.update(&buffer[..read]);
            total = total.saturating_add(read as u64);
        }
        let actual_hash = format!("{:x}", digest.finalize());
        if total != expected_size || actual_hash != expected_hash {
            return Err(format!(
                "published build content changed while archiving: {}",
                source.display()
            ));
        }
        output
            .sync_all()
            .map_err(|error| format!("cannot sync build content blob: {error}"))?;
        drop(output);
        replace_file_atomically(&temporary, &target)
            .map_err(|error| format!("cannot publish build content blob: {error}"))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

fn archive_build_content(
    project_root: &Path,
    output_dir: &Path,
    manifest: &serde_json::Value,
) -> Result<BuildHistoryContentStore, String> {
    let store_root = build_content_store_dir(project_root, true)?
        .ok_or_else(|| "build content store is unavailable".to_string())?;
    let output_metadata = std::fs::symlink_metadata(output_dir)
        .map_err(|error| format!("cannot inspect published build: {error}"))?;
    if output_metadata.file_type().is_symlink() || !output_metadata.is_dir() {
        return Err("published build must be a regular non-symlink directory".into());
    }
    let canonical_output = output_dir
        .canonicalize()
        .map_err(|error| format!("cannot resolve published build: {error}"))?;
    let (_, files) = build_file_snapshots(manifest)?;
    let mut seen = HashSet::new();
    let mut total_bytes = 0_u64;
    for (path, file) in &files {
        let key = path.to_ascii_lowercase();
        if !seen.insert(key) {
            return Err(format!(
                "build history contains a case-insensitive duplicate: {path}"
            ));
        }
        let relative = safe_build_content_path(path)?;
        let source = output_dir.join(relative);
        let metadata = std::fs::symlink_metadata(&source)
            .map_err(|error| format!("cannot inspect published build file {path}: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() != file.size {
            return Err(format!("published build file has invalid metadata: {path}"));
        }
        let canonical_source = source
            .canonicalize()
            .map_err(|error| format!("cannot resolve published build file {path}: {error}"))?;
        if !canonical_source.starts_with(&canonical_output) {
            return Err(format!("published build file escapes output: {path}"));
        }
        store_build_content_blob(&store_root, &source, file.size, &file.sha256)?;
        total_bytes = total_bytes.saturating_add(file.size);
    }
    Ok(BuildHistoryContentStore {
        schema_version: BUILD_CONTENT_STORE_SCHEMA_VERSION,
        file_count: files.len(),
        total_bytes,
    })
}

fn prune_build_content_store(project_root: &Path) -> Result<(), String> {
    let Some(store_root) = build_content_store_dir(project_root, false)? else {
        return Ok(());
    };
    let mut retained = HashSet::new();
    if let Some(history_dir) = build_history_dir(project_root, false)? {
        for item in std::fs::read_dir(history_dir)
            .map_err(|error| format!("cannot scan build history for content retention: {error}"))?
        {
            let Ok(item) = item else { continue };
            let path = item.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Ok(record) = read_build_history_record(&path, id) else {
                continue;
            };
            if record.content_store.is_none() {
                continue;
            }
            if let Ok((_, files)) = build_file_snapshots(&record.manifest) {
                retained.extend(files.into_values().map(|file| file.sha256));
            }
        }
    }
    for shard in std::fs::read_dir(&store_root)
        .map_err(|error| format!("cannot scan build content store: {error}"))?
    {
        let shard = shard.map_err(|error| format!("cannot read build content shard: {error}"))?;
        let shard_path = shard.path();
        let metadata = std::fs::symlink_metadata(&shard_path)
            .map_err(|error| format!("cannot inspect build content shard: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("build content store contains an invalid shard".into());
        }
        for blob in std::fs::read_dir(&shard_path)
            .map_err(|error| format!("cannot scan build content shard: {error}"))?
        {
            let blob = blob.map_err(|error| format!("cannot read build content blob: {error}"))?;
            let path = blob.path();
            let metadata = std::fs::symlink_metadata(&path)
                .map_err(|error| format!("cannot inspect build content blob: {error}"))?;
            let name = blob.file_name().to_string_lossy().into_owned();
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("build content store contains an invalid blob".into());
            }
            if !retained.contains(&name) {
                std::fs::remove_file(&path)
                    .map_err(|error| format!("cannot remove unreferenced build blob: {error}"))?;
            }
        }
        if std::fs::read_dir(&shard_path)
            .map_err(|error| format!("cannot inspect build content shard: {error}"))?
            .next()
            .is_none()
        {
            std::fs::remove_dir(&shard_path)
                .map_err(|error| format!("cannot remove empty build content shard: {error}"))?;
        }
    }
    Ok(())
}

fn archive_build_history(
    project_root: &Path,
    published_output: Option<&Path>,
    manifest: &serde_json::Value,
    total_duration_ms: u64,
    toolchain: &str,
) -> Result<BuildHistoryEntry, String> {
    let history_dir = build_history_dir(project_root, true)?
        .ok_or_else(|| "build history directory is unavailable".to_string())?;
    let content_hash = build_file_snapshots(manifest)?.0;
    let content_store = published_output
        .map(|output| archive_build_content(project_root, output, manifest))
        .transpose()?;
    let recorded_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let recorded_at_ms = recorded_at.as_millis().try_into().unwrap_or(u64::MAX);
    let sub_millisecond = recorded_at.as_nanos() % 1_000_000;
    let base_id = format!(
        "{recorded_at_ms}-{sub_millisecond:06}-{}",
        &content_hash[..12]
    );
    let mut id = base_id.clone();
    let mut suffix = 2_u32;
    let path = loop {
        let candidate = build_history_record_path(&history_dir, &id)?;
        if !candidate.exists() {
            break candidate;
        }
        id = format!("{base_id}-{suffix}");
        suffix = suffix.saturating_add(1);
    };
    let record = BuildHistoryRecord {
        schema_version: BUILD_HISTORY_SCHEMA_VERSION,
        id,
        recorded_at_ms,
        total_duration_ms,
        toolchain: toolchain.to_string(),
        manifest: manifest.clone(),
        content_store,
    };
    let mut entry = match build_history_entry(project_root, &path, &record) {
        Ok(entry) => entry,
        Err(error) => {
            let _ = prune_build_content_store(project_root);
            return Err(error);
        }
    };
    entry.published = read_previous_build_manifest(Path::new(&entry.output_dir))
        .is_some_and(|published_manifest| published_manifest == *manifest);
    if let Err(error) =
        prune_build_history(project_root, MAX_BUILD_HISTORY_ENTRIES.saturating_sub(1))
    {
        let _ = prune_build_content_store(project_root);
        return Err(error);
    }
    if let Err(error) = write_build_history_record(&path, &record) {
        let _ = prune_build_content_store(project_root);
        return Err(error);
    }
    prune_build_content_store(project_root)?;
    Ok(entry)
}

fn compare_build_history(
    project_root: &Path,
    previous_id: &str,
    current_id: &str,
) -> Result<BuildComparisonResult, String> {
    if previous_id == current_id {
        return Err("select two different build history entries".into());
    }
    let history_dir = build_history_dir(project_root, false)?
        .ok_or_else(|| "build history is empty".to_string())?;
    let previous_path = build_history_record_path(&history_dir, previous_id)?;
    let current_path = build_history_record_path(&history_dir, current_id)?;
    let previous = read_build_history_record(&previous_path, previous_id)?;
    let current = read_build_history_record(&current_path, current_id)?;
    compare_build_manifests(&previous.manifest, &current.manifest)
}

fn create_owned_temporary_directory(label: &str) -> Result<OwnedTemporaryDirectory, String> {
    let parent = std::env::temp_dir()
        .canonicalize()
        .map_err(|error| format!("cannot resolve temporary directory: {error}"))?;
    create_owned_directory_in(&parent, label)
}

fn create_owned_directory_in(
    parent: &Path,
    label: &str,
) -> Result<OwnedTemporaryDirectory, String> {
    let metadata = std::fs::symlink_metadata(&parent)
        .map_err(|error| format!("cannot inspect temporary directory parent: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("temporary directory parent must be a regular non-symlink directory".into());
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for suffix in 0..16_u32 {
        let path = parent.join(format!(
            "mengine-{label}-{}-{nonce}-{suffix}",
            std::process::id()
        ));
        match std::fs::create_dir(&path) {
            Ok(()) => return Ok(OwnedTemporaryDirectory { path }),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "cannot create temporary build artifact directory: {error}"
                ));
            }
        }
    }
    Err("cannot allocate a unique temporary build artifact directory".into())
}

fn copy_verified_build_blob(
    source: &Path,
    destination: &Path,
    expected_size: u64,
    expected_hash: &str,
) -> Result<(), String> {
    use std::io::{Read, Write};
    let source_metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("cannot inspect archived build blob: {error}"))?;
    if source_metadata.file_type().is_symlink()
        || !source_metadata.is_file()
        || source_metadata.len() != expected_size
    {
        return Err(format!(
            "archived build blob has invalid metadata: {}",
            source.display()
        ));
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create restored build directory: {error}"))?;
    }
    let mut input = std::fs::File::open(source)
        .map_err(|error| format!("cannot open archived build blob: {error}"))?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| format!("cannot create restored build file: {error}"))?;
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = input
            .read(&mut buffer)
            .map_err(|error| format!("cannot read archived build blob: {error}"))?;
        if read == 0 {
            break;
        }
        output
            .write_all(&buffer[..read])
            .map_err(|error| format!("cannot write restored build file: {error}"))?;
        digest.update(&buffer[..read]);
        total = total.saturating_add(read as u64);
    }
    let actual_hash = format!("{:x}", digest.finalize());
    if total != expected_size || actual_hash != expected_hash {
        return Err(format!(
            "archived build blob does not match its history manifest: {}",
            source.display()
        ));
    }
    output
        .sync_all()
        .map_err(|error| format!("cannot sync restored build file: {error}"))?;
    Ok(())
}

fn restore_build_executable_permissions(
    destination: &Path,
    manifest: &serde_json::Value,
) -> Result<(), String> {
    let executable = manifest
        .get("executable")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "build history manifest does not contain executable".to_string())?;
    let relative = safe_build_content_path(executable)?;
    let (_, files) = build_file_snapshots(manifest)?;
    if !files.contains_key(executable) {
        return Err("build history executable is not declared in files".into());
    }
    let path = destination.join(relative);
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect restored build executable: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("restored build executable must be a regular non-symlink file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions)
            .map_err(|error| format!("cannot make restored Player executable: {error}"))?;
    }
    Ok(())
}

fn restore_build_history_artifact(
    project_root: &Path,
    record_path: &Path,
    record: &BuildHistoryRecord,
    destination: &Path,
) -> Result<BuildHistoryEntry, String> {
    let entry = build_history_entry(project_root, record_path, record)?;
    if record.content_store.is_none() || !entry.content_available {
        return Err(format!(
            "build history {} does not have complete archived content",
            record.id
        ));
    }
    if !entry.artifact_signed {
        return Err(format!(
            "build history {} is unsigned and cannot be used as a trusted artifact",
            record.id
        ));
    }
    std::fs::create_dir(destination)
        .map_err(|error| format!("cannot create restored build artifact: {error}"))?;
    let store_root = build_content_store_dir(project_root, false)?
        .ok_or_else(|| "build content store is unavailable".to_string())?;
    let (_, files) = build_file_snapshots(&record.manifest)?;
    for (path, file) in &files {
        let relative = safe_build_content_path(path)?;
        let shard = store_root.join(&file.sha256[..2]);
        let shard_metadata = std::fs::symlink_metadata(&shard)
            .map_err(|error| format!("cannot inspect archived build shard: {error}"))?;
        if shard_metadata.file_type().is_symlink() || !shard_metadata.is_dir() {
            return Err(format!(
                "archived build shard must be a regular directory: {}",
                shard.display()
            ));
        }
        copy_verified_build_blob(
            &shard.join(&file.sha256),
            &destination.join(relative),
            file.size,
            &file.sha256,
        )?;
    }
    let manifest_path = destination.join("mengine-build.json");
    let contents = serde_json::to_vec_pretty(&record.manifest)
        .map_err(|error| format!("cannot serialize restored build manifest: {error}"))?;
    let mut manifest_file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&manifest_path)
        .map_err(|error| format!("cannot create restored build manifest: {error}"))?;
    use std::io::Write;
    manifest_file
        .write_all(&contents)
        .and_then(|_| manifest_file.write_all(b"\n"))
        .and_then(|_| manifest_file.sync_all())
        .map_err(|error| format!("cannot write restored build manifest: {error}"))?;
    restore_build_executable_permissions(destination, &record.manifest)?;
    Ok(entry)
}

fn unique_build_directory_path(parent: &Path, label: &str) -> Result<PathBuf, String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for suffix in 0..32_u32 {
        let path = parent.join(format!(
            ".mengine-{label}-{}-{nonce}-{suffix}",
            std::process::id()
        ));
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(path),
            Ok(_) => continue,
            Err(error) => {
                return Err(format!(
                    "cannot inspect build artifact staging path: {error}"
                ));
            }
        }
    }
    Err("cannot allocate a unique build artifact staging path".into())
}

fn canonical_builds_directory(project_root: &Path) -> Result<PathBuf, String> {
    let canonical_project = project_root
        .canonicalize()
        .map_err(|error| format!("cannot resolve project directory: {error}"))?;
    let project_metadata = std::fs::symlink_metadata(&canonical_project)
        .map_err(|error| format!("cannot inspect project directory: {error}"))?;
    if project_metadata.file_type().is_symlink() || !project_metadata.is_dir() {
        return Err("project root must be a regular non-symlink directory".into());
    }
    let builds = canonical_project.join("Builds");
    match std::fs::symlink_metadata(&builds) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("project Builds path must be a regular non-symlink directory".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(&builds)
                .map_err(|error| format!("cannot create project Builds directory: {error}"))?;
        }
        Err(error) => return Err(format!("cannot inspect project Builds directory: {error}")),
    }
    let canonical_builds = builds
        .canonicalize()
        .map_err(|error| format!("cannot resolve project Builds directory: {error}"))?;
    if !canonical_builds.starts_with(&canonical_project) {
        return Err("project Builds directory escapes the project root".into());
    }
    Ok(canonical_builds)
}

fn validate_restored_build_identity(
    output_dir: &Path,
    expected_manifest: &serde_json::Value,
    expected: &BuildHistoryEntry,
) -> Result<(), String> {
    let manifest = read_previous_build_manifest(output_dir)
        .ok_or_else(|| "restored build manifest is missing or unsafe".to_string())?;
    if manifest != *expected_manifest {
        return Err("restored build manifest does not match the selected history record".into());
    }
    let (content_hash, file_count, packaged_bytes) = published_build_identity(output_dir)?;
    if content_hash != expected.content_hash
        || file_count != expected.file_count
        || packaged_bytes != expected.packaged_bytes
    {
        return Err("restored build identity does not match the selected history record".into());
    }
    Ok(())
}

fn publish_restored_build_directory(
    staged: &Path,
    output_dir: &Path,
    expected_manifest: &serde_json::Value,
    expected: &BuildHistoryEntry,
) -> Result<(bool, Option<String>), String> {
    let parent = output_dir
        .parent()
        .ok_or_else(|| "restored build output has no parent directory".to_string())?;
    let replaced_existing = match std::fs::symlink_metadata(output_dir) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("published build target must be a regular non-symlink directory".into());
        }
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("cannot inspect published build target: {error}")),
    };
    let backup = unique_build_directory_path(parent, "restore-backup")?;
    if replaced_existing {
        std::fs::rename(output_dir, &backup)
            .map_err(|error| format!("cannot move the current published build aside: {error}"))?;
    }
    if let Err(error) = std::fs::rename(staged, output_dir) {
        if replaced_existing {
            if let Err(rollback_error) = std::fs::rename(&backup, output_dir) {
                return Err(format!(
                    "cannot publish restored build: {error}; rollback also failed: {rollback_error}; previous build remains at {}",
                    backup.display()
                ));
            }
        }
        return Err(format!("cannot publish restored build: {error}"));
    }
    if let Err(validation_error) =
        validate_restored_build_identity(output_dir, expected_manifest, expected)
    {
        let quarantine = staged;
        if let Err(error) = std::fs::rename(output_dir, quarantine) {
            return Err(if replaced_existing {
                format!(
                    "restored build failed post-publish validation: {validation_error}; cannot quarantine it: {error}; previous build remains at {}",
                    backup.display()
                )
            } else {
                format!(
                    "restored build failed post-publish validation: {validation_error}; cannot quarantine it: {error}; no previous published build existed"
                )
            });
        }
        if replaced_existing {
            if let Err(error) = std::fs::rename(&backup, output_dir) {
                return Err(format!(
                    "restored build failed post-publish validation: {validation_error}; rollback failed: {error}; previous build remains at {}",
                    backup.display()
                ));
            }
        }
        return Err(if replaced_existing {
            format!(
                "restored build failed post-publish validation and the previous build was preserved: {validation_error}"
            )
        } else {
            format!(
                "restored build failed post-publish validation; the invalid output was removed and no previous build existed: {validation_error}"
            )
        });
    }
    let cleanup_warning = if replaced_existing {
        std::fs::remove_dir_all(&backup).err().map(|error| {
            format!(
                "restored build was published, but the previous build backup could not be removed: {} ({error})",
                backup.display()
            )
        })
    } else {
        None
    };
    Ok((replaced_existing, cleanup_warning))
}

fn restore_build_history_as_published_with_verifier<F>(
    project_root: &Path,
    history_id: &str,
    verifier: F,
) -> Result<RestoreBuildHistoryResult, String>
where
    F: FnOnce(&Path, &str) -> Result<String, String>,
{
    let history_dir = build_history_dir(project_root, false)?
        .ok_or_else(|| "build history is empty".to_string())?;
    let record_path = build_history_record_path(&history_dir, history_id)?;
    let record = read_build_history_record(&record_path, history_id)?;
    let entry = build_history_entry(project_root, &record_path, &record)?;
    let signing_key_id = entry
        .artifact_signing_key_id
        .clone()
        .ok_or_else(|| "selected build history is unsigned and cannot be restored".to_string())?;
    let builds = canonical_builds_directory(project_root)?;
    let output_dir = builds.join(format!(
        "{}-{}-{}",
        entry.platform, entry.architecture, entry.profile
    ));
    let staged_path = unique_build_directory_path(&builds, "restore-stage")?;
    let staged = OwnedTemporaryDirectory {
        path: staged_path.clone(),
    };
    restore_build_history_artifact(project_root, &record_path, &record, &staged.path)?;
    let log = verifier(&staged.path, &entry.profile)?;
    validate_restored_build_identity(&staged.path, &record.manifest, &entry)?;
    let (replaced_existing, cleanup_warning) =
        publish_restored_build_directory(&staged.path, &output_dir, &record.manifest, &entry)?;
    Ok(RestoreBuildHistoryResult {
        history_id: entry.id,
        output_dir: output_dir.to_string_lossy().into_owned(),
        manifest_path: output_dir
            .join("mengine-build.json")
            .to_string_lossy()
            .into_owned(),
        content_hash: entry.content_hash,
        file_count: entry.file_count,
        packaged_bytes: entry.packaged_bytes,
        signing_key_id,
        replaced_existing,
        cleanup_warning,
        log,
    })
}

fn restore_build_history_as_published(
    project_root: &Path,
    history_id: &str,
    public_key_path: &Path,
    bundled_sdk: Option<PathBuf>,
) -> Result<RestoreBuildHistoryResult, String> {
    let public_key = trusted_public_key_path(public_key_path)?;
    restore_build_history_as_published_with_verifier(project_root, history_id, |staged, profile| {
        let mut command = history_patch_command(bundled_sdk, profile)?;
        let output = command
            .arg("verify-build")
            .arg(staged)
            .arg("--public-key")
            .arg(&public_key)
            .output()
            .map_err(|error| format!("cannot start historical build verification: {error}"))?;
        if !output.status.success() {
            return Err(command_failure("historical build verification", &output));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Ok(match (stdout.is_empty(), stderr.is_empty()) {
            (false, false) => format!("{stdout}\n{stderr}"),
            (false, true) => stdout,
            (true, false) => stderr,
            (true, true) => String::new(),
        })
    })
}

fn build_patch_store_root(project_root: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    let engine_dir = project_root.join(".mengine");
    let patch_dir = engine_dir.join("build-patches");
    for directory in [&engine_dir, &patch_dir] {
        match std::fs::symlink_metadata(directory) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(format!(
                        "build patch directory must be a regular directory: {}",
                        directory.display()
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
                std::fs::create_dir(directory).map_err(|error| {
                    format!(
                        "cannot create build patch directory {}: {error}",
                        directory.display()
                    )
                })?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(format!(
                    "cannot inspect build patch directory {}: {error}",
                    directory.display()
                ));
            }
        }
    }
    Ok(Some(patch_dir))
}

fn build_history_patch_root(project_root: &Path) -> Result<PathBuf, String> {
    let patch_dir = build_patch_store_root(project_root, true)?
        .ok_or_else(|| "build patch directory is unavailable".to_string())?;
    let history_patch_dir = patch_dir.join("history");
    match std::fs::symlink_metadata(&history_patch_dir) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => Err(format!(
            "build patch directory must be a regular directory: {}",
            history_patch_dir.display()
        )),
        Ok(_) => Ok(history_patch_dir),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(&history_patch_dir).map_err(|error| {
                format!(
                    "cannot create build patch directory {}: {error}",
                    history_patch_dir.display()
                )
            })?;
            Ok(history_patch_dir)
        }
        Err(error) => Err(format!(
            "cannot inspect build patch directory {}: {error}",
            history_patch_dir.display()
        )),
    }
}

fn source_cli_command() -> Result<Command, String> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let engine_root = find_engine_root(manifest_dir)
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| find_engine_root(&path))
        })
        .ok_or_else(|| {
            "MEngine build tools were not found. Reinstall the editor Build SDK or set MENGINE_BUILD_SDK."
                .to_string()
        })?;
    let npm = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };
    let cli_build = Command::new(npm)
        .current_dir(&engine_root)
        .args(["--prefix", "packages/cli", "run", "build"])
        .output()
        .map_err(|error| format!("cannot start CLI build: {error}"))?;
    if !cli_build.status.success() {
        return Err(command_failure("MEngine CLI build", &cli_build));
    }
    let cli = engine_root.join("packages/cli/dist/cli.js");
    if !cli.is_file() {
        return Err(format!(
            "MEngine CLI build completed without {}",
            cli.display()
        ));
    }
    let mut command = Command::new("node");
    command.current_dir(engine_root).arg(cli);
    Ok(command)
}

fn history_patch_command(bundled_sdk: Option<PathBuf>, profile: &str) -> Result<Command, String> {
    let configured_sdk = std::env::var_os("MENGINE_BUILD_SDK")
        .map(PathBuf::from)
        .or(bundled_sdk);
    if let Some(root) = configured_sdk {
        let sdk = load_build_sdk(&root, profile)?;
        let mut command = Command::new(child_process_path(&sdk.node));
        command
            .current_dir(child_process_path(&sdk.root))
            .arg(child_process_path(&sdk.cli));
        Ok(command)
    } else {
        source_cli_command()
    }
}

fn parse_build_history_patch_result(
    output_dir: &Path,
    expected_edge: Option<(&str, &str)>,
) -> Result<BuildHistoryPatchResult, String> {
    let manifest_path = output_dir.join("mengine-patch.json");
    let metadata = std::fs::symlink_metadata(&manifest_path)
        .map_err(|error| format!("cannot inspect generated patch manifest: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > 64 * 1024 * 1024
    {
        return Err("generated patch manifest must be a regular file no larger than 64 MiB".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .map_err(|error| format!("cannot read generated patch manifest: {error}"))?,
    )
    .map_err(|error| format!("invalid generated patch manifest: {error}"))?;
    if manifest
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return Err("generated patch manifest has an unsupported schema version".into());
    }
    let string_field = |name: &str| -> Result<String, String> {
        manifest
            .get(name)
            .and_then(serde_json::Value::as_str)
            .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .map(str::to_ascii_lowercase)
            .ok_or_else(|| format!("generated patch manifest has an invalid {name}"))
    };
    let from_content_hash = string_field("fromContentHash")?;
    let to_content_hash = string_field("toContentHash")?;
    if let Some((expected_from, expected_to)) = expected_edge {
        if from_content_hash != expected_from || to_content_hash != expected_to {
            return Err("generated patch content identity does not match selected history".into());
        }
    }
    let number_field = |name: &str| -> Result<u64, String> {
        manifest
            .get(name)
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| format!("generated patch manifest has an invalid {name}"))
    };
    let files = manifest
        .get("files")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "generated patch manifest has an invalid files list".to_string())?;
    let removed = manifest
        .get("removedFiles")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "generated patch manifest has an invalid removedFiles list".to_string())?;
    let signing_key_id = manifest
        .get("signature")
        .and_then(|signature| signature.get("keyId"))
        .and_then(serde_json::Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "generated patch manifest has an invalid signature key id".to_string())?;
    Ok(BuildHistoryPatchResult {
        output_dir: output_dir.to_string_lossy().into_owned(),
        manifest_path: manifest_path.to_string_lossy().into_owned(),
        from_content_hash,
        to_content_hash,
        from_artifact_hash: string_field("fromArtifactHash")?,
        to_artifact_hash: string_field("toArtifactHash")?,
        changed_files: files.len(),
        removed_files: removed.len(),
        unchanged_files: usize::try_from(number_field("unchangedFiles")?)
            .map_err(|_| "generated patch unchangedFiles exceeds this host".to_string())?,
        payload_bytes: number_field("payloadBytes")?,
        reused_bytes: number_field("reusedBytes")?,
        signing_key_id,
    })
}

fn scan_build_patch_inventory(project_root: &Path) -> Result<BuildPatchInventoryResult, String> {
    let Some(store_root) = build_patch_store_root(project_root, false)? else {
        return Ok(BuildPatchInventoryResult {
            entries: Vec::new(),
            invalid_patches: 0,
        });
    };
    let history = list_build_history(project_root)?;
    let mut entries = Vec::new();
    let mut invalid_patches = 0_usize;
    for group in std::fs::read_dir(&store_root)
        .map_err(|error| format!("cannot scan build patch store: {error}"))?
    {
        let Ok(group) = group else {
            invalid_patches = invalid_patches.saturating_add(1);
            continue;
        };
        let group_path = group.path();
        let Ok(group_metadata) = std::fs::symlink_metadata(&group_path) else {
            invalid_patches = invalid_patches.saturating_add(1);
            continue;
        };
        if group_metadata.file_type().is_symlink() || !group_metadata.is_dir() {
            invalid_patches = invalid_patches.saturating_add(1);
            continue;
        }
        let group_name = group.file_name().to_string_lossy().into_owned();
        if !valid_build_history_id(&group_name) {
            invalid_patches = invalid_patches.saturating_add(1);
            continue;
        }
        let children = match std::fs::read_dir(&group_path) {
            Ok(children) => children,
            Err(_) => {
                invalid_patches = invalid_patches.saturating_add(1);
                continue;
            }
        };
        for child in children {
            let Ok(child) = child else {
                invalid_patches = invalid_patches.saturating_add(1);
                continue;
            };
            let path = child.path();
            let Ok(metadata) = std::fs::symlink_metadata(&path) else {
                invalid_patches = invalid_patches.saturating_add(1);
                continue;
            };
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                invalid_patches = invalid_patches.saturating_add(1);
                continue;
            }
            let name = child.file_name().to_string_lossy().into_owned();
            if !valid_build_history_id(&name) {
                invalid_patches = invalid_patches.saturating_add(1);
                continue;
            }
            let patch = match parse_build_history_patch_result(&path, None) {
                Ok(patch) => patch,
                Err(_) => {
                    invalid_patches = invalid_patches.saturating_add(1);
                    continue;
                }
            };
            let base_available = history.iter().any(|entry| {
                entry.content_available
                    && entry.artifact_signing_key_id.as_deref()
                        == Some(patch.signing_key_id.as_str())
                    && entry.content_hash == patch.from_content_hash
            });
            let created_at_ms = std::fs::symlink_metadata(&patch.manifest_path)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis().try_into().unwrap_or(u64::MAX))
                .unwrap_or(0);
            entries.push(BuildPatchInventoryEntry {
                id: format!("{group_name}/{name}"),
                source: if group_name == "history" {
                    "history".into()
                } else {
                    "automatic".into()
                },
                created_at_ms,
                base_available,
                patch,
            });
        }
    }
    entries.sort_by(|left, right| {
        right
            .created_at_ms
            .cmp(&left.created_at_ms)
            .then_with(|| right.id.cmp(&left.id))
    });
    Ok(BuildPatchInventoryResult {
        entries,
        invalid_patches,
    })
}

fn build_patch_directory_from_id(store_root: &Path, id: &str) -> Result<PathBuf, String> {
    let segments = id.split('/').collect::<Vec<_>>();
    if segments.len() != 2
        || segments
            .iter()
            .any(|segment| !valid_build_history_id(segment))
    {
        return Err("invalid build patch id".into());
    }
    let path = store_root.join(segments[0]).join(segments[1]);
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|error| format!("cannot inspect build patch: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("build patch must be a regular non-symlink directory".into());
    }
    Ok(path)
}

fn trusted_public_key_path(path: &Path) -> Result<PathBuf, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("cannot inspect trusted public key: {error}"))?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > 64 * 1024
    {
        return Err(
            "trusted public key must be a non-empty regular non-symlink file under 64 KiB".into(),
        );
    }
    path.canonicalize()
        .map_err(|error| format!("cannot resolve trusted public key: {error}"))
}

fn verify_build_patch_from_history(
    project_root: &Path,
    patch_id: &str,
    public_key_path: &Path,
    bundled_sdk: Option<PathBuf>,
) -> Result<VerifyBuildPatchResult, String> {
    let store_root = build_patch_store_root(project_root, false)?
        .ok_or_else(|| "build patch inventory is empty".to_string())?;
    let patch_dir = build_patch_directory_from_id(&store_root, patch_id)?;
    let patch = parse_build_history_patch_result(&patch_dir, None)?;
    let public_key = trusted_public_key_path(public_key_path)?;
    let candidates = list_build_history(project_root)?
        .into_iter()
        .filter(|entry| {
            entry.content_available
                && entry.content_hash == patch.from_content_hash
                && entry.artifact_signing_key_id.as_deref() == Some(patch.signing_key_id.as_str())
        })
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return Err("no archived build history can provide this patch base artifact".into());
    }
    let history_dir = build_history_dir(project_root, false)?
        .ok_or_else(|| "build history is empty".to_string())?;
    let mut failures = Vec::new();
    for (index, candidate) in candidates.iter().enumerate() {
        let temporary = create_owned_temporary_directory("patch-verify")?;
        let base_dir = temporary.path.join(format!("base-{index}"));
        let record_path = build_history_record_path(&history_dir, &candidate.id)?;
        let record = read_build_history_record(&record_path, &candidate.id)?;
        if let Err(error) =
            restore_build_history_artifact(project_root, &record_path, &record, &base_dir)
        {
            failures.push(error);
            continue;
        }
        let mut command = history_patch_command(bundled_sdk.clone(), &candidate.profile)?;
        let output = command
            .arg("verify-patch")
            .arg(&base_dir)
            .arg(&patch_dir)
            .arg("--public-key")
            .arg(&public_key)
            .output()
            .map_err(|error| format!("cannot start historical patch verification: {error}"))?;
        if output.status.success() {
            return Ok(VerifyBuildPatchResult {
                patch_id: patch_id.to_string(),
                base_history_id: candidate.id.clone(),
                from_content_hash: patch.from_content_hash,
                to_content_hash: patch.to_content_hash,
                signing_key_id: patch.signing_key_id,
                log: String::from_utf8_lossy(&output.stdout).trim().to_owned(),
            });
        }
        failures.push(command_failure("historical patch verification", &output));
    }
    Err(format!(
        "no matching archived base passed trusted patch verification: {}",
        failures
            .last()
            .map(String::as_str)
            .unwrap_or("unknown error")
    ))
}

fn create_build_history_patch(
    project_root: &Path,
    previous_id: &str,
    current_id: &str,
    bundled_sdk: Option<PathBuf>,
) -> Result<BuildHistoryPatchResult, String> {
    if previous_id == current_id {
        return Err("select two different build history entries".into());
    }
    if std::env::var_os("MENGINE_SIGNING_KEY").is_none() {
        return Err("history patch generation requires MENGINE_SIGNING_KEY".into());
    }
    let history_dir = build_history_dir(project_root, false)?
        .ok_or_else(|| "build history is empty".to_string())?;
    let previous_path = build_history_record_path(&history_dir, previous_id)?;
    let current_path = build_history_record_path(&history_dir, current_id)?;
    let previous = read_build_history_record(&previous_path, previous_id)?;
    let current = read_build_history_record(&current_path, current_id)?;
    if (previous.recorded_at_ms, previous.id.as_str())
        >= (current.recorded_at_ms, current.id.as_str())
    {
        return Err("history patch base must be older than its target".into());
    }
    let temporary = create_owned_temporary_directory("history-patch")?;
    let base_dir = temporary.path.join("base");
    let target_dir = temporary.path.join("target");
    let previous_entry =
        restore_build_history_artifact(project_root, &previous_path, &previous, &base_dir)?;
    let current_entry =
        restore_build_history_artifact(project_root, &current_path, &current, &target_dir)?;
    if previous_entry.platform != current_entry.platform
        || previous_entry.architecture != current_entry.architecture
        || previous_entry.profile != current_entry.profile
    {
        return Err("selected build history entries target different platforms or profiles".into());
    }
    if previous_entry.artifact_signing_key_id != current_entry.artifact_signing_key_id {
        return Err("selected build history entries use different artifact signing keys".into());
    }
    let edge = format!("{previous_id}\0{current_id}");
    let edge_hash = format!("{:x}", Sha256::digest(edge.as_bytes()));
    let output_dir = build_history_patch_root(project_root)?.join(format!(
        "{}-{}-{}",
        &previous_entry.content_hash[..12],
        &current_entry.content_hash[..12],
        &edge_hash[..16]
    ));
    let mut command = history_patch_command(bundled_sdk, &current_entry.profile)?;
    let output = command
        .arg("create-patch")
        .arg(&base_dir)
        .arg(&target_dir)
        .arg("--out")
        .arg(&output_dir)
        .arg("--clean")
        .output()
        .map_err(|error| format!("cannot start historical patch build: {error}"))?;
    if !output.status.success() {
        return Err(command_failure("historical patch build", &output));
    }
    let result = parse_build_history_patch_result(
        &output_dir,
        Some((&previous_entry.content_hash, &current_entry.content_hash)),
    )?;
    if current_entry.artifact_signing_key_id.as_deref() != Some(result.signing_key_id.as_str()) {
        return Err("generated patch signing key does not match selected history".into());
    }
    Ok(result)
}

const BUILD_STAGE_COUNT: usize = 5;
type BuildProgressSink = Arc<dyn Fn(BuildProgressEvent) + Send + Sync>;

#[derive(Clone)]
struct BuildControl {
    build_id: u64,
    cancelled: Arc<AtomicBool>,
    cancel_file: Option<PathBuf>,
    progress: Option<BuildProgressSink>,
}

impl BuildControl {
    fn ensure_active(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Acquire) {
            Err("player build cancelled".into())
        } else {
            Ok(())
        }
    }

    fn emit(&self, stage: &str, label: &str, stage_index: usize, status: &str, started: Instant) {
        let Some(progress) = &self.progress else {
            return;
        };
        progress(BuildProgressEvent {
            build_id: self.build_id,
            stage: stage.to_string(),
            label: label.to_string(),
            stage_index,
            stage_count: BUILD_STAGE_COUNT,
            status: status.to_string(),
            elapsed_ms: duration_ms(started.elapsed()),
        });
    }
}

fn duration_ms(duration: std::time::Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

fn begin_build_stage(
    control: &BuildControl,
    total_started: Instant,
    stage: &str,
    label: &str,
    stage_index: usize,
) -> Instant {
    control.emit(stage, label, stage_index, "running", total_started);
    Instant::now()
}

fn finish_build_stage(
    control: &BuildControl,
    total_started: Instant,
    timings: &mut Vec<BuildStageTimingResult>,
    stage: &str,
    label: &str,
    stage_index: usize,
    started: Instant,
) {
    timings.push(BuildStageTimingResult {
        stage: stage.to_string(),
        label: label.to_string(),
        duration_ms: duration_ms(started.elapsed()),
    });
    control.emit(stage, label, stage_index, "completed", total_started);
}

fn run_player_build_controlled(
    project_root: PathBuf,
    profile: String,
    clean: bool,
    bundled_sdk: Option<PathBuf>,
    control: BuildControl,
) -> Result<BuildPlayerResult, String> {
    let total_started = Instant::now();
    let mut stage_timings = Vec::with_capacity(BUILD_STAGE_COUNT);
    let prepare_started = begin_build_stage(
        &control,
        total_started,
        "prepare",
        "Validate project and build settings",
        1,
    );
    control.ensure_active()?;
    if profile != "debug" && profile != "release" {
        return Err(format!("unsupported build profile: {profile}"));
    }
    let manifest = project_root.join("project.json");
    if !manifest.is_file() {
        return Err(format!("project.json not found: {}", manifest.display()));
    }
    let output_dir = project_root.join("Builds").join(format!(
        "{}-{}-{profile}",
        node_platform_name(),
        node_arch_name()
    ));
    let previous_build_manifest = read_previous_build_manifest(&output_dir);
    finish_build_stage(
        &control,
        total_started,
        &mut stage_timings,
        "prepare",
        "Validate project and build settings",
        1,
        prepare_started,
    );

    let toolchain_started = begin_build_stage(
        &control,
        total_started,
        "toolchain",
        "Resolve build toolchain",
        2,
    );
    control.ensure_active()?;
    let configured_sdk = std::env::var_os("MENGINE_BUILD_SDK")
        .map(PathBuf::from)
        .or(bundled_sdk);
    let sdk = configured_sdk
        .as_deref()
        .map(|path| load_build_sdk(path, &profile))
        .transpose()?;
    finish_build_stage(
        &control,
        total_started,
        &mut stage_timings,
        "toolchain",
        "Resolve build toolchain",
        2,
        toolchain_started,
    );

    let compile_started = begin_build_stage(
        &control,
        total_started,
        "compile-tools",
        "Prepare build tools",
        3,
    );
    control.ensure_active()?;
    let mut command;
    let toolchain;
    if let Some(sdk) = &sdk {
        command = Command::new(child_process_path(&sdk.node));
        command
            .current_dir(child_process_path(&sdk.root))
            .arg(child_process_path(&sdk.cli))
            .arg("build")
            .arg(&project_root)
            .arg("--out")
            .arg(&output_dir)
            .arg("--runtime")
            .arg(child_process_path(&sdk.runtime))
            .arg("--skip-runtime-build");
        toolchain = "bundled-sdk".to_string();
    } else {
        command = source_cli_command()?;
        control.ensure_active()?;
        command
            .arg("build")
            .arg(&project_root)
            .arg("--out")
            .arg(&output_dir);
        toolchain = "source-checkout".to_string();
    }
    finish_build_stage(
        &control,
        total_started,
        &mut stage_timings,
        "compile-tools",
        "Prepare build tools",
        3,
        compile_started,
    );

    let package_started = begin_build_stage(
        &control,
        total_started,
        "package-player",
        "Build, validate, and publish Player",
        4,
    );
    control.ensure_active()?;
    if profile == "debug" {
        command.arg("--debug");
    }
    if clean {
        command.arg("--clean");
    }
    if let Some(cancel_file) = &control.cancel_file {
        command.arg("--cancel-file").arg(cancel_file);
    }
    let output = command
        .output()
        .map_err(|error| format!("cannot start player build: {error}"))?;
    if !output.status.success() {
        if control.cancelled.load(Ordering::Acquire) {
            return Err("player build cancelled".into());
        }
        return Err(command_failure("MEngine player build", &output));
    }
    finish_build_stage(
        &control,
        total_started,
        &mut stage_timings,
        "package-player",
        "Build, validate, and publish Player",
        4,
        package_started,
    );

    let report_started = begin_build_stage(
        &control,
        total_started,
        "build-report",
        "Inspect published build report",
        5,
    );
    let build_manifest_path = output_dir.join("mengine-build.json");
    let build_manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&build_manifest_path).map_err(|error| {
            format!(
                "build finished without {}: {error}",
                build_manifest_path.display()
            )
        })?)
        .map_err(|error| format!("invalid build manifest: {error}"))?;
    let comparison = previous_build_manifest
        .as_ref()
        .and_then(|previous| compare_build_manifests(previous, &build_manifest).ok());
    let executable = build_manifest
        .get("executable")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "build manifest does not contain executable".to_string())?;
    let file_count = build_manifest
        .get("files")
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    let content_hash = build_manifest
        .get("contentHash")
        .and_then(serde_json::Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "build manifest does not contain a valid contentHash".to_string())?
        .to_ascii_lowercase();
    let artifact_signing_key_id = build_artifact_signature_key_id(&build_manifest)?;
    let manifest_profile = build_manifest
        .get("profile")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "build manifest does not contain a profile".to_string())?;
    if manifest_profile != profile {
        return Err(format!(
            "build manifest profile mismatch: expected {profile}, found {manifest_profile}"
        ));
    }
    let manifest_string = |field: &str| -> Result<String, String> {
        build_manifest
            .get(field)
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| format!("build manifest does not contain {field}"))
    };
    let manifest_count = |parent: &str, field: &str| -> Result<usize, String> {
        build_manifest
            .get(parent)
            .and_then(|value| value.get(field))
            .and_then(serde_json::Value::as_u64)
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| format!("build manifest does not contain {parent}.{field}"))
    };
    let manifest_u64 = |parent: &str, field: &str| -> Result<u64, String> {
        build_manifest
            .get(parent)
            .and_then(|value| value.get(field))
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| format!("build manifest does not contain {parent}.{field}"))
    };
    let scene_count = build_manifest
        .get("project")
        .and_then(|value| value.get("buildScenes"))
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    let asset_mode = build_manifest
        .get("assetValidation")
        .and_then(|value| value.get("assetMode"))
        .and_then(serde_json::Value::as_str)
        .filter(|value| *value == "all" || *value == "referenced")
        .ok_or_else(|| {
            "build manifest does not contain a valid assetValidation.assetMode".to_string()
        })?
        .to_owned();
    let manifest_files = build_manifest
        .get("files")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "build manifest does not contain files".to_string())?;
    let mut category_totals = BTreeMap::<String, (usize, u64)>::new();
    let mut largest_files = Vec::<BuildContentFileResult>::new();
    for file in manifest_files {
        let path = file
            .get("path")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "build manifest contains a file without path".to_string())?;
        let size = file
            .get("size")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| format!("build manifest file {path} does not contain size"))?;
        let category = file
            .get("category")
            .and_then(serde_json::Value::as_str)
            .filter(|value| {
                matches!(
                    *value,
                    "runtime"
                        | "scene"
                        | "script"
                        | "material"
                        | "shader"
                        | "texture"
                        | "model"
                        | "animation"
                        | "timeline"
                        | "audio"
                        | "prefab"
                        | "spine"
                        | "settings"
                        | "metadata"
                        | "other"
                )
            })
            .ok_or_else(|| format!("build manifest file {path} has an invalid category"))?;
        let reasons = file
            .get("includedBy")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| format!("build manifest file {path} does not contain includedBy"))?;
        let mut included_by = Vec::new();
        for reason in reasons {
            let kind = reason
                .get("kind")
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    format!("build manifest file {path} has an invalid inclusion kind")
                })?;
            let from = reason
                .get("from")
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    format!("build manifest file {path} has an invalid inclusion source")
                })?;
            included_by.push(format!("{kind} <- {from}"));
        }
        if included_by.is_empty() {
            return Err(format!(
                "build manifest file {path} has no inclusion reason"
            ));
        }
        let total = category_totals.entry(category.to_string()).or_default();
        total.0 += 1;
        total.1 += size;
        largest_files.push(BuildContentFileResult {
            path: path.to_string(),
            size,
            category: category.to_string(),
            included_by,
        });
    }
    let packaged_bytes = category_totals.values().map(|(_, bytes)| bytes).sum();
    if manifest_u64("contentSummary", "totalBytes")? != packaged_bytes {
        return Err("build manifest contentSummary.totalBytes does not match files".to_string());
    }
    let mut content_categories = category_totals
        .into_iter()
        .map(|(category, (files, bytes))| BuildContentCategoryResult {
            category,
            files,
            bytes,
        })
        .collect::<Vec<_>>();
    content_categories.sort_by(|left, right| {
        right
            .bytes
            .cmp(&left.bytes)
            .then_with(|| left.category.cmp(&right.category))
    });
    largest_files.sort_by(|left, right| {
        right
            .size
            .cmp(&left.size)
            .then_with(|| left.path.cmp(&right.path))
    });
    largest_files.truncate(20);
    let platform = manifest_string("platform")?;
    let architecture = manifest_string("architecture")?;
    let engine_version = manifest_string("engineVersion")?;
    let validated_asset_files = manifest_count("assetValidation", "validatedFiles")?;
    let asset_references = manifest_count("assetValidation", "references")?;
    let audited_scenes = manifest_count("assetValidation", "auditedScenes")?;
    let audited_prefabs = manifest_count("assetValidation", "auditedPrefabs")?;
    let audited_materials = manifest_count("assetValidation", "auditedMaterials")?;
    let audited_material_instances = manifest_count("assetValidation", "auditedMaterialInstances")?;
    let audited_surface_shaders = manifest_count("assetValidation", "auditedSurfaceShaders")?;
    let shader_variants = manifest_count("assetValidation", "shaderVariants")?;
    let shader_variant_limit = manifest_count("project", "shaderVariantLimit")?;
    if !(1..=65_536).contains(&shader_variant_limit) {
        return Err(
            "build manifest project.shaderVariantLimit must be from 1 to 65536".to_string(),
        );
    }
    let surface_shader_variants = serde_json::from_value::<Vec<BuildShaderVariantResult>>(
        build_manifest
            .get("surfaceShaderVariants")
            .cloned()
            .ok_or_else(|| "build manifest does not contain surfaceShaderVariants".to_string())?,
    )
    .map_err(|error| format!("build manifest contains invalid Surface Shader variants: {error}"))?;
    if surface_shader_variants.len() != shader_variants {
        return Err(
            "build manifest Surface Shader variant count does not match asset validation"
                .to_string(),
        );
    }
    if let Some(invalid) = surface_shader_variants.iter().find(|variant| {
        variant.shader.trim().is_empty()
            || !matches!(
                variant.blend.as_str(),
                "replace" | "alpha" | "premultiplied" | "additive" | "multiply"
            )
    }) {
        return Err(format!(
            "build manifest contains invalid Surface Shader pipeline variant for {}",
            invalid.shader
        ));
    }
    if shader_variants > shader_variant_limit {
        return Err("build manifest exceeds its Surface Shader variant limit".to_string());
    }
    let omitted_asset_files = manifest_count("assetValidation", "omittedAssetFiles")?;
    let omitted_asset_bytes = manifest_u64("assetValidation", "omittedAssetBytes")?;
    let stripped_editor_entities = manifest_count("assetValidation", "strippedEditorEntities")?;
    finish_build_stage(
        &control,
        total_started,
        &mut stage_timings,
        "build-report",
        "Inspect published build report",
        5,
        report_started,
    );
    let total_duration_ms = duration_ms(total_started.elapsed());
    let (build_cache, incremental_patch, mut build_log) = extract_build_reports(&output.stdout);
    let history_entry = match archive_build_history(
        &project_root,
        Some(&output_dir),
        &build_manifest,
        total_duration_ms,
        &toolchain,
    ) {
        Ok(entry) => Some(entry),
        Err(error) => {
            if !build_log.is_empty() {
                build_log.push('\n');
            }
            build_log.push_str(&format!(
                "warning: player was published, but build history archival or maintenance failed: {error}"
            ));
            None
        }
    };
    Ok(BuildPlayerResult {
        build_id: control.build_id,
        output_dir: output_dir.to_string_lossy().into_owned(),
        executable: output_dir.join(executable).to_string_lossy().into_owned(),
        file_count,
        content_hash,
        artifact_signed: artifact_signing_key_id.is_some(),
        artifact_signing_key_id,
        profile,
        platform,
        architecture,
        engine_version,
        scene_count,
        validated_asset_files,
        asset_references,
        audited_scenes,
        audited_prefabs,
        audited_materials,
        audited_material_instances,
        audited_surface_shaders,
        shader_variants,
        shader_variant_limit,
        surface_shader_variants,
        asset_mode,
        omitted_asset_files,
        omitted_asset_bytes,
        stripped_editor_entities,
        packaged_bytes,
        manifest_path: build_manifest_path.to_string_lossy().into_owned(),
        content_categories,
        largest_files,
        comparison,
        build_cache,
        incremental_patch,
        stage_timings,
        total_duration_ms,
        toolchain,
        history_entry,
        log: build_log,
    })
}

fn validated_player_executable(project_root: &Path, requested: &Path) -> Result<PathBuf, String> {
    let canonical_project = project_root
        .canonicalize()
        .map_err(|error| format!("project root: {error}"))?;
    let builds_path = canonical_project.join("Builds");
    let builds_metadata = std::fs::symlink_metadata(&builds_path)
        .map_err(|error| format!("player builds directory: {error}"))?;
    if builds_metadata.file_type().is_symlink() || !builds_metadata.is_dir() {
        return Err("player builds directory must be a regular directory".into());
    }
    let canonical_builds = builds_path
        .canonicalize()
        .map_err(|error| format!("player builds directory: {error}"))?;
    if !canonical_builds.starts_with(&canonical_project) {
        return Err("player builds directory escapes the current project".into());
    }

    let requested_metadata = std::fs::symlink_metadata(requested)
        .map_err(|error| format!("player executable: {error}"))?;
    if requested_metadata.file_type().is_symlink() || !requested_metadata.is_file() {
        return Err("player executable must be a regular non-symlink file".into());
    }
    let canonical_executable = requested
        .canonicalize()
        .map_err(|error| format!("player executable: {error}"))?;
    if !canonical_executable.starts_with(&canonical_builds) {
        return Err(
            "player executable must be inside the current project's Builds directory".into(),
        );
    }

    let output_dir = canonical_executable
        .parent()
        .ok_or_else(|| "player executable has no output directory".to_string())?;
    let manifest_path = output_dir.join("mengine-build.json");
    let manifest_metadata = std::fs::symlink_metadata(&manifest_path)
        .map_err(|error| format!("player build manifest: {error}"))?;
    if manifest_metadata.file_type().is_symlink()
        || !manifest_metadata.is_file()
        || manifest_metadata.len() > 64 * 1024 * 1024
    {
        return Err("player build manifest must be a regular non-symlink file under 64 MiB".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .map_err(|error| format!("cannot read player build manifest: {error}"))?,
    )
    .map_err(|error| format!("invalid player build manifest: {error}"))?;
    let declared = manifest
        .get("executable")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "player build manifest does not contain executable".to_string())?;
    let declared_path = Path::new(declared);
    if declared_path.is_absolute()
        || declared_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("player build manifest contains an unsafe executable path".into());
    }
    let declared_executable = output_dir
        .join(declared_path)
        .canonicalize()
        .map_err(|error| format!("manifest player executable: {error}"))?;
    if declared_executable != canonical_executable {
        return Err("requested executable does not match the player build manifest".into());
    }
    Ok(canonical_executable)
}

fn published_build_identity(output_dir: &Path) -> Result<(String, usize, u64), String> {
    let manifest_path = output_dir.join("mengine-build.json");
    let manifest_metadata = std::fs::symlink_metadata(&manifest_path)
        .map_err(|error| format!("player build manifest: {error}"))?;
    if manifest_metadata.file_type().is_symlink() || !manifest_metadata.is_file() {
        return Err("player build manifest must be a regular non-symlink file".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&manifest_path)
            .map_err(|error| format!("cannot read player build manifest: {error}"))?,
    )
    .map_err(|error| format!("invalid player build manifest: {error}"))?;
    let content_hash = manifest
        .get("contentHash")
        .and_then(serde_json::Value::as_str)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| "player build manifest does not contain a valid contentHash".to_string())?
        .to_ascii_lowercase();
    let files = manifest
        .get("files")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "player build manifest does not contain files".to_string())?;
    let packaged_bytes = files.iter().try_fold(0_u64, |total, file| {
        file.get("size")
            .and_then(serde_json::Value::as_u64)
            .and_then(|size| total.checked_add(size))
            .ok_or_else(|| "player build manifest contains an invalid file size".to_string())
    })?;
    Ok((content_hash, files.len(), packaged_bytes))
}

fn verify_built_player(
    project_root: &Path,
    requested: &Path,
    expected_content_hash: &str,
) -> Result<VerifyPlayerResult, String> {
    let expected_content_hash = expected_content_hash.trim().to_ascii_lowercase();
    if expected_content_hash.len() != 64
        || !expected_content_hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("expected build content hash must be a 64-character SHA-256 value".into());
    }
    let executable = validated_player_executable(project_root, requested)?;
    let output_dir = executable
        .parent()
        .ok_or_else(|| "player executable has no output directory".to_string())?;
    let (content_hash_before, _, _) = published_build_identity(output_dir)?;
    if content_hash_before != expected_content_hash {
        return Err(format!(
            "published build identity changed: expected {expected_content_hash}, found {content_hash_before}"
        ));
    }

    let mut command = Command::new(&executable);
    command.current_dir(output_dir).arg("--validate-package");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("cannot start published build verification: {error}"))?;
    if !output.status.success() {
        return Err(command_failure(
            "Published MEngine player verification",
            &output,
        ));
    }

    let (content_hash, file_count, packaged_bytes) = published_build_identity(output_dir)?;
    if content_hash != expected_content_hash {
        return Err(format!(
            "published build identity changed during verification: expected {expected_content_hash}, found {content_hash}"
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let log = match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => String::new(),
    };
    Ok(VerifyPlayerResult {
        executable: executable.to_string_lossy().into_owned(),
        content_hash,
        file_count,
        packaged_bytes,
        log,
    })
}

fn run_built_player(project_root: &Path, requested: &Path) -> Result<RunPlayerResult, String> {
    let executable = validated_player_executable(project_root, requested)?;
    let working_directory = executable
        .parent()
        .ok_or_else(|| "player executable has no output directory".to_string())?;
    let child = Command::new(&executable)
        .current_dir(working_directory)
        .spawn()
        .map_err(|error| format!("cannot start player: {error}"))?;
    Ok(RunPlayerResult {
        executable: executable.to_string_lossy().into_owned(),
        process_id: child.id(),
    })
}

const MAX_RECENT_PROJECTS: usize = 12;
const MAX_PROJECT_ASSET_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Default, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentProjectInfo {
    name: String,
    path: String,
    last_opened_at: u64,
}

fn recent_projects_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("recent-projects.json"))
        .map_err(|error| error.to_string())
}

fn recent_project_key(path: &str) -> String {
    path.trim()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn normalize_recent_projects(mut projects: Vec<RecentProjectInfo>) -> Vec<RecentProjectInfo> {
    projects.retain(|project| !project.name.trim().is_empty() && !project.path.trim().is_empty());
    projects.sort_by_key(|project| std::cmp::Reverse(project.last_opened_at));
    let mut seen = HashSet::new();
    projects.retain(|project| seen.insert(recent_project_key(&project.path)));
    projects.truncate(MAX_RECENT_PROJECTS);
    projects
}

fn load_recent_projects(app: &tauri::AppHandle) -> Result<Vec<RecentProjectInfo>, String> {
    let file = recent_projects_file(app)?;
    let Ok(contents) = std::fs::read_to_string(file) else {
        return Ok(Vec::new());
    };
    let projects = serde_json::from_str::<Vec<RecentProjectInfo>>(&contents).unwrap_or_default();
    Ok(normalize_recent_projects(projects))
}

fn save_recent_projects(
    app: &tauri::AppHandle,
    projects: &[RecentProjectInfo],
) -> Result<(), String> {
    let file = recent_projects_file(app)?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(projects).map_err(|error| error.to_string())?;
    std::fs::write(file, json).map_err(|error| error.to_string())
}

fn remember_recent_project(app: &tauri::AppHandle, snapshot: &ProjectSnapshot) {
    let Ok(mut projects) = load_recent_projects(app) else {
        return;
    };
    let key = recent_project_key(&snapshot.project_root);
    projects.retain(|project| recent_project_key(&project.path) != key);
    projects.insert(
        0,
        RecentProjectInfo {
            name: snapshot.project_name.clone(),
            path: snapshot.project_root.clone(),
            last_opened_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        },
    );
    projects.truncate(MAX_RECENT_PROJECTS);
    let _ = save_recent_projects(app, &projects);
}

fn project_asset_kind(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".sprite.json") {
        Some("sprite-import")
    } else if lower.ends_with(".mscene") {
        Some("scene")
    } else if lower.ends_with(".ts") || lower.ends_with(".js") || lower.ends_with(".mjs") {
        Some("script")
    } else if lower.ends_with(".matlas") {
        Some("sprite-atlas")
    } else if lower.ends_with(".manim") {
        Some("animation")
    } else if lower.ends_with(".mcontroller") {
        Some("animator-controller")
    } else if lower.ends_with(".mavatar") {
        Some("avatar-mask")
    } else if lower.ends_with(".mtimeline") {
        Some("timeline")
    } else if lower.ends_with(".wav")
        || lower.ends_with(".ogg")
        || lower.ends_with(".mp3")
        || lower.ends_with(".flac")
    {
        Some("audio")
    } else if lower.ends_with(".mmat") || lower.ends_with(".mat") || lower.ends_with(".minst") {
        Some("material")
    } else if lower.ends_with(".mshader") {
        Some("shader")
    } else if lower.ends_with(".prefab") {
        Some("prefab")
    } else if lower.ends_with(".gltf") || lower.ends_with(".glb") {
        Some("model")
    } else if [
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tga", ".tif", ".tiff", ".hdr", ".exr",
    ]
    .iter()
    .any(|extension| lower.ends_with(extension))
    {
        Some("texture")
    } else if lower.ends_with(".atlas") {
        Some("spine-atlas")
    } else if lower.ends_with(".skel") {
        Some("spine-binary")
    } else if lower.ends_with(".json") {
        Some("spine-json")
    } else {
        None
    }
}

fn collect_project_assets(root: &Path, dir: &Path, output: &mut Vec<ProjectAssetInfo>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if output.len() >= 10_000 {
            return;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name.ends_with(".meta") {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            collect_project_assets(root, &path, output);
            continue;
        }
        if let Some(asset) = project_asset_info(root, &path) {
            output.push(asset);
        }
    }
}

fn mark_duplicate_project_asset_guids(assets: &mut [ProjectAssetInfo]) {
    let mut owners = BTreeMap::<String, Vec<usize>>::new();
    for (index, asset) in assets.iter().enumerate() {
        if asset.meta_status == "ready" {
            if let Some(guid) = &asset.guid {
                owners.entry(guid.clone()).or_default().push(index);
            }
        }
    }
    for (guid, indexes) in owners {
        if indexes.len() < 2 {
            continue;
        }
        let mut paths = indexes
            .iter()
            .map(|index| assets[*index].rel_path.clone())
            .collect::<Vec<_>>();
        paths.sort();
        let paths = paths.join(", ");
        for index in indexes {
            assets[index].meta_status = "duplicate".into();
            assets[index].meta_error = Some(format!(
                "asset GUID {guid} is shared by multiple files: {paths}"
            ));
        }
    }
}

fn project_asset_info(root: &Path, path: &Path) -> Option<ProjectAssetInfo> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().into_owned();
    let kind = project_asset_kind(&name)?;
    let relative = path.strip_prefix(root).ok()?;
    let rel_path = relative.to_string_lossy().replace('\\', "/");
    let folder = relative
        .parent()
        .map(|parent| parent.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| "Assets".into());
    let (guid, meta_status, meta_error) = if kind == "sprite-import" {
        (None, "auxiliary".to_string(), None)
    } else {
        match mengine_assets::ensure_asset_sidecar(path, kind) {
            Ok(sidecar) => (Some(sidecar.guid.0.to_string()), "ready".to_string(), None),
            Err(error) => (None, "invalid".to_string(), Some(error)),
        }
    };
    Some(ProjectAssetInfo {
        id: rel_path.clone(),
        guid,
        name,
        folder,
        rel_path,
        kind: kind.into(),
        revision: project_file_revision(&metadata),
        size: metadata.len(),
        meta_status,
        meta_error,
    })
}

fn project_file_revision(metadata: &std::fs::Metadata) -> String {
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{modified_ns:x}-{:x}", metadata.len())
}

fn require_project_asset_revision(
    target: &Path,
    expected_revision: Option<&str>,
) -> Result<(), String> {
    let actual_revision = match std::fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err("asset target must be a regular file".into());
        }
        Ok(metadata) => Some(project_file_revision(&metadata)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    if actual_revision.as_deref() == expected_revision {
        Ok(())
    } else {
        Err("asset changed on disk since it was loaded; reload it before saving".into())
    }
}

fn collect_project_sprites(root: &Path, dir: &Path, output: &mut Vec<ProjectSpriteInfo>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if output.len() >= 10_000 {
            return;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name.ends_with(".meta") {
            continue;
        }
        if path.is_dir() {
            collect_project_sprites(root, &path, output);
            continue;
        }
        let lower = name.to_ascii_lowercase();
        if ![".png", ".jpg", ".jpeg", ".webp", ".gif"]
            .iter()
            .any(|extension| lower.ends_with(extension))
        {
            continue;
        }
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let rel_path = relative.to_string_lossy().replace('\\', "/");
        let folder = relative
            .parent()
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| "Assets".into());
        let dimensions = mengine_assets::texture_dimensions(&path).ok();
        let settings =
            dimensions.and_then(|size| mengine_assets::load_sprite_import(&path, size).ok());
        output.push(ProjectSpriteInfo {
            id: rel_path.clone(),
            name: name.clone(),
            folder: folder.clone(),
            rel_path: rel_path.clone(),
            texture_id: rel_path.clone(),
            slice_name: None,
            rect: dimensions.map(|size| [0, 0, size[0], size[1]]),
            pivot: Some([0.5, 0.5]),
            pixels_per_unit: settings
                .as_ref()
                .map(|settings| settings.pixels_per_unit)
                .or(Some(100.0)),
        });
        let Some(settings) = settings else {
            continue;
        };
        if settings.mode != mengine_assets::SpriteMode::Multiple {
            continue;
        }
        let pixels_per_unit = settings.pixels_per_unit;
        for slice in settings.slices {
            if output.len() >= 10_000 {
                return;
            }
            output.push(ProjectSpriteInfo {
                id: format!("{rel_path}#{}", slice.name),
                name: format!("{} ({name})", slice.name),
                folder: folder.clone(),
                rel_path: rel_path.clone(),
                texture_id: rel_path.clone(),
                slice_name: Some(slice.name),
                rect: Some(slice.rect),
                pivot: Some(slice.pivot),
                pixels_per_unit: Some(pixels_per_unit),
            });
        }
    }
}

fn collect_build_scene_paths(
    project_root: &Path,
    directory: &Path,
    output: &mut Vec<String>,
) -> Result<(), String> {
    if !directory.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_build_scene_paths(project_root, &path, output)?;
        } else if metadata.is_file()
            && path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("mscene"))
        {
            let relative = path
                .strip_prefix(project_root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            output.push(relative);
        }
    }
    Ok(())
}

fn available_build_scenes(project_root: &Path) -> Result<Vec<String>, String> {
    let mut scenes = Vec::new();
    collect_build_scene_paths(
        project_root,
        &project_root.join("Assets/Scenes"),
        &mut scenes,
    )?;
    scenes.sort_by_key(|path| path.to_lowercase());
    Ok(scenes)
}

fn no_project() -> EditorFailure {
    EditorFailure {
        code: "noProject",
        message: "no MEngine project is open".into(),
        current_revision: None,
    }
}

#[tauri::command]
fn is_primary_pointer_down() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        // GetAsyncKeyState's high bit is set while the key/button is physically down.
        unsafe { (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0 }
    }
    #[cfg(not(windows))]
    false
}

fn activate_project(
    mut session: ProjectSession,
    state: &AppState,
) -> Result<ProjectSnapshot, EditorFailure> {
    let snapshot = session
        .open_main_scene()
        .map_err(|error| error.failure(Some(session.current_revision())))?
        .unwrap_or_else(|| session.snapshot());
    *state.project.lock() = Some(session);
    Ok(snapshot)
}

#[tauri::command]
fn open_project(
    root: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<ProjectSnapshot, EditorFailure> {
    let session = ProjectSession::open(&root).map_err(|error| error.failure(None))?;
    let snapshot = activate_project(session, &state)?;
    remember_recent_project(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn create_project(
    parent: String,
    name: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<ProjectSnapshot, EditorFailure> {
    let session = ProjectSession::create(&parent, &name).map_err(|error| error.failure(None))?;
    let snapshot = activate_project(session, &state)?;
    remember_recent_project(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProjectInfo>, String> {
    load_recent_projects(&app)
}

#[tauri::command]
fn remove_recent_project(
    path: String,
    app: tauri::AppHandle,
) -> Result<Vec<RecentProjectInfo>, String> {
    let key = recent_project_key(&path);
    let mut projects = load_recent_projects(&app)?;
    projects.retain(|project| recent_project_key(&project.path) != key);
    save_recent_projects(&app, &projects)?;
    Ok(projects)
}

#[tauri::command]
fn get_project_snapshot(state: State<'_, AppState>) -> Result<ProjectSnapshot, EditorFailure> {
    state
        .project
        .lock()
        .as_ref()
        .map(ProjectSession::snapshot)
        .ok_or_else(no_project)
}

#[tauri::command]
fn list_project_scenes(state: State<'_, AppState>) -> Result<Vec<ProjectSceneInfo>, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let root = PathBuf::from(project_root);
    let mut scenes = Vec::new();
    for path in available_build_scenes(&root)? {
        let relative = Path::new(&path);
        if relative.parent() != Some(Path::new("Assets/Scenes")) {
            continue;
        }
        let absolute = root.join(relative);
        let name = relative
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled")
            .to_string();
        let updated_at = absolute
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_millis() as u64);
        let json = std::fs::read_to_string(&absolute).map_err(|error| error.to_string())?;
        scenes.push(ProjectSceneInfo {
            name,
            updated_at,
            json,
        });
    }
    scenes.sort_by_key(|scene| std::cmp::Reverse(scene.updated_at));
    Ok(scenes)
}

#[tauri::command]
fn rename_project_scene(
    old_name: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .rename_scene(
            Path::new(&format!("Assets/Scenes/{old_name}.mscene")),
            Path::new(&format!("Assets/Scenes/{new_name}.mscene")),
        )
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn delete_project_scene(
    name: String,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .delete_scene(Path::new(&format!("Assets/Scenes/{name}.mscene")))
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn get_project_build_settings(state: State<'_, AppState>) -> Result<ProjectBuildSettings, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    let scenes = session.build_scenes();
    let available_scenes = available_build_scenes(Path::new(&session.snapshot().project_root))?;
    Ok(ProjectBuildSettings {
        main_scene: scenes.first().cloned(),
        scenes,
        available_scenes,
        asset_mode: session.build_asset_mode(),
        always_include: session.always_include(),
        shader_variant_limit: session.shader_variant_limit(),
    })
}

#[tauri::command]
fn save_project_build_settings(
    scenes: Vec<String>,
    state: State<'_, AppState>,
) -> Result<ProjectBuildSettings, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    let scenes = session
        .save_build_scenes(scenes)
        .map_err(|error| error.to_string())?;
    let available_scenes = available_build_scenes(Path::new(&session.snapshot().project_root))?;
    Ok(ProjectBuildSettings {
        main_scene: scenes.first().cloned(),
        scenes,
        available_scenes,
        asset_mode: session.build_asset_mode(),
        always_include: session.always_include(),
        shader_variant_limit: session.shader_variant_limit(),
    })
}

#[tauri::command]
fn save_project_build_asset_settings(
    asset_mode: BuildAssetMode,
    always_include: Vec<String>,
    shader_variant_limit: u32,
    state: State<'_, AppState>,
) -> Result<ProjectBuildSettings, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    let always_include = session
        .save_build_asset_settings(asset_mode, always_include, shader_variant_limit)
        .map_err(|error| error.to_string())?;
    let scenes = session.build_scenes();
    let available_scenes = available_build_scenes(Path::new(&session.snapshot().project_root))?;
    Ok(ProjectBuildSettings {
        main_scene: scenes.first().cloned(),
        scenes,
        available_scenes,
        asset_mode,
        always_include,
        shader_variant_limit,
    })
}

fn validate_surface_shader_source(source: &str) -> Result<(), String> {
    let normalized = mengine_assets::parse_surface_shader(source.as_bytes())
        .map_err(|error| error.to_string())?;
    mengine_rhi::validate_surface_shader_hook(&normalized)
}

#[tauri::command]
fn validate_surface_shader(source: String) -> Result<(), String> {
    validate_surface_shader_source(&source)
}

fn normalize_sorting_layers(value: ProjectSortingLayers) -> Result<ProjectSortingLayers, String> {
    if value.version != 1 {
        return Err(format!(
            "unsupported sorting layer version {}",
            value.version
        ));
    }
    if value.layers.len() > 64 {
        return Err("at most 64 sorting layers are supported".into());
    }
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    let mut layers = Vec::with_capacity(value.layers.len().max(1));
    for layer in value.layers {
        let id = layer.id.trim().to_string();
        let mut name = layer.name.trim().to_string();
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b'_')
        {
            return Err(format!("invalid sorting layer id '{id}'"));
        }
        if name.is_empty() || name.chars().count() > 64 {
            return Err(format!("invalid sorting layer name '{name}'"));
        }
        let id_key = id.to_ascii_lowercase();
        if id_key == "default" {
            name = "Default".into();
        }
        let name_key = name.to_lowercase();
        if !ids.insert(id_key.clone()) {
            return Err(format!("duplicate sorting layer id '{id}'"));
        }
        if !names.insert(name_key) {
            return Err(format!("duplicate sorting layer name '{name}'"));
        }
        layers.push(ProjectSortingLayer { id, name });
    }
    if !ids.contains("default") {
        layers.insert(
            0,
            ProjectSortingLayer {
                id: "default".into(),
                name: "Default".into(),
            },
        );
    }
    Ok(ProjectSortingLayers { version: 1, layers })
}

fn sorting_layers_path(
    project_root: &Path,
    create_parent: bool,
) -> Result<Option<PathBuf>, String> {
    let root = project_root
        .canonicalize()
        .map_err(|error| format!("cannot resolve project root: {error}"))?;
    let requested = root.join("ProjectSettings");
    if !requested.exists() {
        if !create_parent {
            return Ok(None);
        }
        std::fs::create_dir(&requested).map_err(|error| error.to_string())?;
    }
    let metadata = std::fs::symlink_metadata(&requested).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("ProjectSettings must be a regular directory inside the project".into());
    }
    let directory = requested
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !directory.starts_with(&root) {
        return Err("ProjectSettings escapes the project root".into());
    }
    let target = directory.join("sorting-layers.json");
    if let Ok(metadata) = std::fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("sorting-layers.json must be a regular file".into());
        }
    }
    Ok(Some(target))
}

fn read_sorting_layers(project_root: &Path) -> Result<ProjectSortingLayers, String> {
    let Some(path) = sorting_layers_path(project_root, false)? else {
        return Ok(ProjectSortingLayers::default());
    };
    if !path.is_file() {
        return Ok(ProjectSortingLayers::default());
    }
    let contents = std::fs::read(&path).map_err(|error| error.to_string())?;
    let value = serde_json::from_slice(&contents)
        .map_err(|error| format!("cannot parse {}: {error}", path.display()))?;
    normalize_sorting_layers(value)
}

fn write_sorting_layers(
    project_root: &Path,
    settings: &ProjectSortingLayers,
) -> Result<(), String> {
    let target = sorting_layers_path(project_root, true)?
        .ok_or_else(|| "sorting layer path is unavailable".to_string())?;
    let parent = target
        .parent()
        .ok_or_else(|| "sorting layer path has no parent".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let contents = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(
        ".sorting-layers.json.{}.{nonce}.tmp",
        std::process::id()
    ));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&contents)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        drop(file);
        replace_file_atomically(&temporary, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|error| error.to_string())
}

#[tauri::command]
fn get_project_sorting_layers(state: State<'_, AppState>) -> Result<ProjectSortingLayers, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    read_sorting_layers(Path::new(&session.snapshot().project_root))
}

#[tauri::command]
fn save_project_sorting_layers(
    settings: ProjectSortingLayers,
    state: State<'_, AppState>,
) -> Result<ProjectSortingLayers, String> {
    let settings = normalize_sorting_layers(settings)?;
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    write_sorting_layers(Path::new(&session.snapshot().project_root), &settings)?;
    Ok(settings)
}

#[tauri::command]
fn list_pc_build_history(state: State<'_, AppState>) -> Result<BuildHistoryListResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    scan_build_history(Path::new(&project_root))
}

#[tauri::command]
fn list_pc_build_patches(state: State<'_, AppState>) -> Result<BuildPatchInventoryResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    scan_build_patch_inventory(Path::new(&project_root))
}

#[tauri::command]
fn compare_pc_build_history(
    previous_id: String,
    current_id: String,
    state: State<'_, AppState>,
) -> Result<BuildComparisonResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    compare_build_history(Path::new(&project_root), &previous_id, &current_id)
}

#[tauri::command]
async fn create_pc_build_history_patch(
    previous_id: String,
    current_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<BuildHistoryPatchResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let bundled_sdk = app
        .path()
        .resolve("build-sdk", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.join("sdk.json").is_file());
    let operation_id = state.next_build_id.fetch_add(1, Ordering::Relaxed);
    let cancel_file = std::env::temp_dir().join(format!(
        "mengine-editor-history-patch-{}-{operation_id}.cancel",
        std::process::id()
    ));
    {
        let mut active = state.active_build.lock();
        if active.is_some() {
            return Err("another build artifact operation is already running".into());
        }
        *active = Some(ActiveBuild {
            id: operation_id,
            cancelled: Arc::new(AtomicBool::new(false)),
            cancel_file: cancel_file.clone(),
            cancellable: false,
        });
    }
    let cleanup = ActiveBuildGuard {
        active_build: state.active_build.clone(),
        id: operation_id,
        cancel_file,
    };
    match tauri::async_runtime::spawn_blocking(move || {
        let _cleanup = cleanup;
        create_build_history_patch(
            Path::new(&project_root),
            &previous_id,
            &current_id,
            bundled_sdk,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("historical patch task failed: {error}")),
    }
}

#[tauri::command]
async fn restore_pc_build_history(
    history_id: String,
    public_key_path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<RestoreBuildHistoryResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let bundled_sdk = app
        .path()
        .resolve("build-sdk", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.join("sdk.json").is_file());
    let operation_id = state.next_build_id.fetch_add(1, Ordering::Relaxed);
    let cancel_file = std::env::temp_dir().join(format!(
        "mengine-editor-history-restore-{}-{operation_id}.cancel",
        std::process::id()
    ));
    {
        let mut active = state.active_build.lock();
        if active.is_some() {
            return Err("another build artifact operation is already running".into());
        }
        *active = Some(ActiveBuild {
            id: operation_id,
            cancelled: Arc::new(AtomicBool::new(false)),
            cancel_file: cancel_file.clone(),
            cancellable: false,
        });
    }
    let cleanup = ActiveBuildGuard {
        active_build: state.active_build.clone(),
        id: operation_id,
        cancel_file,
    };
    match tauri::async_runtime::spawn_blocking(move || {
        let _cleanup = cleanup;
        restore_build_history_as_published(
            Path::new(&project_root),
            &history_id,
            Path::new(&public_key_path),
            bundled_sdk,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("historical build restore task failed: {error}")),
    }
}

#[tauri::command]
async fn verify_pc_build_patch(
    patch_id: String,
    public_key_path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<VerifyBuildPatchResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let bundled_sdk = app
        .path()
        .resolve("build-sdk", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.join("sdk.json").is_file());
    let operation_id = state.next_build_id.fetch_add(1, Ordering::Relaxed);
    let cancel_file = std::env::temp_dir().join(format!(
        "mengine-editor-patch-verify-{}-{operation_id}.cancel",
        std::process::id()
    ));
    {
        let mut active = state.active_build.lock();
        if active.is_some() {
            return Err("another build artifact operation is already running".into());
        }
        *active = Some(ActiveBuild {
            id: operation_id,
            cancelled: Arc::new(AtomicBool::new(false)),
            cancel_file: cancel_file.clone(),
            cancellable: false,
        });
    }
    let cleanup = ActiveBuildGuard {
        active_build: state.active_build.clone(),
        id: operation_id,
        cancel_file,
    };
    match tauri::async_runtime::spawn_blocking(move || {
        let _cleanup = cleanup;
        verify_build_patch_from_history(
            Path::new(&project_root),
            &patch_id,
            Path::new(&public_key_path),
            bundled_sdk,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("patch verification task failed: {error}")),
    }
}

#[tauri::command]
async fn build_pc_player(
    profile: String,
    clean: bool,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<BuildPlayerResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let bundled_sdk = app
        .path()
        .resolve("build-sdk", BaseDirectory::Resource)
        .ok()
        .filter(|path| path.join("sdk.json").is_file());
    let build_id = state.next_build_id.fetch_add(1, Ordering::Relaxed);
    let cancel_file = std::env::temp_dir().join(format!(
        "mengine-editor-build-{}-{build_id}.cancel",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&cancel_file);
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active_build.lock();
        if active.is_some() {
            return Err("a player build is already running".into());
        }
        *active = Some(ActiveBuild {
            id: build_id,
            cancelled: cancelled.clone(),
            cancel_file: cancel_file.clone(),
            cancellable: true,
        });
    }
    let progress_app = app.clone();
    let progress: BuildProgressSink = Arc::new(move |event| {
        let _ = progress_app.emit("pc-build-progress", event);
    });
    let control = BuildControl {
        build_id,
        cancelled,
        cancel_file: Some(cancel_file.clone()),
        progress: Some(progress),
    };
    let cleanup = ActiveBuildGuard {
        active_build: state.active_build.clone(),
        id: build_id,
        cancel_file,
    };
    let task = match tauri::async_runtime::spawn_blocking(move || {
        let _cleanup = cleanup;
        run_player_build_controlled(
            PathBuf::from(project_root),
            profile,
            clean,
            bundled_sdk,
            control,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("player build task failed: {error}")),
    };
    task
}

#[tauri::command]
fn cancel_pc_build(state: State<'_, AppState>) -> Result<bool, String> {
    let active = state.active_build.lock().clone();
    let Some(active) = active else {
        return Ok(false);
    };
    if !active.cancellable {
        return Ok(false);
    }
    active.cancelled.store(true, Ordering::Release);
    std::fs::write(&active.cancel_file, b"cancel\n")
        .map_err(|error| format!("cannot request player build cancellation: {error}"))?;
    Ok(true)
}

#[tauri::command]
async fn run_pc_player(
    executable: String,
    state: State<'_, AppState>,
) -> Result<RunPlayerResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    tauri::async_runtime::spawn_blocking(move || {
        run_built_player(Path::new(&project_root), Path::new(&executable))
    })
    .await
    .map_err(|error| format!("player launch task failed: {error}"))?
}

#[tauri::command]
async fn verify_pc_player(
    executable: String,
    expected_content_hash: String,
    state: State<'_, AppState>,
) -> Result<VerifyPlayerResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    tauri::async_runtime::spawn_blocking(move || {
        verify_built_player(
            Path::new(&project_root),
            Path::new(&executable),
            &expected_content_hash,
        )
    })
    .await
    .map_err(|error| format!("published build verification task failed: {error}"))?
}

fn asset_relative_tail(relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return Err("asset path must be project-relative under Assets".into());
    }
    let mut components = relative.components();
    if components.next() != Some(Component::Normal("Assets".as_ref())) {
        return Err("asset path must be project-relative under Assets".into());
    }
    let mut tail = PathBuf::new();
    for component in components {
        match component {
            Component::Normal(value) => tail.push(value),
            _ => return Err("asset path contains an invalid segment".into()),
        }
    }
    if tail.as_os_str().is_empty() || tail.file_name().is_none() {
        return Err("asset path must name a file under Assets".into());
    }
    Ok(tail)
}

fn canonical_assets_root(project_root: &Path) -> Result<PathBuf, String> {
    let root = project_root
        .canonicalize()
        .map_err(|error| format!("project root: {error}"))?;
    let assets_path = root.join("Assets");
    std::fs::create_dir_all(&assets_path).map_err(|error| error.to_string())?;
    let assets = assets_path
        .canonicalize()
        .map_err(|error| format!("project Assets: {error}"))?;
    if !assets.starts_with(&root) {
        return Err("project Assets directory escapes project root".into());
    }
    Ok(assets)
}

fn project_asset_read_path(project_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let tail = asset_relative_tail(relative_path)?;
    let assets_root = canonical_assets_root(project_root)?;
    let file = assets_root
        .join(tail)
        .canonicalize()
        .map_err(|error| format!("asset not found: {error}"))?;
    if !file.starts_with(&assets_root) || !file.is_file() {
        return Err("asset path escapes project Assets".into());
    }
    Ok(file)
}

fn project_asset_write_path(project_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let tail = asset_relative_tail(relative_path)?;
    let assets_root = canonical_assets_root(project_root)?;
    let file_name = tail
        .file_name()
        .ok_or_else(|| "asset path must name a file".to_string())?;
    let mut parent = assets_root.clone();
    if let Some(relative_parent) = tail.parent() {
        for component in relative_parent.components() {
            let Component::Normal(segment) = component else {
                return Err("asset path contains an invalid segment".into());
            };
            let next = parent.join(segment);
            if next.exists() {
                let canonical = next.canonicalize().map_err(|error| error.to_string())?;
                if !canonical.starts_with(&assets_root) || !canonical.is_dir() {
                    return Err("asset path escapes project Assets".into());
                }
                parent = canonical;
            } else {
                std::fs::create_dir(&next).map_err(|error| error.to_string())?;
                parent = next.canonicalize().map_err(|error| error.to_string())?;
                if !parent.starts_with(&assets_root) {
                    return Err("asset path escapes project Assets".into());
                }
            }
        }
    }
    let target = parent.join(file_name);
    if let Ok(metadata) = std::fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("asset target must be a regular file".into());
        }
    }
    Ok(target)
}

#[cfg(windows)]
fn replace_file_atomically(source: &Path, target: &Path) -> std::io::Result<()> {
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
fn replace_file_atomically(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::rename(source, target)
}

fn write_project_asset_file(
    project_root: &Path,
    relative_path: &str,
    contents: &[u8],
) -> Result<(), String> {
    if contents.len() > MAX_PROJECT_ASSET_BYTES {
        return Err("asset exceeds 64 MiB editor limit".into());
    }
    let target = project_asset_write_path(project_root, relative_path)?;
    let parent = target
        .parent()
        .ok_or_else(|| "asset target has no parent".to_string())?;
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = parent.join(format!(".{name}.{}.{nonce}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        replace_file_atomically(&temporary, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|error| error.to_string())
}

#[tauri::command]
fn read_project_asset(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<ProjectAssetReadResult, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    let project_root = session.snapshot().project_root;
    let file = project_asset_read_path(Path::new(&project_root), &relative_path)?;
    for _ in 0..2 {
        let before = file.metadata().map_err(|error| error.to_string())?;
        if before.len() > MAX_PROJECT_ASSET_BYTES as u64 {
            return Err("asset exceeds 64 MiB editor limit".into());
        }
        let revision = project_file_revision(&before);
        let contents = std::fs::read(&file).map_err(|error| error.to_string())?;
        let after = file.metadata().map_err(|error| error.to_string())?;
        if revision == project_file_revision(&after) {
            return Ok(ProjectAssetReadResult { contents, revision });
        }
    }
    Err("asset changed repeatedly while it was being read; retry".into())
}

#[tauri::command]
fn write_project_asset(
    relative_path: String,
    contents: Vec<u8>,
    expected_revision: Option<String>,
    state: State<'_, AppState>,
) -> Result<ProjectAssetWriteResult, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    let project_root = session.snapshot().project_root;
    let root = Path::new(&project_root);
    let target = project_asset_write_path(root, &relative_path)?;
    require_project_asset_revision(&target, expected_revision.as_deref())
        .map_err(|error| format!("{error}: {relative_path}"))?;
    write_project_asset_file(root, &relative_path, &contents)?;
    let file = project_asset_read_path(root, &relative_path)?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    Ok(ProjectAssetWriteResult {
        revision: project_file_revision(&metadata),
        asset: project_asset_info(root, &file),
    })
}

#[tauri::command]
fn rename_project_asset(
    request: AssetRenameRequest,
    state: State<'_, AppState>,
) -> Result<AssetRenameResult, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    session
        .rename_asset(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn duplicate_project_asset(
    request: AssetDuplicateRequest,
    state: State<'_, AppState>,
) -> Result<AssetDuplicateResult, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    session
        .duplicate_asset(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_project_asset_delete_snapshot(
    source_path: String,
    state: State<'_, AppState>,
) -> Result<AssetDeleteSnapshot, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    session
        .asset_delete_snapshot(&source_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn trash_project_asset(
    request: AssetTrashRequest,
    state: State<'_, AppState>,
) -> Result<AssetTrashResult, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    session
        .trash_asset(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_project_asset_trash(state: State<'_, AppState>) -> Result<AssetTrashInventory, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    session
        .list_asset_trash()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn restore_project_asset(
    request: AssetRestoreRequest,
    state: State<'_, AppState>,
) -> Result<AssetRestoreResult, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    session
        .restore_asset(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_project_assets(state: State<'_, AppState>) -> Result<Vec<ProjectAssetInfo>, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let root = Path::new(&project_root)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let mut assets = Vec::new();
    collect_project_assets(&root, &root.join("Assets"), &mut assets);
    mark_duplicate_project_asset_guids(&mut assets);
    assets.sort_by(|left, right| left.rel_path.cmp(&right.rel_path));
    Ok(assets)
}

#[tauri::command]
fn list_project_sprites(state: State<'_, AppState>) -> Result<Vec<ProjectSpriteInfo>, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    let root = Path::new(&project_root)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let mut sprites = Vec::new();
    collect_project_sprites(&root, &root.join("Assets"), &mut sprites);
    sprites.sort_by(|left, right| left.rel_path.cmp(&right.rel_path));
    Ok(sprites)
}

#[tauri::command]
fn open_scene(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .open_scene(Path::new(&relative_path))
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn save_scene(
    relative_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .save_scene(relative_path.as_deref().map(Path::new))
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn persist_scene_snapshot(
    relative_path: String,
    snapshot: WorldSnapshot,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    let revision = session.current_revision();
    session
        .replace_snapshot(revision, snapshot)
        .and_then(|_| session.save_scene(Some(Path::new(&relative_path))))
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn checkpoint_scene_snapshot(
    snapshot: WorldSnapshot,
    state: State<'_, AppState>,
) -> Result<SceneRecoveryCheckpoint, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    let revision = session.current_revision();
    session
        .replace_snapshot(revision, snapshot)
        .map_err(|error| error.failure(Some(session.current_revision())))?;
    let recovery = session
        .write_scene_recovery()
        .map_err(|error| error.failure(Some(session.current_revision())))?;
    Ok(SceneRecoveryCheckpoint {
        snapshot: session.snapshot(),
        recovery,
    })
}

#[tauri::command]
fn get_scene_recovery(
    state: State<'_, AppState>,
) -> Result<Option<SceneRecoveryInfo>, EditorFailure> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(no_project)?;
    session
        .scene_recovery_info()
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn restore_scene_recovery(state: State<'_, AppState>) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .restore_scene_recovery()
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn discard_scene_recovery(state: State<'_, AppState>) -> Result<(), EditorFailure> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(no_project)?;
    session
        .discard_scene_recovery()
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn replace_scene_snapshot(
    base_revision: u64,
    snapshot: WorldSnapshot,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .replace_snapshot(base_revision, snapshot)
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[tauri::command]
fn submit_editor_request(
    request: EditorRequest,
    state: State<'_, AppState>,
) -> Result<EditorResult, EditorFailure> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(no_project)?;
    session
        .handle_request(request)
        .map_err(|error| error.failure(Some(session.current_revision())))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorWindowInfo {
    label: String,
    title: String,
    /// "main" | "panel" | "editor" | "other"
    kind: String,
    /// For `panel-*` windows, the panel id (e.g. "hierarchy").
    panel_kind: Option<String>,
    /// For `editor-*` windows, the registered editor window typeId from the URL query.
    editor_type: Option<String>,
    url: String,
    focused: bool,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

/// Enumerate every webview window the editor currently has open. This is the
/// AI-agent "which windows are open" observation: the main window, any detached
/// core panels (`panel-<id>`), and any floating editor windows (`editor-<hash>`).
#[tauri::command]
fn list_editor_windows(app: tauri::AppHandle) -> Vec<EditorWindowInfo> {
    let mut infos: Vec<EditorWindowInfo> = app
        .webview_windows()
        .into_iter()
        .map(|(label, window)| {
            let kind = if label == "main" {
                "main"
            } else if label.starts_with("panel-") {
                "panel"
            } else if label.starts_with("editor-") {
                "editor"
            } else {
                "other"
            };
            let panel_kind = label.strip_prefix("panel-").map(str::to_string);
            let url = window.url().ok();
            let url_str = url.as_ref().map(|u| u.to_string()).unwrap_or_default();
            let editor_type = url.as_ref().and_then(|u| {
                u.query_pairs()
                    .find(|(key, _)| key == "editorWindow")
                    .map(|(_, value)| value.to_string())
            });
            let position = window.outer_position().ok();
            let size = window.outer_size().ok();
            EditorWindowInfo {
                label,
                title: window.title().unwrap_or_default(),
                kind: kind.to_string(),
                panel_kind,
                editor_type,
                url: url_str,
                focused: window.is_focused().unwrap_or(false),
                x: position.map(|p| p.x).unwrap_or(0),
                y: position.map(|p| p.y).unwrap_or(0),
                width: size.map(|s| s.width).unwrap_or(0),
                height: size.map(|s| s.height).unwrap_or(0),
                scale_factor: window.scale_factor().unwrap_or(1.0),
            }
        })
        .collect();
    infos.sort_by(|a, b| a.label.cmp(&b.label));
    infos
}

#[tauri::command]
fn exit_editor(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge_hub = Arc::new(BridgeHub::new(uuid::Uuid::new_v4().to_string()));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            project: Mutex::new(None),
            active_build: Arc::new(Mutex::new(None)),
            next_build_id: AtomicU64::new(1),
        })
        .manage(bridge_hub.clone())
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            is_primary_pointer_down,
            list_recent_projects,
            remove_recent_project,
            get_project_snapshot,
            list_project_scenes,
            rename_project_scene,
            delete_project_scene,
            get_project_build_settings,
            save_project_build_settings,
            save_project_build_asset_settings,
            validate_surface_shader,
            get_project_sorting_layers,
            save_project_sorting_layers,
            list_pc_build_history,
            list_pc_build_patches,
            compare_pc_build_history,
            create_pc_build_history_patch,
            restore_pc_build_history,
            verify_pc_build_patch,
            build_pc_player,
            cancel_pc_build,
            run_pc_player,
            verify_pc_player,
            read_project_asset,
            write_project_asset,
            rename_project_asset,
            duplicate_project_asset,
            get_project_asset_delete_snapshot,
            trash_project_asset,
            list_project_asset_trash,
            restore_project_asset,
            list_project_assets,
            list_project_sprites,
            open_scene,
            save_scene,
            persist_scene_snapshot,
            checkpoint_scene_snapshot,
            get_scene_recovery,
            restore_scene_recovery,
            discard_scene_recovery,
            replace_scene_snapshot,
            submit_editor_request,
            list_editor_windows,
            agent_bridge_respond,
            agent_bridge_broadcast,
            exit_editor
        ])
        .setup(move |app| {
            spawn_bridge_server(app.handle().clone(), bridge_hub.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MEngine Editor");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_shader_validation_uses_the_complete_player_forward_contract() {
        let valid = r#"
            fn mengine_lit_surface_hook(
                surface: MEngineSurface,
                uv: vec2<f32>,
                world_position: vec3<f32>,
            ) -> MEngineSurface {
                var result = surface;
                result.roughness = 0.25;
                return result;
            }
        "#;
        assert!(validate_surface_shader_source(valid).is_ok());

        let unknown_field = valid.replace(
            "result.roughness = 0.25;",
            "result.not_a_material_field = 0.25;",
        );
        let error = validate_surface_shader_source(&unknown_field).unwrap_err();
        assert!(error.contains("WGSL"));
        assert!(validate_surface_shader_source("fn unrelated() {}").is_err());
    }

    fn comparison_manifest(hash: char, files: serde_json::Value) -> serde_json::Value {
        serde_json::json!({
            "contentHash": hash.to_string().repeat(64),
            "files": files,
        })
    }

    fn comparison_file(path: &str, size: u64, hash: char, category: &str) -> serde_json::Value {
        serde_json::json!({
            "path": path,
            "size": size,
            "sha256": hash.to_string().repeat(64),
            "category": category,
        })
    }

    fn history_manifest(hash: char, files: serde_json::Value) -> serde_json::Value {
        let total_bytes = files
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|file| file.get("size").and_then(serde_json::Value::as_u64))
            .sum::<u64>();
        serde_json::json!({
            "schemaVersion": 1,
            "engineVersion": "0.1.0-test",
            "platform": "windows",
            "architecture": "x86_64",
            "profile": "release",
            "executable": "MEnginePlayer.exe",
            "contentHash": hash.to_string().repeat(64),
            "project": {
                "name": "History Test",
                "version": 7,
                "mainScene": "Assets/Scenes/Main.mscene",
                "buildScenes": ["Assets/Scenes/Main.mscene"],
                "assetMode": "all",
                "alwaysInclude": []
            },
            "assetValidation": {
                "assetMode": "all",
                "rootScenes": 1,
                "references": 0,
                "validatedFiles": 1,
                "omittedAssetFiles": 0,
                "omittedAssetBytes": 0,
                "strippedEditorEntities": 0
            },
            "contentSummary": { "totalBytes": total_bytes, "categories": [] },
            "files": files
        })
    }

    #[test]
    fn build_reports_are_parsed_without_polluting_user_log() {
        let output = b"validated package\nMENGINE_BUILD_CACHE {\"enabled\":true,\"hits\":3,\"misses\":1,\"reusedBytes\":120,\"storedBytes\":40,\"recoveredEntries\":1,\"failures\":0}\nMENGINE_BUILD_PATCH {\"generated\":true,\"outputDir\":\"Patches/one\",\"payloadBytes\":40,\"reusedBytes\":120}\nBuilt Game\n";
        let (report, patch, log) = extract_build_reports(output);
        assert_eq!(
            report,
            Some(BuildCacheResult {
                enabled: true,
                hits: 3,
                misses: 1,
                reused_bytes: 120,
                stored_bytes: 40,
                recovered_entries: 1,
                failures: 0,
            })
        );
        assert_eq!(
            patch,
            Some(BuildPatchResult {
                generated: true,
                output_dir: Some("Patches/one".into()),
                manifest_path: None,
                from_content_hash: None,
                to_content_hash: None,
                changed_files: None,
                removed_files: None,
                payload_bytes: Some(40),
                reused_bytes: Some(120),
                reason: None,
                error: None,
            })
        );
        assert_eq!(log, "validated package\nBuilt Game");

        let (report, patch, log) =
            extract_build_reports(b"MENGINE_BUILD_CACHE {broken}\nlegacy sdk output\n");
        assert!(report.is_none());
        assert!(patch.is_none());
        assert!(log.contains("{broken}"));
        assert!(log.contains("legacy sdk output"));
    }

    #[test]
    fn artifact_signature_metadata_is_strict_and_unsigned_builds_remain_compatible() {
        let unsigned = serde_json::json!({ "contentHash": "a".repeat(64) });
        assert_eq!(build_artifact_signature_key_id(&unsigned).unwrap(), None);

        let signed = serde_json::json!({
            "contentHash": "a".repeat(64),
            "signature": {
                "schemaVersion": 1,
                "algorithm": "ed25519",
                "keyId": "b".repeat(64),
                "value": format!("{}==", "A".repeat(86))
            }
        });
        assert_eq!(
            build_artifact_signature_key_id(&signed).unwrap(),
            Some("b".repeat(64))
        );

        let mut malformed = signed.clone();
        malformed["signature"]["keyId"] = serde_json::Value::String("B".repeat(64));
        assert!(build_artifact_signature_key_id(&malformed)
            .unwrap_err()
            .contains("keyId"));
        malformed = signed;
        malformed["signature"]["value"] = serde_json::Value::String("not-base64".into());
        assert!(build_artifact_signature_key_id(&malformed)
            .unwrap_err()
            .contains("Ed25519"));
    }

    #[test]
    fn build_comparison_reports_added_removed_changed_and_unchanged_files() {
        let previous = comparison_manifest(
            'a',
            serde_json::json!([
                comparison_file("Runtime/player.exe", 10, 'a', "runtime"),
                comparison_file("Assets/Same.bin", 5, 'b', "other"),
                comparison_file("Assets/Changed.bin", 8, 'c', "other"),
                comparison_file("Assets/SameSizeChanged.bin", 6, 'a', "other"),
                comparison_file("Assets/Removed.bin", 4, 'd', "other"),
            ]),
        );
        let current = comparison_manifest(
            'e',
            serde_json::json!([
                comparison_file("Runtime/player.exe", 10, 'a', "runtime"),
                comparison_file("Assets/Same.bin", 5, 'b', "other"),
                comparison_file("Assets/Changed.bin", 12, 'f', "other"),
                comparison_file("Assets/SameSizeChanged.bin", 6, 'b', "other"),
                comparison_file("Assets/Added.bin", 20, 'a', "other"),
            ]),
        );

        let comparison = compare_build_manifests(&previous, &current).unwrap();
        assert_eq!(comparison.previous_content_hash, "a".repeat(64));
        assert_eq!(comparison.added_files, 1);
        assert_eq!(comparison.removed_files, 1);
        assert_eq!(comparison.changed_files, 2);
        assert_eq!(comparison.unchanged_files, 2);
        assert_eq!(comparison.byte_delta, 20);
        assert_eq!(comparison.changes.len(), 4);
        assert_eq!(comparison.changes[0].path, "Assets/Added.bin");
        assert_eq!(comparison.changes[0].kind, "added");
        assert_eq!(comparison.changes[0].byte_delta, 20);
        assert_eq!(comparison.changes[1].path, "Assets/Changed.bin");
        assert_eq!(comparison.changes[2].path, "Assets/Removed.bin");
        assert_eq!(comparison.changes[2].byte_delta, -4);
        assert_eq!(comparison.changes[3].path, "Assets/SameSizeChanged.bin");
        assert_eq!(comparison.changes[3].byte_delta, 0);
    }

    #[test]
    fn build_comparison_recognizes_byte_identical_manifests() {
        let previous = comparison_manifest(
            'a',
            serde_json::json!([
                comparison_file("Runtime/player.exe", 10, 'b', "runtime"),
                comparison_file("Assets/Main.mscene", 5, 'c', "scene"),
            ]),
        );
        let current = comparison_manifest(
            'a',
            serde_json::json!([
                comparison_file("Assets/Main.mscene", 5, 'c', "scene"),
                comparison_file("Runtime/player.exe", 10, 'b', "runtime"),
            ]),
        );

        let comparison = compare_build_manifests(&previous, &current).unwrap();
        assert_eq!(comparison.added_files, 0);
        assert_eq!(comparison.removed_files, 0);
        assert_eq!(comparison.changed_files, 0);
        assert_eq!(comparison.unchanged_files, 2);
        assert_eq!(comparison.byte_delta, 0);
        assert!(comparison.changes.is_empty());
    }

    #[test]
    fn build_history_archives_lists_and_compares_durable_reports() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-history-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let output_dir = root.join("Builds/windows-x86_64-release");
        std::fs::create_dir_all(&output_dir).unwrap();
        let previous = history_manifest(
            'a',
            serde_json::json!([
                comparison_file("Runtime/MEnginePlayer.exe", 10, 'a', "runtime"),
                comparison_file("Assets/Main.mscene", 5, 'b', "scene")
            ]),
        );
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&previous).unwrap(),
        )
        .unwrap();
        let previous_entry =
            archive_build_history(&root, None, &previous, 1250, "bundled-sdk").unwrap();
        assert!(previous_entry.published);
        assert!(!previous_entry.content_available);
        assert_eq!(previous_entry.packaged_bytes, 15);
        assert_eq!(previous_entry.project_version, "7");

        let mut current = history_manifest(
            'c',
            serde_json::json!([
                comparison_file("Runtime/MEnginePlayer.exe", 10, 'a', "runtime"),
                comparison_file("Assets/Main.mscene", 9, 'c', "scene"),
                comparison_file("Assets/New.bin", 3, 'd', "other")
            ]),
        );
        current["signature"] = serde_json::json!({
            "schemaVersion": 1,
            "algorithm": "ed25519",
            "keyId": "d".repeat(64),
            "value": format!("{}==", "A".repeat(86))
        });
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&current).unwrap(),
        )
        .unwrap();
        let current_entry =
            archive_build_history(&root, None, &current, 2500, "source-checkout").unwrap();

        let history = list_build_history(&root).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, current_entry.id);
        assert!(history[0].published);
        assert!(!history[0].content_available);
        assert!(history[0].artifact_signed);
        assert_eq!(history[0].artifact_signing_key_id, Some("d".repeat(64)));
        assert_eq!(history[0].toolchain, "source-checkout");
        assert!(!history[1].published);
        assert!(!history[1].artifact_signed);
        assert_eq!(history[1].id, previous_entry.id);

        let comparison =
            compare_build_history(&root, &previous_entry.id, &current_entry.id).unwrap();
        assert_eq!(comparison.added_files, 1);
        assert_eq!(comparison.changed_files, 1);
        assert_eq!(comparison.byte_delta, 7);
        assert!(compare_build_history(&root, "../escape", &current_entry.id).is_err());

        std::fs::write(
            root.join(".mengine/build-history/corrupt.json"),
            b"not json",
        )
        .unwrap();
        let scan = scan_build_history(&root).unwrap();
        assert_eq!(scan.entries.len(), 2);
        assert_eq!(scan.invalid_records, 1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn build_history_marks_only_the_exact_published_manifest_current() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-history-identity-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let output_dir = root.join("Builds/windows-x86_64-release");
        std::fs::create_dir_all(&output_dir).unwrap();
        let mut first = history_manifest(
            'a',
            serde_json::json!([comparison_file(
                "Runtime/MEnginePlayer.exe",
                10,
                'b',
                "runtime"
            )]),
        );
        first["signature"] = serde_json::json!({
            "schemaVersion": 1,
            "algorithm": "ed25519",
            "keyId": "c".repeat(64),
            "value": format!("{}==", "A".repeat(86))
        });
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&first).unwrap(),
        )
        .unwrap();
        let first_entry = archive_build_history(&root, None, &first, 10, "bundled-sdk").unwrap();

        let mut second = first.clone();
        second["project"]["version"] = serde_json::json!(8);
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&second).unwrap(),
        )
        .unwrap();
        let second_entry = archive_build_history(&root, None, &second, 20, "bundled-sdk").unwrap();

        assert_eq!(first_entry.content_hash, second_entry.content_hash);
        let history = list_build_history(&root).unwrap();
        assert_eq!(history.len(), 2);
        assert!(
            history
                .iter()
                .find(|entry| entry.id == second_entry.id)
                .unwrap()
                .published
        );
        assert!(
            !history
                .iter()
                .find(|entry| entry.id == first_entry.id)
                .unwrap()
                .published
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn build_history_content_store_deduplicates_validates_and_collects_blobs() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-content-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let output_dir = root.join("Builds/windows-x86_64-release");
        let runtime_path = output_dir.join("MEnginePlayer.exe");
        let scene_path = output_dir.join("Assets/Main.mscene");
        std::fs::create_dir_all(runtime_path.parent().unwrap()).unwrap();
        std::fs::create_dir_all(scene_path.parent().unwrap()).unwrap();
        let runtime = b"shared-runtime";
        let previous_scene = b"previous-scene";
        let current_scene = b"current-scene-with-changes";
        std::fs::write(&runtime_path, runtime).unwrap();
        std::fs::write(&scene_path, previous_scene).unwrap();
        let runtime_hash = sha256_file(&runtime_path).unwrap();
        let previous_scene_hash = sha256_file(&scene_path).unwrap();
        let mut previous = history_manifest(
            'a',
            serde_json::json!([
                {
                    "path": "MEnginePlayer.exe",
                    "size": runtime.len(),
                    "sha256": runtime_hash.clone(),
                    "category": "runtime"
                },
                {
                    "path": "Assets/Main.mscene",
                    "size": previous_scene.len(),
                    "sha256": previous_scene_hash.clone(),
                    "category": "scene"
                }
            ]),
        );
        previous["signature"] = serde_json::json!({
            "schemaVersion": 1,
            "algorithm": "ed25519",
            "keyId": "d".repeat(64),
            "value": format!("{}==", "A".repeat(86))
        });
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&previous).unwrap(),
        )
        .unwrap();
        let previous_entry =
            archive_build_history(&root, Some(&output_dir), &previous, 10, "bundled-sdk").unwrap();
        assert!(previous_entry.content_available);

        std::fs::write(&scene_path, current_scene).unwrap();
        let current_scene_hash = sha256_file(&scene_path).unwrap();
        let mut current = history_manifest(
            'b',
            serde_json::json!([
                {
                    "path": "MEnginePlayer.exe",
                    "size": runtime.len(),
                    "sha256": runtime_hash.clone(),
                    "category": "runtime"
                },
                {
                    "path": "Assets/Main.mscene",
                    "size": current_scene.len(),
                    "sha256": current_scene_hash.clone(),
                    "category": "scene"
                }
            ]),
        );
        current["signature"] = previous["signature"].clone();
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&current).unwrap(),
        )
        .unwrap();
        let current_entry =
            archive_build_history(&root, Some(&output_dir), &current, 20, "bundled-sdk").unwrap();
        assert!(current_entry.content_available);

        let patch_dir = build_history_patch_root(&root).unwrap().join("test-edge");
        std::fs::create_dir(&patch_dir).unwrap();
        std::fs::write(
            patch_dir.join("mengine-patch.json"),
            serde_json::to_vec(&serde_json::json!({
                "schemaVersion": 1,
                "fromContentHash": previous_entry.content_hash.clone(),
                "toContentHash": current_entry.content_hash.clone(),
                "fromArtifactHash": "1".repeat(64),
                "toArtifactHash": "2".repeat(64),
                "payloadBytes": current_scene.len(),
                "reusedBytes": runtime.len(),
                "unchangedFiles": 1,
                "files": [{}],
                "removedFiles": [],
                "signature": { "keyId": "d".repeat(64) }
            }))
            .unwrap(),
        )
        .unwrap();
        let inventory = scan_build_patch_inventory(&root).unwrap();
        assert_eq!(inventory.entries.len(), 1);
        assert_eq!(inventory.entries[0].id, "history/test-edge");
        assert_eq!(inventory.entries[0].source, "history");
        assert!(inventory.entries[0].base_available);

        let store = build_content_store_dir(&root, false).unwrap().unwrap();
        let blob_count = std::fs::read_dir(&store)
            .unwrap()
            .map(|shard| std::fs::read_dir(shard.unwrap().path()).unwrap().count())
            .sum::<usize>();
        assert_eq!(blob_count, 3);
        let runtime_blob = store.join(&runtime_hash[..2]).join(&runtime_hash);
        let previous_scene_blob = store
            .join(&previous_scene_hash[..2])
            .join(&previous_scene_hash);
        let current_scene_blob = store
            .join(&current_scene_hash[..2])
            .join(&current_scene_hash);
        assert_eq!(std::fs::read(&runtime_blob).unwrap(), runtime);
        assert_eq!(std::fs::read(&previous_scene_blob).unwrap(), previous_scene);
        assert_eq!(std::fs::read(&current_scene_blob).unwrap(), current_scene);

        let current_record =
            read_build_history_record(Path::new(&current_entry.record_path), &current_entry.id)
                .unwrap();
        let restored_dir = root.join("restored-current");
        let restored_entry = restore_build_history_artifact(
            &root,
            Path::new(&current_entry.record_path),
            &current_record,
            &restored_dir,
        )
        .unwrap();
        assert!(restored_entry.artifact_signed);
        assert_eq!(
            std::fs::read(restored_dir.join("MEnginePlayer.exe")).unwrap(),
            runtime
        );
        assert_eq!(
            std::fs::read(restored_dir.join("Assets/Main.mscene")).unwrap(),
            current_scene
        );
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(
                &std::fs::read(restored_dir.join("mengine-build.json")).unwrap()
            )
            .unwrap(),
            current
        );
        assert!(safe_build_content_path("mengine-build.json").is_err());

        std::fs::write(&current_scene_blob, vec![b'x'; current_scene.len()]).unwrap();
        let corrupt_restore = root.join("corrupt-restore");
        assert!(restore_build_history_artifact(
            &root,
            Path::new(&current_entry.record_path),
            &current_record,
            &corrupt_restore,
        )
        .unwrap_err()
        .contains("does not match"));
        std::fs::write(&current_scene_blob, current_scene).unwrap();

        std::fs::remove_file(&previous_entry.record_path).unwrap();
        prune_build_content_store(&root).unwrap();
        assert!(!scan_build_patch_inventory(&root).unwrap().entries[0].base_available);
        assert!(runtime_blob.is_file());
        assert!(!previous_scene_blob.exists());
        assert!(current_scene_blob.is_file());

        let stale_manifest = history_manifest(
            'c',
            serde_json::json!([{
                "path": "Assets/Main.mscene",
                "size": current_scene.len(),
                "sha256": previous_scene_hash.clone(),
                "category": "scene"
            }]),
        );
        let error =
            archive_build_history(&root, Some(&output_dir), &stale_manifest, 30, "bundled-sdk")
                .unwrap_err();
        assert!(error.contains("changed while archiving"));

        std::fs::remove_file(&current_scene_blob).unwrap();
        let history = list_build_history(&root).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, current_entry.id);
        assert!(!history[0].content_available);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn trusted_history_restore_replaces_atomically_and_preserves_on_failure() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-history-restore-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let output_dir = root.join("Builds/windows-x86_64-release");
        let player_path = output_dir.join("MEnginePlayer.exe");
        std::fs::create_dir_all(player_path.parent().unwrap()).unwrap();
        let player = b"trusted-history-player";
        std::fs::write(&player_path, player).unwrap();
        let player_hash = sha256_file(&player_path).unwrap();
        let mut manifest = history_manifest(
            'a',
            serde_json::json!([{
                "path": "MEnginePlayer.exe",
                "size": player.len(),
                "sha256": player_hash,
                "category": "runtime"
            }]),
        );
        manifest["signature"] = serde_json::json!({
            "schemaVersion": 1,
            "algorithm": "ed25519",
            "keyId": "d".repeat(64),
            "value": format!("{}==", "A".repeat(86))
        });
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        let history =
            archive_build_history(&root, Some(&output_dir), &manifest, 15, "bundled-sdk").unwrap();

        std::fs::write(output_dir.join("keep-current.txt"), b"previous build").unwrap();
        std::fs::write(&player_path, b"newer unarchived player").unwrap();
        let restored = restore_build_history_as_published_with_verifier(
            &root,
            &history.id,
            |staged, profile| {
                assert_eq!(profile, "release");
                assert_eq!(
                    std::fs::read(staged.join("MEnginePlayer.exe")).unwrap(),
                    player
                );
                Ok("trusted verifier passed".into())
            },
        )
        .unwrap();
        assert!(restored.replaced_existing);
        assert_eq!(restored.log, "trusted verifier passed");
        assert_eq!(restored.signing_key_id, "d".repeat(64));
        assert!(!output_dir.join("keep-current.txt").exists());
        assert_eq!(std::fs::read(&player_path).unwrap(), player);
        assert!(
            list_build_history(&root)
                .unwrap()
                .iter()
                .find(|entry| entry.id == history.id)
                .unwrap()
                .published
        );

        std::fs::write(output_dir.join("keep-current.txt"), b"preserve me").unwrap();
        let error = restore_build_history_as_published_with_verifier(
            &root,
            &history.id,
            |_staged, _profile| Err("independent trust check failed".into()),
        )
        .unwrap_err();
        assert!(error.contains("independent trust check failed"));
        assert_eq!(
            std::fs::read(output_dir.join("keep-current.txt")).unwrap(),
            b"preserve me"
        );

        let record =
            read_build_history_record(Path::new(&history.record_path), &history.id).unwrap();
        let expected =
            build_history_entry(&root, Path::new(&history.record_path), &record).unwrap();
        let invalid_stage = root.join("Builds/invalid-restore-stage");
        std::fs::create_dir(&invalid_stage).unwrap();
        std::fs::write(invalid_stage.join("mengine-build.json"), b"{}").unwrap();
        let error = publish_restored_build_directory(
            &invalid_stage,
            &output_dir,
            &record.manifest,
            &expected,
        )
        .unwrap_err();
        assert!(error.contains("previous build was preserved"));
        assert_eq!(
            std::fs::read(output_dir.join("keep-current.txt")).unwrap(),
            b"preserve me"
        );

        std::fs::remove_dir_all(&output_dir).unwrap();
        let restored_without_previous = restore_build_history_as_published_with_verifier(
            &root,
            &history.id,
            |_staged, _profile| Ok("trusted verifier passed again".into()),
        )
        .unwrap();
        assert!(!restored_without_previous.replaced_existing);
        assert_eq!(std::fs::read(&player_path).unwrap(), player);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn historical_patch_report_requires_the_selected_content_edge() {
        let root = std::env::temp_dir().join(format!(
            "mengine-history-patch-report-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let from = "a".repeat(64);
        let to = "b".repeat(64);
        std::fs::write(
            root.join("mengine-patch.json"),
            serde_json::to_vec(&serde_json::json!({
                "schemaVersion": 1,
                "fromContentHash": from.clone(),
                "toContentHash": to.clone(),
                "fromArtifactHash": "c".repeat(64),
                "toArtifactHash": "d".repeat(64),
                "payloadBytes": 17,
                "reusedBytes": 23,
                "unchangedFiles": 2,
                "files": [{}, {}],
                "removedFiles": [{}],
                "signature": { "keyId": "e".repeat(64) }
            }))
            .unwrap(),
        )
        .unwrap();
        let report = parse_build_history_patch_result(&root, Some((&from, &to))).unwrap();
        assert_eq!(report.changed_files, 2);
        assert_eq!(report.removed_files, 1);
        assert_eq!(report.unchanged_files, 2);
        assert_eq!(report.payload_bytes, 17);
        assert_eq!(report.reused_bytes, 23);
        assert_eq!(report.signing_key_id, "e".repeat(64));
        let wrong_from = "f".repeat(64);
        assert!(parse_build_history_patch_result(&root, Some((&wrong_from, &to))).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn build_history_retains_only_the_newest_fifty_valid_reports() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-history-retention-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let hashes = [
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
        ];
        for index in 0..(MAX_BUILD_HISTORY_ENTRIES + 3) {
            let hash = hashes[index % hashes.len()];
            let manifest = history_manifest(
                hash,
                serde_json::json!([comparison_file(
                    &format!("Assets/{index}.bin"),
                    index as u64,
                    hash,
                    "other"
                )]),
            );
            archive_build_history(&root, None, &manifest, index as u64, "bundled-sdk").unwrap();
        }
        assert_eq!(
            list_build_history(&root).unwrap().len(),
            MAX_BUILD_HISTORY_ENTRIES
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn published_build_identity_normalizes_hash_and_sums_manifest_files() {
        let root = std::env::temp_dir().join(format!(
            "mengine-published-build-identity-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("mengine-build.json"),
            serde_json::to_vec(&serde_json::json!({
                "contentHash": "A".repeat(64),
                "files": [
                    { "path": "Runtime/player.exe", "size": 9 },
                    { "path": "Assets/Main.mscene", "size": 15 }
                ]
            }))
            .unwrap(),
        )
        .unwrap();

        let identity = published_build_identity(&root).unwrap();
        assert_eq!(identity, ("a".repeat(64), 2, 24));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn published_build_verification_rejects_invalid_expected_hash_before_launch() {
        let error = verify_built_player(
            Path::new("missing-project"),
            Path::new("missing-player"),
            "not-a-sha256",
        )
        .unwrap_err();
        assert!(error.contains("64-character SHA-256"));
    }

    #[test]
    fn cancelled_build_control_stops_before_project_validation() {
        let cancelled = Arc::new(AtomicBool::new(true));
        let error = run_player_build_controlled(
            PathBuf::from("missing-project"),
            "release".into(),
            true,
            None,
            BuildControl {
                build_id: 7,
                cancelled,
                cancel_file: None,
                progress: None,
            },
        )
        .unwrap_err();
        assert_eq!(error, "player build cancelled");
    }

    #[test]
    fn active_build_guard_releases_task_and_cancel_file_on_drop() {
        let cancel_file = std::env::temp_dir().join(format!(
            "mengine-active-build-guard-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&cancel_file, b"cancel\n").unwrap();
        let active_build = Arc::new(Mutex::new(Some(ActiveBuild {
            id: 19,
            cancelled: Arc::new(AtomicBool::new(false)),
            cancel_file: cancel_file.clone(),
            cancellable: true,
        })));
        {
            let _guard = ActiveBuildGuard {
                active_build: active_build.clone(),
                id: 19,
                cancel_file: cancel_file.clone(),
            };
        }
        assert!(active_build.lock().is_none());
        assert!(!cancel_file.exists());
    }

    #[test]
    fn build_backend_finds_workspace_and_rejects_unknown_profiles() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = find_engine_root(manifest_dir).expect("workspace root");
        assert!(root.join("crates/mengine-runtime/Cargo.toml").is_file());
        assert!(run_player_build_controlled(
            root,
            "shipping".into(),
            true,
            None,
            BuildControl {
                build_id: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
                cancel_file: None,
                progress: None,
            },
        )
        .unwrap_err()
        .contains("unsupported build profile"));
    }

    #[test]
    fn bundled_build_sdk_requires_host_matched_safe_regular_files() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-sdk-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("cli/dist")).unwrap();
        std::fs::create_dir_all(root.join("runtimes/debug")).unwrap();
        std::fs::create_dir_all(root.join("runtimes/release")).unwrap();
        std::fs::write(root.join("node-test"), "node").unwrap();
        std::fs::write(root.join("cli/dist/cli.js"), "cli").unwrap();
        std::fs::write(root.join("runtimes/debug/player"), "debug").unwrap();
        std::fs::write(root.join("runtimes/release/player"), "release").unwrap();
        std::fs::write(
            root.join("sdk.json"),
            format!(
                r#"{{"schemaVersion":1,"platform":"{}","architecture":"{}","cliVersion":"{}","node":"node-test","cli":"cli/dist/cli.js","runtimes":{{"debug":"runtimes/debug/player","release":"runtimes/release/player"}}}}"#,
                node_platform_name(),
                node_arch_name(),
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();

        let debug = load_build_sdk(&root, "debug").unwrap();
        assert!(debug.runtime.ends_with("runtimes/debug/player"));
        assert!(!child_process_path(&debug.cli)
            .to_string_lossy()
            .starts_with(r"\\?\"));
        let release = load_build_sdk(&root, "release").unwrap();
        assert!(release.runtime.ends_with("runtimes/release/player"));

        std::fs::write(
            root.join("sdk.json"),
            format!(
                r#"{{"schemaVersion":1,"platform":"{}","architecture":"{}","cliVersion":"{}","node":"../outside","cli":"cli/dist/cli.js","runtimes":{{"debug":"runtimes/debug/player","release":"runtimes/release/player"}}}}"#,
                node_platform_name(),
                node_arch_name(),
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        assert!(load_build_sdk(&root, "debug")
            .unwrap_err()
            .contains("unsafe Node runtime path"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn player_launch_validation_requires_the_current_build_manifest_executable() {
        let root = std::env::temp_dir().join(format!(
            "mengine-player-launch-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let output = root.join("Builds/windows-x64");
        std::fs::create_dir_all(&output).unwrap();
        let executable = output.join("Game.exe");
        let other = output.join("Other.exe");
        std::fs::write(&executable, "player").unwrap();
        std::fs::write(&other, "other").unwrap();
        std::fs::write(
            output.join("mengine-build.json"),
            r#"{"executable":"Game.exe","files":[]}"#,
        )
        .unwrap();

        assert_eq!(
            validated_player_executable(&root, &executable).unwrap(),
            executable.canonicalize().unwrap()
        );
        assert!(validated_player_executable(&root, &other)
            .unwrap_err()
            .contains("does not match"));

        let outside = root.join("Outside.exe");
        std::fs::write(&outside, "outside").unwrap();
        assert!(validated_player_executable(&root, &outside)
            .unwrap_err()
            .contains("inside the current project's Builds directory"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn build_scene_scan_finds_sorted_nested_scene_assets_only() {
        let root = std::env::temp_dir().join(format!(
            "mengine-build-scenes-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets/Scenes/Levels")).unwrap();
        std::fs::write(root.join("Assets/Scenes/Main.mscene"), "{}").unwrap();
        std::fs::write(root.join("Assets/Scenes/Levels/Boss.mscene"), "{}").unwrap();
        std::fs::write(root.join("Assets/Scenes/readme.txt"), "ignored").unwrap();
        assert_eq!(
            available_build_scenes(&root).unwrap(),
            vec![
                "Assets/Scenes/Levels/Boss.mscene",
                "Assets/Scenes/Main.mscene"
            ]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sorting_layers_are_validated_and_atomically_replaceable() {
        let root = std::env::temp_dir().join(format!(
            "mengine-sorting-layers-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let settings = normalize_sorting_layers(ProjectSortingLayers {
            version: 1,
            layers: vec![ProjectSortingLayer {
                id: "effects".into(),
                name: "Effects".into(),
            }],
        })
        .unwrap();
        assert_eq!(settings.layers[0].id, "default");
        std::fs::create_dir(&root).unwrap();
        write_sorting_layers(&root, &settings).unwrap();
        let loaded = read_sorting_layers(&root).unwrap();
        assert_eq!(loaded.layers.len(), 2);
        assert_eq!(loaded.layers[1].id, "effects");

        let duplicate = ProjectSortingLayers {
            version: 1,
            layers: vec![
                ProjectSortingLayer {
                    id: "default".into(),
                    name: "Default".into(),
                },
                ProjectSortingLayer {
                    id: "DEFAULT".into(),
                    name: "Other".into(),
                },
            ],
        };
        assert!(normalize_sorting_layers(duplicate)
            .unwrap_err()
            .contains("duplicate sorting layer id"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "builds and self-validates a real player executable"]
    fn build_backend_packages_a_project_through_the_editor_path() {
        let root = std::env::temp_dir().join(format!(
            "mengine-editor-build-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets/Scenes")).unwrap();
        std::fs::create_dir_all(root.join("Assets/Scripts")).unwrap();
        std::fs::create_dir_all(root.join("ProjectSettings")).unwrap();
        std::fs::write(
            root.join("project.json"),
            r#"{"name":"Editor Build QA","version":1,"language":"typescript","mainScene":"Assets/Scenes/Main.mscene","buildScenes":["Assets/Scenes/Main.mscene","Assets/Scenes/Level2.mscene"],"startupScript":"Assets/Scripts/Main.ts","assetMode":"referenced","alwaysInclude":[]}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Scripts/mengine.d.ts"),
            "declare const engine: { readonly scene: { readonly name: string } | null };",
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Scripts/Main.ts"),
            "let loaded = ''; function onSceneLoaded(scene: { name: string }) { loaded = scene.name; } function onTick(_dt: number, _frame: number) {}",
        )
        .unwrap();
        std::fs::write(root.join("Assets/Unused.bin"), b"must not ship").unwrap();
        std::fs::write(
            root.join("Assets/Scenes/Level2.mscene"),
            r#"{"version":1,"name":"Level 2","world":{"entities":[],"frame":0,"sim_frame":0,"clear_color":[0.05,0.08,0.12,1]}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Scenes/Main.mscene"),
            r#"{"version":1,"name":"Main","world":{"entities":[{"entity":1,"name":"Runtime","parent":null,"siblingIndex":0,"active":true,"components":{}},{"entity":2,"name":"Editor Root","parent":null,"siblingIndex":1,"active":true,"components":{"EditorOnly":{}}},{"entity":3,"name":"Editor Child","parent":2,"siblingIndex":0,"active":true,"components":{}}],"frame":0,"sim_frame":0,"clear_color":[0.1,0.1,0.14,1],"selected":3}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("ProjectSettings/sorting-layers.json"),
            r#"{"version":1,"layers":[{"id":"default","name":"Default"},{"id":"effects","name":"Effects"}]}"#,
        )
        .unwrap();

        let progress_events = Arc::new(Mutex::new(Vec::<BuildProgressEvent>::new()));
        let captured_events = progress_events.clone();
        let result = run_player_build_controlled(
            root.clone(),
            "debug".into(),
            true,
            None,
            BuildControl {
                build_id: 42,
                cancelled: Arc::new(AtomicBool::new(false)),
                cancel_file: None,
                progress: Some(Arc::new(move |event| captured_events.lock().push(event))),
            },
        )
        .unwrap();
        assert_eq!(result.profile, "debug");
        assert_eq!(result.build_id, 42);
        assert_eq!(
            result.toolchain,
            if std::env::var_os("MENGINE_BUILD_SDK").is_some() {
                "bundled-sdk"
            } else {
                "source-checkout"
            }
        );
        assert_eq!(result.scene_count, 2);
        assert_eq!(result.validated_asset_files, 2);
        assert_eq!(result.asset_references, 2);
        assert_eq!(result.asset_mode, "referenced");
        assert_eq!(result.omitted_asset_files, 1);
        assert_eq!(result.omitted_asset_bytes, 13);
        assert_eq!(result.stripped_editor_entities, 2);
        assert!(result.packaged_bytes > 0);
        let first_history = result
            .history_entry
            .as_ref()
            .expect("successful player builds archive their report");
        assert!(first_history.published);
        assert!(Path::new(&first_history.record_path).is_file());
        if result.toolchain == "source-checkout" {
            let cache = result
                .build_cache
                .as_ref()
                .expect("source checkout builds report cache diagnostics");
            assert!(cache.enabled);
            assert_eq!(cache.hits, 0);
            assert!(cache.misses >= 3);
        }
        assert_eq!(result.stage_timings.len(), BUILD_STAGE_COUNT);
        assert_eq!(result.stage_timings[0].stage, "prepare");
        assert_eq!(result.stage_timings[4].stage, "build-report");
        assert!(
            result.total_duration_ms
                >= result
                    .stage_timings
                    .iter()
                    .map(|stage| stage.duration_ms)
                    .sum::<u64>()
        );
        let events = progress_events.lock();
        assert_eq!(events.len(), BUILD_STAGE_COUNT * 2);
        for (index, pair) in events.chunks_exact(2).enumerate() {
            assert_eq!(pair[0].build_id, 42);
            assert_eq!(pair[0].stage_index, index + 1);
            assert_eq!(pair[0].status, "running");
            assert_eq!(pair[1].stage, pair[0].stage);
            assert_eq!(pair[1].status, "completed");
        }
        assert!(Path::new(&result.manifest_path).is_file());
        assert!(!result.content_categories.is_empty());
        assert!(result
            .largest_files
            .iter()
            .all(|file| !file.included_by.is_empty()));
        assert!(Path::new(&result.executable).is_file());
        assert!(result.file_count >= 6);
        let output = Path::new(&result.output_dir);
        let verification =
            verify_built_player(&root, Path::new(&result.executable), &result.content_hash)
                .unwrap();
        assert_eq!(verification.content_hash, result.content_hash);
        assert_eq!(verification.file_count, result.file_count);
        assert_eq!(verification.packaged_bytes, result.packaged_bytes);
        assert!(verification.log.contains("validated"));
        assert!(output.join("Assets/Scripts/Main.js").is_file());
        assert!(!output.join("Assets/Scripts/Main.ts").exists());
        assert!(!output.join("Assets/Scripts/mengine.d.ts").exists());
        assert!(!output.join("Assets/Unused.bin").exists());
        assert!(output.join("ProjectSettings/sorting-layers.json").is_file());
        let packaged_scene: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(output.join("Assets/Scenes/Main.mscene")).unwrap(),
        )
        .unwrap();
        assert_eq!(
            packaged_scene["world"]["entities"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(packaged_scene["world"]["selected"].is_null());

        let cached = run_player_build_controlled(
            root.clone(),
            "debug".into(),
            true,
            None,
            BuildControl {
                build_id: 43,
                cancelled: Arc::new(AtomicBool::new(false)),
                cancel_file: None,
                progress: None,
            },
        )
        .unwrap();
        assert_eq!(cached.content_hash, result.content_hash);
        if cached.toolchain == "source-checkout" {
            let cache = cached
                .build_cache
                .as_ref()
                .expect("the second source checkout build reports cache hits");
            assert!(cache.hits >= 3);
            assert_eq!(cache.misses, 0);
            assert!(cache.reused_bytes > 0);
        }
        let cached_history = cached
            .history_entry
            .as_ref()
            .expect("cached player builds also archive their report");
        let history = scan_build_history(&root).unwrap();
        assert_eq!(history.entries.len(), 2);
        assert_eq!(history.entries[0].id, cached_history.id);
        assert_eq!(
            history
                .entries
                .iter()
                .filter(|entry| entry.published)
                .count(),
            1
        );
        std::fs::write(output.join("tampered-after-publish.bin"), b"tampered").unwrap();
        let error = verify_built_player(&root, Path::new(&result.executable), &result.content_hash)
            .unwrap_err();
        assert!(error.contains("unlisted file"));
        std::fs::remove_dir_all(root).unwrap();
    }

    fn recent(index: usize, path: String, last_opened_at: u64) -> RecentProjectInfo {
        RecentProjectInfo {
            name: format!("Project {index}"),
            path,
            last_opened_at,
        }
    }

    #[test]
    fn recent_projects_are_sorted_deduplicated_and_limited() {
        let mut projects = vec![
            recent(0, r"D:\Games\Demo".into(), 10),
            recent(1, "d:/games/demo/".into(), 30),
            RecentProjectInfo::default(),
        ];
        for index in 2..16 {
            projects.push(recent(
                index,
                format!(r"D:\Games\Project{index}"),
                index as u64,
            ));
        }

        let normalized = normalize_recent_projects(projects);

        assert_eq!(normalized.len(), MAX_RECENT_PROJECTS);
        assert_eq!(normalized[0].path, "d:/games/demo/");
        assert_eq!(
            normalized
                .iter()
                .filter(|project| recent_project_key(&project.path) == r"d:\games\demo")
                .count(),
            1
        );
        assert!(normalized
            .windows(2)
            .all(|pair| pair[0].last_opened_at >= pair[1].last_opened_at));
    }

    #[test]
    fn project_sprite_scan_recurses_and_filters_non_images() {
        let root = std::env::temp_dir().join(format!(
            "mengine-sprite-scan-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let nested = root.join("Assets/UI");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("panel.png"), []).unwrap();
        std::fs::write(nested.join("panel.png.meta"), []).unwrap();
        std::fs::write(nested.join("notes.txt"), []).unwrap();

        let mut sprites = Vec::new();
        collect_project_sprites(&root, &root.join("Assets"), &mut sprites);
        std::fs::remove_dir_all(root).unwrap();

        assert_eq!(sprites.len(), 1);
        assert_eq!(sprites[0].id, "Assets/UI/panel.png");
        assert_eq!(sprites[0].folder, "Assets/UI");
    }

    #[test]
    fn project_asset_scan_classifies_real_authoring_files() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-scan-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let assets = root.join("Assets");
        std::fs::create_dir_all(&assets).unwrap();
        for name in [
            "walk.manim",
            "hero.mcontroller",
            "upper-body.mavatar",
            "intro.mtimeline",
            "character.mmat",
            "character-variant.minst",
            "rim.mshader",
            "enemy.prefab",
            "environment.gltf",
            "character.glb",
            "skeleton.atlas",
            "theme.ogg",
            "ui.matlas",
            "studio.hdr",
            "hero.png.sprite.json",
            "Main.mscene",
            "Main.ts",
            "ignored.txt",
        ] {
            std::fs::write(assets.join(name), []).unwrap();
        }

        let mut found = Vec::new();
        collect_project_assets(&root, &assets, &mut found);
        mark_duplicate_project_asset_guids(&mut found);
        let first_guids = found
            .iter()
            .map(|asset| (asset.rel_path.clone(), asset.guid.clone()))
            .collect::<BTreeMap<_, _>>();
        let mut rescanned = Vec::new();
        collect_project_assets(&root, &assets, &mut rescanned);
        mark_duplicate_project_asset_guids(&mut rescanned);
        assert_eq!(
            first_guids,
            rescanned
                .iter()
                .map(|asset| (asset.rel_path.clone(), asset.guid.clone()))
                .collect::<BTreeMap<_, _>>()
        );
        found.sort_by(|left, right| left.name.cmp(&right.name));

        assert_eq!(found.len(), 17);
        assert!(found
            .iter()
            .any(|asset| asset.name == "walk.manim" && asset.kind == "animation"));
        assert!(found.iter().any(|asset| {
            asset.name == "hero.mcontroller" && asset.kind == "animator-controller"
        }));
        assert!(found
            .iter()
            .any(|asset| asset.name == "upper-body.mavatar" && asset.kind == "avatar-mask"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "intro.mtimeline" && asset.kind == "timeline"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "character.mmat" && asset.kind == "material"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "character-variant.minst" && asset.kind == "material"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "rim.mshader" && asset.kind == "shader"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "enemy.prefab" && asset.kind == "prefab"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "environment.gltf" && asset.kind == "model"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "studio.hdr" && asset.kind == "texture"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "character.glb" && asset.kind == "model"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "theme.ogg" && asset.kind == "audio"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "ui.matlas" && asset.kind == "sprite-atlas"));
        assert!(found.iter().any(|asset| {
            asset.name == "hero.png.sprite.json" && asset.kind == "sprite-import"
        }));
        assert!(found
            .iter()
            .any(|asset| asset.name == "Main.mscene" && asset.kind == "scene"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "Main.ts" && asset.kind == "script"));
        assert!(found.iter().all(|asset| !asset.revision.is_empty()));
        assert!(found.iter().all(|asset| asset.kind == "sprite-import"
            || (asset.guid.is_some() && asset.meta_status == "ready")));
        assert_eq!(
            std::fs::read_dir(&assets)
                .unwrap()
                .flatten()
                .filter(|entry| entry.file_name().to_string_lossy().ends_with(".meta"))
                .count(),
            16
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn project_asset_scan_reports_invalid_and_duplicate_metadata() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-metadata-scan-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let assets = root.join("Assets");
        std::fs::create_dir_all(&assets).unwrap();
        for name in ["First.mmat", "Second.mmat", "Broken.mmat"] {
            std::fs::write(assets.join(name), b"{}").unwrap();
        }
        let duplicate = br#"{"schemaVersion":1,"guid":"bf914747-8c6a-418f-b74f-49d49114f9a2","importer":"material"}"#;
        std::fs::write(assets.join("First.mmat.meta"), duplicate).unwrap();
        std::fs::write(assets.join("Second.mmat.meta"), duplicate).unwrap();
        std::fs::write(assets.join("Broken.mmat.meta"), b"broken").unwrap();

        let mut found = Vec::new();
        collect_project_assets(&root, &assets, &mut found);
        mark_duplicate_project_asset_guids(&mut found);
        assert_eq!(
            found
                .iter()
                .filter(|asset| asset.meta_status == "duplicate")
                .count(),
            2
        );
        let broken = found
            .iter()
            .find(|asset| asset.name == "Broken.mmat")
            .unwrap();
        assert_eq!(broken.meta_status, "invalid");
        assert!(broken.guid.is_none());
        assert!(broken.meta_error.as_deref().unwrap().contains("valid JSON"));
        assert_eq!(
            std::fs::read(assets.join("Broken.mmat.meta")).unwrap(),
            b"broken"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn project_asset_write_is_confined_atomic_and_replaceable() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-write-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets")).unwrap();

        write_project_asset_file(&root, "Assets/Animations/walk.manim", br#"{"version":1}"#)
            .unwrap();
        write_project_asset_file(&root, "Assets/Animations/walk.manim", br#"{"version":2}"#)
            .unwrap();
        let file = root.join("Assets/Animations/walk.manim");
        assert_eq!(std::fs::read(&file).unwrap(), br#"{"version":2}"#);
        assert!(std::fs::read_dir(file.parent().unwrap())
            .unwrap()
            .all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")));

        assert!(write_project_asset_file(&root, "../outside.manim", b"bad").is_err());
        assert!(write_project_asset_file(&root, "Assets/../outside.manim", b"bad").is_err());
        assert!(write_project_asset_file(&root, "Assets", b"bad").is_err());
        assert!(!root.join("outside.manim").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn project_asset_revision_guard_blocks_external_overwrites() {
        let root = std::env::temp_dir().join(format!(
            "mengine-asset-revision-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        let path = root.join("Assets/value.mmat");
        assert!(require_project_asset_revision(&path, None).is_ok());
        std::fs::write(&path, b"first").unwrap();
        assert!(require_project_asset_revision(&path, None).is_err());
        let baseline = project_file_revision(&path.metadata().unwrap());
        assert!(require_project_asset_revision(&path, Some(&baseline)).is_ok());

        std::fs::write(&path, b"externally changed and longer").unwrap();
        assert!(require_project_asset_revision(&path, Some(&baseline)).is_err());
        let current = project_file_revision(&path.metadata().unwrap());
        assert!(require_project_asset_revision(&path, Some(&current)).is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }
}
