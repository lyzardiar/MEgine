import type { EditorStore } from './store';
import {
  capturePrefabAsset,
  parsePrefabAsset,
  serializePrefabAsset,
} from './prefabAsset';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from './projectAssets';

function safePrefabName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  return cleaned || 'New Prefab';
}

async function uniquePrefabPath(name: string): Promise<string> {
  await refreshProjectFiles();
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  const base = safePrefabName(name);
  let index = 0;
  while (true) {
    const suffix = index === 0 ? '' : ` ${index}`;
    const path = `Assets/Prefabs/${base}${suffix}.prefab`;
    if (!used.has(path.toLowerCase())) return path;
    index += 1;
  }
}

export async function instantiateProjectPrefab(
  store: EditorStore,
  source: string,
  parent: number | null = null,
): Promise<number> {
  const normalized = normalizeProjectAssetPath(source);
  const prefab = parsePrefabAsset(await readProjectAssetText(normalized));
  const root = store.instantiatePrefabAsset(normalized, prefab, parent);
  if (root == null) throw new Error('prefabs can only be instantiated in Edit mode');
  return root;
}

export async function createProjectPrefabFromSelection(store: EditorStore): Promise<string> {
  const root = store.selected;
  if (root == null) throw new Error('select one hierarchy root to create a prefab');
  const entities = store.authoredEntities();
  const entity = entities.find((candidate) => candidate.entity === root);
  if (!entity) throw new Error('selected entity no longer exists');
  const path = await uniquePrefabPath(entity.name ?? 'New Prefab');
  const captured = capturePrefabAsset(entity.name ?? 'New Prefab', entities, root);
  await writeProjectAssetText(path, serializePrefabAsset(captured.asset));
  store.markPrefabInstance(root, path, captured.nodeIds);
  await refreshProjectFiles();
  return path;
}

export async function applySelectedPrefab(store: EditorStore): Promise<string> {
  const selected = store.selected;
  if (selected == null) throw new Error('select a prefab instance');
  const instance = store.getPrefabInstance(selected);
  if (!instance) throw new Error('selection is not part of a prefab instance');
  const entities = store.authoredEntities();
  const root = entities.find((entity) => entity.entity === instance.root);
  if (!root) throw new Error('prefab instance root no longer exists');
  const captured = capturePrefabAsset(root.name ?? 'Prefab', entities, instance.root, {
    source: instance.source,
  });
  await writeProjectAssetText(instance.source, serializePrefabAsset(captured.asset));
  store.markPrefabInstance(instance.root, instance.source, captured.nodeIds);
  await refreshProjectFiles();
  return instance.source;
}

export async function revertSelectedPrefab(store: EditorStore): Promise<string> {
  const selected = store.selected;
  if (selected == null) throw new Error('select a prefab instance');
  const instance = store.getPrefabInstance(selected);
  if (!instance) throw new Error('selection is not part of a prefab instance');
  const prefab = parsePrefabAsset(await readProjectAssetText(instance.source));
  if (store.revertPrefabInstance(selected, prefab) == null) {
    throw new Error('could not revert prefab instance');
  }
  return instance.source;
}

export function unpackSelectedPrefab(store: EditorStore): string {
  const selected = store.selected;
  if (selected == null) throw new Error('select a prefab instance');
  const instance = store.getPrefabInstance(selected);
  if (!instance || !store.unpackPrefabInstance(selected)) {
    throw new Error('selection is not part of a prefab instance');
  }
  return instance.source;
}
