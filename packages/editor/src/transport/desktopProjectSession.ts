import {
  createProject,
  discardSceneRecovery,
  deleteProjectScene,
  getSceneRecovery,
  getProjectSnapshot,
  openProjectScene,
  openProject,
  projectSnapshotAsSceneJson,
  renameProjectScene,
  restoreSceneRecovery,
  type SceneRecoveryInfo,
  type HostWorldSnapshot,
  type ProjectSnapshot,
} from './editorTransport';
import { invoke } from '@tauri-apps/api/core';

let currentProject: ProjectSnapshot | null = null;
let sessionQueue: Promise<void> = Promise.resolve();

function enqueueSessionOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionQueue.then(operation, operation);
  sessionQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function getDesktopProject(): ProjectSnapshot | null {
  return currentProject;
}

/** Attach a newly-created WebView to the project already owned by the Rust host. */
export async function attachDesktopProject(): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    currentProject = await getProjectSnapshot();
    return currentProject;
  });
}

export async function startDesktopProject(root: string): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    currentProject = await openProject(root);
    return currentProject;
  });
}

export async function createDesktopProject(
  parent: string,
  name: string,
): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    currentProject = await createProject(parent, name);
    return currentProject;
  });
}

export function desktopProjectSceneJson(): string | null {
  return currentProject ? projectSnapshotAsSceneJson(currentProject) : null;
}

function browserWorldToHost(sceneJson: string): HostWorldSnapshot {
  const scene = JSON.parse(sceneJson) as {
    world?: {
      entities?: Array<{
        entity: number;
        name?: string | null;
        parent?: number | null;
        siblingIndex?: number;
        active?: boolean;
        components?: Record<string, unknown>;
      }>;
      frame?: number;
      simFrame?: number;
      sim_frame?: number;
      clearColor?: [number, number, number, number];
      clear_color?: [number, number, number, number];
      selected?: number | null;
    };
  };
  const world = scene.world ?? {};
  return {
    entities: (world.entities ?? []).map((entity) => ({
      entity: entity.entity,
      name: entity.name,
      parent: entity.parent,
      sibling_index: entity.siblingIndex ?? 0,
      active: entity.active ?? true,
      components: entity.components ?? {},
    })),
    frame: world.frame ?? 0,
    sim_frame: world.sim_frame ?? world.simFrame ?? 0,
    clear_color: world.clear_color ?? world.clearColor ?? [0.1, 0.1, 0.14, 1],
    selected: world.selected,
  };
}

export async function persistDesktopScene(
  sceneJson: string,
  name: string,
): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    currentProject = await invoke<ProjectSnapshot>('persist_scene_snapshot', {
      relativePath: `Assets/Scenes/${name}.mscene`,
      snapshot: browserWorldToHost(sceneJson),
    });
    return currentProject;
  });
}

export async function openDesktopScene(name: string): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    currentProject = await openProjectScene(`Assets/Scenes/${name}.mscene`);
    return currentProject;
  });
}

export async function renameDesktopScene(
  oldName: string,
  newName: string,
): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    currentProject = await renameProjectScene(oldName, newName);
    return currentProject;
  });
}

export async function deleteDesktopScene(name: string): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    currentProject = await deleteProjectScene(name);
    return currentProject;
  });
}

export async function checkpointDesktopScene(sceneJson: string): Promise<SceneRecoveryInfo | null> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) return null;
    const result = await invoke<{
      snapshot: ProjectSnapshot;
      recovery: SceneRecoveryInfo | null;
    }>('checkpoint_scene_snapshot', {
      snapshot: browserWorldToHost(sceneJson),
    });
    currentProject = result.snapshot;
    return result.recovery;
  });
}

export async function getDesktopSceneRecovery(): Promise<SceneRecoveryInfo | null> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) return null;
    return getSceneRecovery();
  });
}

export async function restoreDesktopSceneRecovery(): Promise<{
  snapshot: ProjectSnapshot;
  sceneJson: string;
}> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    currentProject = await restoreSceneRecovery();
    return {
      snapshot: currentProject,
      sceneJson: projectSnapshotAsSceneJson(currentProject),
    };
  });
}

export async function discardDesktopSceneRecovery(): Promise<void> {
  await enqueueSessionOperation(async () => {
    if (!currentProject) return;
    await discardSceneRecovery();
  });
}
