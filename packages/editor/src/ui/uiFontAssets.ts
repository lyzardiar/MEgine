import { listProjectFiles, projectAssetUrl } from '../projectAssets';

const FONT_LOAD_EVENT = 'mengine-ui-font-loaded';
type UiFontFaceEntry = {
  path: string;
  family: string;
  status: 'loading' | 'ready' | 'failed';
  face?: FontFace;
};
const fontFaces = new Map<string, UiFontFaceEntry>();

function portableFontPath(value: string): string {
  const normalized = String(value ?? '').trim().replaceAll('\\', '/');
  return normalized.startsWith('Assets/')
    && /\.(?:ttf|otf)$/i.test(normalized)
    && normalized.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
    ? normalized
    : '';
}

function fontIdentity(normalized: string): { key: string; revision: string } {
  const asset = listProjectFiles().find(
    (candidate) => candidate.relPath.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  );
  const revision = asset ? `${asset.guid ?? 'no-guid'}-${asset.revision}` : 'unindexed';
  return { key: `${normalized.toLocaleLowerCase()}\0${revision}`, revision };
}

function stableFontHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value.toLocaleLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function uiFontFamily(fontPath: string): string {
  const normalized = portableFontPath(fontPath);
  if (!normalized) return 'system-ui, sans-serif';
  const identity = fontIdentity(normalized);
  const normalizedKey = normalized.toLocaleLowerCase();
  for (const [key, entry] of fontFaces) {
    if (entry.path !== normalizedKey || key === identity.key) continue;
    if (entry.face && typeof document !== 'undefined') document.fonts.delete(entry.face);
    fontFaces.delete(key);
  }
  const existing = fontFaces.get(identity.key);
  const family = existing?.family ?? `MEngineFont_${stableFontHash(identity.key)}`;
  if (existing || typeof FontFace !== 'function' || typeof document === 'undefined') {
    return `"${family}", system-ui, sans-serif`;
  }

  const entry: UiFontFaceEntry = { path: normalizedKey, family, status: 'loading' };
  fontFaces.set(identity.key, entry);
  try {
    const url = `${projectAssetUrl(normalized)}?revision=${encodeURIComponent(identity.revision)}`;
    const face = new FontFace(family, `url("${url}")`);
    entry.face = face;
    void face.load().then((loaded) => {
      if (fontFaces.get(identity.key) !== entry) {
        document.fonts.delete(loaded);
        return;
      }
      document.fonts.add(loaded);
      fontFaces.set(identity.key, { path: normalizedKey, family, status: 'ready', face: loaded });
      globalThis.dispatchEvent?.(new CustomEvent(FONT_LOAD_EVENT, { detail: normalized }));
    }).catch(() => {
      if (fontFaces.get(identity.key) === entry) {
        fontFaces.set(identity.key, { path: normalizedKey, family, status: 'failed' });
      }
    });
  } catch {
    fontFaces.set(identity.key, { path: normalizedKey, family, status: 'failed' });
  }
  return `"${family}", system-ui, sans-serif`;
}

export function uiTextFontCss(
  fontSize: number,
  fontStyle: 'Normal' | 'Bold' | 'Italic' | 'BoldAndItalic',
  fontPath: string,
): string {
  const bold = fontStyle === 'Bold' || fontStyle === 'BoldAndItalic';
  const italic = fontStyle === 'Italic' || fontStyle === 'BoldAndItalic';
  const size = Number.isFinite(fontSize) ? Math.min(512, Math.max(1, fontSize)) : 16;
  return `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${size}px ${uiFontFamily(fontPath)}`;
}

export function resetUiFontFaceCacheForTests(): void {
  if (typeof document !== 'undefined') {
    for (const entry of fontFaces.values()) {
      if (entry.face) document.fonts.delete(entry.face);
    }
  }
  fontFaces.clear();
}
