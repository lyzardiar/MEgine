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

const base = () => ({
  anchor_min: [0.5, 0.5],
  anchor_max: [0.5, 0.5],
  pivot: [0.5, 0.5],
  anchored_position: [12, 24],
  size_delta: [100, 60],
  local_rotation: 0,
  local_scale: [1, 1],
});

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
  assert.equal(next.anchored_position[1], -70);
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
