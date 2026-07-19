import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceAnimationPreviewPhase,
  addAnimationEvent,
  animationKeyTangentMode,
  animationKeyTangentWeight,
  automaticAnimationTangent,
  normalizeAnimationClip,
  pasteAnimationEvent,
  pasteAnimationKeyframe,
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

test('AnimationClip tangent modes support clamped auto, linear, constant, and legacy free keys', () => {
  const legacy = normalizeAnimationClip({
    name: 'Legacy',
    duration: 1,
    tracks: [{
      target: '.',
      component: 'Transform',
      property: 'position.x',
      interpolation: 'cubic',
      keyframes: [{ time: 0, value: 0, out_tangent: 2 }, { time: 1, value: 2 }],
    }],
  }).tracks[0];
  assert.equal(animationKeyTangentMode(legacy.keyframes[0], 'out_tangent'), 'free');
  assert.equal(legacy.keyframes[0].broken, true);

  const linear = {
    ...floatTrack('cubic'),
    keyframes: [
      { time: 0, value: 0, out_tangent_mode: 'linear' },
      { time: 1, value: 2, in_tangent_mode: 'linear' },
    ],
  };
  assert.equal(sampleAnimationTrack(linear, 0.5), 1);
  const constant = {
    ...linear,
    keyframes: [
      { time: 0, value: 0, out_tangent_mode: 'constant' },
      { time: 1, value: 2, in_tangent_mode: 'linear' },
    ],
  };
  assert.equal(sampleAnimationTrack(constant, 0.999), 0);
  assert.equal(sampleAnimationTrack(constant, 1), 2);

  const monotone = {
    ...floatTrack('cubic'),
    keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 2, value: 1.01 }],
  };
  assert.ok(automaticAnimationTangent(monotone, 1) > 0);
  for (let step = 0; step <= 40; step += 1) {
    const time = step / 20;
    const value = sampleAnimationTrack(monotone, time);
    assert.ok(value >= 0 && value <= 1.01, `clamped auto overshot at ${time}: ${value}`);
  }
});

test('AnimationClip weighted tangents use time-weighted Bezier sampling and normalize weights', () => {
  const weighted = normalizeAnimationClip({
    name: 'Weighted',
    duration: 1,
    frame_rate: 60,
    tracks: [{
      target: '.',
      component: 'Transform',
      property: 'position.x',
      interpolation: 'cubic',
      keyframes: [
        { time: 0, value: 0, out_tangent: 0, outWeight: 0.8 },
        { time: 1, value: 1, in_tangent: 0, in_weight: 0.1 },
      ],
    }],
  }).tracks[0];
  assert.equal(animationKeyTangentWeight(weighted.keyframes[0], 'out_tangent'), 0.8);
  assert.equal(animationKeyTangentWeight(weighted.keyframes[1], 'in_tangent'), 0.1);
  assert.ok(Math.abs(sampleAnimationTrack(weighted, 0.5) - 0.17219266) < 1e-6);
  const unweightedThird = {
    ...weighted,
    keyframes: weighted.keyframes.map((key) => ({ ...key, in_weight: undefined, out_weight: undefined })),
  };
  const weightedThird = {
    ...weighted,
    keyframes: weighted.keyframes.map((key) => ({ ...key, in_weight: 1 / 3, out_weight: 1 / 3 })),
  };
  assert.ok(Math.abs(sampleAnimationTrack(unweightedThird, 0.37) - sampleAnimationTrack(weightedThird, 0.37)) < 1e-9);

  const zeroWeight = {
    ...weighted,
    keyframes: [
      { time: 0, value: 0, out_tangent: 100, out_weight: 0 },
      { time: 1, value: 1, in_tangent: -100, in_weight: 0 },
    ],
  };
  assert.ok(Math.abs(sampleAnimationTrack(zeroWeight, 0.25) - 0.25) < 1e-6);

  const clamped = normalizeAnimationClip({
    name: 'Clamp', duration: 1, tracks: [{ target: '.', component: 'T', property: 'x', interpolation: 'cubic', keyframes: [
      { time: 0, value: 0, out_weight: 3 }, { time: 1, value: 1, in_weight: -2 },
    ] }],
  }).tracks[0];
  assert.equal(clamped.keyframes[0].out_weight, 1);
  assert.equal(clamped.keyframes[1].in_weight, 0);
  const rejected = normalizeAnimationClip({
    name: 'Reject', duration: 1, tracks: [{ target: '.', component: 'T', property: 'x', interpolation: 'cubic', keyframes: [
      { time: 0, value: 0, out_weight: '0.5' }, { time: 1, value: true, in_weight: 0.5 },
    ] }],
  }).tracks[0];
  assert.equal(rejected.keyframes[0].out_weight, undefined);
  assert.equal(rejected.keyframes[1].in_weight, undefined);
});

test('AnimationClip keeps valid tangents while moving and replacing keys', () => {
  const track = {
    ...floatTrack('cubic'),
    keyframes: [
      { time: 0, value: 0, out_tangent: 2, out_weight: 0.7 },
      { time: 2, value: 10, in_tangent: 3 },
    ],
  };
  const moved = replaceAnimationKeyframe(track, 0, 0.5, 1, 10, 2);
  assert.ok(moved);
  assert.equal(moved.track.keyframes[0].out_tangent, 2);
  assert.equal(moved.track.keyframes[0].out_weight, 0.7);
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
        { time: 0, value: [0, 0], out_tangent: [1, 2], out_tangent_mode: 'free', broken: true },
        { time: 1, value: [2, 3], in_tangent: [0], in_tangent_mode: 'constant' },
      ],
    }],
  });
  assert.equal(clip.tracks[0].interpolation, 'cubic');
  assert.deepEqual(clip.tracks[0].keyframes[0].out_tangent, [1, 2]);
  assert.equal(clip.tracks[0].keyframes[0].out_tangent_mode, 'free');
  assert.equal(clip.tracks[0].keyframes[0].broken, true);
  assert.equal(clip.tracks[0].keyframes[1].in_tangent, undefined);
  assert.equal(clip.tracks[0].keyframes[1].in_tangent_mode, 'constant');
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

test('Timeline copy and paste preserves key tangents and event payloads at the playhead', () => {
  const sourceKey = {
    time: 0.25,
    value: [2, 4],
    in_tangent: [1, 2],
    out_tangent: [3, 4],
    in_weight: 0.2,
    out_weight: 0.7,
  };
  const pastedKey = pasteAnimationKeyframe({
    target: '.',
    component: 'Transform',
    property: 'position',
    interpolation: 'cubic',
    keyframes: [{ time: 0, value: [0, 0] }],
  }, sourceKey, 0.51, 10, 2);
  assert.equal(pastedKey.keyIndex, 1);
  assert.deepEqual(pastedKey.track.keyframes[1], {
    time: 0.5,
    value: [2, 4],
    in_tangent: [1, 2],
    out_tangent: [3, 4],
    in_weight: 0.2,
    out_weight: 0.7,
  });

  const clip = normalizeAnimationClip({
    name: 'Events',
    duration: 2,
    frame_rate: 10,
    events: [],
    tracks: [],
  });
  const pastedEvent = pasteAnimationEvent(clip, {
    time: 0.1,
    function: 'Spawn',
    parameter: [7, 8],
  }, 1.04);
  assert.deepEqual(pastedEvent.clip.events, [{
    time: 1,
    function: 'Spawn',
    parameter: [7, 8],
  }]);
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
