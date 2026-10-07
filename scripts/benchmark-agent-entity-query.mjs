// Author: MiYu. Compare identical entity reads on the Frostbound scene; this measures the Node store only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(new URL('../packages/editor/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);

const root = fileURLToPath(new URL('../', import.meta.url));
const scenePath = path.join(root, 'samples/frostbound-realms/Assets/Scenes/Main.mscene');
const raw = fs.readFileSync(scenePath);
const server = await createServer({ root: path.join(root, 'packages/editor'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const measure = fn => { const start = performance.now(); const result = fn(); return { ms: performance.now() - start, result }; };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
  const store = createEditorStore();
  store.loadSceneJson(raw.toString('utf8'));
  const name = 'Frost telemetry', baseline = () => store.snapshot().entities.find(e => e.name === name), optimized = () => store.entitySnapshot(name);
  const report = { author: 'MiYu', scope: 'Node editor store entity lookup; excludes RPC, native rendering, project startup and complete QA', node: process.version, sceneSha256: createHash('sha256').update(raw).digest('hex'), storeSha256: createHash('sha256').update(fs.readFileSync(path.join(root, 'packages/editor/src/store.ts'))).digest('hex'), entities: JSON.parse(raw).world.entities.length, samplesPerMode: 9, warmupsPerMode: 3, modes: [] };
  for (const mode of ['edit', 'play']) {
    if (mode === 'play') store.play();
    const oldTimes = [], newTimes = [];
    for (let i = 0; i < report.warmupsPerMode + report.samplesPerMode; i++) {
      const first = measure(i % 2 ? optimized : baseline), second = measure(i % 2 ? baseline : optimized);
      assert.ok(first.result); assert.deepEqual(first.result, second.result);
      if (i >= report.warmupsPerMode) { oldTimes.push(i % 2 ? second.ms : first.ms); newTimes.push(i % 2 ? first.ms : second.ms); }
    }
    const baselineMedianMs = median(oldTimes), optimizedMedianMs = median(newTimes);
    report.modes.push({ mode, baselineMedianMs, optimizedMedianMs, ratio: baselineMedianMs / optimizedMedianMs, baselineSamplesMs: oldTimes, optimizedSamplesMs: newTimes, identicalResults: true });
  }
  store.stop();
  fs.writeFileSync(path.join(root, 'docs/designs/frostbound-realms/agent-entity-query-benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ entities: report.entities, modes: report.modes.map(({ mode, baselineMedianMs, optimizedMedianMs, ratio }) => ({ mode, baselineMedianMs, optimizedMedianMs, ratio })), scope: report.scope }));
} finally { await server.close(); }
