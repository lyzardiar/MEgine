import { invoke } from '@tauri-apps/api/core';
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

export type RecentProjectInfo = {
  name: string;
  path: string;
  lastOpenedAt: number;
};

export type BuildPlayerProfile = 'debug' | 'release';

export type BuildPlayerResult = {
  outputDir: string;
  executable: string;
  fileCount: number;
  contentHash: string;
  profile: BuildPlayerProfile;
  platform: string;
  architecture: string;
  engineVersion: string;
  sceneCount: number;
  validatedAssetFiles: number;
  assetReferences: number;
  packagedBytes: number;
  toolchain: 'bundled-sdk' | 'source-checkout';
  log: string;
};

export type RunPlayerResult = {
  executable: string;
  processId: number;
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

export async function runPcPlayer(executable: string): Promise<RunPlayerResult> {
  if (!isDesktopEditor()) {
    throw new Error('PC players can only be launched from the desktop editor');
  }
  return invoke<RunPlayerResult>('run_pc_player', { executable });
}

export async function listProjectScenes(): Promise<ProjectSceneInfo[]> {
  if (!isDesktopEditor()) return [];
  return invoke<ProjectSceneInfo[]>('list_project_scenes');
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
