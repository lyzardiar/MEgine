import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cursorForRectGizmo,
  hitTestRectGizmo,
  rectToolHandlePivot,
  rotateRectToolPoint,
} from '../src/rectGizmo.ts';

test('Rect Tool body hit moves the selected rectangle', () => {
  const hits = [{
    kind: 'body',
    corners: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 60 },
      { x: 10, y: 60 },
    ],
  }];
  assert.deepEqual(hitTestRectGizmo(hits, 50, 30), { kind: 'center' });
  assert.equal(hitTestRectGizmo(hits, 150, 30), null);
  assert.equal(cursorForRectGizmo({ kind: 'center' }, 'rect'), 'move');
});

test('Center handle accounts for a non-centered pivot and local rotation', () => {
  const center = rectToolHandlePivot(
    { x: 10, y: 20, w: 100, h: 40 },
    { x: 10, y: 20 },
    [0, 0.5],
    90,
    'center',
  );
  assert.ok(Math.abs(center.x - 10) < 1e-8);
  assert.ok(Math.abs(center.y + 30) < 1e-8);
  assert.deepEqual(
    rectToolHandlePivot({ x: 0, y: 0, w: 10, h: 10 }, { x: 7, y: 8 }, [0, 0], 0, 'pivot'),
    { x: 7, y: 8 },
  );
});

test('Rect group points rotate around the shared tool center', () => {
  const point = rotateRectToolPoint({ x: 20, y: 10 }, { x: 10, y: 10 }, 90);
  assert.ok(Math.abs(point.x - 10) < 1e-8);
  assert.ok(Math.abs(point.y) < 1e-8);
});

test('Rect Tool size handles keep priority over the body hit area', () => {
  const hits = [
    { kind: 'body', corners: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] },
    { kind: 'size', handle: 'nw', x: 0, y: 0 },
  ];
  assert.deepEqual(hitTestRectGizmo(hits, 2, 2), { kind: 'size', handle: 'nw' });
});
