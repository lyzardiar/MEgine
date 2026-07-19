import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEditorProfilerSampler,
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
