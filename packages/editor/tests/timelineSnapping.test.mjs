import assert from 'node:assert/strict';
import test from 'node:test';
import {
  snapTimelineEventTime,
  snapTimelineKeySelectionDelta,
} from '../src/timelineSnapping.ts';

function clip() {
  return {
    version: 1,
    name: 'Snap',
    duration: 1,
    frame_rate: 10,
    wrap_mode: 'once',
    events: [{ time: 0.6, function: 'Hit', parameter: null }],
    tracks: [
      {
        target: 'Root', component: 'Transform', property: 'position', interpolation: 'linear',
        keyframes: [{ time: 0.2, value: [0, 0, 0] }, { time: 0.8, value: [1, 0, 0] }],
      },
      {
        target: 'Root', component: 'Transform', property: 'rotation', interpolation: 'linear',
        keyframes: [{ time: 0.5, value: [0, 0, 0] }],
      },
    ],
  };
}

test('Timeline key snapping aligns selections to playhead, keys and events', () => {
  assert.deepEqual(
    snapTimelineKeySelectionDelta(clip(), [{ track: 0, key: 0 }], 0.18, 0.4, 0.11),
    { delta: 0.2, guideTime: 0.4 },
  );
  assert.deepEqual(
    snapTimelineKeySelectionDelta(clip(), [{ track: 0, key: 0 }], 0.26, Number.NaN, 0.11),
    { delta: 0.3, guideTime: 0.5 },
  );
  assert.deepEqual(
    snapTimelineKeySelectionDelta(clip(), [{ track: 0, key: 0 }], 0.36, Number.NaN, 0.11),
    { delta: 0.4, guideTime: 0.6 },
  );
});

test('Timeline snapping excludes moving keys and uses deterministic earlier ties', () => {
  const asset = clip();
  asset.events = [];
  asset.tracks[1].keyframes = [{ time: 0.4, value: [0, 0, 0] }, { time: 0.6, value: [0, 0, 0] }];
  assert.deepEqual(
    snapTimelineKeySelectionDelta(asset, [{ track: 0, key: 0 }], 0.3, Number.NaN, 0.11),
    { delta: 0.2, guideTime: 0.4 },
  );
  assert.deepEqual(
    snapTimelineKeySelectionDelta(asset, [{ track: 0, key: 0 }, { track: 1, key: 0 }], 0, Number.NaN, 0.05),
    { delta: 0, guideTime: null },
  );
});

test('Timeline event snapping targets keys and disables correction at zero threshold', () => {
  assert.deepEqual(
    snapTimelineEventTime(clip(), 0, 0.47, Number.NaN, 0.11),
    { time: 0.5, guideTime: 0.5 },
  );
  assert.deepEqual(
    snapTimelineEventTime(clip(), 0, 0.47, Number.NaN, 0),
    { time: 0.5, guideTime: null },
  );
  assert.deepEqual(
    snapTimelineEventTime(clip(), 99, 5, Number.NaN, 0.2),
    { time: 1, guideTime: null },
  );
  const subframe = clip();
  subframe.events[0].time = 0.05;
  assert.deepEqual(
    snapTimelineEventTime(subframe, 0, 0.4, Number.NaN, 0.01),
    { time: 0.4, guideTime: null },
  );
});
