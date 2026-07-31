import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeEditorInstance } from '../src/editorInstance.ts';
import {
  clearTimelineProfilerSnapshots,
  normalizeTimelineProfilerSnapshot,
  readTimelineProfilerSnapshots,
  recordTimelineProfilerSnapshot,
} from '../src/timelineProfiler.ts';

function snapshot() {
  return {
    version: 1,
    capturedAt: 100,
    assetPath: 'Assets\\Timelines\\Root.mtimeline',
    assetName: 'Root',
    sampleTime: 1.25,
    previewEvaluated: true,
    previewActive: true,
    evaluationCapturedAt: 95,
    evaluationMs: 2.5,
    diagnostics: ['warning'],
    dependency: {
      rootPath: 'Assets/Timelines/Root.mtimeline',
      nodes: [{ path: 'Assets/Timelines/Root.mtimeline', name: 'Root', depth: 0, duration: 4, tracks: 2, items: 3 }],
      edges: [{ parentPath: 'Assets/Timelines/Root.mtimeline', childPath: 'Assets/Missing.mtimeline', trackId: 'nested', trackName: 'Nested', clipIndex: 0, depth: 1, status: 'missing' }],
      totalTracks: 999,
      totalItems: 999,
      maximumDepth: 99,
      missingAssets: 99,
      cycles: 0,
      depthLimited: 0,
      truncated: false,
    },
    evaluation: {
      assetsEvaluated: 1, tracksEvaluated: 2, activeItems: 1, targetResolutions: 1,
      unresolvedTargets: 1, maximumDepth: 0, entityIndexCacheHits: 1,
      entityIndexCacheMisses: 0, bindingTargetCacheHits: 0, bindingTargetCacheMisses: 1,
      bindingTableCacheHits: 1, bindingTableCacheMisses: 0,
    },
  };
}

test('Timeline profiler snapshots normalize paths and recompute dependency totals', () => {
  const normalized = normalizeTimelineProfilerSnapshot(snapshot());
  assert.ok(normalized);
  assert.equal(normalized.assetPath, 'Assets/Timelines/Root.mtimeline');
  assert.equal(normalized.previewEvaluated, true);
  assert.equal(normalized.previewActive, true);
  assert.equal(normalized.evaluationCapturedAt, 95);
  assert.equal(normalized.dependency.totalTracks, 2);
  assert.equal(normalized.dependency.totalItems, 3);
  assert.equal(normalized.dependency.maximumDepth, 0);
  assert.equal(normalized.dependency.missingAssets, 1);
});

test('Timeline profiler snapshots reject missing identity and bound hostile arrays', () => {
  assert.equal(normalizeTimelineProfilerSnapshot({ ...snapshot(), assetPath: '' }), null);
  const value = snapshot();
  value.dependency.nodes = Array.from({ length: 300 }, (_, index) => ({
    path: `Assets/${index}.mtimeline`, name: String(index), depth: index,
    duration: 1, tracks: 1, items: 1,
  }));
  value.dependency.edges = Array.from({ length: 2_100 }, (_, index) => ({
    parentPath: 'Assets/Root.mtimeline', childPath: `Assets/${index}.mtimeline`,
    trackId: String(index), trackName: String(index), clipIndex: index, depth: 1,
    status: 'loaded',
  }));
  const normalized = normalizeTimelineProfilerSnapshot(value);
  assert.equal(normalized.dependency.nodes.length, 256);
  assert.equal(normalized.dependency.edges.length, 2_048);
  assert.equal(normalized.dependency.truncated, true);
});

test('Timeline profiler normalization tolerates malformed cross-window entries and bounds counts', () => {
  const value = snapshot();
  value.dependency.nodes = [null, {
    path: 'Assets/Huge.mtimeline', name: 'Huge', depth: Number.POSITIVE_INFINITY,
    duration: -1, tracks: 1e100, items: Number.NaN,
  }];
  value.dependency.edges = [undefined, {
    parentPath: 'Assets/Root.mtimeline', childPath: 'Assets/Huge.mtimeline',
    trackId: 'huge', trackName: 'Huge', clipIndex: 1e100, depth: -1,
    status: 'unexpected',
  }];
  const normalized = normalizeTimelineProfilerSnapshot(value);
  assert.ok(normalized);
  assert.equal(normalized.dependency.nodes.length, 1);
  assert.equal(normalized.dependency.nodes[0].tracks, Number.MAX_SAFE_INTEGER);
  assert.equal(normalized.dependency.nodes[0].duration, 0);
  assert.equal(normalized.dependency.edges.length, 1);
  assert.equal(normalized.dependency.edges[0].status, 'missing');
  assert.equal(normalized.dependency.edges[0].clipIndex, Number.MAX_SAFE_INTEGER);
  assert.equal(normalized.dependency.edges[0].depth, 0);
});

test('Timeline profiler ignores an older cross-window snapshot for the same asset', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = undefined;
  try {
    initializeEditorInstance('timeline-profiler-tests');
    clearTimelineProfilerSnapshots();
    recordTimelineProfilerSnapshot({ ...snapshot(), capturedAt: 200, evaluationMs: 4 });
    recordTimelineProfilerSnapshot({ ...snapshot(), capturedAt: 100, evaluationMs: 1 });
    const profiles = readTimelineProfilerSnapshots();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].capturedAt, 200);
    assert.equal(profiles[0].evaluationMs, 4);
  } finally {
    clearTimelineProfilerSnapshots();
    globalThis.BroadcastChannel = originalBroadcastChannel;
  }
});
