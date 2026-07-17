import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAspectRatio } from '../src/ui/aspectRatioFitter.ts';

const parent = { x: 0, y: 0, w: 200, h: 100 };
const rect = { x: 50, y: 25, w: 100, h: 50 };

test('width and height control modes preserve the RectTransform pivot', () => {
  assert.deepEqual(
    applyAspectRatio(rect, parent, [0.5, 0.5], 'WidthControlsHeight', 1),
    { x: 50, y: 0, w: 100, h: 100 },
  );
  assert.deepEqual(
    applyAspectRatio(rect, parent, [1, 0.5], 'HeightControlsWidth', 4),
    { x: -50, y: 25, w: 200, h: 50 },
  );
});

test('fit and envelope modes align the fitted rect using its pivot', () => {
  assert.deepEqual(
    applyAspectRatio(rect, parent, [0.5, 0.5], 'FitInParent', 1),
    { x: 50, y: 0, w: 100, h: 100 },
  );
  assert.deepEqual(
    applyAspectRatio(rect, parent, [0, 0], 'EnvelopeParent', 1),
    { x: 0, y: 0, w: 200, h: 200 },
  );
});

test('none and invalid ratios leave layout unchanged', () => {
  assert.deepEqual(applyAspectRatio(rect, parent, [0.5, 0.5], 'None', 2), rect);
  assert.deepEqual(applyAspectRatio(rect, parent, [0.5, 0.5], 'FitInParent', 0), rect);
});
