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
    | 'audio'
    | 'material'
    | 'shader'
    | 'model'
    | 'prefab'
    | 'sprite-atlas'
    | 'texture'
    | 'spine-json'
    | 'spine-binary'
    | 'spine-atlas';
};

let projectFiles: ProjectFileAsset[] = [];
let audioPreview: { path: string; audio: HTMLAudioElement; url: string } | null = null;

export function listProjectFiles(): ProjectFileAsset[] {
  return projectFiles;
}

export async function refreshProjectFiles(): Promise<ProjectFileAsset[]> {
  try {
    if (isDesktopEditor()) {
      projectFiles = await invoke<ProjectFileAsset[]>('list_project_assets');
    } else {
      const response = await fetch('/__mengine/assets');
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as { assets?: ProjectFileAsset[] };
      projectFiles = Array.isArray(body.assets) ? body.assets : [];
    }
  } catch {
    projectFiles = [];
  }
  return projectFiles;
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
    const bytes = await invoke<number[]>('read_project_asset', { relativePath: normalized });
    return Uint8Array.from(bytes);
  }
  const response = await fetch(projectAssetUrl(normalized));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${normalized}`);
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
  if (isDesktopEditor()) {
    await invoke('write_project_asset', {
      relativePath: normalized,
      contents: Array.from(contents),
    });
    return;
  }
  const copy = new Uint8Array(contents.byteLength);
  copy.set(contents);
  const response = await fetch(projectAssetUrl(normalized), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: copy,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${normalized}`);
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
