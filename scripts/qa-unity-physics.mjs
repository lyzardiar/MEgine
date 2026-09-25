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
const out = fileURLToPath(new URL('../docs/designs/unity-demos/', import.meta.url));
const step = (steps = 1) => execute('playback.step', { deltaTime: .02, steps });
const bodies = snapshot => snapshot.entities.filter(entity => entity.components.Rigidbody2D?.body_type === 'dynamic');
const pointer = ([x, y]) => [800 + x * 150, 450 - y * 150];
const capture = async name => {
  const shot = await query('view.screenshot', { target: 'game' });
  const bytes = Buffer.from(shot.dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(`${out}/${name}.png`, bytes);
  const colors = JSON.parse(execFileSync('python', ['-c', 'from PIL import Image; import sys,json; im=Image.open(sys.argv[1]).convert("RGB"); p=list(im.get_flattened_data()); print(json.dumps({"colorful":sum(max(c)-min(c)>20 for c in p),"white":sum(min(c)>200 for c in p)}))', `${out}/${name}.png`], { encoding: 'utf8' }));
  assert.ok(colors.colorful > 400, 'native capture must include rendered source sprites');
  return bytes;
};
try {
  for (const slug of (process.argv[2] ? [process.argv[2]] : ['bounce', 'friction', 'box-stacked', 'circle-stacked'])) {
    const root = fileURLToPath(new URL(`../samples/unity-physics-${slug}/`, import.meta.url));
    if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
    await execute('project.open', { root });
    const authored = await query('scene.snapshot');
    const stacked = slug.endsWith('stacked');
    assert.equal(bodies(authored).length, stacked ? 0 : 10);
    assert.equal(authored.entities.filter(e => e.components.EdgeCollider2D).length, slug === 'friction' ? 0 : 1);
    await execute('playback.play', { paused: true }); await execute('panel.focus', { kind: 'game' }); await step();
    const initial = await query('scene.snapshot');
    assert.equal(bodies(initial).length, stacked ? 9 : 10);
    const initialShot = await capture(`physics-${slug}-initial`);
    const peaks = new Map(), hitGround = new Set();
    for (let frame = 1; frame <= (slug === 'bounce' ? 200 : 0); frame++) {
      await step();
      if (slug === 'bounce') {
        const current = await query('scene.snapshot');
        for (const body of bodies(current)) {
          const y = body.components.Transform.position[1], vy = body.components.Rigidbody2D.velocity[1];
          if (y < -2.15 && vy >= -.001) hitGround.add(body.entity);
          if (hitGround.has(body.entity)) peaks.set(body.entity, Math.max(peaks.get(body.entity) ?? -2.3, y));
          assert.ok(y > -2.4, 'edge boundary must hold the falling crate');
        }
        if (frame === 60) await capture(`physics-${slug}-simulated`);
      }
    }
    if (slug !== 'bounce') {
      let frame = 0;
      for (const target of (stacked ? [48, 98, 148, 198, 248, 600] : [200])) {
        await step(target - frame); frame = target;
        if (stacked) assert.equal(bodies(await query('scene.snapshot')).length, Math.min(5, Math.floor((frame + 1) * .02) + 1) * 9, 'source spawn cadence');
      }
    }
    const settled = await query('scene.snapshot');
    const report = { passed: true, sourceDynamicBodies: stacked ? 0 : 10, sourceSpawners: stacked ? 9 : 0, settledBodies: bodies(settled).length };
    for (const before of bodies(initial)) assert.equal(bodies(settled).find(e => e.name === before.name).entity, before.entity);
    if (slug === 'bounce') {
      const ordered = bodies(settled).sort((a, b) => a.components.BoxCollider2D.bounciness - b.components.BoxCollider2D.bounciness);
      const heights = ordered.map(body => peaks.get(body.entity) + 2.3);
      assert.equal(hitGround.size, 10);
      for (let i = 1; i < heights.length; i++) assert.ok(heights[i] >= heights[i - 1] - .001 && (i < 2 || heights[i] > heights[i - 1] + .005), `resolved rebound height must rise with restitution: ${heights}`);
      assert.ok(heights[0] < .08 && heights[9] > 2.5);
      report.reboundHeights = heights;
    } else if (slug === 'friction') {
      const ordered = bodies(settled).sort((a, b) => a.components.BoxCollider2D.friction - b.components.BoxCollider2D.friction);
      const distances = ordered.map(body => body.components.Transform.position[0] - bodies(initial).find(before => before.entity === body.entity).components.Transform.position[0]);
      for (let i = 1; i < distances.length; i++) assert.ok(distances[i] < distances[i - 1], `higher friction must stop sooner: ${distances}`);
      assert.ok(ordered.every(body => Math.hypot(...body.components.Rigidbody2D.velocity) < .02), 'all crates should stop on their ledges');
      report.slideDistances = distances;
    } else {
      assert.equal(bodies(settled).length, 45);
      for (const body of bodies(settled)) {
        const [x, y] = body.components.Transform.position;
        assert.ok(Math.abs(x) < 5.41 && y > -2.3 && y < 5, `stacked body escaped boundary: ${x},${y}`);
      }
      report.maximumSettledSpeed = Math.max(...bodies(settled).map(body => Math.hypot(...body.components.Rigidbody2D.velocity)));
      assert.ok(report.maximumSettledSpeed < .15, `stack must settle: ${report.maximumSettledSpeed}`);
    }
    if (slug !== 'bounce') await capture(`physics-${slug}-simulated`);
    if (slug !== 'bounce') {
      const chosen = [...bodies(settled)].sort((a, b) => slug === 'friction' ? Math.abs(a.components.Transform.position[1]) - Math.abs(b.components.Transform.position[1]) : b.components.Transform.position[1] - a.components.Transform.position[1])[0];
      const start = chosen.components.Transform.position, target = [start[0] + .3, start[1] + .6];
      await execute('playback.input', { buttons: [0], pointer: pointer(start), viewport: [1600, 900] }); await step();
      assert.ok((await query('scene.snapshot')).entities.find(e => e.entity === chosen.entity).components.TargetJoint2D, 'mouse down must create native joint');
      await execute('playback.input', { buttons: [0], pointer: pointer(target), viewport: [1600, 900] });
      await step(150);
      const dragged = (await query('scene.snapshot')).entities.find(e => e.entity === chosen.entity);
      assert.ok(dragged.components.Transform.position[1] > start[1] + .2, 'joint must lift against gravity');
      assert.ok(Math.abs(dragged.components.Transform.position[0] - target[0]) < .12, 'joint must follow pointer');
      await capture(`physics-${slug}-dragged`);
      await execute('playback.input', { buttons: [] }); await step();
      const released = await query('scene.snapshot');
      assert.ok(!released.entities.find(e => e.entity === chosen.entity).components.TargetJoint2D);
      assert.ok(!released.entities.some(e => e.name === 'Drag Line'));
      report.nativeDragAndRelease = true;
    }
    await execute('playback.input', { keys: ['KeyR'], buttons: [] }); await step();
    const reset = await query('scene.snapshot');
    assert.ok(bodies(reset).length <= (stacked ? 9 : 10));
    assert.ok(!reset.entities.some(e => e.components.TargetJoint2D));
    await execute('playback.stop'); assert.deepEqual((await query('scene.snapshot')).entities, authored.entities);
    await execute('playback.play', { paused: true }); await step();
    assert.ok((await capture(`physics-${slug}-restarted`)).equals(initialShot), 'a fresh Play session must reproduce initial pixels');
    await execute('playback.input', { keys: ['KeyH'] }); await step(2);
    assert.ok((await query('scene.snapshot')).entities.filter(e => e.components.Text).every(e => e.components.Text.enabled === false), 'batched steps must consume a pressed key only once');
    await execute('playback.stop');
    Object.assign(report, { stableEntityIds: true, reset: true, stopRestoresAuthored: true, restartExact: true, batchedInputEdges: true });
    fs.writeFileSync(`${out}/physics-${slug}-result.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(`PASS: physics-${slug}, ${report.settledBodies} bodies, source physics response and lifecycle`);
  }
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally {
  try { await execute('playback.stop'); } catch { /* Disconnected editor. */ }
  closeBridgeConnection();
}
