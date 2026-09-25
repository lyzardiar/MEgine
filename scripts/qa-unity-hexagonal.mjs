import { assertUnityGammaCapture } from './assert-unity-capture.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Use an isolated editor config and executable.');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command, args = {}) => {
  const result = await bridgeExecute(command, args, { requestId: crypto.randomUUID() });
  assert.ok(result.ok, result.error?.message); return result.data;
};
const root = fileURLToPath(new URL('../samples/unity-hexagonal/', import.meta.url));
const out = fileURLToPath(new URL('../docs/designs/unity-demos/', import.meta.url));
const data = JSON.parse(fs.readFileSync(`${root}/Assets/Scripts/Data.ts`, 'utf8').split('= ')[1].trim().replace(/;$/, ''));
const step = () => execute('playback.step', { deltaTime: .01 });
const press = async key => {
  await execute('playback.input', { keys: [], buttons: [] }); await step();
  await execute('playback.input', { keys: [key] }); await step();
};
const land = snapshot => snapshot.entities.filter(entity => entity.name?.startsWith('Land '));
const ocean = snapshot => snapshot.entities.filter(entity => entity.name?.startsWith('Ocean '));
const capture = async name => {
  const shot = await query('view.screenshot', { target: 'game' });
  const bytes = Buffer.from(shot.dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(`${out}/${name}.png`, bytes); assertUnityGammaCapture(`${out}/${name}.png`); return bytes;
};
const paint = async (cell, erase = false, offset = [0, 0]) => {
  const wx = (cell.x + .5 * (cell.y & 1)) * data.size[0] + offset[0], wy = cell.y * .75 * data.size[1] + offset[1];
  const pointer = [800 + (wx - data.cameraPosition[0]) / (data.cameraSize * 2) * 900, 450 - (wy - data.cameraPosition[1]) / (data.cameraSize * 2) * 900];
  await execute('playback.input', { keys: [], buttons: [erase ? 2 : 0], pointer, viewport: [1600, 900] }); await step();
  await execute('playback.input', { buttons: [] }); await step(); return query('scene.snapshot');
};
try {
  if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
  await execute('project.open', { root }); const authored = await query('scene.snapshot');
  assert.equal(land(authored).length, 96); assert.equal(ocean(authored).length, 400);
  await execute('playback.play', { paused: true }); await execute('panel.focus', { kind: 'game' }); await press('KeyH');
  const initial = await capture('hexagonal-initial');
  const candidates = data.ocean.filter(cell => !data.land.some(value => value.x === cell.x && value.y === cell.y));
  const odd = candidates.find(cell => cell.y & 1), even = candidates.find(cell => !(cell.y & 1));
  for (const cell of [odd, even]) {
    const after = await paint(cell, false, [.45, .2]);
    assert.equal(land(after).length, 97); assert.ok(land(after).some(value => value.name === `Land ${cell.x} ${cell.y}`));
    assert.deepEqual(ocean(after), ocean(authored));
    await press('KeyZ'); assert.equal(land(await query('scene.snapshot')).length, 96);
  }
  const cell = data.land.find(value => value.flip);
  const before = await query('scene.snapshot'), after = await paint(cell, true);
  assert.equal(land(after).length, 95);
  let changedNeighbors = 0;
  for (const entity of land(after)) {
    const old = land(before).find(value => value.name === entity.name);
    assert.equal(old.entity, entity.entity);
    if (JSON.stringify(old.components.SpriteRenderer) !== JSON.stringify(entity.components.SpriteRenderer)) changedNeighbors++;
  }
  assert.ok(changedNeighbors > 0); assert.deepEqual(ocean(after), ocean(authored));
  await capture('hexagonal-edited');
  await press('KeyR'); await press('KeyH');
  assert.equal(land(await query('scene.snapshot')).length, 96);
  assert.ok(initial.equals(await capture('hexagonal-reset')), 'reset restores initial pixels');
  await execute('playback.stop'); assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
  fs.writeFileSync(`${out}/hexagonal-result.json`, JSON.stringify({ passed: true, oceanCells: 400, landCells: 96, sourceMirrors: 28, rules: 38, oddAndEvenPicking: true, polygonEdgePicking: true, changedNeighbors, oceanPreserved: true, stableRemainingEntityIds: true, undo: true, resetExact: true, stopRestoresAuthored: true }, null, 2));
  console.log(`PASS: Hexagonal, 496 cells, odd/even picking, ${changedNeighbors} neighboring coasts refreshed`);
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally {
  try { await execute('playback.stop'); } catch { /* disconnected editor */ }
  closeBridgeConnection();
}
