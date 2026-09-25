import { assertUnityGammaCapture } from './assert-unity-capture.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Set an isolated editor config and executable.');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command, args = {}) => {
  const result = await bridgeExecute(command, args, { requestId: crypto.randomUUID() });
  assert.ok(result.ok, result.error?.message);
  return result.data;
};
const output = fileURLToPath(new URL('../docs/designs/unity-demos/', import.meta.url));
const step = () => execute('playback.step', { deltaTime: .01 });
const press = async key => {
  await execute('playback.input', { keys: [], buttons: [] }); await step();
  await execute('playback.input', { keys: [key] }); await step();
  await execute('playback.input', { keys: [] }); await step();
};
const click = async (x, y, button = 0) => {
  await execute('playback.input', { keys: [], buttons: [button], pointer: [800 + (x + .5) * 90, 450 - (y + .5) * 90], viewport: [1600, 900] });
  await step();
  const snapshot = await query('scene.snapshot');
  await step(); assert.deepEqual((await query('scene.snapshot')).entities, snapshot.entities, 'holding on one cell must not repeatedly blend');
  await execute('playback.input', { buttons: [] }); await step();
  return snapshot;
};
const capture = async name => {
  const shot = await query('view.screenshot', { target: 'game' });
  const bytes = Buffer.from(shot.dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(`${output}/${name}.png`, bytes); assertUnityGammaCapture(`${output}/${name}.png`);
  return bytes;
};
const tile = (snapshot, x, y) => snapshot.entities.find(entity => entity.name === `Tile ${x} ${y}`);
const decode = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
try {
  for (const smooth of [false, true]) {
    const slug = smooth ? 'tint-brush-smooth' : 'tint-brush';
    const root = fileURLToPath(new URL(`../samples/unity-${slug}/`, import.meta.url));
    if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
    await execute('project.open', { root });
    const authored = await query('scene.snapshot');
    assert.equal(authored.entities.filter(entity => entity.name?.startsWith('Tile ')).length, smooth ? 64 : 4);
    await execute('playback.play', { paused: true }); await execute('panel.focus', { kind: 'game' }); await press('KeyH');
    const initialShot = await capture(`${slug}-initial`);
    const tintPixels = JSON.parse(execFileSync('python', [fileURLToPath(new URL('assert-unity-tint.py', import.meta.url)), `${output}/${slug}-initial.png`, `${root}/Assets/Scripts/Data.ts`], { encoding: 'utf8' }));
    const initial = await query('scene.snapshot');
    const value = (snapshot, x = -1, y = -1) => smooth ? tile(snapshot, x, y).components.MaterialPropertyBlock.custom_parameter_values[4] : tile(snapshot, x, y).components.SpriteRenderer.color;
    const equalColor = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, `color ${actual} != ${expected}`));
    const red = await click(-1, -1); equalColor(value(red), [1, 0, 0, 1]);
    let changed = 0;
    for (const before of initial.entities.filter(entity => entity.name?.startsWith('Tile '))) {
      const after = red.entities.find(entity => entity.name === before.name);
      assert.equal(after.entity, before.entity);
      if (JSON.stringify(after.components) !== JSON.stringify(before.components)) changed++;
    }
    assert.equal(changed, smooth ? 9 : 1);
    await press('KeyB'); await press('Digit3');
    const purple = await click(-1, -1); equalColor(value(purple), [smooth ? .5 : decode(.5), 0, smooth ? .5 : decode(.5), 1]);
    await press('KeyB'); await press('Digit2');
    const unchanged = await click(-1, -1); equalColor(value(unchanged), value(purple));
    await press('KeyB');
    const picked = value(await click(0, 0, 1), 0, 0);
    equalColor(value(await click(-1, -1)), picked);
    await click(-1, -1, 2); equalColor(value(await query('scene.snapshot')), [1, 1, 1, 1]);
    await press('KeyZ'); equalColor(value(await query('scene.snapshot')), picked);
    await capture(`${slug}-painted`);
    await press('KeyR'); await press('KeyH');
    const reset = await query('scene.snapshot');
    equalColor(value(reset), value(initial));
    const resetShot = await capture(`${slug}-reset`);
    assert.ok(initialShot.equals(resetShot), 'reset capture must reproduce the initial pixels');
    await execute('playback.stop'); assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
    fs.writeFileSync(`${output}/${slug}-result.json`, JSON.stringify({ passed: true, sourceCells: smooth ? 64 : 4, tintPixels, changedSprites: changed, blendHalf: true, blendZero: true, pick: true, eraseWhite: true, undo: true, stableEntityIds: true, resetExact: true, stopRestoresAuthored: true, gammaBackgroundVerified: true }, null, 2));
    console.log(`PASS: ${slug}, ${smooth ? 64 : 4} cells; paint/blend/pick/erase/undo/reset`);
  }
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally {
  try { await execute('playback.stop'); } catch { /* Disconnected editor. */ }
  closeBridgeConnection();
}
