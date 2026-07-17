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

export function tileAt(source: TilemapData, cell: readonly [number, number]): string | null {
  const key = cellKey([Math.round(cell[0]), Math.round(cell[1])]);
  for (let index = source.cells.length - 1; index >= 0; index -= 1) {
    if (cellKey(source.cells[index]) === key) return source.sprites[index] || 'white';
  }
  return null;
}

function tileMap(source: TilemapData): Map<string, { cell: [number, number]; sprite: string }> {
  const normalized = normalizeTilemapData(source.cells, source.sprites);
  return new Map(normalized.cells.map((cell, index) => [
    cellKey(cell),
    { cell, sprite: normalized.sprites[index] || 'white' },
  ]));
}

function tileDataFromMap(
  tiles: ReadonlyMap<string, { cell: [number, number]; sprite: string }>,
): TilemapData {
  return normalizeTilemapData(
    [...tiles.values()].map((entry) => entry.cell),
    [...tiles.values()].map((entry) => entry.sprite),
  );
}

/** Paint or erase every cell crossed by an integer grid line, preventing fast-drag gaps. */
export function lineTiles(
  source: TilemapData,
  start: readonly [number, number],
  end: readonly [number, number],
  sprite: string,
  erase = false,
  maxOperationCells = MAX_TILEMAP_TILES,
): TilemapData {
  const startCell = readCell(start);
  const endCell = readCell(end);
  if (!startCell || !endCell) return normalizeTilemapData(source.cells, source.sprites);
  const limit = Number.isFinite(maxOperationCells)
    ? Math.max(0, Math.min(MAX_TILEMAP_TILES, Math.trunc(maxOperationCells)))
    : MAX_TILEMAP_TILES;
  const tiles = tileMap(source);
  let [x, y] = startCell;
  const [endX, endY] = endCell;
  const dx = Math.abs(endX - x);
  const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y);
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  for (let visited = 0; visited < limit; visited += 1) {
    const cell: [number, number] = [x, y];
    const key = cellKey(cell);
    if (erase) tiles.delete(key);
    else if (tiles.has(key) || tiles.size < MAX_TILEMAP_TILES) {
      tiles.set(key, { cell, sprite: sprite || 'white' });
    }
    if (x === endX && y === endY) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
  return tileDataFromMap(tiles);
}

/** Paint or erase an inclusive rectangle. Work is capped even for hostile coordinates. */
export function boxTiles(
  source: TilemapData,
  start: readonly [number, number],
  end: readonly [number, number],
  sprite: string,
  erase = false,
  maxOperationCells = MAX_TILEMAP_TILES,
): TilemapData {
  const startCell = readCell(start);
  const endCell = readCell(end);
  if (!startCell || !endCell) return normalizeTilemapData(source.cells, source.sprites);
  const limit = Number.isFinite(maxOperationCells)
    ? Math.max(0, Math.min(MAX_TILEMAP_TILES, Math.trunc(maxOperationCells)))
    : MAX_TILEMAP_TILES;
  const minX = Math.min(startCell[0], endCell[0]);
  const maxX = Math.max(startCell[0], endCell[0]);
  const minY = Math.min(startCell[1], endCell[1]);
  const maxY = Math.max(startCell[1], endCell[1]);
  const tiles = tileMap(source);
  let visited = 0;
  outer: for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (visited >= limit) break outer;
      visited += 1;
      const cell: [number, number] = [x, y];
      const key = cellKey(cell);
      if (erase) tiles.delete(key);
      else if (tiles.has(key) || tiles.size < MAX_TILEMAP_TILES) {
        tiles.set(key, { cell, sprite: sprite || 'white' });
      }
    }
  }
  return tileDataFromMap(tiles);
}

/** Replace the four-way connected occupied region under start. Empty space is intentionally finite. */
export function floodFillTiles(
  source: TilemapData,
  start: readonly [number, number],
  sprite: string,
  maxOperationCells = MAX_TILEMAP_TILES,
): TilemapData {
  const startCell = readCell(start);
  if (!startCell) return normalizeTilemapData(source.cells, source.sprites);
  const tiles = tileMap(source);
  const startKey = cellKey(startCell);
  const target = tiles.get(startKey)?.sprite ?? null;
  if (target == null) return setTile(source, startCell, sprite);
  const replacement = sprite || 'white';
  if (target === replacement) return tileDataFromMap(tiles);
  const limit = Number.isFinite(maxOperationCells)
    ? Math.max(0, Math.min(MAX_TILEMAP_TILES, Math.trunc(maxOperationCells)))
    : MAX_TILEMAP_TILES;
  const queue: Array<[number, number]> = [startCell];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length && visited.size < limit; index += 1) {
    const cell = queue[index];
    const key = cellKey(cell);
    if (visited.has(key) || tiles.get(key)?.sprite !== target) continue;
    visited.add(key);
    tiles.set(key, { cell, sprite: replacement });
    const [x, y] = cell;
    for (const neighbor of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as Array<[number, number]>) {
      const neighborKey = cellKey(neighbor);
      if (!visited.has(neighborKey) && tiles.get(neighborKey)?.sprite === target) queue.push(neighbor);
    }
  }
  return tileDataFromMap(tiles);
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
