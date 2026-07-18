export type GameResolution = {
  width: number;
  height: number;
};

export type GameOrientation = 'free' | 'landscape' | 'portrait' | 'square';

export const GAME_RESOLUTION_PRESETS: ReadonlyArray<{
  label: string;
  resolution: GameResolution;
}> = [
  { label: 'Full HD (1920 x 1080)', resolution: { width: 1920, height: 1080 } },
  { label: 'HD (1280 x 720)', resolution: { width: 1280, height: 720 } },
  { label: 'Portrait Full HD (1080 x 1920)', resolution: { width: 1080, height: 1920 } },
  { label: 'Portrait HD (720 x 1280)', resolution: { width: 720, height: 1280 } },
  { label: 'WUXGA (1920 x 1200)', resolution: { width: 1920, height: 1200 } },
  { label: 'Portrait WUXGA (1200 x 1920)', resolution: { width: 1200, height: 1920 } },
  { label: 'XGA (1024 x 768)', resolution: { width: 1024, height: 768 } },
  { label: 'Portrait XGA (768 x 1024)', resolution: { width: 768, height: 1024 } },
  { label: 'Square (1080 x 1080)', resolution: { width: 1080, height: 1080 } },
];

const MAX_GAME_RESOLUTION = 16_384;

function dimension(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(MAX_GAME_RESOLUTION, parsed)
    : null;
}

export function normalizeGameResolution(value: unknown): GameResolution | null {
  if (value == null || value === 'free') return null;
  if (typeof value === 'string') {
    const match = /^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/.exec(value);
    if (!match) return null;
    const width = dimension(match[1]);
    const height = dimension(match[2]);
    return width != null && height != null ? { width, height } : null;
  }
  if (Array.isArray(value)) {
    const width = dimension(value[0]);
    const height = dimension(value[1]);
    return value.length === 2 && width != null && height != null ? { width, height } : null;
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const width = dimension(source.width);
    const height = dimension(source.height);
    return width != null && height != null ? { width, height } : null;
  }
  return null;
}

export function gameResolutionKey(resolution: GameResolution | null): string {
  return resolution ? `${resolution.width}x${resolution.height}` : 'free';
}

export function gameResolutionAspect(resolution: GameResolution | null): number | null {
  return resolution ? resolution.width / resolution.height : null;
}

export function gameResolutionOrientation(
  resolution: GameResolution | null,
): GameOrientation {
  if (!resolution) return 'free';
  if (resolution.width === resolution.height) return 'square';
  return resolution.width > resolution.height ? 'landscape' : 'portrait';
}

export function legacyGameResolution(
  aspect: unknown,
  orientation: unknown,
): GameResolution | null {
  if (aspect === 'free') return null;
  const landscape = orientation !== 'portrait';
  const dimensions: Record<string, [number, number]> = {
    '16:9': [1920, 1080],
    '16:10': [1920, 1200],
    '4:3': [1024, 768],
    '1:1': [1080, 1080],
  };
  const pair = typeof aspect === 'string' ? dimensions[aspect] : undefined;
  if (!pair) return { width: 1920, height: 1080 };
  const [width, height] = landscape || widthEqualsHeight(pair)
    ? pair
    : [pair[1], pair[0]];
  return { width, height };
}

function widthEqualsHeight(pair: readonly [number, number]): boolean {
  return pair[0] === pair[1];
}
