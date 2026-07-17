import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAnimationClip,
  parseAnimationClip,
  sampleAnimationClip,
  sampleAnimationTrack,
  serializeAnimationClip,
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
