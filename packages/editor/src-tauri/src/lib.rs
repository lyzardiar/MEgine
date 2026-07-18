use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::{
    EditorFailure, EditorRequest, EditorResult, ProjectSession, ProjectSnapshot,
};
use parking_lot::Mutex;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

struct AppState {
    project: Mutex<Option<ProjectSession>>,
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
struct ProjectBuildSettings {
    main_scene: Option<String>,
    scenes: Vec<String>,
    available_scenes: Vec<String>,
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
    output_dir: String,
    executable: String,
    file_count: usize,
    profile: String,
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

fn run_player_build(
    project_root: PathBuf,
    profile: String,
    clean: bool,
) -> Result<BuildPlayerResult, String> {
    if profile != "debug" && profile != "release" {
        return Err(format!("unsupported build profile: {profile}"));
    }
    let manifest = project_root.join("project.json");
    if !manifest.is_file() {
        return Err(format!("project.json not found: {}", manifest.display()));
    }
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let engine_root = find_engine_root(manifest_dir)
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| find_engine_root(&path))
        })
        .ok_or_else(|| {
            "MEngine build tools were not found. Run this editor from an engine source checkout."
                .to_string()
        })?;
    let cli = engine_root.join("packages/cli/dist/cli.js");
    if !cli.is_file() {
        let npm = if cfg!(target_os = "windows") {
            "npm.cmd"
        } else {
            "npm"
        };
        let output = Command::new(npm)
            .current_dir(&engine_root)
            .args(["--prefix", "packages/cli", "run", "build"])
            .output()
            .map_err(|error| format!("cannot start CLI build: {error}"))?;
        if !output.status.success() {
            return Err(command_failure("MEngine CLI build", &output));
        }
    }
    let output_dir =
        project_root
            .join("Builds")
            .join(format!("{}-{}", node_platform_name(), node_arch_name()));
    let mut command = Command::new("node");
    command
        .current_dir(&engine_root)
        .arg(&cli)
        .arg("build")
        .arg(&project_root)
        .arg("--out")
        .arg(&output_dir);
    if profile == "debug" {
        command.arg("--debug");
    }
    if clean {
        command.arg("--clean");
    }
    let output = command
        .output()
        .map_err(|error| format!("cannot start player build: {error}"))?;
    if !output.status.success() {
        return Err(command_failure("MEngine player build", &output));
    }
    let build_manifest_path = output_dir.join("mengine-build.json");
    let build_manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&build_manifest_path).map_err(|error| {
            format!(
                "build finished without {}: {error}",
                build_manifest_path.display()
            )
        })?)
        .map_err(|error| format!("invalid build manifest: {error}"))?;
    let executable = build_manifest
        .get("executable")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "build manifest does not contain executable".to_string())?;
    let file_count = build_manifest
        .get("files")
        .and_then(serde_json::Value::as_array)
        .map_or(0, Vec::len);
    Ok(BuildPlayerResult {
        output_dir: output_dir.to_string_lossy().into_owned(),
        executable: output_dir.join(executable).to_string_lossy().into_owned(),
        file_count,
        profile,
        log: String::from_utf8_lossy(&output.stdout).trim().to_owned(),
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
    } else if lower.ends_with(".wav")
        || lower.ends_with(".ogg")
        || lower.ends_with(".mp3")
        || lower.ends_with(".flac")
    {
        Some("audio")
    } else if lower.ends_with(".mmat") || lower.ends_with(".mat") {
        Some("material")
    } else if lower.ends_with(".prefab") {
        Some("prefab")
    } else if lower.ends_with(".gltf") || lower.ends_with(".glb") {
        Some("model")
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
fn get_project_build_settings(state: State<'_, AppState>) -> Result<ProjectBuildSettings, String> {
    let guard = state.project.lock();
    let session = guard.as_ref().ok_or_else(|| no_project().message)?;
    let scenes = session.build_scenes();
    let available_scenes = available_build_scenes(Path::new(&session.snapshot().project_root))?;
    Ok(ProjectBuildSettings {
        main_scene: scenes.first().cloned(),
        scenes,
        available_scenes,
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
    })
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
async fn build_pc_player(
    profile: String,
    clean: bool,
    state: State<'_, AppState>,
) -> Result<BuildPlayerResult, String> {
    let project_root = state
        .project
        .lock()
        .as_ref()
        .map(|session| session.snapshot().project_root)
        .ok_or_else(|| no_project().message)?;
    tauri::async_runtime::spawn_blocking(move || {
        run_player_build(PathBuf::from(project_root), profile, clean)
    })
    .await
    .map_err(|error| format!("player build task failed: {error}"))?
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
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            is_primary_pointer_down,
            list_recent_projects,
            remove_recent_project,
            get_project_snapshot,
            list_project_scenes,
            get_project_build_settings,
            save_project_build_settings,
            get_project_sorting_layers,
            save_project_sorting_layers,
            build_pc_player,
            read_project_asset,
            write_project_asset,
            list_project_assets,
            list_project_sprites,
            open_scene,
            save_scene,
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
    fn build_backend_finds_workspace_and_rejects_unknown_profiles() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = find_engine_root(manifest_dir).expect("workspace root");
        assert!(root.join("crates/mengine-runtime/Cargo.toml").is_file());
        assert!(run_player_build(root, "shipping".into(), true)
            .unwrap_err()
            .contains("unsupported build profile"));
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
            r#"{"name":"Editor Build QA","version":1,"language":"typescript","mainScene":"Assets/Scenes/Main.mscene","buildScenes":["Assets/Scenes/Main.mscene","Assets/Scenes/Level2.mscene"],"startupScript":"Assets/Scripts/Main.ts"}"#,
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
        std::fs::write(
            root.join("Assets/Scenes/Level2.mscene"),
            r#"{"version":1,"name":"Level 2","world":{"entities":[],"frame":0,"sim_frame":0,"clear_color":[0.05,0.08,0.12,1]}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Scenes/Main.mscene"),
            r#"{"version":1,"name":"Main","world":{"entities":[],"frame":0,"sim_frame":0,"clear_color":[0.1,0.1,0.14,1]}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("ProjectSettings/sorting-layers.json"),
            r#"{"version":1,"layers":[{"id":"default","name":"Default"},{"id":"effects","name":"Effects"}]}"#,
        )
        .unwrap();

        let result = run_player_build(root.clone(), "debug".into(), true).unwrap();
        assert_eq!(result.profile, "debug");
        assert!(Path::new(&result.executable).is_file());
        assert!(result.file_count >= 6);
        let output = Path::new(&result.output_dir);
        assert!(output.join("Assets/Scripts/Main.js").is_file());
        assert!(!output.join("Assets/Scripts/Main.ts").exists());
        assert!(!output.join("Assets/Scripts/mengine.d.ts").exists());
        assert!(output.join("ProjectSettings/sorting-layers.json").is_file());
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
            "character.mmat",
            "enemy.prefab",
            "environment.gltf",
            "character.glb",
            "skeleton.atlas",
            "theme.ogg",
            "ui.matlas",
            "hero.png.sprite.json",
            "ignored.txt",
        ] {
            std::fs::write(assets.join(name), []).unwrap();
        }

        let mut found = Vec::new();
        collect_project_assets(&root, &assets, &mut found);
        std::fs::remove_dir_all(root).unwrap();
        found.sort_by(|left, right| left.name.cmp(&right.name));

        assert_eq!(found.len(), 9);
        assert!(found
            .iter()
            .any(|asset| asset.name == "walk.manim" && asset.kind == "animation"));
        assert!(found.iter().any(|asset| {
            asset.name == "hero.mcontroller" && asset.kind == "animator-controller"
        }));
        assert!(found
            .iter()
            .any(|asset| asset.name == "character.mmat" && asset.kind == "material"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "enemy.prefab" && asset.kind == "prefab"));
        assert!(found
            .iter()
            .any(|asset| asset.name == "environment.gltf" && asset.kind == "model"));
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
