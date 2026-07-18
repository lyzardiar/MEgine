import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnimationClip } from '../src/animationClip.ts';
import {
  clampTimelineKeyDelta,
  copyTimelineKeySelection,
  mergeTimelineKeySelection,
  moveTimelineKeySelection,
  normalizeTimelineKeySelection,
  pasteTimelineKeySelection,
  removeTimelineKeySelection,
  timelineKeyRangeSelection,
  timelineKeysInRange,
  toggleTimelineKeySelection,
} from '../src/timelineKeyEditing.ts';

function clip() {
  return normalizeAnimationClip({
    name: 'Multi',
    duration: 2,
    frame_rate: 10,
    tracks: [
      {
        target: '.',
        component: 'Transform',
        property: 'position',
        interpolation: 'cubic',
        keyframes: [
          { time: 0, value: [0, 0] },
          { time: 0.5, value: [1, 2], in_tangent: [3, 4] },
          { time: 2, value: [5, 6] },
        ],
      },
      {
        target: '.',
        component: 'Transform',
        property: 'scale',
        interpolation: 'linear',
        keyframes: [
          { time: 0.25, value: [1, 1] },
          { time: 1, value: [2, 2] },
        ],
      },
    ],
  });
}

test('Timeline key selection normalizes toggles ranges and marquee bounds', () => {
  const source = clip();
  assert.deepEqual(normalizeTimelineKeySelection(source, [
    { track: 0, key: 1 },
    { track: 0, key: 1 },
    { track: 9, key: 9 },
  ]), [{ track: 0, key: 1 }]);
  assert.deepEqual(toggleTimelineKeySelection(source, [{ track: 0, key: 1 }], { track: 0, key: 1 }), []);
  assert.deepEqual(timelineKeyRangeSelection(source, { track: 0, key: 0 }, { track: 0, key: 2 }), [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
    { track: 0, key: 2 },
  ]);
  assert.deepEqual(timelineKeysInRange(source, 0, 1, 0.4, 1.1), [
    { track: 0, key: 1 },
    { track: 1, key: 1 },
  ]);
  assert.deepEqual(mergeTimelineKeySelection(source, [{ track: 0, key: 0 }], [{ track: 1, key: 1 }]), [
    { track: 0, key: 0 },
    { track: 1, key: 1 },
  ]);
});

test('Timeline key group copy and paste preserves offsets tangents and extends duration', () => {
  const source = clip();
  const copied = copyTimelineKeySelection(source, [
    { track: 0, key: 1 },
    { track: 1, key: 1 },
  ]);
  assert.deepEqual(copied.map((item) => item.offset), [0, 0.5]);
  const pasted = pasteTimelineKeySelection(source, copied, 1.8);
  assert.equal(pasted.skipped, 0);
  assert.equal(pasted.clip.duration, 2.3);
  assert.deepEqual(pasted.selection, [{ track: 0, key: 2 }, { track: 1, key: 2 }]);
  assert.deepEqual(pasted.clip.tracks[0].keyframes[2], {
    time: 1.8,
    value: [1, 2],
    in_tangent: [3, 4],
  });
  assert.deepEqual(pasted.clip.tracks[1].keyframes[2], { time: 2.3, value: [2, 2] });
});

test('Timeline key group movement stays frame aligned clamps bounds and overwrites collisions', () => {
  const source = clip();
  const selection = [{ track: 0, key: 0 }, { track: 0, key: 1 }];
  assert.equal(clampTimelineKeyDelta(source, selection, -10), 0);
  assert.equal(clampTimelineKeyDelta(source, [{ track: 0, key: 1 }, { track: 0, key: 2 }], 10), 0);

  const moved = moveTimelineKeySelection(source, selection, 0.49);
  assert.equal(moved.appliedDelta, 0.5);
  assert.deepEqual(moved.clip.tracks[0].keyframes.map((key) => key.time), [0.5, 1, 2]);
  assert.deepEqual(moved.selection, [{ track: 0, key: 0 }, { track: 0, key: 1 }]);
  assert.deepEqual(moved.clip.tracks[0].keyframes[1].in_tangent, [3, 4]);
});

test('Timeline group delete removes every selected key without shifting mistakes', () => {
  const source = clip();
  const deleted = removeTimelineKeySelection(source, [
    { track: 0, key: 0 },
    { track: 0, key: 2 },
    { track: 1, key: 0 },
  ]);
  assert.deepEqual(deleted.tracks[0].keyframes.map((key) => key.time), [0.5]);
  assert.deepEqual(deleted.tracks[1].keyframes.map((key) => key.time), [1]);
});
