import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANCHOR_PRESETS,
  applyAnchorsKeepingRect,
  applyAnchorPreset,
  applyPivotKeepingRect,
  applyPivotKeepingVisualRect,
  moveAnchorHandle,
  readRectAxis,
  writeRectAxis,
} from '../src/ui/rectTransformModel.ts';
import { solveRectTransform } from '../src/ui/rectLayout.ts';
import { rectLocalAxes, rectPivot } from '../src/rectGizmo.ts';

const base = () => ({
  anchor_min: [0.5, 0.5],
  anchor_max: [0.5, 0.5],
  pivot: [0.5, 0.5],
  anchored_position: [12, 24],
  size_delta: [100, 60],
  local_rotation: 0,
  local_scale: [1, 1],
});

function rotatedCorners(parent, value) {
  const rect = solveRectTransform(parent, value);
  const pivot = rectPivot(rect, value.pivot);
  const axes = rectLocalAxes(value.local_rotation);
  const left = -rect.w * value.pivot[0];
  const right = rect.w * (1 - value.pivot[0]);
  const bottom = -rect.h * value.pivot[1];
  const top = rect.h * (1 - value.pivot[1]);
  return [[left, bottom], [right, bottom], [right, top], [left, top]].map(([x, y]) => ({
    x: pivot.x + x * axes.x.dx + y * axes.y.dx,
    y: pivot.y + x * axes.x.dy + y * axes.y.dy,
  }));
}

test('anchor presets support Unity-style Shift and Alt modifiers', () => {
  const stretch = ANCHOR_PRESETS.find((preset) => preset.key === 'stretch-stretch');
  assert.ok(stretch);
  const next = applyAnchorPreset(base(), stretch, { setPivot: true, snap: true });
  assert.deepEqual(next.anchor_min, [0, 0]);
  assert.deepEqual(next.anchor_max, [1, 1]);
  assert.deepEqual(next.pivot, [0.5, 0.5]);
  assert.deepEqual(next.anchored_position, [0, 0]);
  assert.deepEqual(next.size_delta, [0, 0]);
});

test('vertical anchor presets use Unity bottom-left normalized coordinates', () => {
  const topLeft = ANCHOR_PRESETS.find((preset) => preset.key === 'top-left');
  const bottomRight = ANCHOR_PRESETS.find((preset) => preset.key === 'bottom-right');
  assert.deepEqual(topLeft?.anchorMin, [0, 1]);
  assert.deepEqual(topLeft?.anchorMax, [0, 1]);
  assert.deepEqual(topLeft?.pivot, [0, 1]);
  assert.deepEqual(bottomRight?.anchorMin, [1, 0]);
  assert.deepEqual(bottomRight?.anchorMax, [1, 0]);
  assert.deepEqual(bottomRight?.pivot, [1, 0]);
});

test('layout converts Unity Y-up RectTransform data into screen coordinates', () => {
  const parent = { x: 0, y: 0, w: 800, h: 600 };
  assert.deepEqual(solveRectTransform(parent, {
    anchor_min: [0, 0],
    anchor_max: [0, 0],
    pivot: [0, 0],
    anchored_position: [10, 20],
    size_delta: [100, 50],
    local_scale: [1, 1],
  }), { x: 10, y: 530, w: 100, h: 50 });
  assert.deepEqual(solveRectTransform(parent, {
    anchor_min: [1, 1],
    anchor_max: [1, 1],
    pivot: [1, 1],
    anchored_position: [-10, -20],
    size_delta: [100, 50],
    local_scale: [1, 1],
  }), { x: 690, y: 20, w: 100, h: 50 });
});

test('positive anchored Y moves a Unity UI rectangle upward on screen', () => {
  const parent = { x: 0, y: 0, w: 800, h: 600 };
  const lower = solveRectTransform(parent, { ...base(), anchored_position: [0, 0] });
  const higher = solveRectTransform(parent, { ...base(), anchored_position: [0, 25] });
  assert.equal(higher.y, lower.y - 25);
  assert.deepEqual(solveRectTransform(parent, {
    ...base(),
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    anchored_position: [0, 0],
    size_delta: [0, 0],
  }), parent);
});

test('stretch offsets round-trip through Left Right Top Bottom fields', () => {
  const value = {
    ...base(),
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    anchored_position: [0, 0],
    size_delta: [-30, -50],
  };
  assert.deepEqual(readRectAxis(value, 0), {
    stretched: true,
    firstLabel: 'L',
    secondLabel: 'R',
    first: 15,
    second: 15,
  });
  const withLeft = writeRectAxis(value, 0, 0, 25);
  const withRight = writeRectAxis(withLeft, 0, 1, 10);
  const fields = readRectAxis(withRight, 0);
  assert.equal(fields.first, 25);
  assert.equal(fields.second, 10);

  assert.deepEqual(readRectAxis(value, 1), {
    stretched: true,
    firstLabel: 'T',
    secondLabel: 'B',
    first: 25,
    second: 25,
  });
  const withTop = writeRectAxis(value, 1, 0, 30);
  const withBottom = writeRectAxis(withTop, 1, 1, 12);
  const vertical = readRectAxis(withBottom, 1);
  assert.equal(vertical.first, 30);
  assert.equal(vertical.second, 12);
});

test('pivot editing preserves a fixed-anchor rectangle', () => {
  const value = {
    anchor_min: [0.5, 0.5],
    anchor_max: [0.5, 0.5],
    pivot: [0.5, 0.5],
    anchored_position: [20, -10],
    size_delta: [200, 80],
    local_rotation: 0,
    local_scale: [1, 1],
  };
  const parent = { x: 0, y: 0, w: 800, h: 600 };
  const before = solveRectTransform(parent, value);
  const next = applyPivotKeepingRect(value, [0, 1]);
  assert.deepEqual(solveRectTransform(parent, next), before);
  assert.deepEqual(next.anchored_position, [-80, 30]);
});

test('pivot editing preserves a stretched rectangle and clamps the handle', () => {
  const value = {
    anchor_min: [0, 0.25],
    anchor_max: [1, 0.75],
    pivot: [0.5, 0.5],
    anchored_position: [5, 7],
    size_delta: [-40, 20],
    local_rotation: 0,
    local_scale: [1, 1],
  };
  const parent = { x: 10, y: 20, w: 500, h: 300 };
  const before = solveRectTransform(parent, value);
  const next = applyPivotKeepingRect(value, [-2, 3]);
  assert.deepEqual(next.pivot, [0, 1]);
  assert.deepEqual(solveRectTransform(parent, next), before);
});

test('visual pivot compensation includes local scale and rotation', () => {
  const value = {
    anchor_min: [0.5, 0.5],
    anchor_max: [0.5, 0.5],
    pivot: [0.5, 0.5],
    anchored_position: [20, 30],
    size_delta: [100, 50],
    local_rotation: 90,
    local_scale: [2, 1],
  };
  const next = applyPivotKeepingVisualRect(value, [1, 0.5], [800, 600]);
  assert.deepEqual(next.pivot, [1, 0.5]);
  assert.ok(Math.abs(next.anchored_position[0] - 20) < 1e-10);
  assert.equal(next.anchored_position[1], 130);
  const parent = { x: 0, y: 0, w: 800, h: 600 };
  const before = rotatedCorners(parent, value);
  const after = rotatedCorners(parent, next);
  before.forEach((corner, index) => {
    assert.ok(Math.abs(after[index].x - corner.x) < 1e-8);
    assert.ok(Math.abs(after[index].y - corner.y) < 1e-8);
  });
});

test('visual pivot compensation preserves stretched scale-one layout', () => {
  const value = {
    anchor_min: [0, 0.25],
    anchor_max: [1, 0.75],
    pivot: [0.5, 0.5],
    anchored_position: [5, 7],
    size_delta: [-40, 20],
    local_rotation: 0,
    local_scale: [1, 1],
  };
  const parent = { x: 0, y: 0, w: 400, h: 200 };
  const before = solveRectTransform(parent, value);
  const next = applyPivotKeepingVisualRect(value, [1, 0], [parent.w, parent.h]);
  assert.deepEqual(solveRectTransform(parent, next), before);
});

test('anchor editing preserves the rectangle while changing its layout contract', () => {
  const value = {
    anchor_min: [0.5, 0.5],
    anchor_max: [0.5, 0.5],
    pivot: [0.25, 0.75],
    anchored_position: [20, 30],
    size_delta: [200, 100],
    local_rotation: 0,
    local_scale: [1, 1],
  };
  const parent = { x: 10, y: 20, w: 800, h: 600 };
  const before = solveRectTransform(parent, value);
  const next = applyAnchorsKeepingRect(value, [0.1, 0.2], [0.9, 0.8], [800, 600]);
  const after = solveRectTransform(parent, next);
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(after[key] - before[key]) < 1e-8, `${key} should remain stable`);
  }
  assert.deepEqual(next.anchor_min, [0.1, 0.2]);
  assert.deepEqual(next.anchor_max, [0.9, 0.8]);
});

test('anchor editing clamps invalid ranges and remains deterministic', () => {
  const value = {
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    pivot: [0.5, 0.5],
    anchored_position: [0, 0],
    size_delta: [0, 0],
    local_rotation: 0,
    local_scale: [1, 1],
  };
  const next = applyAnchorsKeepingRect(value, [0.8, -1], [0.2, 2], [100, 200]);
  assert.deepEqual(next.anchor_min, [0.8, 0]);
  assert.deepEqual(next.anchor_max, [0.8, 1]);
  assert.deepEqual(next.size_delta, [100, 0]);
});

test('anchor handle movement preserves spans and prevents crossed ranges', () => {
  assert.deepEqual(
    moveAnchorHandle([0.25, 0.25], [0.5, 0.75], 'both', [1, -1]),
    { anchorMin: [0.75, 0], anchorMax: [1, 0.5] },
  );
  assert.deepEqual(
    moveAnchorHandle([0.25, 0.25], [0.5, 0.75], 'min', [1, 1]),
    { anchorMin: [0.5, 0.75], anchorMax: [0.5, 0.75] },
  );
  assert.deepEqual(
    moveAnchorHandle([0.25, 0.25], [0.5, 0.75], 'max', [-1, -1]),
    { anchorMin: [0.25, 0.25], anchorMax: [0.25, 0.25] },
  );
});
