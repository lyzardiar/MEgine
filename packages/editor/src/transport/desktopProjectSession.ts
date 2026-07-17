import {
  createProject,
  getProjectSnapshot,
  openProject,
  projectSnapshotAsSceneJson,
  saveProjectScene,
  type HostWorldSnapshot,
  type ProjectSnapshot,
} from './editorTransport';
import { invoke } from '@tauri-apps/api/core';

let currentProject: ProjectSnapshot | null = null;

export function getDesktopProject(): ProjectSnapshot | null {
  return currentProject;
}

/** Attach a newly-created WebView to the project already owned by the Rust host. */
export async function attachDesktopProject(): Promise<ProjectSnapshot> {
  currentProject = await getProjectSnapshot();
  return currentProject;
}

export async function startDesktopProject(root: string): Promise<ProjectSnapshot> {
  currentProject = await openProject(root);
  return currentProject;
}

export async function createDesktopProject(
  parent: string,
  name: string,
): Promise<ProjectSnapshot> {
  currentProject = await createProject(parent, name);
  return currentProject;
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

export async function replaceDesktopSceneJson(sceneJson: string): Promise<ProjectSnapshot> {
  if (!currentProject) throw new Error('no desktop project is open');
  currentProject = await invoke<ProjectSnapshot>('replace_scene_snapshot', {
    baseRevision: currentProject.revision,
    snapshot: browserWorldToHost(sceneJson),
  });
  return currentProject;
}

export async function saveDesktopScene(name: string): Promise<ProjectSnapshot> {
  if (!currentProject) throw new Error('no desktop project is open');
  const currentName = currentProject.scenePath?.split('/').pop()?.replace(/\.mscene$/i, '');
  currentProject = await saveProjectScene(
    currentName === name ? undefined : `Assets/Scenes/${name}.mscene`,
  );
  return currentProject;
}
