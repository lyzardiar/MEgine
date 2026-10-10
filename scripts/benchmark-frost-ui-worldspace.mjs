// Author: MiYu. Measure real-scene WorldSpace layout while verifying live Canvas and transform edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const { createServer } = await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url)), root = path.join(repo, 'packages/editor'), baseline = process.argv[2] ?? 'cf46014', iterations = Number(process.argv[3] ?? 20);
assert.ok(Number.isSafeInteger(iterations) && iterations > 0);
const source = execFileSync('git', ['show', `${baseline}:packages/editor/src/ui/uiLayout.ts`], { cwd: repo, encoding: 'utf8' });
const oldPath = path.join(root, 'src/ui', `uiLayout-benchmark-${process.pid}.ts`), scene = fs.readFileSync(path.join(repo, 'samples/frostbound-realms/Assets/Scenes/Main.mscene'), 'utf8');
fs.writeFileSync(oldPath, source); let server;
try {
  server = await createServer({ root, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  const before = (await server.ssrLoadModule('/src/ui/' + path.basename(oldPath))).layoutUiWorldSpace, after = (await server.ssrLoadModule('/src/ui/uiLayout.ts')).layoutUiWorldSpace;
  const { createEditorStore } = await server.ssrLoadModule('/src/store.ts'), store = createEditorStore(); store.loadSceneJson(scene);
  const entities = store.snapshot().entities, camera = { eye: [0, 0, 4], target: [0, 0, 0], fovYDeg: 60 }, viewport = { x: 0, y: 0, w: 1280, h: 720 }, selected = new Set(), samples = { before: [], after: [] };
  const canvas = entities.find(entity => entity.components.Canvas); assert.ok(canvas); assert.equal(canvas.components.Canvas.render_mode, 'ScreenSpaceOverlay');
  for (let i = 0; i < iterations + 2; i++) for (const name of i % 2 ? ['after', 'before'] : ['before', 'after']) {
    const start = performance.now(), result = (name === 'before' ? before : after)(entities, camera, viewport, selected);
    const ms = performance.now() - start; assert.deepEqual(result, []); if (i >= 2) samples[name].push(ms);
  }
  let comparisons = 0;
  const compare = () => { const old = before(entities, camera, viewport, selected), current = after(entities, camera, viewport, selected); assert.deepEqual(current, old); comparisons++; return current; };
  const original = canvas.components.Canvas.render_mode; canvas.components.Canvas.render_mode = 'WorldSpace'; compare();
  canvas.components.Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }; compare();
  canvas.components.Transform.position[0] = 1; compare(); canvas.active = false; compare(); canvas.active = true;
  canvas.components.Canvas.render_mode = 'ScreenSpaceCamera'; compare(); canvas.components.Canvas.render_mode = original; compare();
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(JSON.stringify({ author: 'MiYu', scope: 'Alternating Node/Vite real-store WorldSpace layout; excludes React, IPC, GPU and native FPS. Complete output equality across live Canvas mode, activity and transform edits.', baseline, sourceSceneSha256: createHash('sha256').update(scene).digest('hex'), entities: entities.length, iterations, warmups: 2, fullOutputComparisons: comparisons, outputEqual: true, mediansMs: { before: median(samples.before), after: median(samples.after) }, samplesMs: samples }));
} finally { await server?.close(); fs.rmSync(oldPath, { force: true }); }
