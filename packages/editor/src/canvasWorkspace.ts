import type { GameResolution } from './gameResolution';

export type CanvasSafeArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasArtboardPreset = {
  key: string;
  label: string;
  width: number;
  height: number;
  safeArea?: CanvasSafeArea;
};

export type CanvasWorkspacePreferences = {
  enabled: boolean;
  activeKey: string;
  artboards: CanvasArtboardPreset[];
  showSafeArea: boolean;
  showDiagnostics: boolean;
  zoom: number;
  pan: [number, number];
};

export type CanvasWorkspacePreferencesPatch = Partial<
  Omit<CanvasWorkspacePreferences, 'artboards' | 'pan'>
> & {
  artboards?: CanvasArtboardPreset[];
  pan?: [number, number];
};

export const MAX_CANVAS_ARTBOARDS = 6;

const FALLBACK_GAME_RESOLUTION: GameResolution = { width: 1920, height: 1080 };

function finiteDimension(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 64 || number > 16_384) return null;
  return Math.round(number);
}

function normalizedSafeArea(
  raw: CanvasArtboardPreset['safeArea'],
  width: number,
  height: number,
): CanvasSafeArea | undefined {
  if (!raw) return undefined;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const safeWidth = Number(raw.width);
  const safeHeight = Number(raw.height);
  if (![x, y, safeWidth, safeHeight].every(Number.isFinite)) return undefined;
  const left = Math.max(0, Math.min(width, x));
  const top = Math.max(0, Math.min(height, y));
  const right = Math.max(left, Math.min(width, x + safeWidth));
  const bottom = Math.max(top, Math.min(height, y + safeHeight));
  if (right - left < 1 || bottom - top < 1) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizedArtboard(
  raw: CanvasArtboardPreset,
  index: number,
): CanvasArtboardPreset | null {
  const width = finiteDimension(raw?.width);
  const height = finiteDimension(raw?.height);
  if (width == null || height == null) return null;
  const key = String(raw?.key ?? '').trim().slice(0, 64) || `artboard-${index + 1}`;
  const label = String(raw?.label ?? '').trim().slice(0, 64) || `${width} × ${height}`;
  const safeArea = normalizedSafeArea(raw.safeArea, width, height);
  return { key, label, width, height, ...(safeArea ? { safeArea } : {}) };
}

export function defaultCanvasArtboards(
  gameResolution: GameResolution | null = FALLBACK_GAME_RESOLUTION,
): CanvasArtboardPreset[] {
  const game = gameResolution ?? FALLBACK_GAME_RESOLUTION;
  return [
    { key: 'game', label: 'Game Resolution', ...game },
    { key: 'desktop', label: 'Desktop', width: 1920, height: 1080 },
    { key: 'tablet', label: 'Tablet', width: 1024, height: 768 },
    {
      key: 'phone',
      label: 'Phone',
      width: 1080,
      height: 1920,
      safeArea: { x: 0, y: 80, width: 1080, height: 1760 },
    },
  ];
}

export function normalizeCanvasArtboards(
  raw: readonly CanvasArtboardPreset[] | null | undefined,
  gameResolution: GameResolution | null = FALLBACK_GAME_RESOLUTION,
): CanvasArtboardPreset[] {
  const candidates = Array.isArray(raw) && raw.length > 0
    ? [...raw]
    : defaultCanvasArtboards(gameResolution);
  const game = gameResolution ?? FALLBACK_GAME_RESOLUTION;
  const gameIndex = candidates.findIndex((entry) => entry?.key === 'game');
  if (gameIndex >= 0) {
    candidates[gameIndex] = { ...candidates[gameIndex], ...game, key: 'game' };
  } else {
    candidates.unshift({ key: 'game', label: 'Game Resolution', ...game });
  }
  const dimensions = new Set<string>();
  const keys = new Set<string>();
  const artboards: CanvasArtboardPreset[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const artboard = normalizedArtboard(candidates[index], index);
    if (!artboard) continue;
    const dimensionKey = `${artboard.width}x${artboard.height}`;
    if (dimensions.has(dimensionKey) || keys.has(artboard.key)) continue;
    dimensions.add(dimensionKey);
    keys.add(artboard.key);
    artboards.push(artboard);
    if (artboards.length === MAX_CANVAS_ARTBOARDS) break;
  }
  return artboards.length > 0 ? artboards : [defaultCanvasArtboards(game)[0]];
}

export function normalizeCanvasWorkspacePreferences(
  raw: CanvasWorkspacePreferencesPatch | null | undefined,
  gameResolution: GameResolution | null = FALLBACK_GAME_RESOLUTION,
): CanvasWorkspacePreferences {
  const artboards = normalizeCanvasArtboards(raw?.artboards, gameResolution);
  const requestedActiveKey = String(raw?.activeKey ?? 'game');
  const activeKey = artboards.some((entry) => entry.key === requestedActiveKey)
    ? requestedActiveKey
    : artboards[0].key;
  const rawZoom = Number(raw?.zoom);
  const zoom = Number.isFinite(rawZoom) ? Math.max(0.1, Math.min(8, rawZoom)) : 1;
  const rawPan = raw?.pan;
  const pan: [number, number] = Array.isArray(rawPan)
    && rawPan.length >= 2
    && Number.isFinite(Number(rawPan[0]))
    && Number.isFinite(Number(rawPan[1]))
    ? [Number(rawPan[0]), Number(rawPan[1])]
    : [0, 0];
  return {
    enabled: raw?.enabled !== false,
    activeKey,
    artboards,
    showSafeArea: raw?.showSafeArea !== false,
    showDiagnostics: raw?.showDiagnostics !== false,
    zoom,
    pan,
  };
}
