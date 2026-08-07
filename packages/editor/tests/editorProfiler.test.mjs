import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearEditorProfilerSamples,
  createEditorProfilerSampler,
  EDITOR_PROFILER_BACKGROUND_UI_INTERVAL_MS,
  editorProfilerUiRefreshDelay,
  readNativeViewportProfiles,
  recordNativeViewportProfile,
  summarizeEditorProfilerSamples,
} from '../src/editorProfiler.ts';

function frame(timestamp, overrides = {}) {
  return {
    source: 'game',
    timestamp,
    frameIntervalMs: 16,
    paintMs: 4,
    entities: 12,
    drawItems: 8,
    uiPrimitives: 20,
    uiBatches: 3,
    particles: 40,
    spineSkeletons: 1,
    viewportPixels: 1280 * 720,
    ...overrides,
  };
}

test('editor profiler sampler aggregates bounded frame windows and preserves latest counters', () => {
  const sample = createEditorProfilerSampler(100);
  assert.equal(sample(frame(0)), null);
  assert.equal(sample(frame(50, { frameIntervalMs: 20, paintMs: 6 })), null);
  const result = sample(frame(100, {
    frameIntervalMs: 40,
    paintMs: 8,
    uiBatches: 5,
    particles: 60,
  }));
  assert.ok(result);
  assert.equal(result.sampleCount, 3);
  assert.equal(result.frameMs, (16 + 20 + 40) / 3);
  assert.equal(result.frameMaxMs, 40);
  assert.equal(result.paintMs, 6);
  assert.equal(result.paintMaxMs, 8);
  assert.equal(result.uiBatches, 5);
  assert.equal(result.particles, 60);
});

test('editor profiler sampler starts a fresh window when a hidden viewport becomes visible', () => {
  const sample = createEditorProfilerSampler(100);
  assert.equal(sample(frame(0)), null);
  assert.equal(sample(frame(50)), null);
  assert.equal(sample(frame(5_000, { frameIntervalMs: 0 })), null);
  const result = sample(frame(5_100, { frameIntervalMs: 20 }));
  assert.ok(result);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.frameMs, 20);
  assert.equal(result.frameMaxMs, 20);
});

test('editor profiler summary separates sustained p95 cost from isolated peaks', () => {
  const sample = createEditorProfilerSampler(16);
  const values = [];
  for (let index = 0; index < 21; index += 1) {
    const result = sample(frame(index * 16, {
      frameIntervalMs: index === 20 ? 80 : 10,
      paintMs: index === 20 ? 30 : 2,
    }));
    if (result) values.push(result);
  }
  const summary = summarizeEditorProfilerSamples(values);
  assert.equal(summary.samples, values.length);
  assert.equal(summary.p95FrameMs, 10);
  assert.equal(summary.peakFrameMs, 80);
  assert.equal(summary.p95PaintMs, 2);
  assert.equal(summary.peakPaintMs, 30);
});

test('editor profiler UI coalesces only background updates into stable snapshot windows', () => {
  assert.equal(editorProfilerUiRefreshDelay(1_000, 1_010, true), 0);
  assert.equal(editorProfilerUiRefreshDelay(Number.NEGATIVE_INFINITY, 1_000, false), 0);
  assert.equal(
    editorProfilerUiRefreshDelay(1_000, 1_250, false),
    EDITOR_PROFILER_BACKGROUND_UI_INTERVAL_MS - 250,
  );
  assert.equal(editorProfilerUiRefreshDelay(1_000, 2_000, false), 0);
  assert.equal(editorProfilerUiRefreshDelay(2_000, 1_000, false), 0);
  assert.equal(editorProfilerUiRefreshDelay(1_000, Number.NaN, false), 0);
  assert.equal(editorProfilerUiRefreshDelay(1_000, 1_001, false, -1), 0);
});

test('native viewport profiles retain call trees, memory provenance, and render resources', () => {
  clearEditorProfilerSamples();
  recordNativeViewportProfile('game', {
    schemaVersion: 1,
    totalMs: 3.5,
    callTree: { name: 'render', totalMs: 3.5, selfMs: 0.5, calls: 1, children: [
      { name: 'submit', totalMs: 3, selfMs: 3, calls: 1, children: [] },
    ] },
    memory: [{ name: 'readback', domain: 'cpu', bytes: 16, certainty: 'exact', source: 'Vec length' }],
    residentMemoryEstimateBytes: 16,
    resources: [{
      kind: 'texture', asset: 'Assets/a.png', resolvedPath: 'C:/p/Assets/a.png', loaded: true,
      sourceBytes: 4, gpuBytesEstimate: 16, dimensions: [2, 2], referencedBy: ['UI batch'],
    }],
    resourcesTruncated: false,
    counts: {
      entities: 1, renderObjects: 0, uiPrimitives: 1, uiBatches: 1, uiDrawCalls: 1,
      materialPipelinesBuiltIn: 1, materialPipelinesCustom: 0,
      materialPipelinesResidentCustom: 0, materialPipelinesRejected: 0,
      materialPipelineEvictions: 0, materialTexturesColor: 0, materialTexturesData: 0,
      materialTextureBindGroups: 0, materialSamplers: 0,
    },
  }, 123);
  const [profile] = readNativeViewportProfiles('game');
  assert.equal(profile.timestamp, 123);
  assert.equal(profile.callTree.children[0].name, 'submit');
  assert.equal(profile.memory[0].certainty, 'exact');
  assert.equal(profile.resources[0].dimensions[0], 2);
  profile.resources[0].asset = 'mutated';
  assert.equal(readNativeViewportProfiles('game')[0].resources[0].asset, 'Assets/a.png');
  clearEditorProfilerSamples();
});

test('native viewport profiles default to the frame sampler monotonic clock', () => {
  clearEditorProfilerSamples();
  const before = performance.now();
  recordNativeViewportProfile('scene', { schemaVersion: 1, totalMs: 1 });
  const after = performance.now();
  const [profile] = readNativeViewportProfiles('scene');
  assert.ok(profile.timestamp >= before && profile.timestamp <= after);
  clearEditorProfilerSamples();
});
