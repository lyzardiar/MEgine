/** Texture / sprite assets under project/Assets (via Vite `/__mengine`). */

import { invoke } from '@tauri-apps/api/core';
import { isDesktopEditor } from './transport/editorTransport';

const API = '/__mengine';

export type SpriteAsset = {
  /** e.g. Assets/Test/Hurt.png */
  id: string;
  name: string;
  folder: string;
  relPath: string;
};

let _sprites: SpriteAsset[] = [];
let _folders: string[] = [];
let _ready = false;

export function listSprites(): SpriteAsset[] {
  return _sprites;
}

/** Dynamic Assets/* folders that contain files (plus known roots). */
export function listAssetFolders(): string[] {
  return _folders;
}

export async function refreshSprites(): Promise<SpriteAsset[]> {
  try {
    if (isDesktopEditor()) {
      _sprites = await invoke<SpriteAsset[]>('list_project_sprites');
      _folders = [...new Set([
        'Assets',
        ..._sprites.flatMap((sprite) => {
          const parts = sprite.folder.split('/');
          return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
        }),
      ])].sort((a, b) => a.localeCompare(b));
      _ready = true;
      return _sprites;
    }
    const res = await fetch(`${API}/sprites`);
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as {
      sprites?: SpriteAsset[];
      folders?: string[];
    };
    _sprites = Array.isArray(body.sprites) ? body.sprites : [];
    _folders = Array.isArray(body.folders) ? body.folders : [];
  } catch {
    _sprites = [];
    _folders = [];
  }
  _ready = true;
  return _sprites;
}

export function isSpriteLibraryReady() {
  return _ready;
}

/**
 * Normalize OS / IDE / Project drag payload → Assets-relative sprite id.
 * e.g. D:\\...\\Assets\\Test\\Hurt.png → Assets/Test/Hurt.png
 */
export function normalizeSpriteRef(raw: string): string {
  let s = (raw ?? '').trim();
  if (!s) return 'white';
  // text/uri-list may be multi-line
  s = s.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? s;
  s = s.replace(/\\/g, '/');
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  s = s.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');

  const lower = s.toLowerCase();
  const marker = '/assets/';
  const idx = lower.lastIndexOf(marker);
  if (idx >= 0) {
    s = 'Assets/' + s.slice(idx + marker.length);
  } else if (lower.startsWith('assets/')) {
    s = 'Assets/' + s.slice('assets/'.length);
  } else if (/^[a-z]:\//i.test(s) || s.startsWith('/')) {
    // Absolute path outside project marker — keep filename only
    s = s.split('/').pop() || s;
  }

  s = s.replace(/^\/+/, '');
  if (!s || s === 'white' || s.toLowerCase() === 'white.png') return 'white';
  return s;
}

/** Dev URL to load a project texture in <img> / canvas. */
export function resolveSpriteId(raw: string): string {
  const n = normalizeSpriteRef(raw);
  if (!n || n === 'white') return 'white';
  if (n.toLowerCase().startsWith('assets/')) return n;
  const lower = n.toLowerCase();
  const withPng = lower.endsWith('.png') ? lower : `${lower}.png`;
  const hit = _sprites.find(
    (s) =>
      s.name.toLowerCase() === lower ||
      s.name.toLowerCase() === withPng ||
      s.id.toLowerCase().endsWith('/' + withPng) ||
      s.id.toLowerCase().endsWith('/' + lower),
  );
  return hit?.id ?? n;
}

export function spriteAssetUrl(id: string): string | null {
  const ref = resolveSpriteId(id);
  if (!ref || ref === 'white') return null;
  const withExt = /\.(png|jpe?g|webp|gif)$/i.test(ref) ? ref : `${ref}.png`;
  if (!withExt.toLowerCase().startsWith('assets/')) return null;
  if (isDesktopEditor()) return null;
  return `${API}/asset/${withExt.split('/').map(encodeURIComponent).join('/')}`;
}

export function spriteDisplayName(id: string): string {
  const ref = normalizeSpriteRef(id);
  if (ref === 'white') return 'white';
  return ref.split('/').pop() || ref;
}
