import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cellLocalPosition,
  boxTiles,
  createGridComponent,
  createTilemapComponent,
  eraseTile,
  floodFillTiles,
  localPointToCell,
  lineTiles,
  nearestGridSettings,
  normalizeTilemapData,
  readGridSettings,
  setTile,
  tileAt,
} from '../src/tilemapModel.ts';

test('Grid and Tilemap creation defaults match the serialized runtime contract', () => {
  assert.deepEqual(createGridComponent(), {
    cell_size: [1, 1], cell_gap: [0, 0], cell_layout: 'Rectangle',
  });
  assert.deepEqual(createTilemapComponent(), {
    cells: [], sprites: [], color: [1, 1, 1, 1], tile_anchor: [0.5, 0.5],
    sorting_layer: 'default', sorting_order: 0,
  });
});

test('Tilemap sparse arrays are canonical, integer, bounded, and last-write-wins', () => {
  const normalized = normalizeTilemapData(
    [[1.2, 0.2], [0, 0], [1, 0], null, [Number.NaN, 2], [8, 8], [1, 0]],
    ['old', 'origin', 'new', 'bad', 'nan', 'over-limit', 'last-write'],
    2,
  );
  assert.deepEqual(normalized, {
    cells: [[0, 0], [1, 0]],
    sprites: ['origin', 'last-write'],
  });
  assert.deepEqual(normalizeTilemapData([[3_000_000_000, 0]], ['outside-i32']), { cells: [], sprites: [] });
  assert.deepEqual(normalizeTilemapData([[0, 0]], ['safe'], Number.NaN), {
    cells: [[0, 0]], sprites: ['safe'],
  });
});

test('painting and erasing a Tilemap cell are immutable', () => {
  const source = { cells: [[0, 0]], sprites: ['grass'] };
  assert.deepEqual(setTile(source, [0, 0], 'stone'), {
    cells: [[0, 0]],
    sprites: ['stone'],
  });
  assert.deepEqual(setTile(source, [2, -1], ''), {
    cells: [[2, -1], [0, 0]],
    sprites: ['white', 'grass'],
  });
  assert.deepEqual(eraseTile(source, [0.2, -0.1]), { cells: [], sprites: [] });
  assert.deepEqual(source, { cells: [[0, 0]], sprites: ['grass'] });
});

test('box painting and erasing are inclusive, bounded, and preserve unrelated cells', () => {
  const source = { cells: [[9, 9]], sprites: ['keep'] };
  const painted = boxTiles(source, [0, 0], [2, 1], 'grass');
  assert.equal(painted.cells.length, 7);
  assert.equal(tileAt(painted, [1, 1]), 'grass');
  assert.equal(tileAt(painted, [9, 9]), 'keep');
  assert.equal(boxTiles(source, [0, 0], [1000, 1000], 'x', false, 3).cells.length, 4);
  const erased = boxTiles(painted, [1, 0], [2, 1], '', true);
  assert.equal(tileAt(erased, [1, 0]), null);
  assert.equal(tileAt(erased, [0, 1]), 'grass');
});

test('line painting rasterizes continuous fast pointer movement', () => {
  const diagonal = lineTiles({ cells: [], sprites: [] }, [0, 0], [4, 2], 'road');
  assert.deepEqual(diagonal.cells, [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]]);
  assert.ok(diagonal.sprites.every((sprite) => sprite === 'road'));
  assert.equal(lineTiles(diagonal, [0, 0], [4, 2], '', true).cells.length, 0);
});

test('flood fill replaces only the connected occupied sprite region', () => {
  const source = normalizeTilemapData(
    [[0, 0], [1, 0], [1, 1], [3, 0], [0, 1]],
    ['grass', 'grass', 'grass', 'grass', 'stone'],
  );
  const filled = floodFillTiles(source, [0, 0], 'water');
  assert.equal(tileAt(filled, [0, 0]), 'water');
  assert.equal(tileAt(filled, [1, 1]), 'water');
  assert.equal(tileAt(filled, [3, 0]), 'grass');
  assert.equal(tileAt(filled, [0, 1]), 'stone');
  assert.equal(tileAt(floodFillTiles(source, [8, 8], 'sand'), [8, 8]), 'sand');
});

test('grid math sanitizes settings and maps local points to cell centers', () => {
  const grid = readGridSettings({ cell_size: [-2, 1], cell_gap: [0.5, 0.25] });
  assert.deepEqual(grid.cellSize, [2, 1]);
  assert.deepEqual(cellLocalPosition([2, -1], grid), [5, -1.25]);
  assert.deepEqual(localPointToCell([4.7, -1], grid), [2, -1]);
  assert.equal(localPointToCell([0, 0], readGridSettings({ cell_size: [1, 1], cell_gap: [-1, 0] })), null);
  assert.equal(localPointToCell([0, 0], readGridSettings({ cell_layout: 'Hexagon' })), null);
});

test('nearest Grid resolves ancestors and terminates parent cycles', () => {
  const entities = [
    { entity: 1, parent: 2, components: { Grid: { cell_size: [3, 4] } } },
    { entity: 2, parent: 1, components: {} },
    { entity: 3, parent: 1, components: { Tilemap: {} } },
  ];
  assert.deepEqual(nearestGridSettings(entities, 3).cellSize, [3, 4]);
  assert.deepEqual(nearestGridSettings(entities, 2).cellSize, [3, 4]);
  assert.deepEqual(nearestGridSettings(entities, 99).cellSize, [1, 1]);
});
