import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANCHOR_PRESETS,
  applyAnchorPreset,
  applyPivotKeepingRect,
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
