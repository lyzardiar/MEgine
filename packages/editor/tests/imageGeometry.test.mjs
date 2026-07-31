import assert from 'node:assert/strict';
import test from 'node:test';
import { fitImageAspectRect } from '../src/ui/imageGeometry.ts';

test('Preserve Aspect centers wide and tall sprites inside the authored rect', () => {
  assert.deepEqual(
    fitImageAspectRect({ x: 10, y: 20, w: 100, h: 100 }, [200, 100]),
    { x: 10, y: 45, w: 100, h: 50 },
  );
  assert.deepEqual(
    fitImageAspectRect({ x: 10, y: 20, w: 100, h: 100 }, [100, 200]),
    { x: 35, y: 20, w: 50, h: 100 },
  );
});

test('Preserve Aspect leaves invalid geometry unchanged', () => {
  const rect = { x: 1, y: 2, w: 30, h: 40 };
  assert.deepEqual(fitImageAspectRect(rect, [0, 20]), rect);
  assert.deepEqual(fitImageAspectRect(rect, [Number.NaN, 20]), rect);
  assert.deepEqual(fitImageAspectRect(rect, [Number.MAX_VALUE, Number.MIN_VALUE]), rect);
});
