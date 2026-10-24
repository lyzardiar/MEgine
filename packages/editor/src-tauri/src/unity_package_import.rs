// Author: MiYu. Unity package transactions are bound to the project selected at analysis time.
use super::AppState;
use mengine_unity_import::{AnalysisReport, ImportResult};
use std::path::{Path, PathBuf};
use tauri::{path::BaseDirectory, Manager, State};

fn resolve_converter(app: &tauri::AppHandle, explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = explicit.filter(|path| !path.trim().is_empty()).map(PathBuf::from).or_else(|| std::env::var_os("MENGINE_FBX2GLTF").map(PathBuf::from)) {
        return if path.is_file() { Ok(path) } else { Err(format!("FBX2glTF executable does not exist: {}", path.display())) };
    }
    if let Ok(path) = app.path().resolve("build-sdk/tools/unity-import/FBX2glTF.exe", BaseDirectory::Resource) {
        if path.is_file() { return Ok(path); }
    }
    if cfg!(debug_assertions) {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tmp/tools/unity-import/package/bin/Windows_NT/FBX2glTF.exe");
        if path.is_file() { return Ok(path); }
    }
    Err("The FBX2glTF converter is missing from this desktop installation. Development checkout: run python scripts/prepare-unity-import.py. Packaged editor: reinstall a build containing the Unity import tools.".into())
}

fn checked_project(state: &AppState, project_id: &str, project_root: &str) -> Result<PathBuf, String> {
    let project = state.project.lock();
    let session = project.as_ref().ok_or("Open a project before importing a Unity package")?;
    let snapshot = session.snapshot();
    if snapshot.project_id.to_string() != project_id || snapshot.project_root != project_root {
        return Err("The active project changed. Analyze the package again in the current project.".into());
    }
    Ok(session.project_root().to_owned())
}

#[tauri::command]
pub(crate) async fn analyze_unity_package(state: State<'_, AppState>, project_id: String, project_root: String, source_path: String) -> Result<AnalysisReport, String> {
    checked_project(&state, &project_id, &project_root)?;
    tauri::async_runtime::spawn_blocking(move || mengine_unity_import::analyze(Path::new(&source_path)).map_err(|error| format!("{error:#}"))).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn import_unity_package(app: tauri::AppHandle, project_id: String, project_root: String, source_path: String, fingerprint: String, converter_path: Option<String>) -> Result<ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Close/open/build use this same lock, so the checked target cannot change during commit.
        let _lifecycle = state.project_lifecycle.lock();
        let root = checked_project(&state, &project_id, &project_root)?;
        if state.active_build.lock().is_some() { return Err("Wait for the active build to finish before importing assets.".into()); }
        let converter = resolve_converter(&app, converter_path.as_deref());
        mengine_unity_import::import_package(Path::new(&source_path), &root, &fingerprint, converter.as_ref().ok().map(PathBuf::as_path)).map_err(|error| {
            let message = format!("{error:#}");
            if message.contains("FBX converter is required") { converter.err().unwrap_or(message) } else { message }
        })
    }).await.map_err(|error| error.to_string())?
}
