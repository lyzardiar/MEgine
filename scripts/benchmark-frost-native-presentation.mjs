// Author: MiYu. Measure repeated paints of an owned decoded frame with equal hierarchy, camera and browser flags.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const { createServer } = await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url)), iterations = Number(process.argv[2] ?? 20), paints = 3;
assert.ok(Number.isSafeInteger(iterations) && iterations > 0);
const scene = fs.readFileSync(path.join(repo, 'samples/frostbound-realms/Assets/Scenes/Main.mscene'), 'utf8'), server = await createServer({ root: path.join(repo, 'packages/editor'), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
try {
  const { createEditorStore } = await server.ssrLoadModule('/src/store.ts'), { createNativeViewportPresentationReader } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts'), { createHierarchyActiveLookup } = await server.ssrLoadModule('/src/hierarchyActivation.ts'), { timelineGameCamera } = await server.ssrLoadModule('/src/gameCamera.ts'), { requiresBrowserViewportSnapshot } = await server.ssrLoadModule('/src/nativeViewportFrame.ts');
  const store = createEditorStore(); store.loadSceneJson(scene); const snapshot = store.snapshot(), read = createNativeViewportPresentationReader(), samples = { before: [], after: [] };
  let comparisons = 0;
  for (let i = 0; i < iterations + 2; i++) {
    const world = { ...snapshot, entities: snapshot.entities.slice(), sourceEntities: snapshot.entities, simulationTime: i, runtimeSessionId: 41 }, outputs = {};
    for (const name of i % 2 ? ['after', 'before'] : ['before', 'after']) {
      const started = performance.now(); let output;
      for (let paint = 0; paint < paints; paint++) {
        const prepared = name === 'after' ? read(world) : null, active = prepared?.active ?? createHierarchyActiveLookup(world.entities);
        const camera = prepared ? prepared.gameCamera(null, 0) : timelineGameCamera(world.entities, null, active, 0);
        output = { camera, active: world.entities.filter((_, index) => index % 25 === 0).map(entity => active(entity.entity)), hasSpine: prepared?.hasSpine ?? world.entities.some(entity => !!entity.components.SpineSkeleton), requiresBrowser: prepared?.requiresBrowserSnapshot ?? requiresBrowserViewportSnapshot(world.entities) };
      }
      const ms = performance.now() - started; outputs[name] = output; if (i >= 2) samples[name].push(ms);
    }
    assert.deepEqual(outputs.after, outputs.before); comparisons++;
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(JSON.stringify({ author: 'MiYu', scope: 'Node/Vite repeated presentation preparation over identical owned real-store frames, three paints per decoded frame. Excludes live-world comparison, React, scripts, IPC, GPU and native FPS.', entities: snapshot.entities.length, sourceSceneSha256: createHash('sha256').update(scene).digest('hex'), iterations, warmups: 2, paintsPerFrame: paints, fullOutputComparisons: comparisons, outputEqual: true, mediansMs: { before: median(samples.before), after: median(samples.after) }, samplesMs: samples }));
} finally { await server.close(); }
