import {
  closeProject,
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
import { resetProjectAssetState } from '../projectAssets';

export type DesktopProjectMetadata = Omit<ProjectSnapshot, 'world'>;
let currentProject: (DesktopProjectMetadata & { world?: HostWorldSnapshot }) | null = null;
let sessionQueue: Promise<void> = Promise.resolve();
let sceneGeneration = 0;

function enqueueSessionOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionQueue.then(operation, operation);
  sessionQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function getDesktopProject(): DesktopProjectMetadata | null {
  return currentProject;
}

/** Attach a newly-created WebView to the project already owned by the Rust host. */
export async function attachDesktopProject(): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    resetProjectAssetState();
    try {
      const fullProject = currentProject = await getProjectSnapshot();
      resetProjectAssetState();
      sceneGeneration++;
      return fullProject;
    } catch (error) {
      currentProject = null;
      throw error;
    }
  });
}

export async function startDesktopProject(root: string): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    resetProjectAssetState();
    const fullProject = currentProject = await openProject(root);
    resetProjectAssetState();
    sceneGeneration++;
    return fullProject;
  });
}

export async function createDesktopProject(
  parent: string,
  name: string,
): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    resetProjectAssetState();
    const fullProject = currentProject = await createProject(parent, name);
    resetProjectAssetState();
    sceneGeneration++;
    return fullProject;
  });
}

export async function closeDesktopProject(
  discardDirty: boolean,
): Promise<{ closedWindows: string[] }> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    const result = await closeProject(discardDirty);
    currentProject = null;
    sceneGeneration++;
    resetProjectAssetState();
    return result;
  });
}

export async function desktopProjectSceneJson(): Promise<string | null> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) return null;
    // MiYu: request the canonical world only when a caller needs it, never for a recovery acknowledgement.
    if (!currentProject.world) currentProject = await getProjectSnapshot();
    return projectSnapshotAsSceneJson({ ...currentProject, world: currentProject.world! });
  });
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
        tag?: string;
        layer?: number;
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
      tag: entity.tag ?? 'Untagged',
      layer: entity.layer ?? 0,
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
    const previousProject = currentProject;
    const fullProject = currentProject = await invoke<ProjectSnapshot>('persist_scene_snapshot', {
      relativePath: `Assets/Scenes/${name}.mscene`,
      snapshot: browserWorldToHost(sceneJson),
    });
    if (previousProject.projectId !== fullProject.projectId || previousProject.scenePath !== fullProject.scenePath) sceneGeneration++;
    return fullProject;
  });
}

export async function openDesktopScene(name: string): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    const fullProject = currentProject = await openProjectScene(`Assets/Scenes/${name}.mscene`);
    sceneGeneration++;
    return fullProject;
  });
}

export async function renameDesktopScene(
  oldName: string,
  newName: string,
): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    const previousProject = currentProject;
    const fullProject = currentProject = await renameProjectScene(oldName, newName);
    if (previousProject.projectId !== fullProject.projectId || previousProject.scenePath !== fullProject.scenePath) sceneGeneration++;
    return fullProject;
  });
}

export async function deleteDesktopScene(
  name: string,
  expectedRevision?: string,
): Promise<ProjectSnapshot> {
  return enqueueSessionOperation(async () => {
    if (!currentProject) throw new Error('no desktop project is open');
    const previousProject = currentProject;
    const fullProject = currentProject = await deleteProjectScene(name, expectedRevision);
    if (previousProject.projectId !== fullProject.projectId || previousProject.scenePath !== fullProject.scenePath) sceneGeneration++;
    return fullProject;
  });
}

export async function checkpointDesktopScene(sceneJson: string): Promise<SceneRecoveryInfo | null> {
  const expectedGeneration = sceneGeneration;
  const expectedProject = currentProject?.projectId;
  const expectedScene = currentProject?.scenePath;
  return enqueueSessionOperation(async () => {
    if (!currentProject || sceneGeneration !== expectedGeneration || currentProject.projectId !== expectedProject || currentProject.scenePath !== expectedScene) return null;
    const snapshot = browserWorldToHost(sceneJson);
    // A failed durable write can still advance the host world; invalidate before dispatch as well.
    const { world: _world, ...metadata } = currentProject;
    currentProject = metadata;
    const result = await invoke<{
      revision: number;
      documentRevision: number;
      saveRevision: number;
      dirty: boolean;
      recovery: SceneRecoveryInfo | null;
    }>('checkpoint_scene_snapshot', {
      projectId: currentProject.projectId,
      scenePath: currentProject.scenePath,
      snapshot,
    });
    // MiYu: Rust normalizes entities and remaps IDs; invalidate the world instead of treating input as canonical.
    const { recovery, ...revisions } = result;
    currentProject = { ...metadata, ...revisions };
    return recovery;
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
    const fullProject = currentProject = await restoreSceneRecovery();
    sceneGeneration++;
    return {
      snapshot: fullProject,
      sceneJson: projectSnapshotAsSceneJson(fullProject),
    };
  });
}

export async function discardDesktopSceneRecovery(): Promise<void> {
  await enqueueSessionOperation(async () => {
    if (!currentProject) return;
    await discardSceneRecovery();
  });
}
