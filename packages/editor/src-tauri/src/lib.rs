use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{
    BuildAssetMode, EditorFailure, EditorRequest, EditorResult, ProjectSession, ProjectSnapshot,
    SceneRecoveryInfo,
};
use parking_lot::Mutex;
use std::collections::{BTreeMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{path::BaseDirectory, Emitter, Manager, State};

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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAssetInfo {
    id: String,
    name: String,
    folder: String,
    rel_path: String,
    kind: String,
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
    profile: String,
    platform: String,
    architecture: String,
    engine_version: String,
    scene_count: usize,
    validated_asset_files: usize,
    asset_references: usize,
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
    stage_timings: Vec<BuildStageTimingResult>,
    total_duration_ms: u64,
    toolchain: String,
    history_entry: Option<BuildHistoryEntry>,
    log: String,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryEntry {
    id: String,
    recorded_at_ms: u64,
    content_hash: String,
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
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildHistoryListResult {
    entries: Vec<BuildHistoryEntry>,
    invalid_records: usize,
    retention_limit: usize,
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
}

const BUILD_HISTORY_SCHEMA_VERSION: u32 = 1;
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

const BUILD_CACHE_REPORT_PREFIX: &str = "MENGINE_BUILD_CACHE ";

fn extract_build_cache_report(stdout: &[u8]) -> (Option<BuildCacheResult>, String) {
    let stdout = String::from_utf8_lossy(stdout);
    let mut report = None;
    let mut log_lines = Vec::new();
    for line in stdout.lines() {
        let Some(json) = line.strip_prefix(BUILD_CACHE_REPORT_PREFIX) else {
            log_lines.push(line);
            continue;
        };
        match serde_json::from_str::<BuildCacheResult>(json) {
            Ok(parsed) => report = Some(parsed),
            Err(_) => log_lines.push(line),
        }
    }
    (report, log_lines.join("\n").trim().to_owned())
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
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return None;
    }
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

fn published_build_hash(output_dir: &Path) -> Option<String> {
    read_previous_build_manifest(output_dir).and_then(|manifest| {
        manifest
            .get("contentHash")
            .and_then(serde_json::Value::as_str)
            .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .map(str::to_ascii_lowercase)
    })
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
    if record.schema_version != BUILD_HISTORY_SCHEMA_VERSION {
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
    Ok(BuildHistoryEntry {
        id: record.id.clone(),
        recorded_at_ms: record.recorded_at_ms,
        content_hash,
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
            Ok(entry) => entries.push(entry),
            Err(_) => invalid_records += 1,
        }
    }
    entries.sort_by(|left, right| {
        right
            .recorded_at_ms
            .cmp(&left.recorded_at_ms)
            .then_with(|| right.id.cmp(&left.id))
    });
    let mut published_hashes = BTreeMap::<String, Option<String>>::new();
    let mut published_targets = HashSet::<String>::new();
    for entry in &mut entries {
        let published_hash = published_hashes
            .entry(entry.output_dir.clone())
            .or_insert_with(|| published_build_hash(Path::new(&entry.output_dir)));
        if !published_targets.contains(&entry.output_dir)
            && published_hash
                .as_ref()
                .is_some_and(|published_hash| published_hash == &entry.content_hash)
        {
            entry.published = true;
            published_targets.insert(entry.output_dir.clone());
        }
    }
    Ok(BuildHistoryListResult {
        entries,
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

fn archive_build_history(
    project_root: &Path,
    manifest: &serde_json::Value,
    total_duration_ms: u64,
    toolchain: &str,
) -> Result<BuildHistoryEntry, String> {
    let history_dir = build_history_dir(project_root, true)?
        .ok_or_else(|| "build history directory is unavailable".to_string())?;
    let content_hash = build_file_snapshots(manifest)?.0;
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
    };
    let mut entry = build_history_entry(project_root, &path, &record)?;
    entry.published = published_build_hash(Path::new(&entry.output_dir))
        .is_some_and(|published_hash| published_hash == entry.content_hash.as_str());
    prune_build_history(project_root, MAX_BUILD_HISTORY_ENTRIES.saturating_sub(1))?;
    write_build_history_record(&path, &record)?;
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
        let cli = engine_root.join("packages/cli/dist/cli.js");
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
        control.ensure_active()?;
        if !cli.is_file() {
            return Err(format!(
                "MEngine CLI build completed without {}",
                cli.display()
            ));
        }
        command = Command::new("node");
        command
            .current_dir(&engine_root)
            .arg(&cli)
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
    let (build_cache, mut build_log) = extract_build_cache_report(&output.stdout);
    let history_entry = match archive_build_history(
        &project_root,
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
                "warning: player was published, but its build history record could not be saved: {error}"
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
        profile,
        platform,
        architecture,
        engine_version,
        scene_count,
        validated_asset_files,
        asset_references,
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
    if manifest_metadata.file_type().is_symlink() || !manifest_metadata.is_file() {
        return Err("player build manifest must be a regular non-symlink file".into());
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
        None
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
        if path.is_dir() {
            collect_project_assets(root, &path, output);
            continue;
        }
        let Some(kind) = project_asset_kind(&name) else {
            continue;
        };
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let rel_path = relative.to_string_lossy().replace('\\', "/");
        let folder = relative
            .parent()
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|| "Assets".into());
        output.push(ProjectAssetInfo {
            id: rel_path.clone(),
            name,
            folder,
            rel_path,
            kind: kind.into(),
        });
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
    })
}

#[tauri::command]
fn save_project_build_asset_settings(
    asset_mode: BuildAssetMode,
    always_include: Vec<String>,
    state: State<'_, AppState>,
) -> Result<ProjectBuildSettings, String> {
    let mut guard = state.project.lock();
    let session = guard.as_mut().ok_or_else(|| no_project().message)?;
    let always_include = session
        .save_build_asset_settings(asset_mode, always_include)
        .map_err(|error| error.to_string())?;
    let scenes = session.build_scenes();
    let available_scenes = available_build_scenes(Path::new(&session.snapshot().project_root))?;
    Ok(ProjectBuildSettings {
        main_scene: scenes.first().cloned(),
        scenes,
        available_scenes,
        asset_mode,
        always_include,
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
) -> Result<Vec<u8>, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    let file =
        project_asset_read_path(Path::new(&session.snapshot().project_root), &relative_path)?;
    let length = file.metadata().map_err(|error| error.to_string())?.len();
    if length > MAX_PROJECT_ASSET_BYTES as u64 {
        return Err("asset exceeds 64 MiB editor limit".into());
    }
    std::fs::read(file).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_project_asset(
    relative_path: String,
    contents: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    write_project_asset_file(
        Path::new(&session.snapshot().project_root),
        &relative_path,
        &contents,
    )
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            project: Mutex::new(None),
            active_build: Arc::new(Mutex::new(None)),
            next_build_id: AtomicU64::new(1),
        })
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
            compare_pc_build_history,
            build_pc_player,
            cancel_pc_build,
            run_pc_player,
            verify_pc_player,
            read_project_asset,
            write_project_asset,
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
            submit_editor_request
        ])
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
    fn build_cache_report_is_parsed_without_polluting_user_log() {
        let output = b"validated package\nMENGINE_BUILD_CACHE {\"enabled\":true,\"hits\":3,\"misses\":1,\"reusedBytes\":120,\"storedBytes\":40,\"recoveredEntries\":1,\"failures\":0}\nBuilt Game\n";
        let (report, log) = extract_build_cache_report(output);
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
        assert_eq!(log, "validated package\nBuilt Game");

        let (report, log) =
            extract_build_cache_report(b"MENGINE_BUILD_CACHE {broken}\nlegacy sdk output\n");
        assert!(report.is_none());
        assert!(log.contains("{broken}"));
        assert!(log.contains("legacy sdk output"));
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
        let previous_entry = archive_build_history(&root, &previous, 1250, "bundled-sdk").unwrap();
        assert!(previous_entry.published);
        assert_eq!(previous_entry.packaged_bytes, 15);
        assert_eq!(previous_entry.project_version, "7");

        let current = history_manifest(
            'c',
            serde_json::json!([
                comparison_file("Runtime/MEnginePlayer.exe", 10, 'a', "runtime"),
                comparison_file("Assets/Main.mscene", 9, 'c', "scene"),
                comparison_file("Assets/New.bin", 3, 'd', "other")
            ]),
        );
        std::fs::write(
            output_dir.join("mengine-build.json"),
            serde_json::to_vec(&current).unwrap(),
        )
        .unwrap();
        let current_entry =
            archive_build_history(&root, &current, 2500, "source-checkout").unwrap();

        let history = list_build_history(&root).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, current_entry.id);
        assert!(history[0].published);
        assert_eq!(history[0].toolchain, "source-checkout");
        assert!(!history[1].published);
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
            archive_build_history(&root, &manifest, index as u64, "bundled-sdk").unwrap();
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
            "ignored.txt",
        ] {
            std::fs::write(assets.join(name), []).unwrap();
        }

        let mut found = Vec::new();
        collect_project_assets(&root, &assets, &mut found);
        std::fs::remove_dir_all(root).unwrap();
        found.sort_by(|left, right| left.name.cmp(&right.name));

        assert_eq!(found.len(), 14);
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
}
