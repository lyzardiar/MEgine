import fs from 'node:fs';
import assert from 'node:assert/strict';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw Error('Use isolated QA editor paths');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command, args = {}) => { const result = await bridgeExecute(command, args, { requestId: crypto.randomUUID() }); assert.ok(result.ok, result.error?.message); return result.data; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = 'docs/designs/editor-performance';
const capture = async (name, windowLabel = 'main') => {
  const result = await query('view.window_screenshot', { windowLabel });
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
};
try {
  fs.mkdirSync(out, { recursive: true });
  if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); }
  await execute('project.open', { root: fs.realpathSync('samples/unity-physics-friction') });
  await execute('view.set_game_resolution', { resolution: { width: 1080, height: 1920 } });
  const authored = await query('scene.snapshot');
  const camera = authored.entities.find(entity => entity.components.Camera2D || entity.components.Camera3D);
  assert.ok(camera);
  await execute('selection.set', { ids: [camera.entity] });
  await execute('panel.focus', { kind: 'scene' });
  await execute('panel.detach', { kind: 'game' });
  const readyDeadline = Date.now() + 30000;
  while (true) {
    const profile = await query('profiler.get_samples', { source: 'game', limit: 1 });
    if (profile.nativeProfileCount >= 5 && profile.nativeLatest?.counts.entities === authored.entities.length) break;
    assert.ok(Date.now() < readyDeadline, 'Detached Game must receive and render its initial Edit scene');
    await delay(500);
  }
  await capture('detached-edit', 'panel-game');
  await execute('playback.play');
  await delay(4000);
  await execute('profiler.clear');
  await delay(12000);
  const scene = await query('profiler.get_samples', { source: 'scene' });
  const game = await query('profiler.get_samples', { source: 'game' });
  assert.ok(scene.nativeSummary.intervals > 5, 'Scene must deliver live frames');
  assert.ok(game.nativeSummary.intervals > 5, 'Detached Game must deliver live frames');
  assert.equal(game.nativeLatest.counts.entities, authored.entities.length, 'Detached Game must receive the project scene');
  await capture('scene-camera');
  await capture('detached-play', 'panel-game');
  await execute('playback.pause');
  const paused = await query('scene.snapshot');
  await delay(300);
  assert.deepEqual((await query('scene.snapshot')).entities, paused.entities);
  await execute('playback.step', { deltaTime: 0.1, steps: 1 });
  const stepped = await query('scene.snapshot');
  assert.ok(stepped.simulationTime > paused.simulationTime);
  await execute('panel.dock', { kind: 'game' });
  await execute('panel.focus', { kind: 'game' });
  const screenshot = await query('view.screenshot', { target: 'game', maxSize: 4096 });
  const png = Buffer.from(screenshot.dataUrl.split(',')[1], 'base64');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1920);
  fs.writeFileSync(`${out}/game-full-resolution.png`, png);
  await execute('playback.stop');
  assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
  fs.writeFileSync(`${out}/multi-view.json`, JSON.stringify({ scope: 'Native editor, Scene plus selected Camera preview and detached Game', executable: process.env.MENGINE_EDITOR_EXECUTABLE, scene: scene.nativeSummary, game: game.nativeSummary, checks: { detachedEditSceneSync: true, detachedPlaySceneSync: true, pause: true, step: true, stopRestoresAuthored: true, fullResolutionCapture: [1080, 1920] } }, null, 2) + '\n');
  console.log('PASS: multi-view, detached scene synchronization, pause, step, stop and full-resolution capture');
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { try { await execute('playback.stop'); await execute('panel.dock', { kind: 'game' }); } catch {} closeBridgeConnection(); }
