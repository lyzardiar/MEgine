import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeSceneFrameForPresentation, nativeSceneFrameRequestIdentity, pendingNativeScenePaintUnchanged } from '../src/nativeSceneFrame.ts';

test('pending Scene paints retain identical pixels but authoring commits, camera changes and new frames repaint immediately', () => {
  const state = { key: 'camera-size-dpr', epoch: 1, frame: {}, preview: {} };
  assert.equal(pendingNativeScenePaintUnchanged(null, state), false);
  assert.equal(pendingNativeScenePaintUnchanged(state, { ...state }), true);
  for (const patch of [{ key: 'new camera' }, { epoch: 2 }, { frame: {} }, { preview: {} }]) assert.equal(pendingNativeScenePaintUnchanged(state, { ...state, ...patch }), false);
});

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
  assert.notEqual(first.key, orbited.key, 'camera movement requests a fresh frame');
  assert.equal(first.presentationKey, orbited.presentationKey, 'camera movement preserves the last complete presentation');
});

test('continuous camera movement retains completed pixels and their camera until a new frame arrives', () => {
  const first = nativeSceneFrameRequestIdentity(camera, viewport, 2, [9, 2]);
  let frame = { presentationKey: first.presentationKey, camera, image: 'first' };
  for (let step = 1; step <= 20; step++) {
    const nextCamera = { ...camera, eye: [step, 4, 7] };
    const next = nativeSceneFrameRequestIdentity(nextCamera, viewport, 2, [2, 9]);
    assert.equal(nativeSceneFrameForPresentation(frame, next), frame, 'pending render keeps complete pixels and matching hit-test camera');
    if (step % 3 === 0) frame = { presentationKey: next.presentationKey, camera: nextCamera, image: `frame ${step}` };
    assert.equal(nativeSceneFrameForPresentation(frame, next).camera, frame.camera);
  }
  for (const identity of [null, nativeSceneFrameRequestIdentity(camera, viewport, 2, [2])]) assert.equal(nativeSceneFrameForPresentation(frame, identity), null);
  for (const identity of [nativeSceneFrameRequestIdentity(camera, { w: 900, h: 600 }, 2, [9, 2]), nativeSceneFrameRequestIdentity(camera, viewport, 1, [9, 2])]) {
    assert.notEqual(identity.key, first.key, 'resize and DPI changes request fresh pixels');
    assert.equal(nativeSceneFrameForPresentation(frame, identity), frame, 'retain complete pixels while resizing');
  }
  assert.equal(nativeSceneFrameForPresentation(null, first), null);
});

test('native Scene frame dimensions remain bounded', () => {
  const identity = nativeSceneFrameRequestIdentity(camera, { w: 10_000, h: 5_000 }, 4, []);
  assert.equal(identity.width, 4_096);
  assert.equal(identity.height, 2_048);
});
