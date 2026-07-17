import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceForSceneZoom, normalizeSceneZoom } from '../src/sceneZoom.ts';

test('moves the camera inversely to the requested Canvas zoom', () => {
  assert.equal(distanceForSceneZoom(10, 0.5, 1), 5);
  assert.equal(distanceForSceneZoom(10, 2, 1), 20);
  assert.equal(distanceForSceneZoom(10, 1, 2), 5);
});

test('zoom and distance stay within editor safety limits', () => {
  assert.equal(normalizeSceneZoom(0), 0.05);
  assert.equal(normalizeSceneZoom(100), 16);
  assert.equal(normalizeSceneZoom(Number.NaN), 1);
  assert.equal(distanceForSceneZoom(0.5, 0.05, 16), 0.5);
  assert.equal(distanceForSceneZoom(200, 16, 0.05), 200);
});
