import { invoke } from '@tauri-apps/api/core';
import { findProjectAssetReferences, type AssetReferenceReport } from './assetReferences.ts';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  resetProjectAssetWatchBaseline,
  type ProjectFileAsset,
} from './projectAssets.ts';
import { isDesktopEditor } from './transport/editorTransport.ts';

export type AssetTrashEntry = {
  trashId: string;
  originalPath: string;
  guid: string;
  trashedAtMs: number;
  size: number;
  hasSpriteImport: boolean;
  recordRevision: string;
};

export type AssetTrashPlan = {
  sourcePath: string;
  sourceRevision: string;
  sourceGuid: string;
  treeRevision: string;
  manifestRevision: string;
  referenceReport: AssetReferenceReport;
};

export type AssetTrashResult = { entry: AssetTrashEntry };

export type AssetTrashInventory = {
  entries: AssetTrashEntry[];
  invalidEntries: number;
};

export type AssetRestoreResult = {
  trashId: string;
  restoredPath: string;
  guid: string;
};

function samePath(left: string, right: string): boolean {
  return left.replace(/\\/g, '/').toLocaleLowerCase()
    === right.replace(/\\/g, '/').toLocaleLowerCase();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

type AssetDeleteSnapshot = {
  treeRevision: string;
  manifestRevision: string;
  manifestReferences: Array<{ location: string; reference: string }>;
};

async function getProjectAssetDeleteSnapshot(sourcePath: string): Promise<AssetDeleteSnapshot> {
  if (isDesktopEditor()) {
    return invoke<AssetDeleteSnapshot>('get_project_asset_delete_snapshot', { sourcePath });
  }
  return fetchJson<AssetDeleteSnapshot>('/__mengine/assets/delete-snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourcePath }),
  });
}

export function buildAssetTrashPlan(
  sourcePathRaw: string,
  source: Pick<ProjectFileAsset, 'relPath' | 'revision' | 'guid' | 'kind' | 'metaStatus'>,
  treeRevision: string,
  manifestRevision: string,
  report: AssetReferenceReport,
): AssetTrashPlan {
  const sourcePath = normalizeProjectAssetPath(sourcePathRaw);
  if (!samePath(source.relPath, sourcePath)) throw new Error('source asset is stale');
  if (source.kind === 'scene') throw new Error('scenes use the dedicated scene lifecycle');
  if (source.kind === 'sprite-import') {
    throw new Error('Sprite Import metadata moves to Trash with its source texture');
  }
  if (source.metaStatus !== 'ready' || !source.guid) {
    throw new Error('asset metadata must be healthy before moving to Trash');
  }
  return {
    sourcePath,
    sourceRevision: source.revision,
    sourceGuid: source.guid,
    treeRevision,
    manifestRevision,
    referenceReport: {
      ...report,
      // References stored inside the deleted asset disappear with it and do
      // not keep any surviving project object dependent on the Trash entry.
      references: report.references.filter((reference) => (
        !samePath(reference.sourcePath, sourcePath)
        && !samePath(reference.sourcePath, `${sourcePath}.sprite.json`)
      )),
    },
  };
}

export async function prepareProjectAssetTrash(sourcePathRaw: string): Promise<AssetTrashPlan> {
  const sourcePath = normalizeProjectAssetPath(sourcePathRaw);
  const before = await getProjectAssetDeleteSnapshot(sourcePath);
  const report = await findProjectAssetReferences(sourcePath);
  const after = await getProjectAssetDeleteSnapshot(sourcePath);
  if (
    before.treeRevision !== after.treeRevision
    || before.manifestRevision !== after.manifestRevision
  ) {
    throw new Error('project assets changed during the reference scan; preview again');
  }
  const source = listProjectFiles().find((asset) => samePath(asset.relPath, sourcePath));
  if (!source) throw new Error(`asset not found: ${sourcePath}`);
  return buildAssetTrashPlan(sourcePath, source, after.treeRevision, after.manifestRevision, {
    ...report,
    scannedFiles: report.scannedFiles + 1,
    references: [
      ...report.references,
      ...after.manifestReferences.map((reference) => ({
        sourcePath: 'project.json',
        location: reference.location,
        reference: reference.reference,
        kind: 'exact' as const,
        snippet: reference.reference,
      })),
    ],
  });
}

export async function applyProjectAssetTrash(plan: AssetTrashPlan): Promise<AssetTrashResult> {
  const request = {
    sourcePath: plan.sourcePath,
    expectedSourceRevision: plan.sourceRevision,
    expectedGuid: plan.sourceGuid,
    expectedTreeRevision: plan.treeRevision,
    expectedManifestRevision: plan.manifestRevision,
  };
  const result = isDesktopEditor()
    ? await invoke<AssetTrashResult>('trash_project_asset', { request })
    : await fetchJson<AssetTrashResult>('/__mengine/assets/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  await resetProjectAssetWatchBaseline();
  return result;
}

export async function listProjectAssetTrash(): Promise<AssetTrashInventory> {
  const inventory = isDesktopEditor()
    ? await invoke<AssetTrashInventory>('list_project_asset_trash')
    : await fetchJson<AssetTrashInventory>('/__mengine/assets/trash');
  return {
    entries: inventory.entries
      .filter((entry) => (
      typeof entry.trashId === 'string'
      && typeof entry.originalPath === 'string'
      && typeof entry.guid === 'string'
      && typeof entry.recordRevision === 'string'
      ))
      .sort((left, right) => (
        right.trashedAtMs - left.trashedAtMs
        || left.originalPath.localeCompare(right.originalPath)
      )),
    invalidEntries: Number.isSafeInteger(inventory.invalidEntries)
      ? Math.max(0, inventory.invalidEntries)
      : 0,
  };
}

export async function restoreProjectAsset(entry: AssetTrashEntry): Promise<AssetRestoreResult> {
  const request = {
    trashId: entry.trashId,
    expectedRecordRevision: entry.recordRevision,
  };
  const result = isDesktopEditor()
    ? await invoke<AssetRestoreResult>('restore_project_asset', { request })
    : await fetchJson<AssetRestoreResult>('/__mengine/assets/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  await resetProjectAssetWatchBaseline();
  return result;
}
