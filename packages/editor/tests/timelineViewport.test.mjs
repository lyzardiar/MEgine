import assert from 'node:assert/strict';
import test from 'node:test';
import { revealTimelineTimeScroll } from '../src/timelineViewport.ts';

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
