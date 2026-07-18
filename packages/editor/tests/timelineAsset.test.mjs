import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTimelineAsset,
  normalizeTimelineAsset,
  parseTimelineAsset,
  serializeTimelineAsset,
  snapTimelineAssetTime,
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
