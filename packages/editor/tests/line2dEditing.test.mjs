import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hitTestLinePoint,
  linePointDeltaFromWorld,
  linePointWorld,
  moveLine2DPoint,
  readLine2DPoints,
} from '../src/line2dEditing.ts';
import { quatAxisAngle } from '../src/math3d.ts';

test('Line2D points are normalized without accepting malformed rows', () => {
  assert.deepEqual(readLine2DPoints([[1, 2], ['3', 4], null, [Number.NaN, 5]]), [
    [1, 2],
    [3, 4],
    [0, 5],
  ]);
});

test('Line2D local point projection applies scale, rotation, and translation', () => {
  const world = linePointWorld(
    [1, 1],
    [10, 20, 3],
    [2, 4, 1],
    quatAxisAngle([0, 0, 1], 90),
  );
  assert.ok(Math.abs(world[0] - 6) < 1e-6);
  assert.ok(Math.abs(world[1] - 22) < 1e-6);
  assert.ok(Math.abs(world[2] - 3) < 1e-6);
});

test('world drag delta converts back to Line2D local coordinates', () => {
  const delta = linePointDeltaFromWorld(
    [-4, 2, 0],
    [2, 4, 1],
    quatAxisAngle([0, 0, 1], 90),
  );
  assert.ok(Math.abs(delta[0] - 1) < 1e-6);
  assert.ok(Math.abs(delta[1] - 1) < 1e-6);
  assert.deepEqual(linePointDeltaFromWorld([4, 8, 0], [0, 2, 1]), [0, 4]);
});

test('moving one point is immutable and point hit testing chooses the nearest handle', () => {
  const source = [[0, 0], [2, 3]];
  assert.deepEqual(moveLine2DPoint(source, 1, [0.5, -1]), [[0, 0], [2.5, 2]]);
  assert.deepEqual(source, [[0, 0], [2, 3]]);

  const hit = hitTestLinePoint([
    { entity: 1, index: 0, x: 10, y: 10 },
    { entity: 1, index: 1, x: 13, y: 10 },
  ], 12.5, 10);
  assert.equal(hit?.index, 1);
  assert.equal(hitTestLinePoint([], 0, 0), null);
});
