import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from '../packages/editor/node_modules/typescript/lib/typescript.js';

test('official hex coast matches all source sprites, mirrors and native Unity coordinates', () => {
  const scripts = new URL('../samples/unity-hexagonal/Assets/Scripts/', import.meta.url);
  const source = fs.readFileSync(new URL('Data.ts', scripts), 'utf8') + fs.readFileSync(new URL('Main.ts', scripts), 'utf8');
  const native = JSON.parse(fs.readFileSync(new URL('../docs/designs/unity-demos/unity-grid-reference.json', import.meta.url), 'utf8'));
  const context = vm.createContext({ engine: { snapshot: { entities: [] } }, assert, native });
  vm.runInContext(ts.transpile(source, { target: ts.ScriptTarget.ES2020 }), context);
  vm.runInContext(`
    onSceneLoaded();
    assert.equal(hexData.land.length, 96); assert.equal(hexData.ocean.length, 400); assert.equal(hexData.rules.length, 38);
    assert.equal(hexData.land.filter(cell => cell.flip).length, 28);
    for (const cell of hexData.land) {
      const visual = hexVisual(cell);
      assert.equal(visual.sprite, cell.sprite, 'source sprite at ' + cell.x + ',' + cell.y);
      assert.equal(visual.flip, cell.flip, 'source mirror at ' + cell.x + ',' + cell.y);
    }
    for (const sample of native.samples.filter(value => value.layout === 'Hexagon')) {
      const position = hexPosition(sample.cell.x, sample.cell.y);
      for (const [i, key] of ['x', 'y', 'z'].entries()) assert.ok(Math.abs(position[i] - sample.local[key]) < 1e-6);
    }
    for (let y = -25; y <= 25; y++) for (let x = -20; x <= 20; x++) {
      const [wx, wy] = hexPosition(x, y);
      const center = hexPick(wx, wy), inner = hexPick(wx + .45, wy + .2);
      assert.equal(center.x, x); assert.equal(center.y, y);
      assert.equal(inner.x, x); assert.equal(inner.y, y);
      const outside = hexPick(wx + .45, wy + .45);
      assert.ok(outside.x !== x || outside.y !== y, 'pick must use the hex polygon rather than a rectangle');
    }
  `, context);
});
