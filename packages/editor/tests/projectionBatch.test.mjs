// Author: MiYu. Batched projection must preserve legacy camera clipping and selection geometry.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjection, project } from '../src/math3d.ts';

test('batched projections match the existing single-point path across camera and viewport limits', () => {
  for (const projection of ['perspective', 'orthographic']) for (const viewport of [{ x: 17, y: 23, w: 1024, h: 768 }, { x: 0, y: 0, w: 0, h: 0 }, { x: -30, y: 8, w: 240, h: 1600 }]) for (const up of [undefined, [1, 0, 0], [0, 0, 0]]) {
    const camera = { eye: [4, 7, 11], target: [-2, 1, 0], fovYDeg: 53, near: 0.25, far: 30, projection, orthographicSize: 7, up };
    const batch = createProjection(camera, viewport);
    for (let i = 0; i < 200; i++) {
      const world = [Math.sin(i) * 17, Math.cos(i * 0.7) * 19, (i % 41) - 10];
      assert.deepEqual(batch(world), project(world, camera, viewport));
    }
    for (const world of [[...camera.eye], [NaN, 0, 0], [Infinity, 0, 0]]) assert.deepEqual(batch(world), project(world, camera, viewport));
  }
  const viewport = { x: 0, y: 0, w: 800, h: 600 }, camera = { eye: [0, 0, 8], target: [0, 0, 0], fovYDeg: 60, near: 1, far: 5 };
  const batch = createProjection(camera, viewport);
  for (const world of [[0, 0, 7], [0, 0, 7.00001], [0, 0, 3], [0, 0, 2.99999]]) assert.deepEqual(batch(world), project(world, camera, viewport));
  const degenerate = { ...camera, target: [...camera.eye] };
  assert.equal(createProjection(degenerate, viewport)([0, 0, 0]), null);
});

test('a projection batch owns its camera values while a fresh batch follows edits', () => {
  const camera = { eye: [0, 0, 8], target: [0, 0, 0], fovYDeg: 60 }, viewport = { x: 0, y: 0, w: 800, h: 600 };
  const batch = createProjection(camera, viewport), before = batch([1, 2, 0]);
  camera.eye[0] = 4; camera.target[1] = 3; camera.fovYDeg = 45; viewport.w = 1400;
  assert.deepEqual(batch([1, 2, 0]), before);
  assert.notDeepEqual(createProjection(camera, viewport)([1, 2, 0]), before);
  assert.deepEqual(createProjection(camera, viewport)([1, 2, 0]), project([1, 2, 0], camera, viewport));
});
