import assert from 'node:assert/strict';
import test from 'node:test';
import { applyContentSize, measureLayoutContent } from '../src/ui/contentSizeFitter.ts';

const base = {
  padding: [8, 10, 12, 14],
  spacing: [6, 4],
  cellSize: [100, 30],
  constraintCount: 2,
};

test('layout content measurement matches horizontal, vertical and grid groups', () => {
  assert.deepEqual(measureLayoutContent({ ...base, direction: 'Horizontal' }, 3), {
    minWidth: 20,
    minHeight: 24,
    preferredWidth: 332,
    preferredHeight: 54,
  });
  assert.deepEqual(measureLayoutContent({ ...base, direction: 'Vertical' }, 3), {
    minWidth: 20,
    minHeight: 24,
    preferredWidth: 120,
    preferredHeight: 122,
  });
  assert.deepEqual(measureLayoutContent({ ...base, direction: 'Grid' }, 3), {
    minWidth: 20,
    minHeight: 24,
    preferredWidth: 226,
    preferredHeight: 88,
  });
});

test('fit modes resize around the RectTransform pivot', () => {
  const rect = { x: 10, y: 20, w: 300, h: 200 };
  const content = measureLayoutContent({ ...base, direction: 'Vertical' }, 3);
  assert.deepEqual(
    applyContentSize(rect, [0.5, 1], 'PreferredSize', 'MinSize', content),
    { x: 100, y: 196, w: 120, h: 24 },
  );
  assert.deepEqual(
    applyContentSize(rect, [0.5, 0.5], 'Unconstrained', 'Unconstrained', content),
    rect,
  );
});

test('empty content fits to padding only', () => {
  const measured = measureLayoutContent({ ...base, direction: 'Grid' }, 0, 2);
  assert.equal(measured.preferredWidth, 40);
  assert.equal(measured.preferredHeight, 48);
});
