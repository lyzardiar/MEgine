import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnimationClip } from '../src/animationClip.ts';
import {
  alignTimelineKeySelection,
  clampTimelineKeyDelta,
  copyTimelineKeySelection,
  distributeTimelineKeySelection,
  mergeTimelineKeySelection,
  moveTimelineKeySelection,
  normalizeTimelineKeySelection,
  pasteTimelineKeySelection,
  previewTimelineKeySelectionMove,
  retimeTimelineKeySelection,
  reverseTimelineKeySelection,
  removeTimelineKeySelection,
  timelineKeyRangeSelection,
  timelineKeyNudgeFrames,
  timelineKeyBatchCapabilities,
  timelineKeySelectionFrameRange,
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

  const collisionClipboard = copyTimelineKeySelection(source, [{ track: 0, key: 0 }]);
  const protectedPaste = pasteTimelineKeySelection(source, collisionClipboard, 0.5, 'protect');
  assert.equal(protectedPaste.blocked, true);
  assert.equal(protectedPaste.clip, source);
  assert.deepEqual(protectedPaste.collisions, [{ track: 0, key: 1, frame: 5 }]);

  const overwrittenPaste = pasteTimelineKeySelection(source, collisionClipboard, 0.5, 'overwrite');
  assert.equal(overwrittenPaste.blocked, false);
  assert.deepEqual(overwrittenPaste.collisions, [{ track: 0, key: 1, frame: 5 }]);
  assert.deepEqual(overwrittenPaste.clip.tracks[0].keyframes[1].value, [0, 0]);
});

test('Timeline key group movement stays frame aligned clamps bounds and overwrites collisions', () => {
  const source = clip();
  const selection = [{ track: 0, key: 0 }, { track: 0, key: 1 }];
  assert.equal(clampTimelineKeyDelta(source, selection, -10), 0);
  assert.equal(clampTimelineKeyDelta(source, [{ track: 0, key: 1 }, { track: 0, key: 2 }], 10), 0);

  const moved = moveTimelineKeySelection(source, selection, 0.49);
  assert.equal(moved.appliedDelta, 0.5);
  assert.deepEqual(moved.collisions, []);
  assert.deepEqual(moved.clip.tracks[0].keyframes.map((key) => key.time), [0.5, 1, 2]);
  assert.deepEqual(moved.selection, [{ track: 0, key: 0 }, { track: 0, key: 1 }]);
  assert.deepEqual(moved.clip.tracks[0].keyframes[1].in_tangent, [3, 4]);
});

test('Timeline key collision preview supports atomic protect and explicit overwrite', () => {
  const source = clip();
  const selection = [{ track: 0, key: 0 }];
  assert.deepEqual(previewTimelineKeySelectionMove(source, selection, 0.5), {
    appliedDelta: 0.5,
    collisions: [{ track: 0, key: 1, frame: 5 }],
  });

  const protectedMove = moveTimelineKeySelection(source, selection, 0.5, 'protect');
  assert.equal(protectedMove.blocked, true);
  assert.equal(protectedMove.appliedDelta, 0);
  assert.equal(protectedMove.requestedDelta, 0.5);
  assert.equal(protectedMove.clip, source);
  assert.deepEqual(protectedMove.selection, selection);
  assert.deepEqual(protectedMove.collisions, [{ track: 0, key: 1, frame: 5 }]);

  const overwritten = moveTimelineKeySelection(source, selection, 0.5, 'overwrite');
  assert.equal(overwritten.blocked, false);
  assert.deepEqual(overwritten.collisions, [{ track: 0, key: 1, frame: 5 }]);
  assert.deepEqual(overwritten.clip.tracks[0].keyframes.map((key) => key.time), [0.5, 2]);
  assert.deepEqual(overwritten.clip.tracks[0].keyframes[0].value, [0, 0]);
});

test('Timeline key selection exposes frame ranges and deterministic nudge shortcuts', () => {
  const source = clip();
  assert.deepEqual(timelineKeySelectionFrameRange(source, [
    { track: 0, key: 1 },
    { track: 1, key: 1 },
  ]), {
    count: 2,
    startFrame: 5,
    endFrame: 10,
    spanFrames: 5,
  });
  assert.equal(timelineKeySelectionFrameRange(source, [{ track: 8, key: 8 }]), null);
  assert.equal(timelineKeyNudgeFrames('ArrowLeft', true, false), -1);
  assert.equal(timelineKeyNudgeFrames('ArrowRight', true, false), 1);
  assert.equal(timelineKeyNudgeFrames('ArrowLeft', true, true), -10);
  assert.equal(timelineKeyNudgeFrames('ArrowRight', true, true), 10);
  assert.equal(timelineKeyNudgeFrames('ArrowRight', false, true), 0);
  assert.equal(timelineKeyNudgeFrames('ArrowUp', true, true), 0);
});

test('Timeline key retiming preserves values and tangents across tracks', () => {
  const source = clip();
  const retimed = retimeTimelineKeySelection(source, [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
    { track: 1, key: 1 },
  ], 5, 15);
  assert.equal(retimed.ok, true);
  assert.deepEqual(retimed.ok && [retimed.startFrame, retimed.endFrame], [5, 15]);
  assert.deepEqual(retimed.clip.tracks[0].keyframes.map((key) => key.time), [0.5, 1, 2]);
  assert.deepEqual(retimed.clip.tracks[0].keyframes[1].in_tangent, [3, 4]);
  assert.deepEqual(retimed.clip.tracks[1].keyframes.map((key) => key.time), [0.25, 1.5]);
  assert.deepEqual(retimed.selection, [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
    { track: 1, key: 1 },
  ]);
});

test('Timeline key retiming clamps bounds and rejects collapsed same-track keys', () => {
  const source = clip();
  const single = retimeTimelineKeySelection(source, [{ track: 0, key: 1 }], 99, -10);
  assert.equal(single.ok, true);
  assert.equal(single.ok && single.startFrame, 20);
  assert.deepEqual(single.clip.tracks[0].keyframes.map((key) => key.time), [0, 2]);

  const collapsed = retimeTimelineKeySelection(source, [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
    { track: 0, key: 2 },
  ], 0, 1);
  assert.equal(collapsed.ok, false);
  assert.match(collapsed.ok ? '' : collapsed.error, /collapses/i);
  assert.equal(collapsed.clip, source);

  const reversed = retimeTimelineKeySelection(source, [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
  ], 10, 5);
  assert.equal(reversed.ok, false);
  assert.match(reversed.ok ? '' : reversed.error, /before its start/i);
});

test('Timeline key reverse mirrors frames and reverses cubic tangent direction', () => {
  const source = clip();
  source.tracks[0].keyframes[1].out_tangent = [7, 8];
  const reversed = reverseTimelineKeySelection(source, [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
    { track: 0, key: 2 },
  ]);
  assert.equal(reversed.ok, true);
  assert.deepEqual(reversed.clip.tracks[0].keyframes.map((key) => key.time), [0, 1.5, 2]);
  assert.deepEqual(reversed.clip.tracks[0].keyframes.map((key) => key.value), [
    [5, 6],
    [1, 2],
    [0, 0],
  ]);
  assert.deepEqual(reversed.clip.tracks[0].keyframes[1].in_tangent, [-7, -8]);
  assert.deepEqual(reversed.clip.tracks[0].keyframes[1].out_tangent, [-3, -4]);
  assert.equal(reversed.selection.length, 3);
});

test('Timeline key alignment is cross-track safe and rejects same-track collapse', () => {
  const source = clip();
  const selection = [{ track: 0, key: 1 }, { track: 1, key: 1 }];
  assert.deepEqual(timelineKeyBatchCapabilities(source, selection), {
    canAlign: true,
    canDistribute: false,
    canReverse: true,
  });
  const aligned = alignTimelineKeySelection(source, selection, 8);
  assert.equal(aligned.ok, true);
  assert.deepEqual(aligned.clip.tracks[0].keyframes.map((key) => key.time), [0, 0.8, 2]);
  assert.deepEqual(aligned.clip.tracks[1].keyframes.map((key) => key.time), [0.25, 0.8]);
  assert.equal(aligned.selection.length, 2);

  const destructive = [{ track: 0, key: 0 }, { track: 0, key: 1 }];
  assert.equal(timelineKeyBatchCapabilities(source, destructive).canAlign, false);
  const rejected = alignTimelineKeySelection(source, destructive, 8);
  assert.equal(rejected.ok, false);
  assert.match(rejected.ok ? '' : rejected.error, /one selected key per track/i);

  const protectedCollision = alignTimelineKeySelection(source, [
    { track: 0, key: 1 },
    { track: 1, key: 0 },
  ], 10, 'protect');
  assert.equal(protectedCollision.ok, false);
  assert.equal(protectedCollision.clip, source);
  assert.deepEqual(protectedCollision.collisions, [{ track: 1, key: 1, frame: 10 }]);
  assert.match(protectedCollision.ok ? '' : protectedCollision.error, /protected/i);
});

test('Timeline key distribution spaces each eligible track independently', () => {
  const source = clip();
  const selection = [
    { track: 0, key: 0 },
    { track: 0, key: 1 },
    { track: 0, key: 2 },
    { track: 1, key: 0 },
  ];
  assert.equal(timelineKeyBatchCapabilities(source, selection).canDistribute, true);
  const distributed = distributeTimelineKeySelection(source, selection);
  assert.equal(distributed.ok, true);
  assert.deepEqual(distributed.clip.tracks[0].keyframes.map((key) => key.time), [0, 1, 2]);
  assert.deepEqual(distributed.clip.tracks[0].keyframes[1].value, [1, 2]);
  assert.deepEqual(distributed.clip.tracks[0].keyframes[1].in_tangent, [3, 4]);
  assert.deepEqual(distributed.clip.tracks[1].keyframes.map((key) => key.time), [0.25, 1]);
  assert.deepEqual(distributed.selection.map((ref) => ({
    track: ref.track,
    time: distributed.clip.tracks[ref.track].keyframes[ref.key].time,
  })), [
    { track: 0, time: 0 },
    { track: 0, time: 1 },
    { track: 0, time: 2 },
    { track: 1, time: 0.25 },
  ]);

  const rejected = distributeTimelineKeySelection(source, [{ track: 0, key: 0 }, { track: 0, key: 2 }]);
  assert.equal(rejected.ok, false);
  assert.match(rejected.ok ? '' : rejected.error, /at least three/i);
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
