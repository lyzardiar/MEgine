import assert from 'node:assert/strict';
import test from 'node:test';
import { rectBounds, snapRectToGuides } from '../src/rectSmartGuides.ts';

test('snaps moving edges to sibling edges and emits a vertical guide', () => {
  const result = snapRectToGuides(
    { x: 0, y: 20, w: 100, h: 50 },
    [{ x: 205, y: 10, w: 80, h: 90 }],
    { x: 103, y: 0 },
  );
  assert.equal(result.offset.x, 105);
  assert.deepEqual(result.guides.find((guide) => guide.axis === 'x'), {
    axis: 'x', position: 205, from: 10, to: 100,
  });
});

test('snaps centers on both axes and leaves distant axes untouched', () => {
  const result = snapRectToGuides(
    { x: 0, y: 0, w: 40, h: 40 },
    [{ x: 100, y: 100, w: 40, h: 40 }],
    { x: 81, y: 79 },
    2,
  );
  assert.deepEqual(result.offset, { x: 80, y: 80 });
  assert.equal(result.guides.length, 2);
  const distant = snapRectToGuides(
    { x: 0, y: 0, w: 10, h: 10 },
    [{ x: 100, y: 100, w: 10, h: 10 }],
    { x: 5, y: 6 },
    2,
  );
  assert.deepEqual(distant, { offset: { x: 5, y: 6 }, guides: [] });
});

test('computes one stable bounding box for multi-selection snapping', () => {
  assert.deepEqual(rectBounds([
    { x: 10, y: 20, w: 30, h: 40 },
    { x: -5, y: 35, w: 20, h: 10 },
  ]), { x: -5, y: 20, w: 45, h: 40 });
  assert.equal(rectBounds([]), null);
});
