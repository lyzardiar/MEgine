import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampSequencerZoom,
  findSequencerClipPlacement,
  moveSequencerClip,
  sequencerTicks,
  trimSequencerClip,
} from '../src/sequencerEditing.ts';

test('Sequencer clip movement preserves duration and cannot overlap neighbours', () => {
  const clips = [
    { start: 0, duration: 1 },
    { start: 2, duration: 1 },
    { start: 4, duration: 1 },
  ];
  assert.deepEqual(moveSequencerClip(clips, 1, -10, 6, 10), { start: 1, duration: 1 });
  assert.deepEqual(moveSequencerClip(clips, 1, 10, 6, 10), { start: 3, duration: 1 });
  assert.deepEqual(moveSequencerClip(clips, 1, 0.26, 6, 10), { start: 2.3, duration: 1 });
});

test('Sequencer clip trimming snaps, preserves the opposite edge and reports source offset', () => {
  const clips = [
    { start: 0, duration: 1 },
    { start: 2, duration: 2 },
    { start: 5, duration: 1 },
  ];
  assert.deepEqual(trimSequencerClip(clips, 1, 'start', -5, 8, 10), {
    start: 1,
    duration: 3,
    sourceOffsetDelta: -1,
  });
  assert.deepEqual(trimSequencerClip(clips, 1, 'end', 5, 8, 10), {
    start: 2,
    duration: 3,
    sourceOffsetDelta: 0,
  });
  assert.deepEqual(trimSequencerClip(clips, 1, 'start', 99, 8, 10), {
    start: 3.9,
    duration: 0.10000000000000009,
    sourceOffsetDelta: 1.9,
  });
});

test('Sequencer start trimming cannot seek before the source asset', () => {
  const clips = [{ start: 2, duration: 2 }];
  assert.deepEqual(trimSequencerClip(clips, 0, 'start', -2, 8, 10, { offset: 0.5, rate: 1 }), {
    start: 1.5,
    duration: 2.5,
    sourceOffsetDelta: -0.5,
  });
  assert.deepEqual(trimSequencerClip(clips, 0, 'start', 2, 8, 10, { offset: 0.5, rate: -1 }), {
    start: 2.5,
    duration: 1.5,
    sourceOffsetDelta: 0.5,
  });
});

test('Sequencer clip placement finds the next gap and reports a full timeline', () => {
  const clips = [{ start: 0, duration: 1 }, { start: 2, duration: 1 }];
  assert.deepEqual(findSequencerClipPlacement(clips, 0.5, 1, 4, 10), { start: 1, duration: 1 });
  assert.deepEqual(findSequencerClipPlacement(clips, 3, 1, 4, 10), { start: 3, duration: 1 });
  assert.equal(findSequencerClipPlacement([{ start: 0, duration: 4 }], 0, 1, 4, 10), null);
});

test('Sequencer ticks adapt to zoom while retaining exact endpoints', () => {
  const fitted = sequencerTicks(10, 500);
  const zoomed = sequencerTicks(10, 2000);
  assert.equal(fitted[0].time, 0);
  assert.equal(fitted.at(-1).time, 10);
  assert.equal(zoomed.at(-1).position, 1);
  assert.ok(zoomed.length > fitted.length);
  const fractional = sequencerTicks(0.3, 500, 100);
  assert.equal(fractional.filter((tick) => tick.position === 1).length, 1);
  assert.equal(fractional.at(-1).time, 0.3);
  assert.equal(clampSequencerZoom(-1), 1);
  assert.equal(clampSequencerZoom(100), 32);
});
