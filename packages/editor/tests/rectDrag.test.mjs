import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rectAxisTranslationAmount,
  rectTranslationAlongAxis,
  screenRectTranslation,
} from '../src/rectDrag.ts';

test('center dragging remains in parent screen axes for rotated RectTransforms', () => {
  assert.deepEqual(screenRectTranslation(30, -15, 3), { dx: 10, dy: -5 });
});

test('axis dragging follows the displayed rotated axis', () => {
  const rotatedRight = { dx: 0, dy: -1 };
  const amount = rectAxisTranslationAmount(3, -24, rotatedRight, 2);
  assert.equal(amount, 12);
  assert.deepEqual(rectTranslationAlongAxis(amount, rotatedRight), { dx: 0, dy: -12 });
});

test('invalid scales and pointer values cannot corrupt RectTransform position', () => {
  assert.deepEqual(screenRectTranslation(Number.NaN, 5, 0), { dx: 0, dy: 5 });
  assert.equal(rectAxisTranslationAmount(Number.NaN, 2, { dx: 1, dy: 0 }, 1), 0);
  assert.deepEqual(rectTranslationAlongAxis(Number.NaN, { dx: 1, dy: 0 }), { dx: 0, dy: 0 });
  assert.deepEqual(rectTranslationAlongAxis(5, { dx: Number.NaN, dy: 1 }), { dx: 0, dy: 5 });
});
