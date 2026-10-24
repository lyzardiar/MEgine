// Author: MiYu. Keep world bundle diagnostics visible and independent for each completed native frame.
import assert from 'node:assert/strict';
import test from 'node:test';
import { clearEditorProfilerSamples, nativeViewportTimingSample, recordOwnedNativeViewportProfile, readNativeViewportProfiles } from '../src/editorProfiler.ts';

test('bounded native timing samples preserve explicit zero counters and omit unavailable legacy counters', () => {
  const frame = { source: 'scene', timestamp: 1, counts: { entities: 14437, worldBundleBuilds: 0, worldBundleHits: 2, worldBundleDraws: 512, worldBundleReusedDraws: 512 } };
  const first = nativeViewportTimingSample(frame); assert.equal(first.worldBundleBuilds, 0); assert.equal(first.worldBundleHits, 2);
  assert.equal(first.worldBundleDraws, 512); assert.equal(first.worldBundleReusedDraws, 512);
  const next = nativeViewportTimingSample({ ...frame, timestamp: 2, counts: { ...frame.counts, worldBundleBuilds: 1, worldBundleHits: 0, worldBundleDraws: 256, worldBundleReusedDraws: 0 } });
  assert.equal(next.worldBundleDraws, 256); assert.equal(next.worldBundleReusedDraws, 0); assert.equal(first.worldBundleReusedDraws, 512);
  assert.equal(next.worldBundleBuilds, 1); assert.equal(next.worldBundleHits, 0); assert.equal(first.worldBundleHits, 2);
  for (const counts of [undefined, { entities: 1 }]) {
    const legacy = nativeViewportTimingSample({ ...frame, counts }); assert.equal(legacy.worldBundleHits, undefined); assert.equal(legacy.worldBundleBuilds, undefined);
    assert.equal(legacy.worldBundleDraws, undefined); assert.equal(legacy.worldBundleReusedDraws, undefined);
    assert.ok(!JSON.stringify(legacy).includes('worldBundle'));
  }
});

test('native frame histories keep per-source and old-frame bundle counts independent', () => {
  clearEditorProfilerSamples();
  recordOwnedNativeViewportProfile('scene', { schemaVersion: 1, totalMs: 3, counts: { worldBundleBuilds: 0, worldBundleHits: 1 } }, 1);
  recordOwnedNativeViewportProfile('game', { schemaVersion: 1, totalMs: 4, counts: { worldBundleBuilds: 2, worldBundleHits: 0 } }, 2);
  const old = nativeViewportTimingSample(readNativeViewportProfiles('scene', false)[0]);
  recordOwnedNativeViewportProfile('scene', { schemaVersion: 1, totalMs: 5, counts: { worldBundleBuilds: 3, worldBundleHits: 0 } }, 3);
  assert.equal(old.worldBundleHits, 1); assert.equal(nativeViewportTimingSample(readNativeViewportProfiles('scene', false)[1]).worldBundleBuilds, 3);
  assert.equal(nativeViewportTimingSample(readNativeViewportProfiles('game', false)[0]).worldBundleBuilds, 2);
});
