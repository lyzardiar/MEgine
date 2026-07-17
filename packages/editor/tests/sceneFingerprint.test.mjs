import assert from 'node:assert/strict';
import test from 'node:test';
import { sceneContentFingerprint } from '../src/sceneFingerprint.ts';

test('scene fingerprints ignore object key order', () => {
  const left = sceneContentFingerprint([
    { entity: 1, components: { Transform: { position: [0, 1, 2], scale: [1, 1, 1] } } },
  ], [0.1, 0.2, 0.3, 1]);
  const right = sceneContentFingerprint([
    { components: { Transform: { scale: [1, 1, 1], position: [0, 1, 2] } }, entity: 1 },
  ], [0.1, 0.2, 0.3, 1]);
  assert.equal(left, right);
});

test('scene fingerprints detect authored world and clear color changes', () => {
  const initial = sceneContentFingerprint([{ entity: 1, active: true }], [0, 0, 0, 1]);
  assert.notEqual(
    initial,
    sceneContentFingerprint([{ entity: 1, active: false }], [0, 0, 0, 1]),
  );
  assert.notEqual(
    initial,
    sceneContentFingerprint([{ entity: 1, active: true }], [0.2, 0, 0, 1]),
  );
});
