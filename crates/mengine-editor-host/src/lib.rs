//! Editor host: shared engine session, undo stack, play mode, gizmo state.

mod gizmo;
mod project;
mod session;
mod undo;

pub use gizmo::{GizmoMode, GizmoState};
pub use project::{
    AssetDeleteSnapshot, AssetDuplicateRequest, AssetDuplicateResult, AssetManifestReference,
    AssetRenameRequest, AssetRenameResult, AssetRenameUpdate, AssetRestoreRequest,
    AssetRestoreResult, AssetTrashEntry, AssetTrashInventory, AssetTrashRequest, AssetTrashResult,
    BuildAssetMode, EditorFailure, EditorRequest, EditorResult, ProjectError, ProjectManifest,
    ProjectSession, ProjectSnapshot, SceneRecoveryInfo,
};
pub use session::{EditorMode, EditorSession};
pub use undo::{EditorCommand, UndoStack};
