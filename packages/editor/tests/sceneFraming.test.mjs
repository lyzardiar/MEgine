import assert from 'node:assert/strict';
import test from 'node:test';
import { frameWorldSprite } from '../src/sceneFraming.ts';

test('sprite framing targets visual bounds for non-centered pivots', () => {
  const frame = frameWorldSprite(
    [10, 20, 0],
    [0, 0, 0, 1],
    [2, 3, 1],
    [4, 2],
    [0, 1],
  );
  assert.deepEqual(frame.pivot, [14, 17, 0]);
  assert.equal(frame.distance, 10.8);
});

test('sprite framing sanitizes invalid geometry and keeps a useful minimum distance', () => {
  const frame = frameWorldSprite(
    [Number.NaN, 2, 3],
    [0, 0, 0, 1],
    [0, Number.NaN, 1],
    [0, Number.NaN],
    [Number.NaN, Number.POSITIVE_INFINITY],
  );
  assert.deepEqual(frame.pivot, [0, 2, 3]);
  assert.equal(frame.distance, 1.35);
});
