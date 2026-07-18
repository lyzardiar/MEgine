import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceAnimationPreviewPhase,
  addAnimationEvent,
  automaticAnimationTangent,
  normalizeAnimationClip,
  parseAnimationClip,
  removeAnimationKeyframe,
  removeAnimationEvent,
  replaceAnimationEvent,
  replaceAnimationKeyframe,
  sampleAnimationClip,
  sampleAnimationTrack,
  serializeAnimationClip,
  setAnimationKeyframeTangents,
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

test('Animation preview keeps ping-pong phase while sample time reverses', () => {
  const turned = advanceAnimationPreviewPhase(0.9, 0.2, 1, 'ping_pong');
  assert.equal(turned.phase, 1.1);
  assert.ok(Math.abs(turned.time - 0.9) < 1e-9);
  const returning = advanceAnimationPreviewPhase(turned.phase, 0.2, 1, 'ping_pong');
  assert.ok(Math.abs(returning.phase - 1.3) < 1e-9);
  assert.ok(Math.abs(returning.time - 0.7) < 1e-9);
  assert.deepEqual(advanceAnimationPreviewPhase(0.1, -0.2, 1, 'once'), {
    phase: 0,
    time: 0,
    finished: true,
  });
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

test('AnimationClip cubic interpolation supports automatic and authored Hermite tangents', () => {
  const automatic = {
    ...floatTrack('cubic'),
    keyframes: [
      { time: 0, value: 0 },
      { time: 1, value: 1 },
      { time: 2, value: 0 },
    ],
  };
  assert.equal(automaticAnimationTangent(automatic, 0), 1);
  assert.equal(automaticAnimationTangent(automatic, 1), 0);
  assert.equal(sampleAnimationTrack(automatic, 0.5), 0.625);

  const flat = setAnimationKeyframeTangents(
    setAnimationKeyframeTangents(automatic, 0, { out_tangent: 0 }),
    1,
    { in_tangent: 0 },
  );
  assert.equal(sampleAnimationTrack(flat, 0.5), 0.5);
  const reset = setAnimationKeyframeTangents(flat, 0, { out_tangent: null });
  assert.equal(reset.keyframes[0].out_tangent, undefined);

  const vector = {
    ...floatTrack('cubic'),
    keyframes: [
      { time: 0, value: [0, 2], out_tangent: [0, 0] },
      { time: 1, value: [2, 4], in_tangent: [0, 0] },
    ],
  };
  assert.deepEqual(sampleAnimationTrack(vector, 0.5), [1, 3]);
});

test('AnimationClip keeps valid tangents while moving and replacing keys', () => {
  const track = {
    ...floatTrack('cubic'),
    keyframes: [
      { time: 0, value: 0, out_tangent: 2 },
      { time: 2, value: 10, in_tangent: 3 },
    ],
  };
  const moved = replaceAnimationKeyframe(track, 0, 0.5, 1, 10, 2);
  assert.ok(moved);
  assert.equal(moved.track.keyframes[0].out_tangent, 2);
  const overwritten = upsertAnimationKeyframe(moved.track, 0.51, 4, 10, 2);
  assert.equal(overwritten.track.keyframes[0].out_tangent, 2);
  const changedShape = replaceAnimationKeyframe(overwritten.track, 0, 0.5, [1, 2], 10, 2);
  assert.equal(changedShape.track.keyframes[0].out_tangent, undefined);
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

test('AnimationClip serializes cubic tangents and ignores invalid tangent shapes', () => {
  const clip = normalizeAnimationClip({
    name: 'Curve',
    duration: 1,
    tracks: [{
      target: '.',
      component: 'Transform',
      property: 'position',
      interpolation: 'cubic',
      keyframes: [
        { time: 0, value: [0, 0], out_tangent: [1, 2] },
        { time: 1, value: [2, 3], in_tangent: [0] },
      ],
    }],
  });
  assert.equal(clip.tracks[0].interpolation, 'cubic');
  assert.deepEqual(clip.tracks[0].keyframes[0].out_tangent, [1, 2]);
  assert.equal(clip.tracks[0].keyframes[1].in_tangent, undefined);
  assert.deepEqual(parseAnimationClip(serializeAnimationClip(clip)), clip);
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

test('Animation events normalize, snap, edit, and remain backward compatible', () => {
  const legacy = normalizeAnimationClip({ version: 1, name: 'Legacy', duration: 1, tracks: [] });
  assert.deepEqual(legacy.events, []);

  const added = addAnimationEvent(legacy, 0.509, 'Footstep');
  assert.equal(added.clip.events[0].time, 31 / 60);
  const replaced = replaceAnimationEvent(added.clip, added.eventIndex, {
    function: 'SpawnDust',
    parameter: 'left',
  });
  assert.ok(replaced);
  assert.equal(replaced.clip.events[0].function, 'SpawnDust');
  assert.equal(replaced.clip.events[0].parameter, 'left');
  assert.deepEqual(removeAnimationEvent(replaced.clip, replaced.eventIndex).events, []);

  const parsed = normalizeAnimationClip({
    version: 1,
    name: 'Events',
    duration: 0.1,
    tracks: [],
    events: [
      { time: 0.75, name: 'LegacyName', parameter: 3 },
      { time: -1, function: '' },
    ],
  });
  assert.equal(parsed.duration, 0.75);
  assert.deepEqual(parsed.events, [{ time: 0.75, function: 'LegacyName', parameter: 3 }]);
});
