import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceSequencerPreviewTime,
  combineSequencerMarqueeSelection,
  clampSequencerZoom,
  copySequencerItem,
  copySequencerItems,
  deleteSequencerItems,
  expandSequencerRippleSelection,
  findSequencerClipPlacement,
  lockedSequencerContentEnd,
  moveSequencerClip,
  moveSequencerItems,
  moveSequencerGroup,
  moveSequencerTrack,
  normalizeSequencerPreviewRange,
  pasteSequencerItem,
  pasteSequencerClipboard,
  placeSequencerGroup,
  placeSequencerTrack,
  resolveSequencerPasteTrack,
  rippleMoveSequencerItems,
  resizeSequencerAnimationBlend,
  resizeSequencerPreviewRange,
  selectSequencerItem,
  sequencerPanScrollLeft,
  sequencerRevealScrollLeft,
  sequencerSelectionTimeRange,
  sequencerShiftWheelDelta,
  sequencerSliderToZoom,
  sequencerTicks,
  sequencerZoomToSlider,
  snapSequencerItemsDelta,
  trimSequencerCameraBlendIn,
  trimSequencerAnimationClip,
  trimSequencerClip,
} from '../src/sequencerEditing.ts';

test('Sequencer logarithmic zoom slider reaches exact limits and round-trips', () => {
  assert.equal(sequencerZoomToSlider(1), 0);
  assert.equal(sequencerZoomToSlider(32), 100);
  assert.equal(sequencerSliderToZoom(0), 1);
  assert.equal(sequencerSliderToZoom(100), 32);
  for (const zoom of [1.5, 2, 4, 8, 16, 24]) {
    assert.ok(Math.abs(sequencerSliderToZoom(sequencerZoomToSlider(zoom)) - zoom) < 1e-9);
  }
  assert.equal(sequencerSliderToZoom(Number.NaN), 1);
});

test('Sequencer selection range covers markers and complete clips', () => {
  const asset = timeline();
  assert.deepEqual(sequencerSelectionTimeRange(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 0 },
  ]), { start: 1, end: 3 });
  assert.deepEqual(sequencerSelectionTimeRange(asset, [{ track: 0, marker: 0 }]), { start: 1, end: 1 });
  assert.equal(sequencerSelectionTimeRange(asset, [{ track: 99, marker: 0 }]), null);
});

test('Sequencer viewport panning and shifted wheel navigation stay bounded', () => {
  assert.equal(sequencerShiftWheelDelta(4, 20), 20);
  assert.equal(sequencerShiftWheelDelta(-40, 10), -40);
  assert.equal(sequencerShiftWheelDelta(Number.NaN, 12), 12);
  assert.equal(sequencerPanScrollLeft(300, 500, 450, 1600, 800), 350);
  assert.equal(sequencerPanScrollLeft(20, 500, 800, 1600, 800), 0);
  assert.equal(sequencerPanScrollLeft(780, 500, 300, 1600, 800), 800);
  assert.equal(sequencerPanScrollLeft(Number.NaN, 0, Number.NaN, 400, 800), 0);
  assert.equal(sequencerRevealScrollLeft(300, 100, 1600, 800), 88);
  assert.equal(sequencerRevealScrollLeft(300, 700, 1600, 800), 300);
  assert.equal(sequencerRevealScrollLeft(300, 1200, 1600, 800), 412);
  assert.equal(sequencerRevealScrollLeft(900, 1600, 1600, 800), 800);
  assert.equal(sequencerRevealScrollLeft(Number.NaN, Number.NaN, 400, 800), 0);
});

test('Sequencer preview range snaps and playback stops or loops deterministically', () => {
  assert.deepEqual(normalizeSequencerPreviewRange({ start: 1.04, end: 4.96 }, 8, 10), { start: 1, end: 5 });
  assert.deepEqual(normalizeSequencerPreviewRange({ start: 9, end: -2 }, 8, 10), { start: 7.9, end: 8 });
  assert.deepEqual(normalizeSequencerPreviewRange({ start: 9, end: 9 }, 1.05, 10), { start: 0.9, end: 1.05 });
  assert.deepEqual(advanceSequencerPreviewTime(2, 1, { start: 1, end: 4 }, false), { time: 3, playing: true });
  assert.deepEqual(advanceSequencerPreviewTime(3.5, 1, { start: 1, end: 4 }, false), { time: 4, playing: false });
  assert.deepEqual(advanceSequencerPreviewTime(3.5, 1, { start: 1, end: 4 }, true), { time: 1.5, playing: true });
  assert.deepEqual(advanceSequencerPreviewTime(1, 7, { start: 1, end: 4 }, true), { time: 2, playing: true });
});

test('Sequencer preview range handles keep the opposite edge fixed and one frame apart', () => {
  assert.deepEqual(resizeSequencerPreviewRange({ start: 1, end: 4 }, 'start', 2.06, 8, 10), { start: 2.1, end: 4 });
  assert.deepEqual(resizeSequencerPreviewRange({ start: 1, end: 4 }, 'start', 7, 8, 10), { start: 3.9, end: 4 });
  assert.deepEqual(resizeSequencerPreviewRange({ start: 1, end: 4 }, 'end', 2.04, 8, 10), { start: 1, end: 2 });
  assert.deepEqual(resizeSequencerPreviewRange({ start: 1, end: 4 }, 'end', -2, 8, 10), { start: 1, end: 1.1 });
  assert.deepEqual(resizeSequencerPreviewRange({ start: 0.9, end: 1.05 }, 'end', 9, 1.05, 10), { start: 0.9, end: 1.05 });
  assert.deepEqual(resizeSequencerPreviewRange({ start: 0.9, end: 1.05 }, 'start', Number.NaN, 1.05, 10), { start: 0.9, end: 1.05 });
});

function timeline() {
  return {
    version: 1,
    name: 'Edit',
    duration: 8,
    frame_rate: 10,
    groups: [],
    tracks: [
      { type: 'signal', id: 'signals', name: 'Signals', muted: false, locked: false, markers: [{ time: 1, name: 'Hit', payload: { value: 1 } }] },
      { type: 'audio', id: 'audio', name: 'Audio', muted: false, locked: false, target: 'Audio', clips: [{ start: 1, duration: 2, clip: 'Assets/hit.ogg', clip_in: 0.5, volume: 0.8, pitch: 1, looped: false, fade_in: 0.25, fade_out: 0.5, fade_curve: 'ease_in_out' }] },
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

test('Sequencer camera start trim preserves the absolute blend end', () => {
  assert.equal(trimSequencerCameraBlendIn(0.75, 1.5, 0.25), 0.5);
  assert.equal(trimSequencerCameraBlendIn(0.75, 2.5, -0.5), 1.25);
  assert.equal(trimSequencerCameraBlendIn(0.75, 0.25, -1), 0.25);
});

test('Sequencer Animation trimming preserves and bounds crossfade overlap', () => {
  const clips = [
    { start: 0, duration: 1, clip: 'A', clip_in: 0, speed: 1, blend_in: 0, blend_curve: 'linear' },
    { start: 0.8, duration: 1, clip: 'B', clip_in: 0.5, speed: 1, blend_in: 0.2, blend_curve: 'linear' },
    { start: 2, duration: 1, clip: 'C', clip_in: 0, speed: 1, blend_in: 0.2, blend_curve: 'linear' },
  ];
  const startTrim = trimSequencerAnimationClip(clips, 1, 'start', -0.1, 4, 10);
  assert.equal(startTrim.start, 0.7);
  assert.ok(Math.abs(startTrim.duration - 1.1) < 1e-9);
  assert.ok(Math.abs(startTrim.sourceOffsetDelta + 0.1) < 1e-9);
  assert.ok(Math.abs(startTrim.blendIn - 0.3) < 1e-9);
  assert.deepEqual(trimSequencerAnimationClip(clips, 0, 'end', 2, 4, 10), {
    start: 0, duration: 1, sourceOffsetDelta: 0, blendIn: 0,
  });
  const endTrim = trimSequencerAnimationClip(clips, 1, 'end', 2, 4, 10);
  assert.equal(endTrim.start, 0.8);
  assert.ok(Math.abs(endTrim.duration - 1.4) < 1e-9);
  assert.equal(endTrim.sourceOffsetDelta, 0);
  assert.equal(endTrim.blendIn, 0.2);
  const shortTrim = trimSequencerAnimationClip(clips, 1, 'end', -2, 4, 10);
  assert.equal(shortTrim.start + shortTrim.duration, 1);
  const crossedStart = trimSequencerAnimationClip(clips, 1, 'start', 2, 4, 10);
  assert.equal(crossedStart.start, 1.7);
});

test('Sequencer Animation blend handle snaps without breaking live overlap', () => {
  const clips = [
    { start: 0, duration: 1, clip: 'A', clip_in: 0, speed: 1, blend_in: 0, blend_curve: 'linear' },
    { start: 0.8, duration: 1, clip: 'B', clip_in: 0, speed: 1, blend_in: 0.2, blend_curve: 'linear' },
  ];
  assert.ok(Math.abs(resizeSequencerAnimationBlend(clips, 1, 0, 10) - 0.2) < 1e-9);
  assert.equal(resizeSequencerAnimationBlend(clips, 1, 0.46, 10), 0.5);
  assert.equal(resizeSequencerAnimationBlend(clips, 1, 5, 10), 1);
});

test('Sequencer selection model supports toggle and anchored ranges deterministically', () => {
  const first = selectSequencerItem([], null, { track: 1, marker: 2 }, 'single');
  assert.deepEqual(first, {
    primary: { track: 1, marker: 2 },
    items: [{ track: 1, marker: 2 }],
  });
  const added = selectSequencerItem(first.items, first.primary, { track: 3, marker: 1 }, 'toggle');
  assert.deepEqual(added.items, [{ track: 1, marker: 2 }, { track: 3, marker: 1 }]);
  assert.deepEqual(added.primary, { track: 3, marker: 1 });
  const removed = selectSequencerItem(added.items, added.primary, { track: 3, marker: 1 }, 'toggle');
  assert.deepEqual(removed.items, [{ track: 1, marker: 2 }]);
  assert.deepEqual(removed.primary, { track: 1, marker: 2 });
  const range = selectSequencerItem([], { track: 2, marker: 4 }, { track: 2, marker: 1 }, 'range');
  assert.deepEqual(range.items, [1, 2, 3, 4].map((marker) => ({ track: 2, marker })));
  assert.deepEqual(range.primary, { track: 2, marker: 1 });
});

test('Sequencer marquee selection replaces adds and toggles without duplicate items', () => {
  const current = [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
  ];
  const hits = [
    { track: 1, marker: 1 },
    { track: 2, marker: 0 },
    { track: 2, marker: 0 },
    { track: -1, marker: 0 },
  ];
  assert.deepEqual(combineSequencerMarqueeSelection(current, hits, 'replace'), [
    { track: 1, marker: 1 },
    { track: 2, marker: 0 },
  ]);
  assert.deepEqual(combineSequencerMarqueeSelection(current, hits, 'add'), [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
    { track: 2, marker: 0 },
  ]);
  assert.deepEqual(combineSequencerMarqueeSelection(current, hits, 'toggle'), [
    { track: 0, marker: 0 },
    { track: 2, marker: 0 },
  ]);
});

test('Sequencer multi-delete is atomic across tracks and rejects locked selections', () => {
  const asset = timeline();
  asset.tracks[0].markers.push({ time: 3, name: 'Later' });
  asset.tracks[1].clips.push({
    start: 4, duration: 1, clip: 'Assets/later.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false,
  });
  const deleted = deleteSequencerItems(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 0 },
  ]);
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.asset.tracks[0].markers.map((marker) => marker.name), ['Later']);
  assert.deepEqual(deleted.asset.tracks[1].clips.map((clip) => clip.start), [4]);
  assert.equal(asset.tracks[0].markers.length, 2);
  assert.equal(asset.tracks[1].clips.length, 2);

  asset.tracks[1].locked = true;
  const locked = deleteSequencerItems(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 0 },
  ]);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /locked/);
});

test('Sequencer ripple-delete closes deleted clip durations per affected track', () => {
  const asset = timeline();
  asset.tracks[1].clips = [
    { start: 0, duration: 1, clip: 'Assets/a.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 2, duration: 1, clip: 'Assets/b.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 4, duration: 1, clip: 'Assets/c.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 6, duration: 1, clip: 'Assets/d.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
  ];
  const deleted = deleteSequencerItems(asset, [
    { track: 1, marker: 0 },
    { track: 1, marker: 2 },
  ], true);
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.asset.tracks[1].clips.map((clip) => [clip.clip, clip.start]), [
    ['Assets/b.ogg', 1],
    ['Assets/d.ogg', 4],
  ]);
  const markerOnly = deleteSequencerItems(asset, [{ track: 0, marker: 0 }], true);
  assert.equal(markerOnly.ok, false);
  assert.match(markerOnly.error, /requires at least one selected clip/);
});

test('Sequencer group clipboard preserves cross-track offsets and primary selection', () => {
  const asset = timeline();
  const copied = copySequencerItems(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 0 },
  ], { track: 1, marker: 0 });
  assert.equal(copied.ok, true);
  assert.equal(copied.clipboard.type, 'group');
  asset.tracks[0].markers[0].name = 'Changed';
  asset.tracks[1].clips[0].volume = 0.1;
  const pasted = pasteSequencerClipboard(asset, null, 1.04, copied.clipboard);
  assert.equal(pasted.ok, true);
  assert.deepEqual(pasted.selections, [
    { track: 0, marker: 1 },
    { track: 1, marker: 1 },
  ]);
  assert.deepEqual(pasted.primary, { track: 1, marker: 1 });
  assert.equal(pasted.asset.tracks[0].markers[1].time, 3);
  assert.equal(pasted.asset.tracks[0].markers[1].name, 'Hit');
  assert.equal(pasted.asset.tracks[1].clips[1].start, 3);
  assert.equal(pasted.asset.tracks[1].clips[1].volume, 0.8);
});

test('Sequencer group clipboard preserves an Animation crossfade shape', () => {
  const asset = timeline();
  asset.tracks[2].clips = [
    {
      start: 0, duration: 1, clip: 'Assets/A.manim', clip_in: 0,
      speed: 1, blend_in: 0, blend_curve: 'linear',
    },
    {
      start: 0.8, duration: 1, clip: 'Assets/B.manim', clip_in: 0,
      speed: 1, blend_in: 0.2, blend_curve: 'ease_in_out',
    },
  ];
  const copied = copySequencerItems(asset, [
    { track: 2, marker: 0 },
    { track: 2, marker: 1 },
  ]);
  assert.equal(copied.ok, true);
  const pasted = pasteSequencerClipboard(asset, 2, 3, copied.clipboard);
  assert.equal(pasted.ok, true);
  assert.deepEqual(pasted.asset.tracks[2].clips.map((clip) => clip.start), [0, 0.8, 3, 3.8]);
  assert.equal(pasted.asset.tracks[2].clips[3].blend_in, 0.2);
});

test('Sequencer group paste is atomic when the complete shape cannot fit', () => {
  const source = timeline();
  source.tracks[1].clips.push({
    start: 4, duration: 2, clip: 'Assets/later.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false,
  });
  const copied = copySequencerItems(source, [
    { track: 1, marker: 0 },
    { track: 1, marker: 1 },
  ]);
  assert.equal(copied.ok, true);
  const target = timeline();
  target.tracks[1].clips = [{
    start: 0, duration: 8, clip: 'Assets/full.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false,
  }];
  const pasted = pasteSequencerClipboard(target, 1, 0, copied.clipboard);
  assert.equal(pasted.ok, false);
  assert.match(pasted.error, /no collision-free space/);
  assert.equal(target.tracks[1].clips.length, 1);
});

test('Sequencer group paste never collapses separate source tracks into one lane', () => {
  const source = timeline();
  source.tracks.push({
    type: 'audio', id: 'dialogue', name: 'Dialogue', muted: false, locked: false, target: 'Voice',
    clips: [{ start: 1, duration: 1, clip: 'Assets/voice.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false }],
  });
  const copied = copySequencerItems(source, [
    { track: 1, marker: 0 },
    { track: 3, marker: 0 },
  ]);
  assert.equal(copied.ok, true);
  const target = timeline();
  const pasted = pasteSequencerClipboard(target, 1, 4, copied.clipboard);
  assert.equal(pasted.ok, false);
  assert.match(pasted.error, /no separate unlocked audio track/);
  assert.equal(target.tracks[1].clips.length, 1);
});

test('Sequencer group movement shares one collision bound and rejects locked tracks', () => {
  const asset = timeline();
  asset.tracks[1].clips = [
    { start: 0, duration: 1, clip: 'Assets/a.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 2, duration: 1, clip: 'Assets/b.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 4, duration: 1, clip: 'Assets/c.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 6, duration: 1, clip: 'Assets/d.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
  ];
  const moved = moveSequencerItems(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
    { track: 1, marker: 2 },
  ], 10);
  assert.equal(moved.ok, true);
  assert.equal(moved.delta, 1);
  assert.equal(moved.asset.tracks[0].markers[0].time, 2);
  assert.deepEqual(moved.asset.tracks[1].clips.map((clip) => clip.start), [0, 3, 5, 6]);
  assert.deepEqual(asset.tracks[1].clips.map((clip) => clip.start), [0, 2, 4, 6]);

  asset.tracks[0].locked = true;
  const locked = moveSequencerItems(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
  ], 1);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /locked/);

  asset.tracks[0].locked = false;
  asset.groups = [{
    id: 'locked-group', name: 'Locked Group', muted: false, locked: true, collapsed: false,
    track_ids: ['signals'],
  }];
  const groupLocked = moveSequencerItems(asset, [{ track: 0, marker: 0 }], 1);
  assert.equal(groupLocked.ok, false);
  assert.match(groupLocked.error, /locked/);
});

test('Sequencer movement automatically authors bounded two-clip Animation crossfades', () => {
  const asset = timeline();
  asset.tracks[2].clips = [
    {
      start: 0, duration: 1, clip: 'Assets/A.manim', clip_in: 0,
      speed: 1, blend_in: 0, blend_curve: 'linear',
    },
    {
      start: 1.5, duration: 1, clip: 'Assets/B.manim', clip_in: 0,
      speed: 1, blend_in: 0, blend_curve: 'linear',
    },
  ];
  const crossed = moveSequencerItems(asset, [{ track: 2, marker: 1 }], -1);
  assert.equal(crossed.ok, true);
  assert.equal(crossed.delta, -1);
  assert.deepEqual(crossed.asset.tracks[2].clips.map((clip) => clip.start), [0, 0.5]);
  assert.equal(crossed.asset.tracks[2].clips[1].blend_in, 0.5);

  asset.tracks[2].clips.push({
    start: 2.8, duration: 1, clip: 'Assets/C.manim', clip_in: 0,
    speed: 1, blend_in: 0.5, blend_curve: 'linear',
  });
  const grouped = moveSequencerItems(asset, [
    { track: 2, marker: 1 },
    { track: 2, marker: 2 },
  ], -2);
  assert.equal(grouped.ok, true);
  assert.ok(grouped.delta > -1.5);
  assert.equal(grouped.asset.tracks[2].clips.every((clip, index, clips) => (
    index < 2 || clips[index - 2].start + clips[index - 2].duration <= clip.start + 0.0001
  )), true);
});

test('Sequencer ripple movement shifts each affected suffix and extends duration', () => {
  const asset = timeline();
  asset.tracks[1].clips = [
    { start: 0, duration: 1, clip: 'Assets/a.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 2, duration: 1, clip: 'Assets/b.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 4, duration: 1, clip: 'Assets/c.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 6, duration: 1, clip: 'Assets/d.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
  ];
  const moved = rippleMoveSequencerItems(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
  ], 2);
  assert.equal(moved.ok, true);
  assert.equal(moved.delta, 2);
  assert.equal(moved.asset.duration, 9);
  assert.deepEqual(moved.asset.tracks[0].markers.map((marker) => marker.time), [3]);
  assert.deepEqual(moved.asset.tracks[1].clips.map((clip) => clip.start), [0, 4, 6, 8]);
  assert.deepEqual(asset.tracks[1].clips.map((clip) => clip.start), [0, 2, 4, 6]);
  assert.deepEqual(expandSequencerRippleSelection(asset, [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
  ]), [
    { track: 0, marker: 0 },
    { track: 1, marker: 1 },
    { track: 1, marker: 2 },
    { track: 1, marker: 3 },
  ]);
  assert.deepEqual(
    snapSequencerItemsDelta(
      asset,
      expandSequencerRippleSelection(asset, [{ track: 1, marker: 1 }]),
      0.86,
      0,
      0.15,
    ),
    { delta: 1, guideTime: 8 },
  );
});

test('Sequencer ripple movement preserves a valid Animation crossfade boundary', () => {
  const asset = timeline();
  asset.tracks[2].clips = [
    {
      start: 0, duration: 1, clip: 'Assets/A.manim', clip_in: 0,
      speed: 1, blend_in: 0, blend_curve: 'linear',
    },
    {
      start: 0.8, duration: 1, clip: 'Assets/B.manim', clip_in: 0,
      speed: 1, blend_in: 0.4, blend_curve: 'linear',
    },
    {
      start: 2, duration: 1, clip: 'Assets/C.manim', clip_in: 0,
      speed: 1, blend_in: 0.2, blend_curve: 'linear',
    },
  ];
  const moved = rippleMoveSequencerItems(asset, [{ track: 2, marker: 1 }], -1);
  assert.equal(moved.ok, true);
  assert.equal(moved.delta, -0.7);
  assert.deepEqual(moved.asset.tracks[2].clips.map((clip) => clip.start), [0, 0.1, 1.3]);
  assert.equal(moved.asset.tracks[2].clips[1].blend_in, 0.9);
});

test('Sequencer ripple movement closes time but preserves the previous clip boundary', () => {
  const asset = timeline();
  asset.tracks[1].clips = [
    { start: 0, duration: 1, clip: 'Assets/a.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 2, duration: 1, clip: 'Assets/b.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
    { start: 4, duration: 1, clip: 'Assets/c.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false },
  ];
  const moved = rippleMoveSequencerItems(asset, [{ track: 1, marker: 1 }], -99);
  assert.equal(moved.ok, true);
  assert.equal(moved.delta, -1);
  assert.deepEqual(moved.asset.tracks[1].clips.map((clip) => clip.start), [0, 1, 3]);
  assert.equal(moved.asset.duration, 8);

  asset.tracks[1].locked = true;
  const locked = rippleMoveSequencerItems(asset, [{ track: 1, marker: 1 }], 1);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /locked/);
});

test('Sequencer magnetic snapping aligns selected edges without using selected items as targets', () => {
  const asset = timeline();
  asset.tracks[1].clips.push({
    start: 4, duration: 1, clip: 'Assets/b.ogg', clip_in: 0, volume: 1, pitch: 1, looped: false,
  });
  assert.deepEqual(
    snapSequencerItemsDelta(asset, [{ track: 1, marker: 0 }], 0.86, 7, 0.15),
    { delta: 1, guideTime: 4 },
  );
  assert.deepEqual(
    snapSequencerItemsDelta(asset, [{ track: 1, marker: 0 }], 0.86, 7, 0.05),
    { delta: 0.9, guideTime: null },
  );

  asset.tracks[1].clips[1].start = 3.1;
  asset.tracks[0].markers = [];
  assert.deepEqual(
    snapSequencerItemsDelta(asset, [
      { track: 1, marker: 0 },
      { track: 1, marker: 1 },
    ], 0.06, 7, 0.15),
    { delta: 0.1, guideTime: null },
  );
});

test('Sequencer magnetic snapping supports playhead targets and individual trim edges', () => {
  const asset = timeline();
  assert.deepEqual(
    snapSequencerItemsDelta(asset, [{ track: 1, marker: 0 }], 0.86, 2, 0.15, 'start'),
    { delta: 1, guideTime: 2 },
  );
  assert.deepEqual(
    snapSequencerItemsDelta(asset, [{ track: 1, marker: 0 }], -0.86, 2, 0.15, 'end'),
    { delta: -1, guideTime: 2 },
  );
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
    fade_in: 0.25,
    fade_out: 0.5,
    fade_curve: 'ease_in_out',
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

test('Sequencer track buttons share direct-drag group placement semantics', () => {
  const asset = timeline();
  asset.groups = [{ id: 'actors', name: 'Actors', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['audio', 'animation'] }];
  const withinGroup = moveSequencerTrack(asset, 2, -1);
  assert.equal(withinGroup.ok, true);
  assert.deepEqual(withinGroup.asset.tracks.map((track) => track.id), ['signals', 'animation', 'audio']);
  assert.deepEqual(withinGroup.asset.groups[0].track_ids, ['animation', 'audio']);

  const leaveGroup = moveSequencerTrack(withinGroup.asset, 1, -1);
  assert.equal(leaveGroup.ok, true);
  assert.deepEqual(leaveGroup.asset.tracks.map((track) => track.id), ['animation', 'signals', 'audio']);
  assert.deepEqual(leaveGroup.asset.groups[0].track_ids, ['audio']);
});

test('Sequencer direct track placement reorders and synchronizes group membership atomically', () => {
  const asset = timeline();
  asset.groups = [{ id: 'actors', name: 'Actors', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['animation'] }];
  const joined = placeSequencerTrack(asset, 'signals', { kind: 'track', trackId: 'animation', edge: 'before' });
  assert.equal(joined.ok, true);
  assert.equal(joined.changed, true);
  assert.deepEqual(joined.asset.tracks.map((track) => track.id), ['audio', 'signals', 'animation']);
  assert.deepEqual(joined.asset.groups[0].track_ids, ['signals', 'animation']);
  assert.deepEqual(asset.tracks.map((track) => track.id), ['signals', 'audio', 'animation']);

  const rooted = placeSequencerTrack(joined.asset, 'signals', { kind: 'root' });
  assert.equal(rooted.ok, true);
  assert.deepEqual(rooted.asset.tracks.map((track) => track.id), ['audio', 'animation', 'signals']);
  assert.deepEqual(rooted.asset.groups[0].track_ids, ['animation']);

  const appended = placeSequencerTrack(rooted.asset, 'audio', { kind: 'group', groupId: 'actors' });
  assert.equal(appended.ok, true);
  assert.deepEqual(appended.asset.tracks.map((track) => track.id), ['animation', 'audio', 'signals']);
  assert.deepEqual(appended.asset.groups[0].track_ids, ['animation', 'audio']);

  const reordered = placeSequencerTrack(appended.asset, 'audio', { kind: 'track', trackId: 'animation', edge: 'before' });
  assert.equal(reordered.ok, true);
  assert.deepEqual(reordered.asset.tracks.map((track) => track.id), ['audio', 'animation', 'signals']);
  assert.deepEqual(reordered.asset.groups[0].track_ids, ['audio', 'animation']);

  const stable = placeSequencerTrack(reordered.asset, 'audio', { kind: 'track', trackId: 'animation', edge: 'before' });
  assert.equal(stable.ok, true);
  assert.equal(stable.changed, false);
});

test('Sequencer direct track placement rejects locked groups and detects no-op drops', () => {
  const asset = timeline();
  asset.groups = [{ id: 'locked', name: 'Locked', collapsed: true, muted: false, solo: false, locked: true, track_ids: ['animation'] }];
  const rejected = placeSequencerTrack(asset, 'audio', { kind: 'group', groupId: 'locked' });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /locked/);
  const lockedSource = placeSequencerTrack(asset, 'animation', { kind: 'root' });
  assert.equal(lockedSource.ok, false);
  assert.match(lockedSource.error, /locked/);
  const noOp = placeSequencerTrack(asset, 'signals', { kind: 'track', trackId: 'signals', edge: 'after' });
  assert.equal(noOp.ok, true);
  assert.equal(noOp.changed, false);
});

test('Sequencer group placement moves complete track blocks and preserves membership order', () => {
  const asset = timeline();
  asset.groups = [
    { id: 'dialog', name: 'Dialog', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['signals', 'audio'] },
    { id: 'actors', name: 'Actors', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['animation'] },
    { id: 'empty', name: 'Empty', collapsed: false, muted: false, solo: false, locked: false, track_ids: [] },
  ];

  const afterActors = placeSequencerGroup(asset, 'dialog', { kind: 'group', groupId: 'actors', edge: 'after' });
  assert.equal(afterActors.ok, true);
  assert.equal(afterActors.changed, true);
  assert.deepEqual(afterActors.asset.tracks.map((track) => track.id), ['animation', 'signals', 'audio']);
  assert.deepEqual(afterActors.asset.groups.map((group) => group.id), ['actors', 'dialog', 'empty']);
  assert.deepEqual(afterActors.asset.groups[1].track_ids, ['signals', 'audio']);
  assert.deepEqual(asset.tracks.map((track) => track.id), ['signals', 'audio', 'animation']);

  const beforeActors = placeSequencerGroup(afterActors.asset, 'dialog', { kind: 'track', trackId: 'animation', edge: 'before' });
  assert.equal(beforeActors.ok, true);
  assert.deepEqual(beforeActors.asset.tracks.map((track) => track.id), ['signals', 'audio', 'animation']);
  assert.deepEqual(beforeActors.asset.groups.map((group) => group.id), ['dialog', 'actors', 'empty']);

  const rooted = placeSequencerGroup(beforeActors.asset, 'dialog', { kind: 'root' });
  assert.equal(rooted.ok, true);
  assert.deepEqual(rooted.asset.tracks.map((track) => track.id), ['animation', 'signals', 'audio']);
  assert.deepEqual(rooted.asset.groups.map((group) => group.id), ['actors', 'dialog', 'empty']);
  assert.deepEqual(rooted.asset.groups[1].track_ids, ['signals', 'audio']);

  const stable = placeSequencerGroup(rooted.asset, 'dialog', { kind: 'group', groupId: 'dialog', edge: 'after' });
  assert.equal(stable.ok, true);
  assert.equal(stable.changed, false);
});

test('Sequencer group placement handles empty and locked groups without unrepresentable layouts', () => {
  const asset = timeline();
  asset.groups = [
    { id: 'actors', name: 'Actors', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['animation'] },
    { id: 'empty-a', name: 'Empty A', collapsed: false, muted: false, solo: false, locked: false, track_ids: [] },
    { id: 'empty-b', name: 'Empty B', collapsed: false, muted: false, solo: false, locked: false, track_ids: [] },
  ];

  const reordered = placeSequencerGroup(asset, 'empty-b', { kind: 'group', groupId: 'empty-a', edge: 'before' });
  assert.equal(reordered.ok, true);
  assert.deepEqual(reordered.asset.groups.map((group) => group.id), ['actors', 'empty-b', 'empty-a']);
  assert.deepEqual(reordered.asset.tracks.map((track) => track.id), ['signals', 'audio', 'animation']);

  const emptyAcrossTracks = placeSequencerGroup(asset, 'empty-a', { kind: 'group', groupId: 'actors', edge: 'before' });
  assert.equal(emptyAcrossTracks.ok, false);
  assert.match(emptyAcrossTracks.error, /empty Timeline group/);
  const tracksAfterEmpty = placeSequencerGroup(asset, 'actors', { kind: 'group', groupId: 'empty-a', edge: 'after' });
  assert.equal(tracksAfterEmpty.ok, false);
  assert.match(tracksAfterEmpty.error, /cannot be placed after an empty/);

  asset.groups[0].locked = true;
  const locked = placeSequencerGroup(asset, 'actors', { kind: 'root' });
  assert.equal(locked.ok, false);
  assert.match(locked.error, /locked/);
});

test('Sequencer keyboard group movement follows visual blocks and respects boundaries', () => {
  const asset = timeline();
  asset.groups = [
    { id: 'dialog', name: 'Dialog', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['signals'] },
    { id: 'actors', name: 'Actors', collapsed: false, muted: false, solo: false, locked: false, track_ids: ['animation'] },
  ];
  const moved = moveSequencerGroup(asset, 'actors', -1);
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.asset.tracks.map((track) => track.id), ['signals', 'animation', 'audio']);
  assert.deepEqual(moved.asset.groups.map((group) => group.id), ['dialog', 'actors']);

  const movedAgain = moveSequencerGroup(moved.asset, 'actors', -1);
  assert.equal(movedAgain.ok, true);
  assert.deepEqual(movedAgain.asset.tracks.map((track) => track.id), ['animation', 'signals', 'audio']);
  assert.deepEqual(movedAgain.asset.groups.map((group) => group.id), ['actors', 'dialog']);
  const boundary = moveSequencerGroup(movedAgain.asset, 'actors', -1);
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

test('Sequencer camera clipboard preserves binding and blend settings', () => {
  const asset = timeline();
  asset.tracks.push({
    type: 'camera', id: 'shots', name: 'Shots', muted: false, locked: false,
    clips: [{ start: 0, duration: 1, target: 'Cameras/Wide', blend_in: 0.25, blend_curve: 'ease_in_out' }],
  });
  const clipboard = copySequencerItem(asset, 3, 0);
  assert.ok(clipboard);
  assert.equal(clipboard.type, 'camera');
  const pasted = pasteSequencerItem(asset, 3, 1, clipboard);
  assert.equal(pasted.ok, true);
  assert.deepEqual(pasted.asset.tracks[3].clips[pasted.itemIndex], {
    start: 1,
    duration: 1,
    target: 'Cameras/Wide',
    blend_in: 0.25,
    blend_curve: 'ease_in_out',
  });
  assert.equal(asset.tracks[3].clips.length, 1);
});
