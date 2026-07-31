import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTimelineAsset } from '../src/timelineAsset.ts';
import {
  timelineControlSourceMap,
  timelineInlineTrackItems,
} from '../src/timelineControlTree.ts';

const child = parseTimelineAsset(JSON.stringify({
  version: 1,
  duration: 1,
  tracks: [
    {
      type: 'signal', id: 'events', name: 'Events',
      markers: [{ time: 0, name: 'Start' }, { time: 0.25, name: 'Beat' }, { time: 1, name: 'End' }],
    },
    {
      type: 'activation', id: 'visible', name: 'Visible', target: 'Actor',
      clips: [{ start: 0.5, duration: 0.25, active: true }],
    },
  ],
}));

function control(overrides = {}) {
  return {
    start: 0,
    duration: 2.5,
    timeline: 'Assets/Timelines/Child.mtimeline',
    clip_in: 0,
    speed: 1,
    extrapolation: 'none',
    binding_overrides: {},
    ...overrides,
  };
}

test('Control tree source maps split Hold traversal from its frozen tail', () => {
  const map = timelineControlSourceMap(control({ duration: 2, extrapolation: 'hold' }), 1);
  assert.equal(map.truncated, false);
  assert.equal(map.segments.length, 2);
  assert.deepEqual(map.segments.map((segment) => [segment.parentStart, segment.parentEnd, segment.held]), [
    [0, 1, false],
    [1, 2, true],
  ]);
  assert.ok(map.segments[1].childStart > 0.999);
  assert.equal(map.segments[1].childStart, map.segments[1].childEnd);
  const signals = timelineInlineTrackItems(child.tracks[0], map);
  assert.deepEqual(signals.map((item) => item.label), ['Start', 'Beat', 'End']);
  for (const [index, expected] of [0, 0.25, 1].entries()) {
    assert.ok(Math.abs(signals[index].start - expected) < 0.000001);
  }
});

test('Control tree source maps repeat child clips and Signals for every Loop cycle', () => {
  const map = timelineControlSourceMap(control({ extrapolation: 'loop' }), 1);
  assert.equal(map.truncated, false);
  assert.deepEqual(map.segments.map((segment) => [segment.parentStart, segment.parentEnd, segment.childStart, segment.childEnd]), [
    [0, 1, 0, 1],
    [1, 2, 0, 1],
    [2, 2.5, 0, 0.5],
  ]);
  assert.deepEqual(
    timelineInlineTrackItems(child.tracks[0], map)
      .filter((item) => item.label === 'Beat')
      .map((item) => item.start),
    [0.25, 1.25, 2.25],
  );
  assert.deepEqual(
    timelineInlineTrackItems(child.tracks[1], map).map((item) => [item.start, item.duration]),
    [[0.5, 0.25], [1.5, 0.25]],
  );
});

test('Control tree source maps preserve reverse Loop direction and cap pathological assets', () => {
  const reverse = timelineControlSourceMap(control({
    duration: 1.5,
    clip_in: 0.5,
    speed: -1,
    extrapolation: 'loop',
  }), 1);
  assert.deepEqual(reverse.segments.map((segment) => [segment.parentStart, segment.parentEnd, segment.childStart, segment.childEnd]), [
    [0, 0.5, 0.5, 0],
    [0.5, 1.5, 1, 0],
  ]);
  const bounded = timelineControlSourceMap(control({ duration: 1000, speed: 4, extrapolation: 'loop' }), 0.01, 16);
  assert.equal(bounded.segments.length, 16);
  assert.equal(bounded.truncated, true);
  assert.ok(Math.abs(bounded.segments.at(-1).parentEnd - 0.04) < 0.000001);
  assert.ok(bounded.segments.every((segment) => segment.parentEnd - segment.parentStart < 0.003));
});

test('Control tree does not visualize a None source window rejected by runtime validation', () => {
  const invalid = timelineControlSourceMap(control({
    duration: 2,
    clip_in: 0.5,
    extrapolation: 'none',
  }), 1);
  assert.deepEqual(invalid, { segments: [], truncated: false });
  assert.deepEqual(timelineInlineTrackItems(child.tracks[1], invalid), []);
});
