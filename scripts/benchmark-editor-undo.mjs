import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modulePath = path.resolve(process.argv[3] ?? 'packages/editor/src/editorUndo.ts');
const { captureEditorUndoState, restoreEditorUndoState } = await import(pathToFileURL(modulePath));

if (!global.gc) throw new Error('Run with node --expose-gc scripts/benchmark-editor-undo.mjs [label]');
const label = process.argv[2] ?? 'current';
const scenePath = path.resolve('samples/frostbound-realms/Assets/Scenes/Main.mscene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const source = scene.world?.entities ?? scene.entities;
let results = [];
if (process.argv[4] === '--worker') {
  const entities = structuredClone(source), history = [];
  const movable = entities.find(entity => entity.components?.Transform?.position);
  const color = scene.world?.clearColor ?? [0, 0, 0, 1];
  let previous;
  global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  for (let step = 0; step < 128; step++) {
    previous = captureEditorUndoState(entities, [movable.entity], movable.entity, 10000, color, previous);
    history.push(previous);
    movable.components.Transform.position[0] += 1;
  }
  const captureMs = performance.now() - start;
  global.gc();
  const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
  const restoreStart = performance.now();
  const restored = restoreEditorUndoState(history[0]);
  const restoreMs = performance.now() - restoreStart;
  const uniqueEntityRecords = new Set(history.flatMap(state => state.entities)).size;
  console.log(JSON.stringify({ captureMs, retainedHeapBytes, restoreMs, uniqueEntityRecords, restoredEntities: restored.entities.length }));
  process.exit(0);
}
results = Array.from({ length: 3 }, () => JSON.parse(execFileSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), label, modulePath, '--worker'], { encoding: 'utf8' })));
const median = key => results.map(result => result[key]).sort((a, b) => a - b)[1];
const report = { label, node: process.version, modulePath, scenePath, entityCount: source.length, historyDepth: 128, workload: 'Capture before each of 128 single-entity in-place transform edits; fresh process per sample, force GC before/after retention measurement', runs: results, median: Object.fromEntries(['captureMs', 'retainedHeapBytes', 'restoreMs', 'uniqueEntityRecords'].map(key => [key, median(key)])) };
const output = path.resolve('tmp/docs-artifacts/editor-performance-risk');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, `undo-${label}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
