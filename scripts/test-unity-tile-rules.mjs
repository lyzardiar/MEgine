import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from '../packages/editor/node_modules/typescript/lib/typescript.js';

for (const slug of ['terrain-tile', 'pipeline-tile', 'random-tile', 'weighted-random-tile', 'auto-tile']) {
  test(`${slug} reproduces all authored tile outputs`, () => {
    const scripts = new URL(`../samples/unity-${slug}/Assets/Scripts/`, import.meta.url);
    const source = fs.readFileSync(new URL('Data.ts', scripts), 'utf8') + fs.readFileSync(new URL('Main.ts', scripts), 'utf8');
    const context = vm.createContext({ engine: { snapshot: { entities: [] } }, assert });
    vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2020 }), context);
    vm.runInContext(`
      onSceneLoaded();
      for (const cell of tileData.cells) {
        const visual = tileVisual(cell);
        assert.equal(visual.sprite, cell.sprite, cell.x + ',' + cell.y);
        const dot = visual.rotation.reduce((sum, value, i) => sum + value * cell.rotation[i], 0);
        assert.ok(Math.abs(dot) > 0.99999, 'rotation must match source, including q/-q equivalence');
      }
      if (tileData.kind === 'random' || tileData.kind === 'weighted') {
        for (let tile = 0; tile < tileData.tiles.length; tile++) {
          const asset = tileData.tiles[tile], expected = new Map(), actual = new Map();
          const total = asset.weights.reduce((sum, weight) => sum + weight, 0);
          asset.sprites.forEach((sprite, i) => expected.set(sprite, (expected.get(sprite) ?? 0) + asset.weights[i] / total));
          for (let x = 100; x < 200; x++) for (let y = 100; y < 200; y++) {
            const cell = { x, y, tile }, sprite = tileVisual(cell).sprite;
            assert.equal(tileVisual(cell).sprite, sprite, 'random choices must be stable per cell');
            actual.set(sprite, (actual.get(sprite) ?? 0) + 1);
          }
          for (const [sprite, probability] of expected) assert.ok(Math.abs((actual.get(sprite) ?? 0) / 10000 - probability) < 0.025, 'new cells must honor source weights');
        }
      }
    `, context);
  });
}
