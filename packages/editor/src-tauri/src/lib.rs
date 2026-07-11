use mengine_core::snapshot::WorldSnapshot;
use mengine_editor_host::session::EditorSession;
use mengine_editor_host::undo::EditorCommand;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::State;

struct AppState {
    session: Mutex<EditorSession>,
}

#[tauri::command]
fn get_snapshot(state: State<'_, Arc<AppState>>) -> WorldSnapshot {
    state.session.lock().snapshot()
}

#[tauri::command]
fn editor_command(state: State<'_, Arc<AppState>>, cmd: EditorCommand) -> Result<(), String> {
    state
        .session
        .lock()
        .handle_editor_command(cmd)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        session: Mutex::new(EditorSession::new()),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![get_snapshot, editor_command])
        .run(tauri::generate_context!())
        .expect("error while running MEngine Editor");
}
