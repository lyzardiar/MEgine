//! Editor host: shared engine session, undo stack, play mode, gizmo state.

pub use mengine_script::runtime_identity;

mod gizmo;
mod project;
mod play_runtime;
mod session;
mod undo;
mod viewport;
mod scene_snapshot_world;
pub use scene_snapshot_world::SceneSnapshotWorld;

pub use gizmo::{GizmoMode, GizmoState};
pub use play_runtime::{EditorPlayRuntime, PlayProject, PlayWorldUpdate, ScriptInput};
pub use project::{
    AssetDeleteSnapshot, AssetDuplicateRequest, AssetDuplicateResult, AssetManifestReference,
    AssetRenameRequest, AssetRenameResult, AssetRenameUpdate, AssetRestoreRequest,
    AssetRestoreResult, AssetTrashEntry, AssetTrashInventory, AssetTrashRequest, AssetTrashResult,
    BuildAssetMode, EditorFailure, EditorRequest, EditorResult, ProjectError, ProjectManifest,
    ProjectSession, ProjectSnapshot, SceneRecoveryInfo,
};
pub use session::{EditorMode, EditorSession};
pub use undo::{EditorCommand, UndoStack};
pub use viewport::{
    invalidate_resource_samples, resource_sample_generation,
    EditorCameraPreview, EditorSceneCamera, EditorViewportFrame, EditorViewportMemoryCategory, EditorViewportPresentation,
    EditorViewportProfile, EditorViewportProfileCounts, EditorViewportProfileNode,
    EditorViewportRenderer, EditorViewportResource,
};
