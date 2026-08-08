import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeSceneFrameRequestIdentity } from '../src/nativeSceneFrame.ts';

const viewport = { w: 800, h: 600 };
const camera = { eye: [3, 4, 7], target: [0, 0, 0], fovYDeg: 60 };

test('native Scene bitmaps are keyed to the exact orbit camera that rendered them', () => {
  const first = nativeSceneFrameRequestIdentity(camera, viewport, 2, [9, 2]);
  const same = nativeSceneFrameRequestIdentity(camera, viewport, 2, [2, 9]);
  const orbited = nativeSceneFrameRequestIdentity(
    { ...camera, eye: [7, 4, 3] },
    viewport,
    2,
    [2, 9],
  );

  assert.deepEqual({ width: first.width, height: first.height }, { width: 1600, height: 1200 });
  assert.equal(first.key, same.key, 'visibility ordering is not a visual change');
  assert.notEqual(first.key, orbited.key, 'an old orbit frame must not cover the live camera');
});

test('native Scene frame dimensions remain bounded', () => {
  const identity = nativeSceneFrameRequestIdentity(camera, { w: 10_000, h: 5_000 }, 4, []);
  assert.equal(identity.width, 4_096);
  assert.equal(identity.height, 2_048);
});
