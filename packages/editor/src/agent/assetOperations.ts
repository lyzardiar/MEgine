import type {
  AssetDuplicatePlan,
  AssetRenamePlan,
} from '../assetRename';
import type {
  AssetDeleteSnapshot,
  AssetTrashEntry,
  AssetTrashInventory,
  AssetTrashPlan,
} from '../assetTrash';
import type { AssetReference } from '../assetReferences';
import {
  diffProjectFiles,
  listProjectFiles,
  normalizeProjectAssetPath,
  refreshProjectFiles,
  type ProjectFileAsset,
} from '../projectAssets';
import {
  PROJECT_ASSETS_CHANGED_EVENT,
  PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT,
  broadcastProjectAssetsChanged,
  type ProjectAssetLifecycleDetail,
} from '../assetEditorEvents';
import { BridgeError } from './protocol';

const REFERENCE_PREVIEW_LIMIT = 200;
const assetRenameApi = () => import('../assetRename');
const assetTrashApi = () => import('../assetTrash');

type AssetMutationGuard = () => Promise<void>;
type AssetOperationLogger = (message: string) => void;

type ReferencePreview = {
  total: number;
  truncated: boolean;
  items: AssetReference[];
};

export type AssetRenamePreview = {
  operation: 'rename';
  previewToken: string;
  sourcePath: string;
  destinationPath: string;
  sourceRevision: string;
  sourceGuid: string;
  scannedFiles: number;
  skippedFiles: number;
  projectTreeRevision: string;
  manifestRevision: string;
  manifestReferences: {
    total: number;
    truncated: boolean;
    items: Array<{ location: string; reference: string }>;
  };
  automaticUpdates: Array<{
    sourcePath: string;
    expectedRevision: string;
    bytes: number;
  }>;
  updateBytes: number;
  manualReferences: ReferencePreview;
};

export type AssetDuplicatePreview = {
  operation: 'duplicate';
  previewToken: string;
  sourcePath: string;
  destinationPath: string;
  sourceRevision: string;
  sourceGuid: string;
  copiedBytes: number;
  rewritesOwnContents: boolean;
  manualReferences: ReferencePreview;
};

export type AssetTrashPreview = {
  operation: 'trash';
  previewToken: string;
  sourcePath: string;
  sourceRevision: string;
  sourceGuid: string;
  scannedFiles: number;
  skippedFiles: number;
  references: ReferencePreview;
  referenceScanTruncated: boolean;
};

export class AgentAssetOperations {
  constructor(
    private readonly assertMutationAllowed: AssetMutationGuard,
    private readonly log: AssetOperationLogger,
  ) {}

  async previewRename(sourcePathRaw: string, destinationPathRaw: string): Promise<AssetRenamePreview> {
    const sourcePath = normalizePath(sourcePathRaw);
    const destinationPath = normalizePath(destinationPathRaw);
    const [
      { prepareProjectAssetRename },
      { getProjectAssetDeleteSnapshot },
    ] = await Promise.all([assetRenameApi(), assetTrashApi()]);
    const [plan, manifestSnapshot] = await assetIo(
      'Failed to prepare asset rename',
      () => Promise.all([
        prepareProjectAssetRename(sourcePath, destinationPath),
        getProjectAssetDeleteSnapshot(sourcePath),
      ]),
    );
    return renamePreview(plan, manifestSnapshot);
  }

  async rename(options: {
    sourcePath: string;
    destinationPath: string;
    previewToken: string;
    allowManualReferences: boolean;
    allowSkippedFiles: boolean;
  }): Promise<{
    sourcePath: string;
    destinationPath: string;
    updatedPaths: string[];
    changedFiles: number;
  }> {
    await this.assertMutationAllowed();
    const preview = await this.previewRename(options.sourcePath, options.destinationPath);
    requireCurrentPreview(options.previewToken, preview.previewToken);
    if (preview.manualReferences.total > 0 && !options.allowManualReferences) {
      throw new BridgeError(
        'CONFLICT',
        'Rename has references that cannot be rewritten automatically; inspect the preview and pass allowManualReferences=true',
        preview.manualReferences,
      );
    }
    if (preview.skippedFiles > 0 && !options.allowSkippedFiles) {
      throw new BridgeError(
        'CONFLICT',
        'Rename reference scanning skipped files; inspect the preview and pass allowSkippedFiles=true',
        { skippedFiles: preview.skippedFiles },
      );
    }
    await this.assertMutationAllowed();
    const {
      applyProjectAssetRename,
      prepareProjectAssetRename,
    } = await assetRenameApi();
    const { getProjectAssetDeleteSnapshot } = await assetTrashApi();
    const [plan, manifestSnapshot] = await assetIo(
      'Asset rename preview became stale',
      () => Promise.all([
        prepareProjectAssetRename(preview.sourcePath, preview.destinationPath),
        getProjectAssetDeleteSnapshot(preview.sourcePath),
      ]),
    );
    const currentPreview = await renamePreview(plan, manifestSnapshot);
    requireCurrentPreview(options.previewToken, currentPreview.previewToken);
    const before = cloneAssets(listProjectFiles());
    const result = await assetIo(
      'Asset rename failed',
      () => applyProjectAssetRename(plan),
    );
    const changedFiles = await publishChanges(before, {
      action: 'renamed',
      sourcePath: result.sourcePath,
      destinationPath: result.destinationPath,
    });
    this.log(
      `Renamed ${result.sourcePath} to ${result.destinationPath} from AgentBridge; `
      + `updated ${result.updatedPaths.length} dependent file(s).`,
    );
    return { ...result, changedFiles };
  }

  async previewDuplicate(
    sourcePathRaw: string,
    destinationPathRaw: string,
  ): Promise<AssetDuplicatePreview> {
    const sourcePath = normalizePath(sourcePathRaw);
    const destinationPath = normalizePath(destinationPathRaw);
    const { prepareProjectAssetDuplicate } = await assetRenameApi();
    const plan = await assetIo(
      'Failed to prepare asset duplicate',
      () => prepareProjectAssetDuplicate(sourcePath, destinationPath),
    );
    return duplicatePreview(plan);
  }

  async duplicate(options: {
    sourcePath: string;
    destinationPath: string;
    previewToken: string;
    allowManualReferences: boolean;
  }): Promise<{
    sourcePath: string;
    destinationPath: string;
    guid: string;
    changedFiles: number;
  }> {
    await this.assertMutationAllowed();
    const preview = await this.previewDuplicate(options.sourcePath, options.destinationPath);
    requireCurrentPreview(options.previewToken, preview.previewToken);
    if (preview.manualReferences.total > 0 && !options.allowManualReferences) {
      throw new BridgeError(
        'CONFLICT',
        'Duplicate has source references requiring review; inspect the preview and pass allowManualReferences=true',
        preview.manualReferences,
      );
    }
    await this.assertMutationAllowed();
    const {
      applyProjectAssetDuplicate,
      prepareProjectAssetDuplicate,
    } = await assetRenameApi();
    const plan = await assetIo(
      'Asset duplicate preview became stale',
      () => prepareProjectAssetDuplicate(preview.sourcePath, preview.destinationPath),
    );
    const currentPreview = await duplicatePreview(plan);
    requireCurrentPreview(options.previewToken, currentPreview.previewToken);
    const before = cloneAssets(listProjectFiles());
    const result = await assetIo(
      'Asset duplicate failed',
      () => applyProjectAssetDuplicate(plan),
    );
    const changedFiles = await publishChanges(before, {
      action: 'created',
      destinationPath: result.destinationPath,
    });
    this.log(
      `Duplicated ${result.sourcePath} to ${result.destinationPath} from AgentBridge `
      + `with new GUID ${result.guid}.`,
    );
    return { ...result, changedFiles };
  }

  async previewTrash(sourcePathRaw: string): Promise<AssetTrashPreview> {
    const sourcePath = normalizePath(sourcePathRaw);
    const { prepareProjectAssetTrash } = await assetTrashApi();
    const plan = await assetIo(
      'Failed to prepare asset Trash transaction',
      () => prepareProjectAssetTrash(sourcePath),
    );
    return trashPreview(plan);
  }

  async trash(options: {
    sourcePath: string;
    previewToken: string;
    allowSkippedFiles: boolean;
  }): Promise<{
    entry: AssetTrashEntry;
    changedFiles: number;
  }> {
    await this.assertMutationAllowed();
    const preview = await this.previewTrash(options.sourcePath);
    requireCurrentPreview(options.previewToken, preview.previewToken);
    if (preview.referenceScanTruncated || preview.references.total > 0) {
      throw new BridgeError(
        'CONFLICT',
        'Asset is still referenced or the reference scan was truncated; Trash is blocked',
        {
          references: preview.references,
          referenceScanTruncated: preview.referenceScanTruncated,
        },
      );
    }
    if (preview.skippedFiles > 0 && !options.allowSkippedFiles) {
      throw new BridgeError(
        'CONFLICT',
        'Trash reference scanning skipped files; inspect the preview and pass allowSkippedFiles=true',
        { skippedFiles: preview.skippedFiles },
      );
    }
    await this.assertMutationAllowed();
    const {
      applyProjectAssetTrash,
      prepareProjectAssetTrash,
    } = await assetTrashApi();
    const plan = await assetIo(
      'Asset Trash preview became stale',
      () => prepareProjectAssetTrash(preview.sourcePath),
    );
    const currentPreview = await trashPreview(plan);
    requireCurrentPreview(options.previewToken, currentPreview.previewToken);
    const before = cloneAssets(listProjectFiles());
    const result = await assetIo(
      'Move to project Trash failed',
      () => applyProjectAssetTrash(plan),
    );
    const changedFiles = await publishChanges(before, {
      action: 'deleted',
      sourcePath: result.entry.originalPath,
    });
    this.log(
      `Moved ${result.entry.originalPath} to project Trash from AgentBridge; `
      + 'its GUID is preserved for Restore.',
    );
    return { ...result, changedFiles };
  }

  async listTrash(): Promise<AssetTrashInventory> {
    const { listProjectAssetTrash } = await assetTrashApi();
    return assetIo('Failed to list project Trash', () => listProjectAssetTrash());
  }

  async restore(options: {
    trashId: string;
    expectedRecordRevision: string;
  }): Promise<{
    trashId: string;
    restoredPath: string;
    guid: string;
    changedFiles: number;
  }> {
    await this.assertMutationAllowed();
    const inventory = await this.listTrash();
    const entry = inventory.entries.find((candidate) => candidate.trashId === options.trashId);
    if (!entry) {
      throw new BridgeError('STALE_REVISION', `Trash entry no longer exists: ${options.trashId}`);
    }
    if (entry.recordRevision !== options.expectedRecordRevision) {
      throw new BridgeError(
        'STALE_REVISION',
        `Trash entry revision changed: expected ${options.expectedRecordRevision}, current ${entry.recordRevision}`,
        {
          trashId: entry.trashId,
          expectedRecordRevision: options.expectedRecordRevision,
          currentRevision: entry.recordRevision,
        },
      );
    }
    await this.assertMutationAllowed();
    const before = cloneAssets(await refreshProjectFiles());
    const { restoreProjectAsset } = await assetTrashApi();
    const result = await assetIo(
      'Asset Restore failed',
      () => restoreProjectAsset(entry),
    );
    const changedFiles = await publishChanges(before, {
      action: 'restored',
      destinationPath: result.restoredPath,
    });
    this.log(
      `Restored ${result.restoredPath} from project Trash via AgentBridge `
      + `with GUID ${result.guid}.`,
    );
    return { ...result, changedFiles };
  }
}

async function renamePreview(
  plan: AssetRenamePlan,
  manifestSnapshot: AssetDeleteSnapshot,
): Promise<AssetRenamePreview> {
  const previewToken = await planToken({
    sourcePath: plan.sourcePath,
    destinationPath: plan.destinationPath,
    sourceRevision: plan.sourceRevision,
    sourceGuid: plan.sourceGuid,
    automaticUpdates: plan.automaticUpdates.map((update) => ({
      sourcePath: update.sourcePath,
      expectedRevision: update.expectedRevision,
    })),
    manualReferences: plan.manualReferences,
    scannedFiles: plan.scannedFiles,
    skippedFiles: plan.skippedFiles,
    projectTreeRevision: manifestSnapshot.treeRevision,
    manifestRevision: manifestSnapshot.manifestRevision,
    manifestReferences: manifestSnapshot.manifestReferences,
    updateBytes: plan.updateBytes,
  });
  return {
    operation: 'rename',
    previewToken,
    sourcePath: plan.sourcePath,
    destinationPath: plan.destinationPath,
    sourceRevision: plan.sourceRevision,
    sourceGuid: plan.sourceGuid,
    scannedFiles: plan.scannedFiles,
    skippedFiles: plan.skippedFiles,
    projectTreeRevision: manifestSnapshot.treeRevision,
    manifestRevision: manifestSnapshot.manifestRevision,
    manifestReferences: {
      total: manifestSnapshot.manifestReferences.length,
      truncated: manifestSnapshot.manifestReferences.length > REFERENCE_PREVIEW_LIMIT,
      items: structuredClone(
        manifestSnapshot.manifestReferences.slice(0, REFERENCE_PREVIEW_LIMIT),
      ),
    },
    automaticUpdates: plan.automaticUpdates.map((update) => ({
      sourcePath: update.sourcePath,
      expectedRevision: update.expectedRevision,
      bytes: new TextEncoder().encode(update.contents).byteLength,
    })),
    updateBytes: plan.updateBytes,
    manualReferences: referencePreview(plan.manualReferences),
  };
}

async function duplicatePreview(plan: AssetDuplicatePlan): Promise<AssetDuplicatePreview> {
  const previewToken = await planToken({
    sourcePath: plan.sourcePath,
    destinationPath: plan.destinationPath,
    sourceRevision: plan.sourceRevision,
    sourceGuid: plan.sourceGuid,
    contentsRewritten: plan.contents != null,
    manualReferences: plan.manualReferences,
    copiedBytes: plan.copiedBytes,
  });
  return {
    operation: 'duplicate',
    previewToken,
    sourcePath: plan.sourcePath,
    destinationPath: plan.destinationPath,
    sourceRevision: plan.sourceRevision,
    sourceGuid: plan.sourceGuid,
    copiedBytes: plan.copiedBytes,
    rewritesOwnContents: plan.contents != null,
    manualReferences: referencePreview(plan.manualReferences),
  };
}

async function trashPreview(plan: AssetTrashPlan): Promise<AssetTrashPreview> {
  const report = plan.referenceReport;
  const previewToken = await planToken({
    sourcePath: plan.sourcePath,
    sourceRevision: plan.sourceRevision,
    sourceGuid: plan.sourceGuid,
    treeRevision: plan.treeRevision,
    manifestRevision: plan.manifestRevision,
    referenceReport: report,
  });
  return {
    operation: 'trash',
    previewToken,
    sourcePath: plan.sourcePath,
    sourceRevision: plan.sourceRevision,
    sourceGuid: plan.sourceGuid,
    scannedFiles: report.scannedFiles,
    skippedFiles: report.skippedFiles,
    references: referencePreview(report.references),
    referenceScanTruncated: report.truncated,
  };
}

function referencePreview(references: readonly AssetReference[]): ReferencePreview {
  return {
    total: references.length,
    truncated: references.length > REFERENCE_PREVIEW_LIMIT,
    items: structuredClone(references.slice(0, REFERENCE_PREVIEW_LIMIT)),
  };
}

async function planToken(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireCurrentPreview(expected: string, current: string): void {
  if (expected === current) return;
  throw new BridgeError(
    'STALE_REVISION',
    'Asset transaction preview is stale; preview the operation again',
    { expectedPreviewToken: expected, currentPreviewToken: current },
  );
}

function normalizePath(path: string): string {
  try {
    return normalizeProjectAssetPath(path);
  } catch (error) {
    throw new BridgeError(
      'INVALID_ARGS',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function cloneAssets(assets: readonly ProjectFileAsset[]): ProjectFileAsset[] {
  return structuredClone([...assets]);
}

async function publishChanges(
  before: readonly ProjectFileAsset[],
  lifecycle: ProjectAssetLifecycleDetail,
): Promise<number> {
  const after = await refreshProjectFiles();
  const changes = diffProjectFiles(before, after);
  if (lifecycle.action === 'renamed' || lifecycle.action === 'deleted') {
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, {
      detail: { ...lifecycle, remote: true, source: 'agent' },
    }));
  }
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
    detail: { changes, source: 'agent' },
  }));
  broadcastProjectAssetsChanged(lifecycle);
  return changes.length;
}

async function assetIo<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLocaleLowerCase();
    if (
      lower.includes('changed')
      || lower.includes('stale')
      || lower.includes('revision')
      || lower.includes('preview again')
    ) {
      throw new BridgeError('STALE_REVISION', `${label}: ${message}`);
    }
    if (
      lower.includes('already exists')
      || lower.includes('still referenced')
    ) {
      throw new BridgeError('CONFLICT', `${label}: ${message}`);
    }
    if (
      lower.includes('must preserve')
      || lower.includes('must be')
      || lower.includes('cannot be renamed')
      || lower.includes('dedicated scene')
      || lower.includes('save as instead')
      || lower.includes('sprite import metadata')
      || lower.includes('subresources')
      || lower.includes('destination must be different')
    ) {
      throw new BridgeError('INVALID_ARGS', `${label}: ${message}`);
    }
    throw new BridgeError('IO_ERROR', `${label}: ${message}`);
  }
}
