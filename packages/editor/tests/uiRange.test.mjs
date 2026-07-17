import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVerticalRange,
  normalizedRangePosition,
  scrollbarHandleRange,
  scrollbarValueFromPosition,
} from '../src/ui/uiRange.ts';

test('Scrollbar handle range honors size and reversed directions', () => {
  assert.deepEqual(scrollbarHandleRange(0.25, 0.2, 'LeftToRight'), { start: 0.2, size: 0.2 });
  const reversed = scrollbarHandleRange(0.25, 0.2, 'RightToLeft');
  assert.ok(Math.abs(reversed.start - 0.6) < 1e-8);
  assert.equal(reversed.size, 0.2);
  assert.equal(isVerticalRange('BottomToTop'), true);
  assert.equal(isVerticalRange('LeftToRight'), false);
});

test('Scrollbar pointer mapping accounts for handle size, reverse and steps', () => {
  assert.equal(scrollbarValueFromPosition(0.1, 0.2, 0, 'TopToBottom'), 0);
  assert.equal(scrollbarValueFromPosition(0.5, 0.2, 0, 'TopToBottom'), 0.5);
  assert.equal(scrollbarValueFromPosition(0.9, 0.2, 0, 'BottomToTop'), 0);
  assert.equal(scrollbarValueFromPosition(0.5, 0.2, 5, 'TopToBottom'), 0.5);
  assert.equal(scrollbarValueFromPosition(0.7, 0.2, 5, 'TopToBottom'), 0.75);
});

test('vertical range coordinates use screen-down UI space and honor rotation', () => {
  const common = [{ w: 20, h: 100 }, [0.5, 0.5], 0, 'TopToBottom'];
  assert.equal(normalizedRangePosition({ x: 10, y: 0 }, { x: 10, y: 50 }, ...common), 0);
  assert.equal(normalizedRangePosition({ x: 10, y: 100 }, { x: 10, y: 50 }, ...common), 1);
  assert.ok(Math.abs(normalizedRangePosition(
    { x: 50, y: 10 },
    { x: 0, y: 10 },
    { w: 20, h: 100 },
    [0.5, 0.5],
    90,
    'TopToBottom',
  ) - 1) < 1e-8);
});
