import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTimelineTimeInput,
  formatTimelineTimeLabel,
  formatTimelineTimeTooltip,
  timelineFrameAtTime,
  timelineRulerStepCount,
  timelineTimeFromDisplayValue,
} from '../src/timelineTimeDisplay.ts';

test('Timeline time display formats the same playhead as frames or seconds', () => {
  assert.equal(timelineFrameAtTime(0.4167, 24), 10);
  assert.equal(formatTimelineTimeInput(0.4167, 24, 'frames'), '10');
  assert.equal(formatTimelineTimeInput(0.4167, 24, 'seconds'), '0.417');
  assert.equal(formatTimelineTimeLabel(0.4167, 24, 'frames'), '10f');
  assert.equal(formatTimelineTimeLabel(0.4167, 24, 'seconds'), '0.42s');
  assert.equal(formatTimelineTimeTooltip(0.4167, 24), '10f · 0.417s');
  assert.equal(formatTimelineTimeInput(1 / 1_200, 1_200, 'seconds'), '0.0008');
  assert.equal(formatTimelineTimeLabel(1 / 600, 60, 'seconds', 1 / 600), '0.002s');
  assert.equal(formatTimelineTimeTooltip(1 / 1_200, 1_200), '1f · 0.0008s');
});

test('Timeline time editing snaps both display modes and clamps clip boundaries', () => {
  assert.equal(timelineTimeFromDisplayValue(11, 24, 'frames', 2), 11 / 24);
  assert.equal(timelineTimeFromDisplayValue(0.47, 10, 'seconds', 2), 0.5);
  assert.equal(timelineTimeFromDisplayValue(Number(formatTimelineTimeInput(1 / 1_200, 1_200, 'seconds')), 1_200, 'seconds', 2), 1 / 1_200);
  assert.equal(timelineTimeFromDisplayValue(999, 24, 'frames', 2), 2);
  assert.equal(timelineTimeFromDisplayValue(-10, 24, 'seconds', 2), 0);
  assert.equal(timelineTimeFromDisplayValue(Number.NaN, 0, 'seconds', 2), 0);
});

test('Frame rulers avoid duplicate labels on short or highly zoomed spans', () => {
  assert.equal(timelineRulerStepCount(10, 2, 24, 'frames'), 10);
  assert.equal(timelineRulerStepCount(10, 0.125, 24, 'frames'), 3);
  assert.equal(timelineRulerStepCount(10, 1 / 60, 60, 'frames'), 1);
  assert.equal(timelineRulerStepCount(10, 0.125, 24, 'seconds'), 10);
  assert.equal(timelineRulerStepCount(Number.NaN, 1, 24, 'seconds'), 1);
});
