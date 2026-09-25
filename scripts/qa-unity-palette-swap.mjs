import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

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
  return shot.dataUrl;
};
const root = fileURLToPath(new URL('../samples/unity-palette-swap/', import.meta.url));
const text = fs.readFileSync(`${root}/Assets/Scripts/Data.ts`, 'utf8');
const data = JSON.parse(text.slice(text.indexOf('= ') + 2).trim().replace(/;$/, ''));
const press = async (key) => {
  await execute('playback.input', { keys: [] });
  await execute('playback.step', { deltaTime: 0.01 });
  await execute('playback.input', { keys: [key] });
  await execute('playback.step', { deltaTime: 0.01 });
};
let initial;
async function checkPalette(index) {
  const snapshot = await query('scene.snapshot');
  assert.equal(snapshot.entities.length, initial.entities.length);
  const tiles = snapshot.entities.filter(entity => entity.name?.startsWith('Tile '));
  assert.equal(tiles.length, 26);
  data.cells.forEach((cell, i) => {
    const entity = tiles.find(tile => tile.name === cell.name);
    const original = initial.entities.find(tile => tile.name === cell.name);
    const visual = data.palettes[index][i];
    (entity.components.AnimatedSprite2D ?? entity.components.SpriteRenderer).color.forEach((value, n) => assert.ok(Math.abs(value - visual.color[n]) < 0.00001));
    assert.equal(entity.entity, original.entity, 'tile identity must survive palette switches');
    assert.deepEqual(entity.components.Transform.position, original.components.Transform.position);
    entity.components.Transform.rotation.forEach((value, n) => assert.ok(Math.abs(value - visual.rotation[n]) < 0.00001));
    if (visual.frames.length) {
      assert.deepEqual(entity.components.AnimatedSprite2D.frames, visual.frames);
      assert.equal(entity.components.AnimatedSprite2D.fps, 1.5);
      assert.equal(entity.components.SpriteRenderer, undefined);
    } else {
      assert.equal(entity.components.SpriteRenderer.sprite, visual.sprite);
      assert.equal(entity.components.AnimatedSprite2D, undefined);
    }
  });
  assert.ok(snapshot.entities.find(entity => entity.name === 'Palette Controls').components.Text.text.startsWith(`Palette ${'ABC'[index]}`));
  return snapshot;
}
try {
  if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
  await execute('project.open', { root });
  const authored = await query('scene.snapshot');
  await execute('playback.play', { paused: true });
  await execute('panel.focus', { kind: 'game' });
  initial = await query('scene.snapshot');
  await checkPalette(1);
  const b = await capture('palette-swap-b');
  await press('Digit1'); await checkPalette(0);
  const a = await capture('palette-swap-a'); assert.notEqual(a, b);
  await execute('playback.step', { deltaTime: 0.1 }); await checkPalette(0);
  await press('ArrowLeft');
  const ocean = await checkPalette(2);
  const c = await capture('palette-swap-c'); assert.notEqual(c, a);
  const animatedTiles = ocean.entities.filter(entity => entity.components.AnimatedSprite2D).length;
  assert.ok(animatedTiles > 0);
  for (let i = 0; i < 4; i++) await execute('playback.step', { deltaTime: 0.2 });
  const animated = await capture('palette-swap-c-animated'); assert.notEqual(animated, c);
  assert.equal(await capture('palette-swap-paused'), animated);
  await press('ArrowRight'); await checkPalette(0);
  await press('Digit2'); await checkPalette(1);
  assert.equal(await capture('palette-swap-returned'), b);
  await press('Space');
  const random = await query('scene.snapshot');
  const label = random.entities.find(entity => entity.name === 'Palette Controls').components.Text.text;
  await checkPalette('ABC'.indexOf(label.slice(8, 9)));
  await press('KeyR'); initial = await query('scene.snapshot'); await checkPalette(1);
  await execute('playback.stop'); assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
  fs.writeFileSync(`${output}/palette-swap-result.json`, JSON.stringify({ passed: true, sourceCells: 26, palettes: 3, animatedTiles, originalAndAliasControls: true, wraparound: true, heldKeyDoesNotRepeat: true, stableEntityIds: true, oceanAnimation: true, pauseFrozen: true, returnToInitialPixels: true, randomPalette: true, restartRestores: true, stopRestoresAuthored: true }, null, 2));
  console.log(`PASS: 26 cells, 3 palettes, ${animatedTiles} ocean animations, wraparound, stable IDs, pause and reset`);
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally {
  try { await execute('playback.stop'); } catch { /* The bridge may already have disconnected. */ }
  closeBridgeConnection();
}
