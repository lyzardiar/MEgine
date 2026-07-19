import { invoke } from '@tauri-apps/api/core';
import { isDesktopEditor } from './transport/editorTransport.ts';

const DEV_ASSET_API = '/__mengine/asset';

export type ProjectFileAsset = {
  id: string;
  name: string;
  folder: string;
  relPath: string;
  kind:
    | 'animation'
    | 'animator-controller'
    | 'avatar-mask'
    | 'timeline'
    | 'audio'
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
};

export type ProjectAssetChange = {
  type: 'added' | 'modified' | 'deleted';
  relPath: string;
  previous: ProjectFileAsset | null;
  current: ProjectFileAsset | null;
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
  return {
    ...asset,
    revision: typeof asset.revision === 'string' ? asset.revision : '',
    size: Number.isFinite(asset.size) && asset.size >= 0 ? asset.size : 0,
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

export async function readProjectAssetBytes(relativePath: string): Promise<Uint8Array> {
  const normalized = normalizeProjectAssetPath(relativePath);
  if (isDesktopEditor()) {
    const result = await invoke<{ contents: number[]; revision: string }>('read_project_asset', {
      relativePath: normalized,
    });
    writeBaselines.set(assetKey(normalized), result.revision);
    return Uint8Array.from(result.contents);
  }
  const response = await fetch(projectAssetUrl(normalized));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${normalized}`);
  const revision = response.headers.get('X-MEngine-Asset-Revision');
  if (revision) writeBaselines.set(assetKey(normalized), revision);
  return new Uint8Array(await response.arrayBuffer());
}

export async function readProjectAssetText(relativePath: string): Promise<string> {
  return new TextDecoder().decode(await readProjectAssetBytes(relativePath));
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
        expectedRevision: writeBaselines.get(assetKey(normalized)) ?? null,
      });
      writeBaselines.set(assetKey(normalized), result.revision);
      acceptWrittenAsset(result.asset);
      return;
    }
    const copy = new Uint8Array(contents.byteLength);
    copy.set(contents);
    const response = await fetch(projectAssetUrl(normalized), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-MEngine-Expected-Revision': writeBaselines.get(assetKey(normalized)) ?? '__missing__',
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
    if (result.revision) writeBaselines.set(assetKey(normalized), result.revision);
    acceptWrittenAsset(result.asset);
  } finally {
    endInternalProjectFileWrite(normalized);
  }
}

export async function writeProjectAssetText(
  relativePath: string,
  contents: string,
): Promise<void> {
  await writeProjectAssetBytes(relativePath, new TextEncoder().encode(contents));
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
