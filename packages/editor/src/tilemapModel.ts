export const MAX_TILEMAP_TILES = 100_000;

export type GridSettings = {
  cellSize: [number, number];
  cellGap: [number, number];
  cellLayout: string;
};

export type TilemapData = {
  cells: Array<[number, number]>;
  sprites: string[];
};

export type TilemapEntityLike = {
  entity: number;
  parent?: number | null;
  components: Record<string, unknown>;
};

const DEFAULT_GRID: GridSettings = {
  cellSize: [1, 1],
  cellGap: [0, 0],
  cellLayout: 'Rectangle',
};

export function createGridComponent(): Record<string, unknown> {
  return {
    cell_size: [1, 1],
    cell_gap: [0, 0],
    cell_layout: 'Rectangle',
  };
}

export function createTilemapComponent(): Record<string, unknown> {
  return {
    cells: [],
    sprites: [],
    color: [1, 1, 1, 1],
    tile_anchor: [0.5, 0.5],
    sorting_layer: 'default',
    sorting_order: 0,
  };
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pair(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return [...fallback];
  return [finite(value[0], fallback[0]), finite(value[1], fallback[1])];
}

export function readGridSettings(value: unknown): GridSettings {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_GRID);
  const component = value as Record<string, unknown>;
  const size = pair(component.cell_size ?? component.cellSize, DEFAULT_GRID.cellSize);
  const gap = pair(component.cell_gap ?? component.cellGap, DEFAULT_GRID.cellGap);
  const authoredLayout = String(component.cell_layout ?? component.cellLayout ?? 'Rectangle').trim();
  return {
    cellSize: [Math.max(0.0001, Math.abs(size[0])), Math.max(0.0001, Math.abs(size[1]))],
    cellGap: gap,
    cellLayout: authoredLayout.toLowerCase() === 'rectangle' ? 'Rectangle' : authoredLayout,
  };
}

function cellKey(cell: readonly [number, number]): string {
  return `${cell[0]},${cell[1]}`;
}

function readCell(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const rounded: [number, number] = [Math.round(x), Math.round(y)];
  if (rounded.some((part) => part < -2_147_483_648 || part > 2_147_483_647)) return null;
  return rounded;
}

/** Canonical sparse representation: parallel arrays, unique integer cells, last duplicate wins. */
export function normalizeTilemapData(
  cellsValue: unknown,
  spritesValue: unknown,
  maxTiles = MAX_TILEMAP_TILES,
): TilemapData {
  if (!Array.isArray(cellsValue) || !Array.isArray(spritesValue)) {
    return { cells: [], sprites: [] };
  }
  const limit = Number.isFinite(maxTiles)
    ? Math.max(0, Math.min(MAX_TILEMAP_TILES, Math.trunc(maxTiles)))
    : MAX_TILEMAP_TILES;
  const normalized = new Map<string, { cell: [number, number]; sprite: string }>();
  const count = Math.min(cellsValue.length, spritesValue.length);
  for (let index = 0; index < count; index += 1) {
    const cell = readCell(cellsValue[index]);
    if (!cell) continue;
    const key = cellKey(cell);
    if (!normalized.has(key) && normalized.size >= limit) continue;
    normalized.set(key, { cell, sprite: String(spritesValue[index] ?? '') || 'white' });
  }
  const entries = [...normalized.values()].sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0]);
  return {
    cells: entries.map((entry) => entry.cell),
    sprites: entries.map((entry) => entry.sprite),
  };
}

export function setTile(
  source: TilemapData,
  cell: readonly [number, number],
  sprite: string,
): TilemapData {
  return normalizeTilemapData(
    [...source.cells, [Math.round(cell[0]), Math.round(cell[1])]],
    [...source.sprites, sprite || 'white'],
  );
}

export function eraseTile(source: TilemapData, cell: readonly [number, number]): TilemapData {
  const key = cellKey([Math.round(cell[0]), Math.round(cell[1])]);
  const cells: Array<[number, number]> = [];
  const sprites: string[] = [];
  source.cells.forEach((candidate, index) => {
    if (cellKey(candidate) === key) return;
    cells.push([candidate[0], candidate[1]]);
    sprites.push(source.sprites[index] || 'white');
  });
  return normalizeTilemapData(cells, sprites);
}

export function cellLocalPosition(cell: readonly [number, number], grid: GridSettings): [number, number] {
  return [
    cell[0] * (grid.cellSize[0] + grid.cellGap[0]),
    cell[1] * (grid.cellSize[1] + grid.cellGap[1]),
  ];
}

export function localPointToCell(point: readonly [number, number], grid: GridSettings): [number, number] | null {
  if (grid.cellLayout !== 'Rectangle') return null;
  const stepX = grid.cellSize[0] + grid.cellGap[0];
  const stepY = grid.cellSize[1] + grid.cellGap[1];
  if (!Number.isFinite(stepX) || !Number.isFinite(stepY) || Math.abs(stepX) < 1e-7 || Math.abs(stepY) < 1e-7) {
    return null;
  }
  return readCell([point[0] / stepX, point[1] / stepY]);
}

export function nearestGridSettings(
  entities: readonly TilemapEntityLike[],
  entityId: number,
): GridSettings {
  const byId = new Map(entities.map((entity) => [entity.entity, entity]));
  const visited = new Set<number>();
  let current = byId.get(entityId);
  while (current && !visited.has(current.entity)) {
    visited.add(current.entity);
    if (current.components.Grid) return readGridSettings(current.components.Grid);
    current = current.parent == null ? undefined : byId.get(current.parent);
  }
  return structuredClone(DEFAULT_GRID);
}
