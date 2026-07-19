import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { WorldCommand, WorldSnapshotView } from '@mengine/api';

type HostEntitySnapshot = {
  entity: number;
  name?: string | null;
  parent?: number | null;
  sibling_index?: number;
  active?: boolean;
  components: Record<string, unknown>;
};

export type HostWorldSnapshot = {
  entities: HostEntitySnapshot[];
  frame: number;
  sim_frame: number;
  clear_color: [number, number, number, number];
  selected?: number | null;
};

export type ProjectSnapshot = {
  projectId: string;
  projectName: string;
  projectRoot: string;
  revision: number;
  documentRevision: number;
  saveRevision: number;
  dirty: boolean;
  scenePath?: string | null;
  world: HostWorldSnapshot;
};

export type SceneRecoveryInfo = {
  scenePath: string;
  sceneName: string;
  recordedAtMs: number;
  documentRevision: number;
  entityCount: number;
};

export type RecentProjectInfo = {
  name: string;
  path: string;
  lastOpenedAt: number;
};

export type BuildPlayerProfile = 'debug' | 'release';

export type BuildContentCategoryResult = {
  category: string;
  files: number;
  bytes: number;
};

export type BuildContentFileResult = {
  path: string;
  size: number;
  category: string;
  includedBy: string[];
};

export type BuildFileChangeResult = {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  category: string;
  previousSize: number | null;
  currentSize: number | null;
  byteDelta: number;
};

export type BuildComparisonResult = {
  previousContentHash: string;
  addedFiles: number;
  removedFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  byteDelta: number;
  changes: BuildFileChangeResult[];
};

export type BuildStageTimingResult = {
  stage: string;
  label: string;
  durationMs: number;
};

export type BuildCacheResult = {
  enabled: boolean;
  hits: number;
  misses: number;
  reusedBytes: number;
  storedBytes: number;
  recoveredEntries: number;
  failures: number;
};

export type BuildProgressEvent = {
  buildId: number;
  stage: string;
  label: string;
  stageIndex: number;
  stageCount: number;
  status: 'running' | 'completed';
  elapsedMs: number;
};

export type BuildHistoryEntry = {
  id: string;
  recordedAtMs: number;
  contentHash: string;
  artifactSigned: boolean;
  artifactSigningKeyId: string | null;
  profile: BuildPlayerProfile;
  platform: string;
  architecture: string;
  engineVersion: string;
  projectName: string;
  projectVersion: string;
  fileCount: number;
  packagedBytes: number;
  outputDir: string;
  manifestPath: string;
  recordPath: string;
  published: boolean;
  totalDurationMs: number;
  toolchain: 'bundled-sdk' | 'source-checkout';
};

export type BuildHistoryListResult = {
  entries: BuildHistoryEntry[];
  invalidRecords: number;
  retentionLimit: number;
};

export type BuildPlayerResult = {
  buildId: number;
  outputDir: string;
  executable: string;
  fileCount: number;
  contentHash: string;
  artifactSigned: boolean;
  artifactSigningKeyId: string | null;
  profile: BuildPlayerProfile;
  platform: string;
  architecture: string;
  engineVersion: string;
  sceneCount: number;
  validatedAssetFiles: number;
  assetReferences: number;
  auditedScenes: number;
  auditedPrefabs: number;
  auditedMaterials: number;
  auditedMaterialInstances: number;
  auditedSurfaceShaders: number;
  shaderVariants: number;
  shaderVariantLimit: number;
  surfaceShaderVariants: Array<{
    shader: string;
    enabledKeywords: string[];
    blend: 'replace' | 'alpha' | 'premultiplied' | 'additive' | 'multiply';
    doubleSided: boolean;
    depthWrite: boolean;
  }>;
  assetMode: 'all' | 'referenced';
  omittedAssetFiles: number;
  omittedAssetBytes: number;
  strippedEditorEntities: number;
  packagedBytes: number;
  manifestPath: string;
  contentCategories: BuildContentCategoryResult[];
  largestFiles: BuildContentFileResult[];
  comparison: BuildComparisonResult | null;
  buildCache: BuildCacheResult | null;
  stageTimings: BuildStageTimingResult[];
  totalDurationMs: number;
  toolchain: 'bundled-sdk' | 'source-checkout';
  historyEntry: BuildHistoryEntry | null;
  log: string;
};

export type RunPlayerResult = {
  executable: string;
  processId: number;
};

export type VerifyPlayerResult = {
  executable: string;
  contentHash: string;
  fileCount: number;
  packagedBytes: number;
  log: string;
};

export type ProjectSceneInfo = {
  name: string;
  updatedAt: number;
  json: string;
};

export type ProjectBuildSettings = {
  mainScene: string | null;
  scenes: string[];
  availableScenes: string[];
  assetMode: 'all' | 'referenced';
  alwaysInclude: string[];
  shaderVariantLimit: number;
};

export type ProjectSortingLayer = {
  id: string;
  name: string;
};

export type ProjectSortingLayers = {
  version: 1;
  layers: ProjectSortingLayer[];
};

export type EditorOperation =
  | { op: 'select'; entity: number | null }
  | { op: 'undo' }
  | { op: 'redo' }
  | { op: 'play' }
  | { op: 'stop' }
  | { op: 'pause' }
  | { op: 'step' }
  | { op: 'applyBatch'; forward: WorldCommand[]; inverse: WorldCommand[] };

export type EditorResult = {
  requestId: string;
  acceptedRevision: number;
  documentRevision: number;
  dirty: boolean;
  world: HostWorldSnapshot;
};

export type EditorFailure = {
  code: string;
  message: string;
  currentRevision?: number | null;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktopEditor(): boolean {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ != null;
}

export async function isPrimaryPointerDown(): Promise<boolean> {
  return isDesktopEditor() ? invoke<boolean>('is_primary_pointer_down') : false;
}

export function toWorldSnapshotView(snapshot: HostWorldSnapshot): WorldSnapshotView & {
  selectedIds: number[];
} {
  return {
    entities: snapshot.entities.map((entity) => ({
      entity: entity.entity,
      name: entity.name,
      parent: entity.parent,
      siblingIndex: entity.sibling_index ?? 0,
      active: entity.active ?? true,
      components: entity.components,
    })),
    frame: snapshot.frame,
    simFrame: snapshot.sim_frame,
    clearColor: snapshot.clear_color,
    selected: snapshot.selected,
    selectedIds: snapshot.selected == null ? [] : [snapshot.selected],
  };
}

export function projectSnapshotAsSceneJson(snapshot: ProjectSnapshot): string {
  const sceneName = snapshot.scenePath?.split('/').pop()?.replace(/\.mscene$/i, '') ?? 'Untitled';
  const world = toWorldSnapshotView(snapshot.world);
  return JSON.stringify(
    {
      version: 1,
      name: sceneName,
      world: {
        entities: world.entities,
        frame: world.frame,
        simFrame: world.simFrame,
        clearColor: world.clearColor,
        selected: world.selected,
        selectedIds: world.selectedIds,
      },
    },
    null,
    2,
  );
}

export async function chooseProjectDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Open MEngine Project',
  });
  return typeof selected === 'string' ? selected : null;
}

export async function chooseProjectLocation(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Choose New MEngine Project Location',
  });
  return typeof selected === 'string' ? selected : null;
}

export async function createProject(parent: string, name: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('create_project', { parent, name });
}

export async function openProject(root: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('open_project', { root });
}

export async function listRecentProjects(): Promise<RecentProjectInfo[]> {
  return invoke<RecentProjectInfo[]>('list_recent_projects');
}

export async function removeRecentProject(path: string): Promise<RecentProjectInfo[]> {
  return invoke<RecentProjectInfo[]>('remove_recent_project', { path });
}

export async function getProjectSnapshot(): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('get_project_snapshot');
}

export async function buildPcPlayer(
  profile: BuildPlayerProfile,
  clean = true,
): Promise<BuildPlayerResult> {
  if (!isDesktopEditor()) {
    throw new Error('PC player builds require the desktop editor');
  }
  return invoke<BuildPlayerResult>('build_pc_player', { profile, clean });
}

export async function listPcBuildHistory(): Promise<BuildHistoryListResult> {
  if (!isDesktopEditor()) return { entries: [], invalidRecords: 0, retentionLimit: 50 };
  return invoke<BuildHistoryListResult>('list_pc_build_history');
}

export async function comparePcBuildHistory(
  previousId: string,
  currentId: string,
): Promise<BuildComparisonResult> {
  if (!isDesktopEditor()) {
    throw new Error('Build history comparison requires the desktop editor');
  }
  return invoke<BuildComparisonResult>('compare_pc_build_history', { previousId, currentId });
}

export async function cancelPcBuild(): Promise<boolean> {
  if (!isDesktopEditor()) return false;
  return invoke<boolean>('cancel_pc_build');
}

export async function listenToPcBuildProgress(
  listener: (progress: BuildProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!isDesktopEditor()) return () => {};
  return listen<BuildProgressEvent>('pc-build-progress', (event) => listener(event.payload));
}

export async function runPcPlayer(executable: string): Promise<RunPlayerResult> {
  if (!isDesktopEditor()) {
    throw new Error('PC players can only be launched from the desktop editor');
  }
  return invoke<RunPlayerResult>('run_pc_player', { executable });
}

export async function verifyPcPlayer(
  executable: string,
  expectedContentHash: string,
): Promise<VerifyPlayerResult> {
  if (!isDesktopEditor()) {
    throw new Error('Published player builds can only be verified from the desktop editor');
  }
  return invoke<VerifyPlayerResult>('verify_pc_player', { executable, expectedContentHash });
}

export async function listProjectScenes(): Promise<ProjectSceneInfo[]> {
  if (!isDesktopEditor()) return [];
  return invoke<ProjectSceneInfo[]>('list_project_scenes');
}

export async function renameProjectScene(
  oldName: string,
  newName: string,
): Promise<ProjectSnapshot> {
  if (!isDesktopEditor()) throw new Error('Scene rename requires the desktop editor');
  return invoke<ProjectSnapshot>('rename_project_scene', { oldName, newName });
}

export async function deleteProjectScene(name: string): Promise<ProjectSnapshot> {
  if (!isDesktopEditor()) throw new Error('Scene deletion requires the desktop editor');
  return invoke<ProjectSnapshot>('delete_project_scene', { name });
}

export async function getProjectBuildSettings(): Promise<ProjectBuildSettings> {
  if (isDesktopEditor()) {
    return invoke<ProjectBuildSettings>('get_project_build_settings');
  }
  const response = await fetch('/__mengine/build-settings');
  if (!response.ok) throw new Error(`cannot read build settings: ${response.status}`);
  return response.json() as Promise<ProjectBuildSettings>;
}

export async function saveProjectBuildSettings(
  scenes: string[],
): Promise<ProjectBuildSettings> {
  if (isDesktopEditor()) {
    return invoke<ProjectBuildSettings>('save_project_build_settings', { scenes });
  }
  const response = await fetch('/__mengine/build-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `cannot save build settings: ${response.status}`);
  }
  return response.json() as Promise<ProjectBuildSettings>;
}

export async function saveProjectBuildAssetSettings(
  assetMode: 'all' | 'referenced',
  alwaysInclude: string[],
  shaderVariantLimit: number,
): Promise<ProjectBuildSettings> {
  if (isDesktopEditor()) {
    return invoke<ProjectBuildSettings>('save_project_build_asset_settings', {
      assetMode,
      alwaysInclude,
      shaderVariantLimit,
    });
  }
  const response = await fetch('/__mengine/build-asset-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetMode, alwaysInclude, shaderVariantLimit }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `cannot save build asset settings: ${response.status}`);
  }
  return response.json() as Promise<ProjectBuildSettings>;
}

export async function validateSurfaceShaderWithRuntime(source: string): Promise<void> {
  if (!isDesktopEditor()) {
    throw new Error('Full Surface Shader validation requires the desktop editor.');
  }
  await invoke('validate_surface_shader', { source });
}

export async function getProjectSortingLayers(): Promise<ProjectSortingLayers> {
  if (isDesktopEditor()) {
    return invoke<ProjectSortingLayers>('get_project_sorting_layers');
  }
  const response = await fetch('/__mengine/sorting-layers');
  if (!response.ok) throw new Error(`cannot read sorting layers: ${response.status}`);
  return response.json() as Promise<ProjectSortingLayers>;
}

export async function saveProjectSortingLayers(
  settings: ProjectSortingLayers,
): Promise<ProjectSortingLayers> {
  if (isDesktopEditor()) {
    return invoke<ProjectSortingLayers>('save_project_sorting_layers', { settings });
  }
  const response = await fetch('/__mengine/sorting-layers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `cannot save sorting layers: ${response.status}`);
  }
  return response.json() as Promise<ProjectSortingLayers>;
}

export async function openProjectScene(relativePath: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('open_scene', { relativePath });
}

export async function saveProjectScene(relativePath?: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('save_scene', { relativePath: relativePath ?? null });
}

export async function getSceneRecovery(): Promise<SceneRecoveryInfo | null> {
  return invoke<SceneRecoveryInfo | null>('get_scene_recovery');
}

export async function restoreSceneRecovery(): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>('restore_scene_recovery');
}

export async function discardSceneRecovery(): Promise<void> {
  await invoke('discard_scene_recovery');
}

export async function submitEditorRequest(
  snapshot: ProjectSnapshot,
  operation: EditorOperation,
): Promise<EditorResult> {
  return invoke<EditorResult>('submit_editor_request', {
    request: {
      requestId: crypto.randomUUID(),
      projectId: snapshot.projectId,
      baseRevision: snapshot.revision,
      operation,
    },
  });
}
