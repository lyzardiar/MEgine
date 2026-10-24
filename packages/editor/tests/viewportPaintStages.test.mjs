// Author: MiYu. Verify disjoint CPU paint scopes, weighted sampling and cross-window ownership.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from '../node_modules/typescript/lib/typescript.js';
import { VIEWPORT_PAINT_STAGE_LABELS, clearEditorProfilerSamples, createEditorProfilerSampler, readEditorProfilerSamples, summarizeEditorProfilerSamples } from '../src/editorProfiler.ts';
import { initializeEditorInstance } from '../src/editorInstance.ts';

const frame = (timestamp, paintStages, source = 'scene') => ({ source, timestamp, frameIntervalMs: 16, paintMs: 10, paintStages, entities: 100, drawItems: 2, uiPrimitives: 3, uiBatches: 1, particles: 0, spineSkeletons: 0, viewportPixels: 640 * 480 });

test('actual Viewport scopes partition completed paint CPU time in their production order', () => {
  const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8'), ast = ts.createSourceFile('Viewport.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let fields;
  function visit(node) { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'recordViewportProfilerFrame') fields = node.arguments[0].properties; ts.forEachChild(node, visit); }
  visit(ast); assert.ok(fields);
  const read = key => fields.find(p => p.name.getText(ast) === key).initializer.getText(ast);
  const marks = ['paintStartedAt', 'requestStageAt', 'worldStageAt', 'worldDrawStageAt', 'gizmoStageAt', 'uiStageAt', 'paintFinishedAt'];
  const calculate = new Function(...marks, 'return {paintMs:' + read('paintMs') + ',stages:' + read('paintStages') + '};');
  for (let offset = 0; offset < 100; offset++) {
    const durations = [1, 3, 2, 0, 4, 1].map(v => v + offset / 32), times = [offset * 10];
    for (const duration of durations) times.push(times.at(-1) + duration);
    const result = calculate(...times);
    assert.deepEqual(Object.keys(result.stages), Object.keys(VIEWPORT_PAINT_STAGE_LABELS));
    assert.equal(Object.values(result.stages).reduce((a, b) => a + b, 0), result.paintMs);
    Object.values(result.stages).forEach((ms, i) => assert.equal(ms, durations[i]));
  }
  let previous = source.indexOf('    if (skipUnchangedScenePaint && scenePaintState.frame');
  assert.ok(previous > 0);
  for (const name of marks.slice(1)) { const at = source.indexOf('const ' + name + ' = performance.now();'); assert.ok(at > previous, name); assert.equal(source.indexOf('const ' + name + ' =', at + 1), -1); previous = at; }
  for (const [before, mark, after] of [['nativeScenePickRef.current =', 'requestStageAt', 'const displayedWorld ='], ['const drawn = prepareDrawn(', 'worldStageAt', 'const drawWorld ='], ['ctx.drawImage(nativeSceneFrame.image', 'worldDrawStageAt', 'const box = e.components.BoxCollider3D'], ['const points = readLine2DPoints(line.points)', 'gizmoStageAt', 'const textMeasurement = canvasUiTextLayoutMeasurement(ctx)'], ['drawArtboardOverlay(', 'uiStageAt', 'drawSmartGuides(ctx'], ['ctx.restore();\n    // MiYu: completion', 'paintFinishedAt', 'recordViewportProfilerFrame({']]) {
    const marker = source.indexOf('const ' + mark + ' ='), left = source.indexOf(before), right = source.indexOf(after, marker);
    assert.ok(left >= 0 && left < marker && marker < right, mark + ' scope boundary');
  }
});

test('stage buckets keep their own means, peaks and coverage without filling missing legacy stages with zero', () => {
  const sample = createEditorProfilerSampler(100), stages = { request: 1, world: 2, ui: 0 };
  assert.equal(sample(frame(0, stages)), null); stages.request = 999;
  assert.equal(sample(frame(50, { request: 3, world: 4, ui: 0 })), null);
  const result = sample(frame(100, undefined));
  assert.equal(result.sampleCount, 3);
  assert.deepEqual(result.paintStages, { request: { averageMs: 2, maxMs: 3, sampleCount: 2 }, world: { averageMs: 3, maxMs: 4, sampleCount: 2 }, ui: { averageMs: 0, maxMs: 0, sampleCount: 2 } });
  assert.equal(sample(frame(200, undefined)).paintStages, undefined, 'legacy-only buckets have no stage values');
  const scene = sample(frame(300, { ui: 7 })); assert.deepEqual(scene.paintStages, { ui: { averageMs: 7, maxMs: 7, sampleCount: 1 } });
  assert.equal(sample(frame(300, { request: 200 }, 'game')), null);
  const game = sample(frame(400, { request: 100 }, 'game')); assert.equal(game.paintStages.request.averageMs, 150);
  assert.equal(scene.paintStages.ui.averageMs, 7, 'later sources and buckets do not mutate retained samples');
});

test('paint stage summaries weight actual covered paints across unequal sampling buckets', () => {
  const sample = stages => ({ ...frame(0), frameMs: 16, frameMaxMs: 16, paintMaxMs: 10, sampleCount: 15, paintStages: stages });
  const summary = summarizeEditorProfilerSamples([sample({ request: { averageMs: 10, maxMs: 10, sampleCount: 1 } }), sample({ request: { averageMs: 2, maxMs: 5, sampleCount: 9 }, ui: { averageMs: 0, maxMs: 0, sampleCount: 2 } }), sample(undefined)]);
  assert.deepEqual(summary.paintStages, { request: { averageMs: 2.8, maxMs: 10, sampleCount: 10 }, ui: { averageMs: 0, maxMs: 0, sampleCount: 2 } });
  assert.equal(summarizeEditorProfilerSamples([]).paintStages, undefined);
  assert.equal(summarizeEditorProfilerSamples([sample(undefined)]).paintStages, undefined);
});

test('floating point accumulation cannot push a stage mean above its measured peak', () => {
  const sample = createEditorProfilerSampler(100); let result;
  for (let i = 0; i < 3; i++) result = sample(frame(i * 50, { request: .1 }));
  assert.deepEqual(result.paintStages.request, { averageMs: .1, maxMs: .1, sampleCount: 3 });
});

test('raw stage inputs discard invalid values and unknown names while preserving real zero measurements', () => {
  const sample = createEditorProfilerSampler(16);
  sample(frame(0, { request: NaN, world: Infinity, worldDraw: -1, gizmos: '2', ui: 0, composition: 5, unexpected: 100 }));
  const result = sample(frame(16, []));
  assert.deepEqual(result.paintStages, { ui: { averageMs: 0, maxMs: 0, sampleCount: 1 }, composition: { averageMs: 5, maxMs: 5, sampleCount: 1 } });
  assert.equal(sample(frame(32, { request: -Infinity })).paintStages, undefined);
});

test('remote stage samples stay bounded, validate coverage and remain isolated from sender and reader mutation', () => {
  const original = globalThis.BroadcastChannel; let receive;
  globalThis.BroadcastChannel = class { addEventListener(_, callback) { receive = callback; } postMessage() {} };
  try {
    initializeEditorInstance('viewport-paint-stages-test'); clearEditorProfilerSamples();
    const stages = { request: { averageMs: 2, maxMs: 4, sampleCount: 3 }, world: { averageMs: NaN, maxMs: 4, sampleCount: 2 }, worldDraw: { averageMs: 2, maxMs: 1, sampleCount: 2 }, gizmos: { averageMs: 1, maxMs: 3, sampleCount: 0 }, ui: { averageMs: 0, maxMs: 0, sampleCount: 2 }, composition: { averageMs: 3, maxMs: Infinity, sampleCount: 1 }, unexpected: { averageMs: 100, maxMs: 100, sampleCount: 1 } };
    const sample = { ...frame(100), frameMs: 16, frameMaxMs: 20, paintMaxMs: 10, sampleCount: 3, paintStages: stages };
    receive({ data: { type: 'sample', sample } }); stages.request.averageMs = 999;
    const copy = readEditorProfilerSamples('scene')[0];
    assert.deepEqual(copy.paintStages, { request: { averageMs: 2, maxMs: 4, sampleCount: 3 }, ui: { averageMs: 0, maxMs: 0, sampleCount: 2 } });
    copy.paintStages.request.averageMs = 888; delete copy.paintStages.ui;
    assert.equal(readEditorProfilerSamples('scene')[0].paintStages.request.averageMs, 2); assert.ok(readEditorProfilerSamples('scene')[0].paintStages.ui);
    receive({ data: { type: 'sample', sample: { ...sample, timestamp: 200, paintStages: undefined } } });
    assert.equal(readEditorProfilerSamples('scene')[1].paintStages, undefined);
    const panel = readFileSync(new URL('../src/panels/Profiler.tsx', import.meta.url), 'utf8');
    assert.match(panel, /aria-label="WebView paint CPU stages"/); assert.match(panel, /This bucket can span multiple native frames/);
    clearEditorProfilerSamples(); assert.equal(readEditorProfilerSamples().length, 0);
  } finally { globalThis.BroadcastChannel = original; }
});
