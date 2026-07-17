import assert from 'node:assert/strict';
import test from 'node:test';
import { cursorForRectGizmo, hitTestRectGizmo } from '../src/rectGizmo.ts';

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

test('Rect Tool size handles keep priority over the body hit area', () => {
  const hits = [
    { kind: 'body', corners: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] },
    { kind: 'size', handle: 'nw', x: 0, y: 0 },
  ];
  assert.deepEqual(hitTestRectGizmo(hits, 2, 2), { kind: 'size', handle: 'nw' });
});
