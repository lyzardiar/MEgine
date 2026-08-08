import type { EditorStore } from './store';
import {
  capturePrefabAsset,
  parsePrefabAsset,
  serializePrefabAsset,
} from './prefabAsset';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetBytesWithRevision,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from './projectAssets';

function safePrefabName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  return cleaned || 'New Prefab';
}

function prefabFolder(folder: string | null | undefined): string {
  const normalized = normalizeProjectAssetPath(folder || 'Assets/Prefabs').replace(/\/$/, '');
  return normalized === 'Assets' || normalized.startsWith('Assets/')
    ? normalized
    : 'Assets/Prefabs';
}

function uniquePrefabPath(name: string, folder: string, used: Set<string>): string {
  const base = safePrefabName(name);
  let index = 0;
  while (true) {
    const suffix = index === 0 ? '' : ` ${index}`;
    const path = `${folder}/${base}${suffix}.prefab`;
    if (!used.has(path.toLowerCase())) {
      used.add(path.toLowerCase());
      return path;
    }
    index += 1;
  }
}

export async function instantiateProjectPrefab(
  store: EditorStore,
  source: string,
  parent: number | null = null,
  position?: [number, number, number],
): Promise<number> {
  const normalized = normalizeProjectAssetPath(source);
  const prefab = parsePrefabAsset(await readProjectAssetText(normalized));
  const root = store.instantiatePrefabAsset(normalized, prefab, parent, position);
  if (root == null) throw new Error('prefabs can only be instantiated in Edit mode');
  return root;
}

export async function createProjectPrefabsFromEntities(
  store: EditorStore,
  roots: readonly number[],
  destinationFolder = 'Assets/Prefabs',
): Promise<string[]> {
  const entities = store.authoredEntities();
  const entityIds = new Set(entities.map((entity) => entity.entity));
  const uniqueRoots = [...new Set(roots)].filter((root) => entityIds.has(root));
  if (!uniqueRoots.length) throw new Error('drag one or more live hierarchy entities');

  // If both a parent and its descendant are selected, the parent Prefab already
  // captures the descendant. Matching Unity here avoids duplicate nested assets.
  const rootSet = new Set(uniqueRoots);
  const topLevelRoots = uniqueRoots.filter((root) => {
    let parent = entities.find((entity) => entity.entity === root)?.parent ?? null;
    while (parent != null) {
      if (rootSet.has(parent)) return false;
      parent = entities.find((entity) => entity.entity === parent)?.parent ?? null;
    }
    return true;
  });

  await refreshProjectFiles();
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  const folder = prefabFolder(destinationFolder);
  const created: string[] = [];
  for (const root of topLevelRoots) {
    const entity = entities.find((candidate) => candidate.entity === root)!;
    const path = uniquePrefabPath(entity.name ?? 'New Prefab', folder, used);
    const captured = capturePrefabAsset(entity.name ?? 'New Prefab', entities, root);
    await writeProjectAssetText(path, serializePrefabAsset(captured.asset), null);
    store.markPrefabInstance(root, path, captured.nodeIds);
    created.push(path);
  }
  await refreshProjectFiles();
  return created;
}

export async function createProjectPrefabFromSelection(store: EditorStore): Promise<string> {
  const root = store.selected;
  if (root == null) throw new Error('select one hierarchy root to create a prefab');
  const [path] = await createProjectPrefabsFromEntities(store, [root]);
  return path;
}

export async function applySelectedPrefab(
  store: EditorStore,
  expectedRevision?: string,
): Promise<string> {
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
  await writeProjectAssetText(
    instance.source,
    serializePrefabAsset(captured.asset),
    expectedRevision,
  );
  store.markPrefabInstance(instance.root, instance.source, captured.nodeIds);
  await refreshProjectFiles();
  return instance.source;
}

export async function revertSelectedPrefab(
  store: EditorStore,
  expectedRevision?: string,
): Promise<string> {
  const selected = store.selected;
  if (selected == null) throw new Error('select a prefab instance');
  const instance = store.getPrefabInstance(selected);
  if (!instance) throw new Error('selection is not part of a prefab instance');
  const source = await readProjectAssetBytesWithRevision(instance.source);
  if (expectedRevision != null && source.revision !== expectedRevision) {
    throw new Error('asset changed on disk since it was loaded');
  }
  const prefab = parsePrefabAsset(new TextDecoder().decode(source.contents));
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
