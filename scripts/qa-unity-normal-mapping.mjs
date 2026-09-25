import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Use an isolated editor config and executable.');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command, args = {}) => {
  const result = await bridgeExecute(command, args, { requestId: crypto.randomUUID() });
  assert.ok(result.ok, result.error?.message); return result.data;
};
const root = fileURLToPath(new URL('../samples/unity-normal-mapping/', import.meta.url));
const out = fileURLToPath(new URL('../docs/designs/unity-demos/', import.meta.url));
const data = JSON.parse(fs.readFileSync(`${root}/Assets/Scripts/Data.ts`, 'utf8').split('= ')[1].trim().replace(/;$/, ''));
const step = () => execute('playback.step', { deltaTime: .01 });
const press = async key => {
  await execute('playback.input', { keys: [], buttons: [] }); await step();
  await execute('playback.input', { keys: [key] }); await step();
  await execute('playback.input', { keys: [] }); await step();
};
const tiles = snapshot => snapshot.entities.filter(entity => entity.name?.startsWith('Tile '));
const capture = async (name, variant, overrides = {}) => {
  const shot = await query('view.screenshot', { target: 'game' });
  const bytes = Buffer.from(shot.dataUrl.split(',')[1], 'base64'), path = `${out}/${name}.png`;
  fs.writeFileSync(path, bytes);
  const pixels = JSON.parse(execFileSync('python', [fileURLToPath(new URL('assert-unity-normal-mapping.py', import.meta.url)), path, root, String(variant), JSON.stringify(overrides)], { encoding: 'utf8' }));
  return { bytes, pixels };
};
try {
  if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
  await execute('project.open', { root });
  const authored = await query('scene.snapshot');
  assert.equal(tiles(authored).length, 16);
  await execute('playback.play', { paused: true }); await execute('panel.focus', { kind: 'game' }); await press('KeyH');
  const initial = await query('scene.snapshot');
  const builtin = await capture('normal-mapping-builtin', 0);
  await press('KeyN'); const flat = await capture('normal-mapping-flat', 0, { normal: 0 });
  assert.ok(!builtin.bytes.equals(flat.bytes), 'normal direction must visibly change lighting');
  await press('KeyN');
  const wx = 1, wy = 1;
  await execute('playback.input', { keys: [], buttons: [0], pointer: [800 + (wx - data.cameraPosition[0]) * 90, 450 - (wy - data.cameraPosition[1]) * 90], viewport: [1600, 900] }); await step();
  await execute('playback.input', { buttons: [] }); await step();
  const dragged = await query('scene.snapshot');
  const light = dragged.entities.find(entity => entity.name === 'Blue Light');
  assert.ok(Math.abs(light.components.Transform.position[0] - wx) < 1e-5 && Math.abs(light.components.Transform.position[1] - wy) < 1e-5);
  for (const tile of tiles(dragged)) {
    assert.equal(tile.entity, tiles(initial).find(before => before.name === tile.name).entity);
    assert.deepEqual(tile.components.MaterialPropertyBlock.custom_parameter_values[0], [1, 1, 0, 100]);
  }
  const moved = await capture('normal-mapping-moved', 0, { blue: [1, 1] });
  assert.ok(!moved.bytes.equals(builtin.bytes));
  await press('KeyR'); await press('KeyH');
  assert.ok((await capture('normal-mapping-reset', 0)).bytes.equals(builtin.bytes), 'reset must restore exact pixels');
  await press('Digit2'); await press('KeyH');
  assert.equal(tiles(await query('scene.snapshot')).length, 16);
  const urp = await capture('normal-mapping-urp', 1);
  await press('KeyN'); const urpNormal = await capture('normal-mapping-urp-normal', 1, { normal: 1 });
  assert.ok(!urp.bytes.equals(urpNormal.bytes));
  await press('Digit1'); await press('KeyH');
  assert.ok((await capture('normal-mapping-return', 0)).bytes.equals(builtin.bytes), 'scene round trip must restore pixels');
  await execute('playback.stop'); assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
  const flipTile = tiles(authored).find(entity => entity.name === 'Tile -2 -1');
  await execute('component.set', { entity: flipTile.entity, type: 'SpriteRenderer', value: { ...flipTile.components.SpriteRenderer, flip_y: true } });
  await execute('playback.play', { paused: true }); await press('KeyH');
  const flip = await capture('normal-mapping-flip-y', 0, { flipY: [-2, -1] });
  await execute('playback.stop');
  await execute('component.set', { entity: flipTile.entity, type: 'SpriteRenderer', value: flipTile.components.SpriteRenderer });
  assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
  fs.writeFileSync(`${out}/normal-mapping-result.json`, JSON.stringify({ passed: true, sourceCells: 16, variants: 2, builtin: builtin.pixels, flat: flat.pixels, moved: moved.pixels, urp: urp.pixels, urpNormal: urpNormal.pixels, flipY: flip.pixels, linearNormalTexture: true, stableEntityIds: true, resetExact: true, sceneRoundTrip: true, stopRestoresAuthored: true }, null, 2) + '\n');
  console.log('PASS: Normal Mapping, 2 variants, per-pixel normals, light dragging, reset, scene round trip and stop');
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally {
  try { await execute('playback.stop'); } catch { /* Disconnected editor. */ }
  closeBridgeConnection();
}
