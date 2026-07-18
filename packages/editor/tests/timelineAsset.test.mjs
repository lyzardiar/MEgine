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
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"audio"}]}'), /不支持/);
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"signal","id":"same","name":"A"},{"type":"signal","id":"same","name":"B"}]}'), /唯一/);
  assert.throws(() => parseTimelineAsset('{"version":1,"duration":2,"tracks":[{"type":"signal","id":"events","name":"Events","markers":[{"time":1,"name":""}]}]}'), /未命名/);
  const asset = createTimelineAsset();
  asset.frame_rate = 10;
  assert.equal(snapTimelineAssetTime(0.26, asset), 0.3);
  assert.equal(snapTimelineAssetTime(99, asset), asset.duration);
});
