import assert from 'node:assert/strict';
import test from 'node:test';
import { planRectAlignment } from '../src/rectAlignment.ts';

const items = [
  { entity: 1, rect: { x: 0, y: 10, w: 20, h: 20 } },
  { entity: 2, rect: { x: 50, y: 30, w: 40, h: 10 } },
  { entity: 3, rect: { x: 140, y: 60, w: 20, h: 30 } },
];

test('aligns edges and centers to the primary selected item', () => {
  assert.deepEqual(planRectAlignment(items, [1, 2, 3], 2, 'left'), [
    { entity: 1, dx: 50, dy: 0 },
    { entity: 3, dx: -90, dy: 0 },
  ]);
  assert.deepEqual(planRectAlignment(items, [1, 2, 3], 2, 'middle'), [
    { entity: 1, dx: 0, dy: 15 },
    { entity: 3, dx: 0, dy: -40 },
  ]);
});

test('distributes variable-size rects with equal edge gaps', () => {
  assert.deepEqual(planRectAlignment(items, [1, 2, 3], 2, 'distribute-horizontal'), [
    { entity: 2, dx: 10, dy: 0 },
  ]);
});

test('distribution requires three selected roots', () => {
  assert.deepEqual(planRectAlignment(items, [1, 2], 2, 'distribute-horizontal'), []);
});
