import { invoke } from '@tauri-apps/api/core';
import { isDesktopEditor } from './transport/editorTransport.ts';

const DEV_ASSET_API = '/__mengine/asset';

export type ProjectFileAsset = {
  id: string;
  guid: string | null;
  name: string;
  folder: string;
  relPath: string;
  kind:
    | 'animation'
    | 'animator-controller'
    | 'avatar-mask'
    | 'timeline'
    | 'audio'
    | 'font'
    | 'material'
    | 'shader'
    | 'model'
    | 'prefab'
    | 'sprite-atlas'
    | 'texture'
    | 'spine-json'
    | 'spine-binary'
    | 'spine-atlas'
    | 'scene'
    | 'script'
    | 'sprite-import';
  revision: string;
  size: number;
  metaStatus: 'ready' | 'auxiliary' | 'invalid' | 'duplicate';
  metaError: string | null;
};

export type ProjectAssetChange = {
  type: 'added' | 'modified' | 'deleted';
  relPath: string;
  previous: ProjectFileAsset | null;
  current: ProjectFileAsset | null;
};

export type ProjectAssetImportResult = {
  sourcePath: string;
  sourceRevision: string;
  destinationPath: string;
  asset: ProjectFileAsset;
};

export type ProjectAssetReadOptions = {
  /**
   * Replace an existing optimistic-write baseline with the revision just read.
   * Only a resource editor intentionally loading or reloading its authored
   * document should do this. Incidental previews and Agent reads must preserve
   * an already-open editor's older baseline so stale saves remain blocked.
   */
  replaceWriteBaseline?: boolean;
};

let projectFiles: ProjectFileAsset[] = [];
let watchedProjectFiles: ProjectFileAsset[] = [];
let watchBaselineInitialized = false;
let audioPreview: { path: string; audio: HTMLAudioElement; url: string } | null = null;
const writeBaselines = new Map<string, string>();
const internalWrites = new Map<string, number>();
const acknowledgedRevisions = new Map<string, string | null>();

function assetKey(path: string): string {
  return path.replace(/\\/g, '/').toLocaleLowerCase();
}

export function listProjectFiles(): ProjectFileAsset[] {
  return projectFiles;
}

export function resetProjectAssetState(): void {
  projectFiles = [];
  watchedProjectFiles = [];
  watchBaselineInitialized = false;
  writeBaselines.clear();
  internalWrites.clear();
  acknowledgedRevisions.clear();
  if (audioPreview) {
    audioPreview.audio.pause();
    URL.revokeObjectURL(audioPreview.url);
    audioPreview = null;
  }
}

export function beginInternalProjectFileWrite(relativePath: string): void {
  const key = assetKey(relativePath);
  internalWrites.set(key, (internalWrites.get(key) ?? 0) + 1);
}

export function endInternalProjectFileWrite(relativePath: string): void {
  const key = assetKey(relativePath);
  const depth = internalWrites.get(key) ?? 0;
  if (depth <= 1) internalWrites.delete(key);
  else internalWrites.set(key, depth - 1);
}

export function acknowledgeProjectFileWrite(relativePath: string): void {
  const key = assetKey(relativePath);
  const asset = projectFiles.find((candidate) => assetKey(candidate.relPath) === key);
  acknowledgedRevisions.set(key, asset?.revision ?? null);
}

function normalizeListedAsset(asset: ProjectFileAsset): ProjectFileAsset {
  const metaStatus = ['ready', 'auxiliary', 'invalid', 'duplicate'].includes(asset.metaStatus)
    ? asset.metaStatus
    : 'invalid';
  return {
    ...asset,
    guid: typeof asset.guid === 'string' && asset.guid ? asset.guid.toLowerCase() : null,
    revision: typeof asset.revision === 'string' ? asset.revision : '',
    size: Number.isFinite(asset.size) && asset.size >= 0 ? asset.size : 0,
    metaStatus,
    metaError: typeof asset.metaError === 'string' && asset.metaError ? asset.metaError : null,
  };
}

async function fetchProjectFiles(): Promise<ProjectFileAsset[]> {
  if (isDesktopEditor()) {
    return (await invoke<ProjectFileAsset[]>('list_project_assets')).map(normalizeListedAsset);
  }
  const response = await fetch('/__mengine/assets');
  if (!response.ok) throw new Error(String(response.status));
  const body = await response.json() as { assets?: ProjectFileAsset[] };
  return (Array.isArray(body.assets) ? body.assets : []).map(normalizeListedAsset);
}

export async function refreshProjectFiles(): Promise<ProjectFileAsset[]> {
  try {
    projectFiles = await fetchProjectFiles();
    if (!watchBaselineInitialized) {
      watchedProjectFiles = projectFiles;
      watchBaselineInitialized = true;
    }
  } catch {
    // A transient scan failure must not make the Project window pretend every
    // asset was deleted. The last known-good index remains authoritative.
  }
  return projectFiles;
}

/** Accepts an editor-owned multi-file transaction as the new watcher baseline. */
export async function resetProjectAssetWatchBaseline(): Promise<ProjectFileAsset[]> {
  try {
    projectFiles = await fetchProjectFiles();
    watchedProjectFiles = projectFiles;
    watchBaselineInitialized = true;
  } catch {
    // The disk transaction already committed. Suppress one future diff instead
    // of reporting failure or misclassifying our rename as an external delete.
    watchBaselineInitialized = false;
  }
  writeBaselines.clear();
  acknowledgedRevisions.clear();
  return projectFiles;
}

export function diffProjectFiles(
  previous: readonly ProjectFileAsset[],
  current: readonly ProjectFileAsset[],
): ProjectAssetChange[] {
  const key = (path: string) => path.replace(/\\/g, '/').toLocaleLowerCase();
  const before = new Map(previous.map((asset) => [key(asset.relPath), asset]));
  const after = new Map(current.map((asset) => [key(asset.relPath), asset]));
  const changes: ProjectAssetChange[] = [];
  for (const asset of current) {
    const prior = before.get(key(asset.relPath));
    if (!prior) {
      changes.push({ type: 'added', relPath: asset.relPath, previous: null, current: asset });
    } else if (
      prior.revision !== asset.revision
      || prior.kind !== asset.kind
      || prior.relPath !== asset.relPath
      || prior.guid !== asset.guid
      || prior.metaStatus !== asset.metaStatus
      || prior.metaError !== asset.metaError
    ) {
      changes.push({
        type: 'modified',
        relPath: asset.relPath,
        previous: prior,
        current: asset,
      });
    }
  }
  for (const asset of previous) {
    if (!after.has(key(asset.relPath))) {
      changes.push({ type: 'deleted', relPath: asset.relPath, previous: asset, current: null });
    }
  }
  return changes.sort((left, right) => (
    left.relPath.localeCompare(right.relPath) || left.type.localeCompare(right.type)
  ));
}

export async function pollProjectFileChanges(): Promise<ProjectAssetChange[]> {
  const previous = watchedProjectFiles;
  const current = await fetchProjectFiles();
  if (!watchBaselineInitialized) {
    projectFiles = current;
    watchedProjectFiles = current;
    watchBaselineInitialized = true;
    return [];
  }
  const changes = diffProjectFiles(previous, current).filter((change) => {
    const key = assetKey(change.relPath);
    if (internalWrites.has(key)) return false;
    if (
      acknowledgedRevisions.has(key)
      && acknowledgedRevisions.get(key) === (change.current?.revision ?? null)
    ) {
      acknowledgedRevisions.delete(key);
      return false;
    }
    return true;
  });
  projectFiles = current;
  watchedProjectFiles = current;
  watchBaselineInitialized = true;
  for (const [key, revision] of acknowledgedRevisions) {
    const before = previous.find((asset) => assetKey(asset.relPath) === key)?.revision ?? null;
    const after = current.find((asset) => assetKey(asset.relPath) === key)?.revision ?? null;
    if (before === revision && after === revision) acknowledgedRevisions.delete(key);
  }
  return changes;
}

function acceptWrittenAsset(asset: ProjectFileAsset | null | undefined): void {
  if (!asset) return;
  const normalized = normalizeListedAsset(asset);
  const key = normalized.relPath.toLocaleLowerCase();
  projectFiles = [
    ...projectFiles.filter((candidate) => candidate.relPath.toLocaleLowerCase() !== key),
    normalized,
  ].sort((left, right) => left.relPath.localeCompare(right.relPath));
  watchedProjectFiles = [
    ...watchedProjectFiles.filter((candidate) => candidate.relPath.toLocaleLowerCase() !== key),
    normalized,
  ].sort((left, right) => left.relPath.localeCompare(right.relPath));
  acknowledgedRevisions.set(key, normalized.revision);
}

export function normalizeProjectAssetPath(raw: string): string {
  let value = String(raw ?? '').trim().replace(/\\/g, '/');
  value = value.replace(/^\/+/, '');
  if (value.toLowerCase().startsWith('assets/')) {
    value = `Assets/${value.slice('assets/'.length)}`;
  }
  const segments = value.split('/').filter(Boolean);
  if (segments[0] !== 'Assets' || segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`asset path must be under Assets: ${raw}`);
  }
  return segments.join('/');
}

export function isProjectTextAssetPath(relativePath: string): boolean {
  const lower = normalizeProjectAssetPath(relativePath).toLocaleLowerCase();
  return [
    '.json',
    '.mscene',
    '.prefab',
    '.manim',
    '.mcontroller',
    '.mavatar',
    '.mtimeline',
    '.mmat',
    '.mat',
    '.minst',
    '.mshader',
    '.matlas',
    '.gltf',
    '.atlas',
    '.ts',
    '.js',
    '.mjs',
  ].some((extension) => lower.endsWith(extension));
}

export function resolveProjectAssetPath(baseAsset: string, relative: string): string {
  if (/^assets[\\/]/i.test(relative)) return normalizeProjectAssetPath(relative);
  const base = normalizeProjectAssetPath(baseAsset).split('/');
  base.pop();
  for (const segment of relative.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (base.length <= 1) throw new Error(`asset path escapes Assets: ${relative}`);
      base.pop();
    } else {
      base.push(segment);
    }
  }
  return normalizeProjectAssetPath(base.join('/'));
}

export function projectAssetUrl(relativePath: string): string {
  const normalized = normalizeProjectAssetPath(relativePath);
  return `${DEV_ASSET_API}/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

export async function readProjectAssetBytesWithRevision(
  relativePath: string,
  options: ProjectAssetReadOptions = {},
): Promise<{ contents: Uint8Array; revision: string }> {
  const normalized = normalizeProjectAssetPath(relativePath);
  const key = assetKey(normalized);
  if (isDesktopEditor()) {
    const result = await invoke<{ contents: number[]; revision: string }>('read_project_asset', {
      relativePath: normalized,
    });
    if (options.replaceWriteBaseline || !writeBaselines.has(key)) {
      writeBaselines.set(key, result.revision);
    }
    return {
      contents: Uint8Array.from(result.contents),
      revision: result.revision,
    };
  }
  const response = await fetch(projectAssetUrl(normalized));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${normalized}`);
  const revision = response.headers.get('X-MEngine-Asset-Revision');
  if (!revision) throw new Error(`asset read did not return a revision: ${normalized}`);
  if (options.replaceWriteBaseline || !writeBaselines.has(key)) {
    writeBaselines.set(key, revision);
  }
  return {
    contents: new Uint8Array(await response.arrayBuffer()),
    revision,
  };
}

export async function readProjectAssetBytes(
  relativePath: string,
  options: ProjectAssetReadOptions = {},
): Promise<Uint8Array> {
  return (await readProjectAssetBytesWithRevision(relativePath, options)).contents;
}

export async function readProjectAssetText(
  relativePath: string,
  options: ProjectAssetReadOptions = {},
): Promise<string> {
  return new TextDecoder().decode(await readProjectAssetBytes(relativePath, options));
}

export function projectAssetHasExternalWriteConflict(relativePath: string): boolean {
  const normalized = normalizeProjectAssetPath(relativePath);
  const baseline = writeBaselines.get(assetKey(normalized));
  if (baseline === undefined) return false;
  const current = projectFiles.find(
    (asset) => assetKey(asset.relPath) === assetKey(normalized),
  );
  return (current?.revision ?? null) !== baseline;
}

/** Double-click preview for imported audio without mutating the scene. */
export async function toggleProjectAudioPreview(relativePath: string): Promise<'playing' | 'stopped'> {
  const normalized = normalizeProjectAssetPath(relativePath);
  if (audioPreview) {
    audioPreview.audio.pause();
    URL.revokeObjectURL(audioPreview.url);
    const wasSame = audioPreview.path === normalized;
    audioPreview = null;
    if (wasSame) return 'stopped';
  }
  const bytes = await readProjectAssetBytes(normalized);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const extension = normalized.split('.').pop()?.toLowerCase();
  const mime = extension === 'wav'
    ? 'audio/wav'
    : extension === 'ogg'
      ? 'audio/ogg'
      : extension === 'flac'
        ? 'audio/flac'
        : 'audio/mpeg';
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: mime }));
  const audio = new Audio(url);
  audioPreview = { path: normalized, audio, url };
  const release = () => {
    if (audioPreview?.audio !== audio) return;
    URL.revokeObjectURL(url);
    audioPreview = null;
  };
  audio.addEventListener('ended', release, { once: true });
  audio.addEventListener('error', release, { once: true });
  try {
    await audio.play();
    return 'playing';
  } catch (error) {
    release();
    throw error;
  }
}

export async function writeProjectAssetBytes(
  relativePath: string,
  contents: Uint8Array,
  expectedRevision?: string | null,
): Promise<void> {
  const normalized = normalizeProjectAssetPath(relativePath);
  if (contents.byteLength > 64 * 1024 * 1024) {
    throw new Error('asset exceeds 64 MiB editor limit');
  }
  beginInternalProjectFileWrite(normalized);
  try {
    if (isDesktopEditor()) {
      const result = await invoke<{
        revision: string;
        asset: ProjectFileAsset | null;
      }>('write_project_asset', {
        relativePath: normalized,
        contents: Array.from(contents),
        expectedRevision:
          expectedRevision === undefined
            ? (writeBaselines.get(assetKey(normalized)) ?? null)
            : expectedRevision,
      });
      if (expectedRevision === undefined) {
        writeBaselines.set(assetKey(normalized), result.revision);
      }
      acceptWrittenAsset(result.asset);
      return;
    }
    const copy = new Uint8Array(contents.byteLength);
    copy.set(contents);
    const response = await fetch(projectAssetUrl(normalized), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-MEngine-Expected-Revision':
          expectedRevision === undefined
            ? (writeBaselines.get(assetKey(normalized)) ?? '__missing__')
            : (expectedRevision ?? '__missing__'),
      },
      body: copy,
    });
    if (!response.ok) {
      const detail = await response.text();
      let message = detail;
      try {
        message = (JSON.parse(detail) as { error?: string }).error ?? detail;
      } catch {
        /* plain response */
      }
      throw new Error(message || `${response.status} ${response.statusText}: ${normalized}`);
    }
    const result = await response.json() as {
      revision?: string;
      asset?: ProjectFileAsset | null;
    };
    if (expectedRevision === undefined && result.revision) {
      writeBaselines.set(assetKey(normalized), result.revision);
    }
    acceptWrittenAsset(result.asset);
  } finally {
    endInternalProjectFileWrite(normalized);
  }
}

export async function importExternalProjectAsset(
  sourcePath: string,
  destinationPath: string,
): Promise<ProjectAssetImportResult> {
  if (!isDesktopEditor()) {
    throw new Error('Importing an external local file requires the desktop editor');
  }
  const normalized = normalizeProjectAssetPath(destinationPath);
  beginInternalProjectFileWrite(normalized);
  try {
    const result = await invoke<ProjectAssetImportResult>('import_project_asset', {
      sourcePath,
      destinationPath: normalized,
    });
    writeBaselines.set(assetKey(normalized), result.asset.revision);
    acceptWrittenAsset(result.asset);
    return result;
  } finally {
    endInternalProjectFileWrite(normalized);
  }
}

export async function writeProjectAssetText(
  relativePath: string,
  contents: string,
  expectedRevision?: string | null,
): Promise<void> {
  await writeProjectAssetBytes(
    relativePath,
    new TextEncoder().encode(contents),
    expectedRevision,
  );
}

export async function loadProjectImage(relativePath: string): Promise<HTMLImageElement> {
  let objectUrl: string | null = null;
  const image = new Image();
  if (isDesktopEditor()) {
    const bytes = await readProjectAssetBytes(relativePath);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    objectUrl = URL.createObjectURL(new Blob([copy.buffer]));
    image.src = objectUrl;
  } else {
    image.src = projectAssetUrl(relativePath);
  }
  try {
    await image.decode();
    return image;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
