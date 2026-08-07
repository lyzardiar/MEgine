import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyContentSize,
  layoutGroupChildRects,
  measureLayoutContent,
} from '../src/ui/contentSizeFitter.ts';

const base = {
  padding: [8, 10, 12, 14],
  spacing: [6, 4],
  cellSize: [100, 30],
  constraintCount: 2,
};

test('layout content measurement matches horizontal, vertical and grid groups', () => {
  assert.deepEqual(measureLayoutContent({ ...base, direction: 'Horizontal' }, 3), {
    minWidth: 32,
    minHeight: 24,
    preferredWidth: 332,
    preferredHeight: 54,
    flexibleWidth: 3,
    flexibleHeight: 1,
  });
  assert.deepEqual(measureLayoutContent({ ...base, direction: 'Vertical' }, 3), {
    minWidth: 20,
    minHeight: 32,
    preferredWidth: 120,
    preferredHeight: 122,
    flexibleWidth: 1,
    flexibleHeight: 3,
  });
  assert.deepEqual(measureLayoutContent({ ...base, direction: 'Grid' }, 3), {
    minWidth: 20,
    minHeight: 24,
    preferredWidth: 226,
    preferredHeight: 88,
    flexibleWidth: 0,
    flexibleHeight: 0,
  });
});

test('fit modes resize around the RectTransform pivot', () => {
  const rect = { x: 10, y: 20, w: 300, h: 200 };
  const content = measureLayoutContent({ ...base, direction: 'Vertical' }, 3);
  assert.deepEqual(
    applyContentSize(rect, [0.5, 1], 'PreferredSize', 'MinSize', content),
    { x: 100, y: 20, w: 120, h: 32 },
  );
  assert.deepEqual(
    applyContentSize(rect, [0.5, 0.5], 'Unconstrained', 'Unconstrained', content),
    rect,
  );
});

test('horizontal groups align preferred children and distribute flexible surplus', () => {
  const layout = {
    direction: 'Horizontal',
    padding: [0, 0, 0, 0],
    spacing: [10, 0],
    cellSize: [50, 20],
    constraintCount: 1,
    childAlignment: 'MiddleCenter',
    childControlWidth: true,
    childControlHeight: true,
    childForceExpandWidth: false,
    childForceExpandHeight: false,
  };
  const children = [
    { width: 10, height: 10, preferredWidth: 50 },
    { width: 10, height: 10, preferredWidth: 100 },
  ];
  assert.deepEqual(
    layoutGroupChildRects({ x: 0, y: 0, w: 300, h: 100 }, layout, children),
    [
      { x: 70, y: 40, w: 50, h: 20 },
      { x: 130, y: 40, w: 100, h: 20 },
    ],
  );

  const expanded = layoutGroupChildRects(
    { x: 0, y: 0, w: 300, h: 100 },
    { ...layout, childForceExpandWidth: true },
    [
      { ...children[0], flexibleWidth: 1 },
      { ...children[1], flexibleWidth: 3 },
    ],
  );
  assert.deepEqual(expanded.map((rect) => rect.w), [85, 205]);
});

test('grid groups honor fixed rows, vertical fill, alignment and start corner', () => {
  const rects = layoutGroupChildRects(
    { x: 0, y: 0, w: 300, h: 200 },
    {
      direction: 'Grid',
      padding: [0, 0, 0, 0],
      spacing: [10, 10],
      cellSize: [50, 40],
      constraint: 'FixedRowCount',
      constraintCount: 2,
      startAxis: 'Vertical',
      startCorner: 'LowerRight',
      childAlignment: 'MiddleCenter',
    },
    Array.from({ length: 5 }, () => ({ width: 10, height: 10 })),
  );
  assert.deepEqual(rects.slice(0, 3), [
    { x: 185, y: 105, w: 50, h: 40 },
    { x: 185, y: 55, w: 50, h: 40 },
    { x: 125, y: 105, w: 50, h: 40 },
  ]);
});

test('LayoutElement metrics drive minimum and preferred content sizes', () => {
  const measured = measureLayoutContent(
    {
      ...base,
      direction: 'Horizontal',
      childControlWidth: true,
      childControlHeight: true,
    },
    [
      { width: 10, height: 10, minWidth: 20, preferredWidth: 80, minHeight: 12, preferredHeight: 20 },
      { width: 10, height: 10, minWidth: 30, preferredWidth: 60, minHeight: 16, preferredHeight: 24 },
    ],
  );
  assert.deepEqual(measured, {
    minWidth: 76,
    minHeight: 40,
    preferredWidth: 166,
    preferredHeight: 48,
    flexibleWidth: 2,
    flexibleHeight: 1,
  });
});

test('disabled child size control ignores flexible metrics on that axis', () => {
  const rects = layoutGroupChildRects(
    { x: 0, y: 0, w: 300, h: 40 },
    {
      ...base,
      direction: 'Horizontal',
      padding: [0, 0, 0, 0],
      spacing: [10, 0],
      childControlWidth: false,
      childControlHeight: true,
      childForceExpandWidth: false,
      childForceExpandHeight: false,
    },
    [
      { width: 40, height: 20, flexibleWidth: 1 },
      { width: 60, height: 20, flexibleWidth: 3 },
    ],
  );
  assert.deepEqual(rects.map((rect) => rect.w), [40, 60]);
});

test('positive flexible size fills only that child on a layout cross axis', () => {
  const vertical = layoutGroupChildRects(
    { x: 0, y: 0, w: 300, h: 200 },
    {
      ...base,
      direction: 'Vertical',
      padding: [20, 0, 20, 0],
      spacing: [0, 10],
      childControlWidth: true,
      childControlHeight: true,
      childForceExpandWidth: false,
      childForceExpandHeight: false,
    },
    [
      { width: 10, height: 10, preferredWidth: 80, preferredHeight: 30 },
      { width: 10, height: 10, preferredWidth: 80, preferredHeight: 30, flexibleWidth: 1 },
    ],
  );
  assert.deepEqual(vertical.map((rect) => rect.w), [80, 260]);

  const horizontal = layoutGroupChildRects(
    { x: 0, y: 0, w: 300, h: 200 },
    {
      ...base,
      direction: 'Horizontal',
      padding: [0, 20, 0, 20],
      spacing: [10, 0],
      childControlWidth: true,
      childControlHeight: true,
      childForceExpandWidth: false,
      childForceExpandHeight: false,
    },
    [
      { width: 10, height: 10, preferredWidth: 40, preferredHeight: 50 },
      { width: 10, height: 10, preferredWidth: 40, preferredHeight: 50, flexibleHeight: 1 },
    ],
  );
  assert.deepEqual(horizontal.map((rect) => rect.h), [50, 160]);
});

test('empty content fits to padding only', () => {
  const measured = measureLayoutContent({ ...base, direction: 'Grid' }, 0, 2);
  assert.equal(measured.preferredWidth, 40);
  assert.equal(measured.preferredHeight, 48);
});
