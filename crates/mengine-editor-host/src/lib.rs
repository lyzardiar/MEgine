//! Editor host: shared engine session, undo stack, play mode, gizmo state.

pub use mengine_script::runtime_identity;

mod gizmo;
mod project;
mod play_runtime;
mod session;
mod undo;
mod viewport;
mod scene_snapshot_world;
mod warcraft_model;
mod warcraft_world;
pub use warcraft_world::{MountedWarcraftPlacedWorld,WarcraftPlacedWorldView,WarcraftWorldRenderLimits};
mod warcraft_terrain;
pub use warcraft_terrain::{MountedWarcraftTerrain,WarcraftTerrainView,WarcraftTerrainRenderLimits,WarcraftTerrainUploadStats};
pub use scene_snapshot_world::SceneSnapshotWorld;
pub use warcraft_model::{MountedWarcraftModel,WarcraftModelRenderLimits};

pub use gizmo::{GizmoMode, GizmoState};
pub use play_runtime::{EditorPlayRuntime, PlayProject, PlayWorldUpdate, ScriptInput};
pub use project::{
    AssetDeleteSnapshot, AssetDuplicateRequest, AssetDuplicateResult, AssetManifestReference,
    AssetRenameRequest, AssetRenameResult, AssetRenameUpdate, AssetRestoreRequest,
    AssetRestoreResult, AssetTrashEntry, AssetTrashInventory, AssetTrashRequest, AssetTrashResult,
    BuildAssetMode, EditorFailure, EditorRequest, EditorResult, ProjectError, ProjectManifest,
    ProjectSession, ProjectSnapshot, SceneRecoveryInfo, SceneRecoveryCheckpoint,
};
pub use session::{EditorMode, EditorSession};
pub use undo::{EditorCommand, UndoStack};
pub use viewport::{
    invalidate_resource_samples, resource_sample_generation,
    EditorCameraPreview, EditorSceneCamera, EditorViewportFrame, EditorViewportSubmission, EditorViewportMemoryCategory, EditorViewportPresentation,
    EditorViewportProfile, EditorViewportProfileCounts, EditorViewportProfileNode,
    EditorViewportRenderer, EditorViewportResource,
    ViewportGpuMemory,
};
