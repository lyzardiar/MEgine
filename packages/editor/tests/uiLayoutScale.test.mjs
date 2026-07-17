import assert from 'node:assert/strict';
import test from 'node:test';
import { rectComponentSceneScale } from '../src/rectSceneScale.ts';

test('Scene RectTransform units include the CanvasScaler factor', () => {
  assert.equal(rectComponentSceneScale(2, 0.5), 1);
  assert.equal(rectComponentSceneScale(2, 1.5), 3);
});

test('Constant Pixel Size uses its configured scale factor', () => {
  assert.equal(rectComponentSceneScale(0.5, 1.75), 0.875);
});

test('invalid scale values have safe fallbacks', () => {
  assert.equal(rectComponentSceneScale(0, Number.NaN), 1);
});
