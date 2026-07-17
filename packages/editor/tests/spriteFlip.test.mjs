import assert from 'node:assert/strict';
import test from 'node:test';
import { spriteLocalCorners, spriteSourceAffine } from '../src/math3d.ts';

const corners = [
  { x: 0, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 0 },
  { x: 0, y: 0 },
];

test('sprite affine mapping mirrors texture coordinates without moving the quad', () => {
  assert.deepEqual(spriteSourceAffine(corners, 20, 10), [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(spriteSourceAffine(corners, 20, 10, true, false), [-1, 0, 0, 1, 20, 0]);
  assert.deepEqual(spriteSourceAffine(corners, 20, 10, false, true), [1, 0, 0, -1, 0, 10]);
  assert.deepEqual(spriteSourceAffine(corners, 20, 10, true, true), [-1, 0, 0, -1, 20, 10]);
});

test('sprite affine mapping rejects invalid image dimensions', () => {
  assert.equal(spriteSourceAffine(corners, 0, 10, true, false), null);
  assert.equal(spriteSourceAffine([], 20, 10, true, false), null);
});

test('sprite pivot offsets local geometry while keeping the transform at the pivot', () => {
  assert.deepEqual(spriteLocalCorners([1, 2], [0.25, 0.75]), [
    [-0.5, -3, 0],
    [1.5, -3, 0],
    [1.5, 1, 0],
    [-0.5, 1, 0],
  ]);
  assert.deepEqual(spriteLocalCorners([1, 1], [-5, Number.NaN]), [
    [0, -1, 0],
    [2, -1, 0],
    [2, 1, 0],
    [0, 1, 0],
  ]);
});
