export type SpriteMode = 'single' | 'multiple';

export type SpriteSlice = {
  name: string;
  /** Top-left pixel rectangle: x, y, width, height. */
  rect: [number, number, number, number];
  /** Normalized pivot where [0, 0] is bottom-left. */
  pivot: [number, number];
};

export type SpriteImportSettings = {
  version: 1;
  mode: SpriteMode;
  pixels_per_unit: number;
  slices: SpriteSlice[];
};

export type SpriteGridSliceOptions = {
  cellWidth: number;
  cellHeight: number;
  offsetX?: number;
  offsetY?: number;
  paddingX?: number;
  paddingY?: number;
  baseName?: string;
  pivot?: [number, number];
};

const MAX_SLICES = 4096;

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

function normalizedPivot(value: unknown): [number, number] {
  const input = Array.isArray(value) ? value : [0.5, 0.5];
  return [0, 1].map((axis) => {
    const part = Number(input[axis]);
    return Number.isFinite(part) ? Math.max(0, Math.min(1, part)) : 0.5;
  }) as [number, number];
}

export function spriteTexturePath(reference: string): string {
  return String(reference ?? '').trim().split('#', 1)[0];
}

export function spriteSliceName(reference: string): string | null {
  const marker = String(reference ?? '').indexOf('#');
  if (marker < 0) return null;
  const name = reference.slice(marker + 1).trim();
  return name || null;
}

export function spriteImportPath(reference: string): string {
  return `${spriteTexturePath(reference)}.sprite.json`;
}

export function createSpriteImportSettings(): SpriteImportSettings {
  return { version: 1, mode: 'single', pixels_per_unit: 100, slices: [] };
}

export function normalizeSpriteImportSettings(
  raw: unknown,
  textureSize: readonly [number, number],
): SpriteImportSettings {
  if (!raw || typeof raw !== 'object') throw new Error('sprite import metadata must be an object');
  const input = raw as Record<string, unknown>;
  if (Number(input.version ?? 1) !== 1) throw new Error(`unsupported sprite import version ${String(input.version)}`);
  const mode: SpriteMode = input.mode === 'multiple' ? 'multiple' : 'single';
  const ppu = Number(input.pixels_per_unit ?? 100);
  const pixelsPerUnit = Number.isFinite(ppu) && ppu > 0
    ? Math.max(0.01, Math.min(100_000, ppu))
    : 100;
  if (mode === 'single') {
    return { version: 1, mode, pixels_per_unit: pixelsPerUnit, slices: [] };
  }
  if (!Array.isArray(input.slices)) throw new Error('multiple sprite import requires a slices array');
  if (input.slices.length > MAX_SLICES) throw new Error(`sprite import supports at most ${MAX_SLICES} slices`);
  const textureWidth = positiveInteger(textureSize[0], 'texture width');
  const textureHeight = positiveInteger(textureSize[1], 'texture height');
  const names = new Set<string>();
  const slices = input.slices.map((candidate, index): SpriteSlice => {
    if (!candidate || typeof candidate !== 'object') throw new Error(`slice ${index + 1} must be an object`);
    const slice = candidate as Record<string, unknown>;
    const name = String(slice.name ?? '').trim();
    if (!name || name.length > 64 || name.includes('#') || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error(`invalid sprite slice name '${name}'`);
    }
    const key = name.toLocaleLowerCase();
    if (names.has(key)) throw new Error(`duplicate sprite slice name '${name}'`);
    names.add(key);
    if (!Array.isArray(slice.rect) || slice.rect.length < 4) throw new Error(`slice '${name}' requires x, y, width and height`);
    const x = nonNegativeInteger(slice.rect[0], `${name} x`);
    const y = nonNegativeInteger(slice.rect[1], `${name} y`);
    const width = positiveInteger(slice.rect[2], `${name} width`);
    const height = positiveInteger(slice.rect[3], `${name} height`);
    if (x + width > textureWidth || y + height > textureHeight) {
      throw new Error(`sprite slice '${name}' is outside ${textureWidth}x${textureHeight} texture bounds`);
    }
    return { name, rect: [x, y, width, height], pivot: normalizedPivot(slice.pivot) };
  });
  return { version: 1, mode, pixels_per_unit: pixelsPerUnit, slices };
}

export function parseSpriteImportSettings(
  text: string,
  textureSize: readonly [number, number],
): SpriteImportSettings {
  return normalizeSpriteImportSettings(JSON.parse(text), textureSize);
}

export function serializeSpriteImportSettings(
  settings: SpriteImportSettings,
  textureSize: readonly [number, number],
): string {
  return `${JSON.stringify(normalizeSpriteImportSettings(settings, textureSize), null, 2)}\n`;
}

export function sliceSpriteGrid(
  textureSize: readonly [number, number],
  options: SpriteGridSliceOptions,
): SpriteSlice[] {
  const textureWidth = positiveInteger(textureSize[0], 'texture width');
  const textureHeight = positiveInteger(textureSize[1], 'texture height');
  const cellWidth = positiveInteger(options.cellWidth, 'cell width');
  const cellHeight = positiveInteger(options.cellHeight, 'cell height');
  const offsetX = nonNegativeInteger(options.offsetX ?? 0, 'offset X');
  const offsetY = nonNegativeInteger(options.offsetY ?? 0, 'offset Y');
  const paddingX = nonNegativeInteger(options.paddingX ?? 0, 'padding X');
  const paddingY = nonNegativeInteger(options.paddingY ?? 0, 'padding Y');
  const baseName = String(options.baseName ?? 'Sprite').trim() || 'Sprite';
  const pivot = normalizedPivot(options.pivot);
  const slices: SpriteSlice[] = [];
  for (let y = offsetY; y + cellHeight <= textureHeight; y += cellHeight + paddingY) {
    for (let x = offsetX; x + cellWidth <= textureWidth; x += cellWidth + paddingX) {
      if (slices.length >= MAX_SLICES) throw new Error(`grid produces more than ${MAX_SLICES} slices`);
      slices.push({
        name: `${baseName}_${slices.length}`,
        rect: [x, y, cellWidth, cellHeight],
        pivot: [...pivot],
      });
    }
  }
  if (!slices.length) throw new Error('grid does not fit inside the texture');
  return slices;
}

export function uniqueSpriteSliceName(slices: readonly SpriteSlice[], base = 'Sprite'): string {
  const names = new Set(slices.map((slice) => slice.name.toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let index = 1;
  while (names.has(`${base}_${index}`.toLocaleLowerCase())) index += 1;
  return `${base}_${index}`;
}
