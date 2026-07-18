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
  assert.deepEqual(asset.tracks[0].markers.map((marker) => marker.name), ['Start', 'End']);
  assert.deepEqual(parseTimelineAsset(serializeTimelineAsset(asset)), asset);
});

test('timeline asset rejects unknown tracks and snaps to frames', () => {
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"audio"}]}'), /Unsupported/);
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
      type: 'activation', id: 'dialog', name: 'Dialog', target: 'Canvas\\Dialog',
      clips: [
        { start: 1, duration: 0.5, active: true },
        { start: 0, duration: 0.5, active: false },
      ],
    }],
  }));
  assert.equal(asset.tracks[0].target, 'Canvas/Dialog');
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
});
