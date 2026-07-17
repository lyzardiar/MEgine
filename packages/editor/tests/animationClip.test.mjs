import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAnimationClip,
  parseAnimationClip,
  removeAnimationKeyframe,
  replaceAnimationKeyframe,
  sampleAnimationClip,
  sampleAnimationTrack,
  serializeAnimationClip,
  snapAnimationTime,
  upsertAnimationKeyframe,
  wrappedAnimationTime,
} from '../src/animationClip.ts';

const floatTrack = (interpolation) => ({
  target: '.',
  component: 'Transform',
  property: 'position.x',
  interpolation,
  keyframes: [
    { time: 0, value: 0 },
    { time: 2, value: 10 },
  ],
});

test('AnimationClip wrap modes match runtime semantics', () => {
  assert.equal(wrappedAnimationTime(2.5, 2, 'once'), 2);
  assert.equal(wrappedAnimationTime(2.5, 2, 'loop'), 0.5);
  assert.equal(wrappedAnimationTime(-0.5, 2, 'loop'), 1.5);
  assert.equal(wrappedAnimationTime(2.5, 2, 'ping_pong'), 1.5);
  assert.equal(wrappedAnimationTime(4.5, 2, 'ping_pong'), 0.5);
});

test('AnimationClip scalar vector and discrete interpolation is deterministic', () => {
  assert.equal(sampleAnimationTrack(floatTrack('linear'), 0.5), 2.5);
  assert.equal(sampleAnimationTrack(floatTrack('step'), 1.5), 0);
  assert.equal(sampleAnimationTrack(floatTrack('smooth'), 0.5), 1.5625);
  assert.deepEqual(sampleAnimationTrack({
    ...floatTrack('linear'),
    keyframes: [
      { time: 0, value: [0, 2] },
      { time: 1, value: [2, 4] },
    ],
  }, 0.5), [1, 3]);
  const discrete = {
    ...floatTrack('linear'),
    keyframes: [{ time: 0, value: false }, { time: 1, value: true }],
  };
  assert.equal(sampleAnimationTrack(discrete, 0.75), false);
  assert.equal(sampleAnimationTrack(discrete, 1), true);
});

test('AnimationClip parsing normalizes metadata key ordering and duplicate times', () => {
  const clip = parseAnimationClip(JSON.stringify({
    version: 0,
    name: 'Move',
    duration: 1,
    frame_rate: 0,
    wrap_mode: 'once',
    tracks: [{
      target: '',
      component: 'Transform',
      property: 'position.x',
      interpolation: 'linear',
      keyframes: [
        { time: 2, value: 2 },
        { time: 0, value: 0 },
        { time: 2, value: 3 },
      ],
    }],
  }));
  assert.equal(clip.version, 1);
  assert.equal(clip.frame_rate, 60);
  assert.equal(clip.duration, 2);
  assert.equal(clip.tracks[0].target, '.');
  assert.deepEqual(clip.tracks[0].keyframes, [
    { time: 0, value: 0 },
    { time: 2, value: 3 },
  ]);
  assert.deepEqual(sampleAnimationClip(clip, 2)[0].value, 3);
  assert.deepEqual(normalizeAnimationClip(JSON.parse(serializeAnimationClip(clip))), clip);
});

test('AnimationClip keyframe editing snaps replaces moves and removes on frame boundaries', () => {
  const track = floatTrack('linear');
  assert.equal(snapAnimationTime(0.26, 10, 2), 0.3);
  assert.equal(snapAnimationTime(5, 10, 2), 2);

  const inserted = upsertAnimationKeyframe(track, 0.26, 4, 10, 2);
  assert.equal(inserted.keyIndex, 1);
  assert.deepEqual(inserted.track.keyframes, [
    { time: 0, value: 0 },
    { time: 0.3, value: 4 },
    { time: 2, value: 10 },
  ]);

  const replaced = upsertAnimationKeyframe(inserted.track, 0.31, 5, 10, 2);
  assert.equal(replaced.keyIndex, 1);
  assert.deepEqual(replaced.track.keyframes[1], { time: 0.3, value: 5 });

  const moved = replaceAnimationKeyframe(replaced.track, 1, 1.04, 6, 10, 2);
  assert.ok(moved);
  assert.equal(moved.keyIndex, 1);
  assert.deepEqual(moved.track.keyframes[1], { time: 1, value: 6 });
  assert.deepEqual(removeAnimationKeyframe(moved.track, 1).keyframes, [
    { time: 0, value: 0 },
    { time: 2, value: 10 },
  ]);
});
