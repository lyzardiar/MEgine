import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignTimelineTrackGroup,
  createTimelineAsset,
  normalizeTimelineAsset,
  parseTimelineAsset,
  serializeTimelineAsset,
  snapTimelineAssetTime,
  timelineHasSolo,
  timelineGroupForTrack,
  timelineTrackIsLocked,
  timelineTrackIsMuted,
  timelineTrackIsSolo,
} from '../src/timelineAsset.ts';

test('timeline asset normalizes signal tracks and round trips', () => {
  const asset = normalizeTimelineAsset({
    name: ' Intro ', duration: 2, frame_rate: 30,
    tracks: [{ type: 'signal', id: 'events', name: ' Events ', markers: [
      { time: 1.5, name: 'End', payload: { score: 2 } },
      { time: 0.25, name: ' Start ' },
    ] }],
  });
  assert.equal(asset.name, 'Intro');
  assert.equal(asset.tracks[0].solo, false);
  assert.equal(asset.tracks[0].locked, false);
  assert.deepEqual(asset.tracks[0].markers.map((marker) => marker.name), ['Start', 'End']);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);
});

test('timeline asset rejects unknown tracks and snaps to frames', () => {
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"unknown"}]}'), /Unsupported/);
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"signal","id":"same","name":"A"},{"type":"signal","id":"same","name":"B"}]}'), /unique/);
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"signal","id":"events","name":"Events","markers":[{"time":1,"name":""}]}]}'), /invalid/);
  const asset = createTimelineAsset();
  asset.frame_rate = 10;
  assert.equal(snapTimelineAssetTime(0.26, asset), 0.3);
  assert.equal(snapTimelineAssetTime(99, asset), asset.duration);
});

test('timeline track groups round trip and contribute effective mute and lock state', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Grouped',
    duration: 2,
    tracks: [
      { type: 'signal', id: 'events', name: 'Events' },
      { type: 'signal', id: 'dialogue', name: 'Dialogue', muted: true },
    ],
    groups: [{
      id: 'presentation', name: ' Presentation ', muted: true, locked: true, collapsed: true,
      track_ids: ['events'],
    }],
  }));
  assert.deepEqual(asset.groups, [{
    id: 'presentation', name: 'Presentation', solo: false, muted: true, locked: true, collapsed: true,
    track_ids: ['events'],
  }]);
  assert.equal(timelineGroupForTrack(asset, 'events')?.id, 'presentation');
  assert.equal(timelineTrackIsMuted(asset, asset.tracks[0]), true);
  assert.equal(timelineTrackIsLocked(asset, asset.tracks[0]), true);
  assert.equal(timelineTrackIsMuted(asset, asset.tracks[1]), true);
  const moved = assignTimelineTrackGroup([
    { ...asset.groups[0], locked: false },
    { id: 'other', name: 'Other', muted: false, locked: false, collapsed: false, track_ids: [] },
  ], 'events', 'other');
  assert.deepEqual(moved.map((group) => group.track_ids), [[], ['events']]);
  assert.deepEqual(assignTimelineTrackGroup(moved, 'events', null).map((group) => group.track_ids), [[], []]);
  assert.throws(() => assignTimelineTrackGroup(moved, 'events', 'missing'), /no longer exists/);
  assert.throws(() => assignTimelineTrackGroup(asset.groups, 'events', null), /Presentation is locked/);
  assert.throws(() => assignTimelineTrackGroup([
    { id: 'other', name: 'Other', muted: false, locked: true, collapsed: false, track_ids: [] },
  ], 'events', 'other'), /Other is locked/);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);

  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 1,
    tracks: [{ type: 'signal', id: 'events', name: 'Events' }],
    groups: [{ id: 'a', name: 'A', track_ids: ['events'] }, { id: 'b', name: 'B', track_ids: ['events'] }],
  })), /more than one group/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 1,
    tracks: [{ type: 'signal', id: 'events', name: 'Events' }],
    groups: [{ id: 'a', name: 'A', track_ids: ['missing'] }],
  })), /missing track/);
});

test('timeline Solo filters non-solo tracks while mute remains authoritative', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Solo',
    duration: 2,
    tracks: [
      { type: 'signal', id: 'events', name: 'Events' },
      { type: 'signal', id: 'dialogue', name: 'Dialogue', solo: true },
      { type: 'signal', id: 'muted', name: 'Muted', solo: true, muted: true },
      { type: 'signal', id: 'grouped', name: 'Grouped' },
    ],
    groups: [{ id: 'presentation', name: 'Presentation', solo: true, track_ids: ['grouped'] }],
  }));
  assert.equal(timelineTrackIsSolo(asset, asset.tracks[0]), false);
  assert.equal(timelineTrackIsMuted(asset, asset.tracks[0]), true);
  assert.equal(timelineTrackIsSolo(asset, asset.tracks[1]), true);
  assert.equal(timelineTrackIsMuted(asset, asset.tracks[1]), false);
  assert.equal(timelineTrackIsMuted(asset, asset.tracks[2]), true);
  assert.equal(timelineTrackIsSolo(asset, asset.tracks[3]), true);
  assert.equal(timelineTrackIsMuted(asset, asset.tracks[3]), false);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);

  const emptyGroup = parseTimelineAsset(JSON.stringify({
    version: 1, duration: 1,
    tracks: [{ type: 'signal', id: 'events', name: 'Events' }],
    groups: [{ id: 'empty', name: 'Empty', solo: true, track_ids: [] }],
  }));
  assert.equal(timelineHasSolo(emptyGroup), false);
  assert.equal(timelineTrackIsMuted(emptyGroup, emptyGroup.tracks[0]), false);

  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 1,
    tracks: [{ type: 'signal', id: 'events', name: 'Events', solo: 'yes' }],
  })), /solo must be boolean/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 1,
    tracks: [{ type: 'signal', id: 'events', name: 'Events' }],
    groups: [{ id: 'group', name: 'Group', solo: 'yes', track_ids: ['events'] }],
  })), /solo must be boolean/);
});

test('timeline activation tracks normalize bindings and reject ambiguous clips', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Activation',
    duration: 3,
    frame_rate: 30,
    tracks: [{
      type: 'activation', id: 'dialog', name: 'Dialog', target: 'Canvas\\Dialog', locked: true,
      clips: [
        { start: 1, duration: 0.5, active: true },
        { start: 0, duration: 0.5, active: false },
      ],
    }],
  }));
  assert.equal(asset.tracks[0].target, 'Canvas/Dialog');
  assert.equal(asset.tracks[0].locked, true);
  assert.deepEqual(asset.tracks[0].clips.map((clip) => clip.start), [0, 1]);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'activation', id: 'dialog', name: 'Dialog', target: 'Canvas/Dialog',
      clips: [
        { start: 0, duration: 1.5, active: true },
        { start: 1, duration: 1, active: false },
      ],
    }],
  })), /overlapping/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{ type: 'activation', id: 'dialog', name: 'Dialog', target: '../Dialog', clips: [] }],
  })), /descendant/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{ type: 'signal', id: 'events', name: 'Events', locked: 'yes' }],
  })), /locked must be boolean/);
});

test('timeline audio clips normalize fades and reject invalid envelopes', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Audio',
    duration: 4,
    tracks: [{
      type: 'audio', id: 'music', name: 'Music', target: 'Audio\\Music',
      clips: [
        { start: 2, duration: 1, clip: 'assets\\Audio\\theme.ogg', fade_in: 0.25, fade_out: 0.5, fade_curve: ' EASE_IN_OUT ' },
        { start: 0, duration: 1, clip: 'Assets/Audio/intro.wav' },
      ],
    }],
  }));
  assert.equal(asset.tracks[0].target, 'Audio/Music');
  assert.deepEqual(asset.tracks[0].clips, [
    {
      start: 0, duration: 1, clip: 'Assets/Audio/intro.wav', clip_in: 0,
      volume: 1, pitch: 1, looped: false, fade_in: 0, fade_out: 0, fade_curve: 'linear',
    },
    {
      start: 2, duration: 1, clip: 'Assets/Audio/theme.ogg', clip_in: 0,
      volume: 1, pitch: 1, looped: false, fade_in: 0.25, fade_out: 0.5, fade_curve: 'ease_in_out',
    },
  ]);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'audio', id: 'music', name: 'Music', target: 'Audio',
      clips: [{ start: 0, duration: 1, clip: 'Assets/Audio/a.ogg', fade_out: 1.1 }],
    }],
  })), /invalid/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'audio', id: 'music', name: 'Music', target: 'Audio',
      clips: [{ start: 0, duration: 1, clip: 'Assets/Audio/a.ogg', fade_curve: 'logarithmic' }],
    }],
  })), /invalid/);
});

test('timeline animation clips normalize seam blends and reject invalid curves', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Animation Blend',
    duration: 3,
    tracks: [{
      type: 'animation', id: 'hero', name: 'Hero', target: 'Characters\\Hero',
      clips: [
        { start: 1, duration: 1, clip: 'Assets/Animations/Run.manim', blend_in: 0.4, blend_curve: ' LINEAR ' },
        { start: 0, duration: 1, clip: 'Assets/Animations/Idle.manim' },
      ],
    }],
  }));
  assert.deepEqual(asset.tracks[0].clips, [
    {
      start: 0, duration: 1, clip: 'Assets/Animations/Idle.manim', clip_in: 0,
      speed: 1, blend_in: 0, blend_curve: 'ease_in_out',
    },
    {
      start: 1, duration: 1, clip: 'Assets/Animations/Run.manim', clip_in: 0,
      speed: 1, blend_in: 0.4, blend_curve: 'linear',
    },
  ]);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);
  const overlap = parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'animation', id: 'hero', name: 'Hero', target: 'Hero',
      clips: [
        { start: 0, duration: 1, clip: 'Assets/Animations/A.manim' },
        { start: 0.75, duration: 1, clip: 'Assets/Animations/B.manim', blend_in: 0.25 },
      ],
    }],
  }));
  assert.equal(overlap.tracks[0].clips[1].start, 0.75);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'animation', id: 'hero', name: 'Hero', target: 'Hero',
      clips: [
        { start: 0, duration: 1.5, clip: 'Assets/Animations/A.manim' },
        { start: 1, duration: 1, clip: 'Assets/Animations/B.manim', blend_in: 0.25 },
      ],
    }],
  })), /invalid crossfade/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'animation', id: 'hero', name: 'Hero', target: 'Hero',
      clips: [
        { start: 0, duration: 1.2, clip: 'Assets/Animations/A.manim' },
        { start: 0.5, duration: 1, clip: 'Assets/Animations/B.manim', blend_in: 0.7 },
        { start: 0.9, duration: 1, clip: 'Assets/Animations/C.manim', blend_in: 0.6 },
      ],
    }],
  })), /only two clips/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'animation', id: 'hero', name: 'Hero', target: 'Hero',
      clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/A.manim', blend_in: 1.1 }],
    }],
  })), /invalid/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'animation', id: 'hero', name: 'Hero', target: 'Hero',
      clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/A.manim', blend_curve: 'bounce' }],
    }],
  })), /invalid/);
});

test('timeline particle tracks normalize prewarm and reject invalid clips', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Particles',
    duration: 4,
    frame_rate: 30,
    tracks: [{
      type: 'particle', id: 'fx', name: 'FX', target: 'Effects\\Burst',
      clips: [
        { start: 2, duration: 1, clip_in: 0.5 },
        { start: 0, duration: 1 },
      ],
    }],
  }));
  assert.equal(asset.tracks[0].target, 'Effects/Burst');
  assert.deepEqual(asset.tracks[0].clips, [
    { start: 0, duration: 1, clip_in: 0 },
    { start: 2, duration: 1, clip_in: 0.5 },
  ]);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'particle', id: 'fx', name: 'FX', target: 'Burst',
      clips: [{ start: 0, duration: 1, clip_in: 300 }],
    }],
  })), /invalid/);
});

test('timeline camera tracks normalize shots and reject invalid blends', () => {
  const asset = parseTimelineAsset(JSON.stringify({
    version: 1,
    name: 'Shots',
    duration: 4,
    tracks: [{
      type: 'camera', id: 'shots', name: 'Shots', locked: true,
      clips: [
        { start: 2, duration: 2, target: 'Cameras\\Close', blend_in: 0.5, blend_curve: ' LINEAR ' },
        { start: 0, duration: 2, target: 'Cameras/Wide' },
      ],
    }],
  }));
  assert.deepEqual(asset.tracks[0].clips, [
    { start: 0, duration: 2, target: 'Cameras/Wide', blend_in: 0, blend_curve: 'ease_in_out' },
    { start: 2, duration: 2, target: 'Cameras/Close', blend_in: 0.5, blend_curve: 'linear' },
  ]);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [{
      type: 'camera', id: 'shots', name: 'Shots',
      clips: [{ start: 0, duration: 1, target: 'Camera', blend_in: 1.1 }],
    }],
  })), /invalid/);
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1, duration: 2,
    tracks: [
      { type: 'camera', id: 'a', name: 'A' },
      { type: 'camera', id: 'b', name: 'B' },
    ],
  })), /only one/);
});
