import { assertUnityGammaCapture } from './assert-unity-capture.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Set an isolated MENGINE_EDITOR_CONFIG_DIR and MENGINE_EDITOR_EXECUTABLE.');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command, args = {}) => {
  const result = await bridgeExecute(command, args, { requestId: crypto.randomUUID() });
  assert.ok(result.ok, result.error?.message);
  return result.data;
};
const output = fileURLToPath(new URL('../docs/designs/unity-demos/', import.meta.url));
const capture = async (name) => {
  const shot = await query('view.screenshot', { target: 'game' });
  fs.writeFileSync(`${output}/${name}.png`, Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
  assertUnityGammaCapture(`${output}/${name}.png`);
  return shot.dataUrl;
};
const press = async (key) => {
  await execute('playback.input', { keys: [], buttons: [] });
  await execute('playback.step', { deltaTime: 0.01 });
  await execute('playback.input', { keys: [key] });
  await execute('playback.step', { deltaTime: 0.01 });
};
const tiles = snapshot => snapshot.entities.filter(entity => entity.name?.startsWith('Tile '));
try {
  const available = ['random-tile', 'weighted-random-tile', 'terrain-tile', 'pipeline-tile'];
  const requested = process.argv.slice(2);
  assert.ok(requested.every(slug => available.includes(slug)), 'Unknown tile demo');
  for (const slug of requested.length ? requested : available) {
    const root = fileURLToPath(new URL(`../samples/unity-${slug}/`, import.meta.url));
    const text = fs.readFileSync(`${root}/Assets/Scripts/Data.ts`, 'utf8');
    const data = JSON.parse(text.slice(text.indexOf('= ') + 2).trim().replace(/;$/, ''));
    if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
    await execute('project.open', { root });
    const authored = await query('scene.snapshot');
    assert.equal(tiles(authored).length, data.cells.length);
    await execute('playback.play', { paused: true }); await execute('panel.focus', { kind: 'game' });
    const initial = await query('scene.snapshot');
    await capture(`${slug}-initial`);
    const paint = async (x, y, button = 0) => {
      const pointer = [400 + (x + 0.5 - data.cameraPosition[0]) / (data.cameraSize * 2) * 600, 300 - (y + 0.5 - data.cameraPosition[1]) / (data.cameraSize * 2) * 600];
      await execute('playback.input', { keys: [], buttons: [button], pointer, viewport: [800, 600] });
      await execute('playback.step', { deltaTime: 0.016 });
      await execute('playback.input', { buttons: [] });
      return query('scene.snapshot');
    };
    let x = -5, y = -3;
    while (data.cells.some(cell => cell.x === x && cell.y === y)) x++;
    const name = `Tile ${x} ${y}`;
    const painted = await paint(x, y);
    assert.equal(tiles(painted).length, data.cells.length + 1);
    const sprite = painted.entities.find(entity => entity.name === name).components.SpriteRenderer.sprite;
    assert.ok(data.tiles[0].sprites.includes(sprite));
    for (const entity of tiles(initial)) assert.equal(painted.entities.find(value => value.name === entity.name).entity, entity.entity);
    assert.equal(tiles(await paint(x, y)).length, data.cells.length + 1, 'painting same tile must not duplicate it');
    const erased = await paint(x, y, 2); assert.equal(tiles(erased).length, data.cells.length);
    const repainted = await paint(x, y); assert.equal(repainted.entities.find(entity => entity.name === name).components.SpriteRenderer.sprite, sprite);
    if (data.tiles.length > 1) {
      await press('Digit2');
      const selected = await paint(x, y);
      assert.ok(data.tiles[1].sprites.includes(selected.entities.find(entity => entity.name === name).components.SpriteRenderer.sprite));
      await press('KeyZ');
      assert.equal((await query('scene.snapshot')).entities.find(entity => entity.name === name).components.SpriteRenderer.sprite, sprite);
    }
    let changedNeighbors = 0;
    if (data.kind === 'terrain' || data.kind === 'pipeline') {
      const source = data.cells.find(cell => data.cells.some(other => other.tile === cell.tile && Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) === 1));
      const before = await query('scene.snapshot');
      const after = await paint(source.x, source.y, 2);
      assert.equal(after.entities.find(entity => entity.name === `Tile ${source.x} ${source.y}`), undefined);
      for (const entity of tiles(after)) {
        const old = before.entities.find(value => value.name === entity.name);
        if (old && JSON.stringify(old.components) !== JSON.stringify(entity.components)) changedNeighbors++;
      }
      assert.ok(changedNeighbors > 0, 'erasing a connected tile must update adjoining graphics');
      await press('KeyZ');
      assert.equal(tiles(await query('scene.snapshot')).length, tiles(before).length);
    }
    await capture(`${slug}-painted`);
    await press('KeyR'); assert.equal(tiles(await query('scene.snapshot')).length, data.cells.length);
    await capture(`${slug}-reset`);
    const resetPixels = JSON.parse(execFileSync('python', ['-c', 'from PIL import Image,ImageChops; import sys,json; a=Image.open(sys.argv[1]).convert("RGBA"); b=Image.open(sys.argv[2]).convert("RGBA"); assert a.size==b.size; d=ImageChops.difference(a,b); print(json.dumps(dict(changed=sum(any(p) for p in d.getdata()),maximum=max(v[1] for v in d.getextrema()),pixels=a.width*a.height)))', `${output}/${slug}-initial.png`, `${output}/${slug}-reset.png`], { encoding: 'utf8' }));
    // A GPU readback can differ by one quantization step at a viewport edge.
    assert.ok(resetPixels.maximum <= 1 && resetPixels.changed <= Math.max(2, resetPixels.pixels * 0.0001), `Reset image changed: ${JSON.stringify(resetPixels)}`);
    await execute('playback.stop'); assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
    const result = { passed: true, gammaBackgroundVerified: true, sourceCells: data.cells.length, tileAssets: data.tiles.length, paint: true, erase: true, coordinateStableRandom: true, tileSelection: data.tiles.length > 1, undo: true, changedNeighbors, preservedExistingEntityIds: true, resetPixels, stopRestoresAuthored: true };
    fs.writeFileSync(`${output}/${slug}-result.json`, JSON.stringify(result, null, 2));
    console.log(`PASS: ${slug}, ${data.cells.length} source cells, brush/erase/undo/reset, ${changedNeighbors} adjoining tiles refreshed`);
  }
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally {
  try { await execute('playback.stop'); } catch { /* The bridge may already have disconnected. */ }
  closeBridgeConnection();
}
