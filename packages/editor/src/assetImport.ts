import {
  listProjectFiles,
  refreshProjectFiles,
  writeProjectAssetBytes,
} from './projectAssets.ts';
import { listSprites, refreshSprites } from './spriteLibrary.ts';
import { pingProjectAsset } from './pingBus.ts';
import {
  ASSET_IMPORT_ACCEPT,
  ASSET_IMPORT_MAX_BYTES,
  allocateImportedAssetPath,
  formatAssetImportSummary,
  normalizeAssetImportFolder,
  type AssetImportResult,
  type ImportableAssetFile,
} from './assetImportModel.ts';

export {
  ASSET_IMPORT_ACCEPT,
  ASSET_IMPORT_MAX_BYTES,
  allocateImportedAssetPath,
  formatAssetImportSummary,
  normalizeAssetImportFolder,
  sanitizeImportedAssetName,
  validateImportedAssetName,
} from './assetImportModel.ts';
export type {
  AssetImportRejection,
  AssetImportResult,
  ImportableAssetFile,
} from './assetImportModel.ts';

const PROJECT_ASSETS_CHANGED_EVENT = 'mengine:project-assets-changed';

let activeImportFolder = 'Assets';

export function setActiveAssetImportFolder(folder: string): void {
  activeImportFolder = normalizeAssetImportFolder(folder);
}

export function getActiveAssetImportFolder(): string {
  return activeImportFolder;
}

function occupiedProjectPaths(): Set<string> {
  return new Set([
    ...listProjectFiles().map((asset) => asset.relPath),
    ...listSprites().map((sprite) => sprite.textureId ?? sprite.relPath),
  ]);
}

export async function importProjectAssetFiles(
  files: Iterable<ImportableAssetFile>,
  targetFolder = activeImportFolder,
): Promise<AssetImportResult> {
  const folder = normalizeAssetImportFolder(targetFolder);
  const occupied = occupiedProjectPaths();
  const result: AssetImportResult = { imported: [], rejected: [] };

  for (const file of files) {
    let targetPath: string;
    try {
      if (!Number.isFinite(file.size) || file.size < 0) throw new Error('invalid file size');
      if (file.size > ASSET_IMPORT_MAX_BYTES) throw new Error('file exceeds the 64 MiB editor limit');
      targetPath = allocateImportedAssetPath(folder, file.name, occupied);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength !== file.size) throw new Error('file changed while it was being read');
      await writeProjectAssetBytes(targetPath, bytes);
      occupied.add(targetPath);
      result.imported.push(targetPath);
    } catch (error) {
      result.rejected.push({
        name: file.name || '(unnamed)',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (result.imported.length > 0) {
    await Promise.all([refreshProjectFiles(), refreshSprites()]);
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
    window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'project' }));
    window.requestAnimationFrame(() => pingProjectAsset(result.imported[0]));
  }
  return result;
}

export function chooseProjectAssetFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ASSET_IMPORT_ACCEPT;
    input.hidden = true;
    document.body.appendChild(input);

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });
    input.click();
  });
}

export async function importProjectAssetsFromPicker(
  targetFolder = activeImportFolder,
): Promise<AssetImportResult> {
  const files = await chooseProjectAssetFiles();
  if (files.length === 0) return { imported: [], rejected: [] };
  return importProjectAssetFiles(files, targetFolder);
}
