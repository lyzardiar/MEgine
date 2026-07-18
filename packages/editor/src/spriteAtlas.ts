export type SpriteAtlasAsset = {
  version: 1;
  name: string;
  max_size: 256 | 512 | 1024 | 2048 | 4096 | 8192;
  padding: number;
  pixels_per_unit: number;
  sprites: string[];
};

export type SpriteAtlasInput = {
  reference: string;
  width: number;
  height: number;
  pivot: [number, number];
};

export type SpriteAtlasEntry = SpriteAtlasInput & {
  name: string;
  rect: [number, number, number, number];
};

export type SpriteAtlasPlan = {
  width: number;
  height: number;
  entries: SpriteAtlasEntry[];
};

const ATLAS_SIZES = [256, 512, 1024, 2048, 4096, 8192] as const;

function normalizeReference(raw: unknown): string {
  const value = String(raw ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const [texture, fragment] = value.split('#', 2);
  const segments = texture.split('/').filter(Boolean);
  if (segments[0]?.toLocaleLowerCase() !== 'assets'
    || segments.length < 2
    || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`sprite atlas source must be under Assets: ${String(raw)}`);
  }
  const normalized = `Assets/${segments.slice(1).join('/')}`;
  return fragment?.trim() ? `${normalized}#${fragment.trim()}` : normalized;
}

function finitePivot(value: unknown): [number, number] {
  const input = Array.isArray(value) ? value : [0.5, 0.5];
  return [0, 1].map((axis) => {
    const part = Number(input[axis]);
    return Number.isFinite(part) ? Math.max(0, Math.min(1, part)) : 0.5;
  }) as [number, number];
}

export function createSpriteAtlasAsset(name = 'New Sprite Atlas'): SpriteAtlasAsset {
  return {
    version: 1,
    name,
    max_size: 2048,
    padding: 2,
    pixels_per_unit: 100,
    sprites: [],
  };
}

export function normalizeSpriteAtlasAsset(raw: unknown): SpriteAtlasAsset {
  if (!raw || typeof raw !== 'object') throw new Error('sprite atlas must be an object');
  const input = raw as Record<string, unknown>;
  if (Number(input.version ?? 1) !== 1) throw new Error(`unsupported sprite atlas version ${String(input.version)}`);
  const requestedSize = Number(input.max_size ?? 2048);
  const maxSize = ATLAS_SIZES.includes(requestedSize as (typeof ATLAS_SIZES)[number])
    ? requestedSize as SpriteAtlasAsset['max_size']
    : 2048;
  const rawPadding = Number(input.padding ?? 2);
  const padding = Number.isFinite(rawPadding) ? Math.max(0, Math.min(64, Math.trunc(rawPadding))) : 2;
  const rawPpu = Number(input.pixels_per_unit ?? 100);
  const pixelsPerUnit = Number.isFinite(rawPpu) && rawPpu > 0
    ? Math.max(0.01, Math.min(100_000, rawPpu))
    : 100;
  const sprites: string[] = [];
  const seen = new Set<string>();
  for (const rawSprite of Array.isArray(input.sprites) ? input.sprites : []) {
    const sprite = normalizeReference(rawSprite);
    const key = sprite.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sprites.push(sprite);
    if (sprites.length > 4096) throw new Error('sprite atlas supports at most 4096 sources');
  }
  const name = String(input.name ?? 'Sprite Atlas').trim().slice(0, 80) || 'Sprite Atlas';
  return { version: 1, name, max_size: maxSize, padding, pixels_per_unit: pixelsPerUnit, sprites };
}

export function parseSpriteAtlasAsset(text: string): SpriteAtlasAsset {
  return normalizeSpriteAtlasAsset(JSON.parse(text));
}

export function serializeSpriteAtlasAsset(asset: SpriteAtlasAsset): string {
  return `${JSON.stringify(normalizeSpriteAtlasAsset(asset), null, 2)}\n`;
}

export function spriteAtlasTexturePath(assetPath: string): string {
  const normalized = normalizeReference(assetPath);
  if (!normalized.toLocaleLowerCase().endsWith('.matlas')) {
    throw new Error(`sprite atlas asset must end with .matlas: ${assetPath}`);
  }
  return `${normalized.slice(0, -'.matlas'.length)}.png`;
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function baseEntryName(reference: string): string {
  const [texture, fragment] = reference.split('#', 2);
  const candidate = fragment || texture.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Sprite';
  return candidate.replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'Sprite';
}

export function planSpriteAtlas(
  inputs: readonly SpriteAtlasInput[],
  maxSize: number,
  padding: number,
): SpriteAtlasPlan {
  if (!ATLAS_SIZES.includes(maxSize as (typeof ATLAS_SIZES)[number])) throw new Error('atlas max size must be a supported power of two');
  const gap = Math.max(0, Math.min(64, Math.trunc(Number(padding) || 0)));
  if (!inputs.length) throw new Error('sprite atlas has no sources');
  const normalized = inputs.map((input) => {
    const reference = normalizeReference(input.reference);
    const width = Math.trunc(Number(input.width));
    const height = Math.trunc(Number(input.height));
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`sprite '${reference}' has invalid dimensions`);
    }
    if (width + gap * 2 > maxSize || height + gap * 2 > maxSize) {
      throw new Error(`sprite '${reference}' (${width}x${height}) exceeds ${maxSize}px atlas size`);
    }
    return { reference, width, height, pivot: finitePivot(input.pivot) };
  }).sort((left, right) =>
    right.height - left.height
    || right.width - left.width
    || left.reference.localeCompare(right.reference));

  const baseCounts = new Map<string, number>();
  for (const input of normalized) {
    const base = baseEntryName(input.reference).toLocaleLowerCase();
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }
  const entries: SpriteAtlasEntry[] = [];
  let x = gap;
  let y = gap;
  let shelfHeight = 0;
  let usedWidth = 0;
  let usedHeight = 0;
  for (const input of normalized) {
    if (x + input.width + gap > maxSize) {
      x = gap;
      y += shelfHeight + gap;
      shelfHeight = 0;
    }
    if (y + input.height + gap > maxSize) {
      throw new Error(`sprite atlas sources do not fit inside ${maxSize}x${maxSize}`);
    }
    const base = baseEntryName(input.reference);
    const name = (baseCounts.get(base.toLocaleLowerCase()) ?? 0) > 1
      ? `${base}_${stableHash(input.reference)}`
      : base;
    entries.push({ ...input, name, rect: [x, y, input.width, input.height] });
    x += input.width + gap;
    shelfHeight = Math.max(shelfHeight, input.height);
    usedWidth = Math.max(usedWidth, x);
    usedHeight = Math.max(usedHeight, y + input.height + gap);
  }
  return {
    width: Math.min(maxSize, Math.max(32, nextPowerOfTwo(usedWidth))),
    height: Math.min(maxSize, Math.max(32, nextPowerOfTwo(usedHeight))),
    entries,
  };
}
