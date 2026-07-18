import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampSequencerZoom,
  copySequencerItem,
  findSequencerClipPlacement,
  lockedSequencerContentEnd,
  moveSequencerClip,
  moveSequencerTrack,
  pasteSequencerItem,
  resolveSequencerPasteTrack,
  sequencerTicks,
  trimSequencerClip,
} from '../src/sequencerEditing.ts';

function timeline() {
  return {
    version: 1,
    name: 'Edit',
    duration: 8,
    frame_rate: 10,
    tracks: [
      { type: 'signal', id: 'signals', name: 'Signals', muted: false, locked: false, markers: [{ time: 1, name: 'Hit', payload: { value: 1 } }] },
      { type: 'audio', id: 'audio', name: 'Audio', muted: false, locked: false, target: 'Audio', clips: [{ start: 1, duration: 2, clip: 'Assets/hit.ogg', clip_in: 0.5, volume: 0.8, pitch: 1, looped: false }] },
      { type: 'animation', id: 'animation', name: 'Animation', muted: false, locked: false, target: 'Actor', clips: [] },
    ],
  };
}

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

test('Sequencer clipboard preserves payloads and selects a compatible track', () => {
  const asset = timeline();
  const clipboard = copySequencerItem(asset, 0, 0);
  assert.ok(clipboard);
  asset.tracks[0].markers[0].payload.value = 9;
  assert.deepEqual(clipboard.item.payload, { value: 1 });
  assert.equal(resolveSequencerPasteTrack(asset, 2, clipboard), 0);
  const pasted = pasteSequencerItem(asset, 0, 2.04, clipboard);
  assert.equal(pasted.ok, true);
  assert.equal(pasted.asset.tracks[0].markers[pasted.itemIndex].time, 2);
  assert.deepEqual(pasted.asset.tracks[0].markers[pasted.itemIndex].payload, { value: 1 });
});

test('Sequencer clip paste preserves source settings and finds collision-free space', () => {
  const asset = timeline();
  const clipboard = copySequencerItem(asset, 1, 0);
  assert.ok(clipboard);
  const pasted = pasteSequencerItem(asset, 2, 1.5, clipboard);
  assert.equal(pasted.ok, true);
  assert.equal(pasted.trackIndex, 1);
  assert.deepEqual(pasted.asset.tracks[1].clips[pasted.itemIndex], {
    start: 3,
    duration: 2,
    clip: 'Assets/hit.ogg',
    clip_in: 0.5,
    volume: 0.8,
    pitch: 1,
    looped: false,
  });
  const rejected = pasteSequencerItem({ ...asset, tracks: asset.tracks.slice(0, 1) }, null, 0, clipboard);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'Timeline has no unlocked audio track for this item.');
});

test('Sequencer paste never mutates locked tracks and falls back to an unlocked match', () => {
  const asset = timeline();
  const clipboard = copySequencerItem(asset, 0, 0);
  assert.ok(clipboard);
  asset.tracks[0].locked = true;
  asset.tracks.push({
    type: 'signal', id: 'secondary', name: 'Secondary', muted: false, locked: false, markers: [],
  });
  assert.equal(resolveSequencerPasteTrack(asset, 0, clipboard), 3);
  const pasted = pasteSequencerItem(asset, 0, 2, clipboard);
  assert.equal(pasted.ok, true);
  assert.equal(pasted.trackIndex, 3);
  assert.equal(asset.tracks[0].markers.length, 1);
  asset.tracks[3].locked = true;
  const rejected = pasteSequencerItem(asset, 0, 2, clipboard);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /no unlocked signal track/);
});

test('Sequencer locked content constrains global duration without considering editable tracks', () => {
  const asset = timeline();
  assert.equal(lockedSequencerContentEnd(asset), 0);
  asset.tracks[0].locked = true;
  asset.tracks[1].locked = true;
  assert.equal(lockedSequencerContentEnd(asset), 3);
  asset.tracks[2].locked = true;
  asset.tracks[2].clips.push({ start: 6, duration: 1.5, clip: 'Assets/Animations/Run.manim', clip_in: 0, speed: 1 });
  assert.equal(lockedSequencerContentEnd(asset), 7.5);
});

test('Sequencer track ordering is immutable and rejects locked or boundary moves', () => {
  const asset = timeline();
  const moved = moveSequencerTrack(asset, 1, -1);
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.asset.tracks.map((track) => track.id), ['audio', 'signals', 'animation']);
  assert.deepEqual(asset.tracks.map((track) => track.id), ['signals', 'audio', 'animation']);
  asset.tracks[1].locked = true;
  const locked = moveSequencerTrack(asset, 1, 1);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /locked/);
  const boundary = moveSequencerTrack(asset, 0, -1);
  assert.equal(boundary.ok, false);
  assert.match(boundary.error, /already at the top/);
});

test('Sequencer particle clipboard preserves prewarm and collision-safe placement', () => {
  const asset = timeline();
  asset.tracks.push({
    type: 'particle', id: 'fx', name: 'FX', muted: false, locked: false, target: 'Effects/Burst',
    clips: [{ start: 1, duration: 1.5, clip_in: 0.75 }],
  });
  const clipboard = copySequencerItem(asset, 3, 0);
  assert.ok(clipboard);
  assert.equal(clipboard.type, 'particle');
  const pasted = pasteSequencerItem(asset, 3, 1.5, clipboard);
  assert.equal(pasted.ok, true);
  assert.deepEqual(pasted.asset.tracks[3].clips[pasted.itemIndex], {
    start: 2.5,
    duration: 1.5,
    clip_in: 0.75,
  });
  assert.equal(asset.tracks[3].clips.length, 1);
});
