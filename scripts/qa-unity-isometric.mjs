import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Use an isolated editor config and executable.');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command, args = {}) => { const r = await bridgeExecute(command, args, { requestId: crypto.randomUUID() }); assert.ok(r.ok, r.error?.message); return r.data; };
const root = fileURLToPath(new URL('../samples/unity-isometric-z-as-y/', import.meta.url));
const out = fileURLToPath(new URL('../docs/designs/unity-demos/', import.meta.url));
const step = (steps = 1) => execute('playback.step', { deltaTime: .02, steps });
const player = s => s.entities.find(e => e.name === 'Player');
const witch = s => s.entities.find(e => e.name === 'Witch');
const position = s => player(s).components.Transform.position;
const snapshot = () => query('scene.snapshot');
const actions = async list => {
  for (const [keys, frames] of list) { await execute('playback.input', { keys: keys.split(',').filter(Boolean) }); await step(frames); }
  await execute('playback.input', { keys: [] }); await step(2); return snapshot();
};
const capture = async name => {
  const shot = await query('view.screenshot', { target: 'game' }), bytes = Buffer.from(shot.dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(`${out}/${name}.png`, bytes);
  const colors = JSON.parse(execFileSync('python', ['-c', 'from PIL import Image;import json,sys;p=list(Image.open(sys.argv[1]).convert("RGB").get_flattened_data());print(json.dumps({"sand":sum(r>200 and g>160 and b<180 for r,g,b in p),"error":sum(r>240 and b>240 and g<20 for r,g,b in p)}))', `${out}/${name}.png`], { encoding: 'utf8' }));
  assert.ok(colors.sand > 15000 && colors.error < 20, JSON.stringify(colors)); return bytes;
};
try {
  if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(r => setTimeout(r, 600)); }
  await execute('project.open', { root }); const authored = await snapshot();
  assert.equal(authored.entities.filter(e => e.name.startsWith('Ground ')).length, 284);
  assert.equal(authored.entities.filter(e => e.components.EdgeCollider2D?.is_trigger).length, 6);
  await execute('playback.play', { paused: true }); await execute('panel.focus', { kind: 'game' }); await step(30);
  const initial = await snapshot(), initialShot = await capture('isometric-initial');
  const camera = initial.entities.find(e => e.name === 'Main Camera');
  assert.ok(Math.hypot(...camera.components.Transform.position.slice(0, 2).map((v, i) => v - position(initial)[i])) < .01, 'camera follows the player');
  const report = { passed: true, sourceGroundCells: 284, sourceHeightTriggers: 6, sourceAnimationClips: 16, cameraFollow: true, heightTransitions: [] };
  const level = async (expected, name) => {
    const s = await snapshot(); assert.equal(position(s)[2], expected);
    const active = s.entities.filter(e => e.components.EdgeCollider2D && !e.components.EdgeCollider2D.is_trigger);
    assert.equal(active.length, expected === 2 ? 4 : expected === 4 ? 5 : 0, 'source collider group switches with height');
    const upper = s.entities.filter(e => e.name.startsWith('Tilemap - Collider - Level 2') && e.components.PolygonCollider2D);
    assert.equal(upper.length, expected === 6 ? 31 : 0);
    report.heightTransitions.push({ height: expected, position: position(s), edgeOutlines: active.length, upperPolygons: upper.length });
    await capture(name);
    console.log(`Height ${expected}: ${position(s).join(', ')}`);
  };
  // Enter the left staircase from its lower landing, then move along its diagonal.
  await actions([['KeyS',12],['KeyD',55],['KeyA,KeyW',20]]);
  await actions([['KeyD',18],['KeyA,KeyW',30]]);
  await actions([['KeyA',8],['KeyW',22]]);
  await actions([['KeyA,KeyW',28],['KeyW',8]]);
  await level(4, 'isometric-level-1');
  await actions([['KeyD',30],['KeyW',30]]);
  await actions([['KeyD,KeyW',28],['KeyW',8]]);
  await level(6, 'isometric-level-2');
  await actions([['KeyS',8],['KeyA,KeyS',32]]);
  await level(4, 'isometric-descended');
  const beforeWall = position(await snapshot());
  await actions([['KeyW',80]]);
  const afterWall = position(await snapshot());
  report.wallDisplacement = Math.hypot(afterWall[0] - beforeWall[0], afterWall[1] - beforeWall[1]);
  assert.ok(report.wallDisplacement < .8, 'native contour blocks traversal through the raised platform');
  report.nativeCollision = true;
  await actions([['KeyA',30],['KeyS',8],['KeyD,KeyS',44]]);
  await level(2, 'isometric-base-return');
  await actions([['KeyS',30],['KeyD',50],['KeyW',20],['KeyD,KeyW',30]]);
  await level(4, 'isometric-right-stairs');
  await actions([['KeyA,KeyS',35]]);
  await level(2, 'isometric-right-return');
  await actions([['KeyR',1]]); await step(28);
  assert.ok((await capture('isometric-reset')).equals(initialShot), 'reset restores camera and initial pixels');
  const directions = [['KeyW','N',false],['KeyA,KeyW','NE',true],['KeyA','E',true],['KeyA,KeyS','SE',true],['KeyS','S',false],['KeyD,KeyS','SE',false],['KeyD','E',false],['KeyD,KeyW','NE',false]];
  for (const [keys, spriteDirection, flip] of directions) {
    await execute('playback.input', { keys: keys.split(',') }); await step();
    const renderer = witch(await snapshot()).components.SpriteRenderer;
    assert.ok(renderer.sprite.includes(`witch run ${spriteDirection}00.png`), renderer.sprite); assert.equal(renderer.flip_x, flip);
  }
  const runFirst = witch(await snapshot()).components.SpriteRenderer.sprite; await step(5);
  assert.notEqual(witch(await snapshot()).components.SpriteRenderer.sprite, runFirst, '12 Hz run animation advances');
  report.eightDirectionsAndMirrors = true; report.animationAdvances = true;
  await execute('playback.stop'); assert.deepEqual((await snapshot()).entities, authored.entities);
  await execute('playback.play', { paused: true }); await step(30);
  assert.ok((await capture('isometric-restarted')).equals(initialShot));
  await execute('playback.stop');
  const view = authored.entities.find(e => e.name === 'Main Camera');
  try {
    await execute('component.set', { entity: view.entity, type: 'Transform', value: { ...view.components.Transform, position: [1.5, -.25, 10] } });
    await execute('component.set', { entity: view.entity, type: 'Camera2D', value: { ...view.components.Camera2D, size: 4.8 } });
    await execute('playback.play', { paused: true }); await step();
    await capture('isometric-overview');
  } finally {
    await execute('playback.stop');
    await execute('component.set', { entity: view.entity, type: 'Transform', value: view.components.Transform });
    await execute('component.set', { entity: view.entity, type: 'Camera2D', value: view.components.Camera2D });
  }
  assert.deepEqual((await snapshot()).entities, authored.entities);
  Object.assign(report, { resetExact: true, stopRestoresAuthored: true, restartExact: true, overviewCameraOverride: true });
  fs.writeFileSync(`${out}/isometric-result.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: Isometric Z As Y, native collision, height transitions, animation, camera and lifecycle');
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally { try { await execute('playback.stop'); } catch {} closeBridgeConnection(); }
