import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceTimelineEdgeAutoScroll,
  revealTimelineTimeScroll,
  timelinePointerTime,
} from '../src/timelineViewport.ts';

test('Timeline viewport reveals playhead on either edge without moving visible times', () => {
  assert.equal(revealTimelineTimeScroll(0, 600, 2400, 0.8, 1), 1352);
  assert.equal(revealTimelineTimeScroll(1352, 600, 2400, 0.8, 1), 1352);
  assert.equal(revealTimelineTimeScroll(1352, 600, 2400, 0.1, 1), 208);
  assert.equal(revealTimelineTimeScroll(208, 600, 2400, 0, 1), 0);
});

test('Timeline viewport clamps zoom, time, margins and invalid measurements', () => {
  assert.equal(revealTimelineTimeScroll(1900, 600, 2400, 2, 1), 1800);
  assert.equal(revealTimelineTimeScroll(-10, 600, 300, 0.5, 1), 0);
  assert.equal(revealTimelineTimeScroll(Number.NaN, 0, 2400, 0.5, 1), 0);
  assert.equal(revealTimelineTimeScroll(50, 600, 2400, 0.5, 0), 50);
  assert.equal(revealTimelineTimeScroll(0, 100, 400, 1, 1, 999), 300);
});

test('Timeline edge auto-scroll advances continuously near either viewport edge', () => {
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(400, 600, 2400, 590, 0, 50, 40, 800),
    { scrollLeft: 430, active: true },
  );
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(400, 600, 2400, 10, 0, 50, 40, 800),
    { scrollLeft: 370, active: true },
  );
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(400, 600, 2400, 300, 0, 50, 40, 800),
    { scrollLeft: 400, active: false },
  );
});

test('Timeline pointer time follows the current scrolled content rectangle', () => {
  assert.equal(timelinePointerTime(590, -400, 2_400, 1), 0.4125);
  assert.equal(timelinePointerTime(590, -430, 2_400, 1), 0.425);
  assert.equal(timelinePointerTime(-100, 0, 2_400, 1), 0);
  assert.equal(timelinePointerTime(3_000, 0, 2_400, 1), 1);
  assert.equal(timelinePointerTime(Number.NaN, 0, 0, 1), 0);
  assert.equal(timelinePointerTime(10, 0, Number.POSITIVE_INFINITY, 1), 0);
  assert.equal(timelinePointerTime(10, 0, 100, Number.POSITIVE_INFINITY), 0);
});

test('Timeline edge auto-scroll clamps boundaries, stalls and invalid geometry safely', () => {
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(1_790, 600, 2_400, 700, 0, 50, 40, 800),
    { scrollLeft: 1_800, active: false },
  );
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(10, 600, 2_400, -100, 0, 50, 40, 800),
    { scrollLeft: 0, active: false },
  );
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(10, 600, 300, 590, 0, 50),
    { scrollLeft: 0, active: false },
  );
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(Number.NaN, 0, 2_400, Number.NaN, 0, 50),
    { scrollLeft: 0, active: false },
  );
  assert.deepEqual(
    advanceTimelineEdgeAutoScroll(10, 600, 2_400, 590, 0, 50, 40, 0),
    { scrollLeft: 10, active: false },
  );
});
