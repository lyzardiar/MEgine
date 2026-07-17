import assert from 'node:assert/strict';
import test from 'node:test';
import { planRectResize } from '../src/rectResize.ts';

test('unrotated east resize keeps the west edge fixed', () => {
  assert.deepEqual(planRectResize('e', [0.5, 0.5], [1, 1], 0, 20, 0), {
    sizeDelta: [20, 0],
    positionDelta: [10, 0],
    visualSizeDelta: [20, 0],
  });
});

test('rotated resize converts pivot compensation back to parent axes', () => {
  const plan = planRectResize('e', [0.5, 0.5], [1, 1], 90, 20, 0);
  assert.ok(Math.abs(plan.positionDelta[0]) < 1e-10);
  assert.equal(plan.positionDelta[1], -10);
  assert.deepEqual(plan.sizeDelta, [20, 0]);
  assert.deepEqual(plan.visualSizeDelta, [20, 0]);
});

test('local scale only changes sizeDelta, not the visual pivot displacement', () => {
  assert.deepEqual(planRectResize('se', [0.5, 0.25], [2, 4], 0, 20, 40), {
    sizeDelta: [10, 10],
    positionDelta: [10, 10],
    visualSizeDelta: [20, 40],
  });
});

test('invalid pointer values cannot corrupt resize data', () => {
  assert.deepEqual(planRectResize('nw', [0.5, 0.5], [0, 0], Number.NaN, Number.NaN, 0), {
    sizeDelta: [0, 0],
    positionDelta: [0, 0],
    visualSizeDelta: [0, 0],
  });
});

test('Alt resize keeps the pivot fixed and expands through the opposite side', () => {
  assert.deepEqual(
    planRectResize('e', [0.5, 0.5], [1, 1], 0, 10, 0, {
      aroundPivot: true,
      currentVisualSize: [100, 50],
    }),
    {
      sizeDelta: [20, 0],
      positionDelta: [0, 0],
      visualSizeDelta: [20, 0],
    },
  );
});

test('Shift corner resize preserves the current visual aspect ratio', () => {
  assert.deepEqual(
    planRectResize('se', [0.5, 0.5], [1, 1], 0, 20, 5, {
      preserveAspect: true,
      currentVisualSize: [200, 100],
    }),
    {
      sizeDelta: [20, 10],
      positionDelta: [10, 5],
      visualSizeDelta: [20, 10],
    },
  );
});

test('Shift and Alt combine as uniform resize around the pivot', () => {
  assert.deepEqual(
    planRectResize('se', [0.5, 0.5], [1, 1], 0, 10, 2, {
      preserveAspect: true,
      aroundPivot: true,
      currentVisualSize: [200, 100],
    }),
    {
      sizeDelta: [20, 10],
      positionDelta: [0, 0],
      visualSizeDelta: [20, 10],
    },
  );
});
