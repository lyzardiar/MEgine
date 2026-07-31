import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sequencerPointInTimeWindow,
  sequencerSampleItems,
  sequencerSpanIntersectsTimeWindow,
  sequencerTimeWindow,
  sequencerWindowedPoints,
  sequencerWindowedSpans,
} from '../src/sequencerTimeWindow.ts';

test('Sequencer time window renders the complete Timeline when it fits', () => {
  assert.deepEqual(sequencerTimeWindow(10, 800, 0, 800), {
    visibleStart: 0,
    visibleEnd: 10,
    renderStart: 0,
    renderEnd: 10,
  });
});

test('Sequencer time window converts horizontal scroll into time with bounded overscan', () => {
  assert.deepEqual(sequencerTimeWindow(100, 4_000, 1_000, 1_000), {
    visibleStart: 25,
    visibleEnd: 50,
    renderStart: 12.5,
    renderEnd: 62.5,
  });
  assert.deepEqual(sequencerTimeWindow(100, 4_000, 3_500, 1_000), {
    visibleStart: 75,
    visibleEnd: 100,
    renderStart: 62.5,
    renderEnd: 100,
  });
});

test('Sequencer time window sanitizes invalid geometry and clamps overscan', () => {
  assert.deepEqual(sequencerTimeWindow(Number.NaN, 0, Number.POSITIVE_INFINITY, -1), {
    visibleStart: 0,
    visibleEnd: 0,
    renderStart: 0,
    renderEnd: 0,
  });
  assert.deepEqual(sequencerTimeWindow(10, 100, -50, 20, -1), {
    visibleStart: 0,
    visibleEnd: 2,
    renderStart: 0,
    renderEnd: 2,
  });
  assert.deepEqual(sequencerTimeWindow(10, 100, 80, 20, 99), {
    visibleStart: 8,
    visibleEnd: 10,
    renderStart: 4,
    renderEnd: 10,
  });
});

test('Sequencer point and span visibility preserve items crossing either render edge', () => {
  const window = { renderStart: 10, renderEnd: 20 };
  assert.equal(sequencerPointInTimeWindow(10, window), true);
  assert.equal(sequencerPointInTimeWindow(20, window), true);
  assert.equal(sequencerPointInTimeWindow(9.999, window), false);
  assert.equal(sequencerSpanIntersectsTimeWindow(5, 5, window), true);
  assert.equal(sequencerSpanIntersectsTimeWindow(20, 5, window), true);
  assert.equal(sequencerSpanIntersectsTimeWindow(5, 4.999, window), false);
  assert.equal(sequencerSpanIntersectsTimeWindow(15, -1, window), false);
});

test('Sequencer windowed collections preserve authored source indices', () => {
  const window = { renderStart: 10, renderEnd: 20 };
  const points = [{ time: 5 }, { time: 10 }, { time: 20 }, { time: 25 }];
  assert.deepEqual(sequencerWindowedPoints(points, (item) => item.time, window), [
    { item: points[1], sourceIndex: 1 },
    { item: points[2], sourceIndex: 2 },
  ]);
  const spans = [
    { start: 0, duration: 5 },
    { start: 5, duration: 5 },
    { start: 20, duration: 1 },
    { start: 21, duration: 1 },
  ];
  assert.deepEqual(sequencerWindowedSpans(spans, (item) => item, window), [
    { item: spans[1], sourceIndex: 1 },
    { item: spans[2], sourceIndex: 2 },
  ]);
});

test('Sequencer dense viewport sampling stays bounded and preserves both ends', () => {
  const values = Array.from({ length: 10 }, (_, index) => index);
  assert.deepEqual(sequencerSampleItems(values, 4), {
    items: [0, 3, 6, 9],
    total: 10,
    truncated: true,
  });
  assert.deepEqual(sequencerSampleItems(values.slice(0, 2), 4), {
    items: [0, 1],
    total: 2,
    truncated: false,
  });
  assert.deepEqual(sequencerSampleItems(values, 1), {
    items: [0],
    total: 10,
    truncated: true,
  });
  assert.deepEqual(sequencerSampleItems(values, 0), {
    items: [],
    total: 10,
    truncated: true,
  });
});
