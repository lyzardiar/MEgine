import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnimationClip } from '../src/animationClip.ts';
import {
  animationCurveCoordinates,
  animationCurveChannelDrawOrder,
  animationCurveKeysInRect,
  animationCurveMaximumZoom,
  animationCurvePoint,
  animationCurveSelectionBounds,
  animationCurveSlopeFromPoint,
  animationCurveTangentChannel,
  animationCurveTangentConstraint,
  animationCurveTangentHandle,
  animationCurveTangentWeightFromPoint,
  animationCurveValueBounds,
  moveAnimationCurveKey,
  offsetAnimationCurveKeyValues,
  panAnimationCurveView,
  setAnimationCurveTangentChannel,
  setAnimationCurveTangentSideMode,
  setAnimationCurveTangentWeight,
  setAnimationCurveTangentsAuto,
  setAnimationCurveTangentsBroken,
  setAnimationCurveTangentsFlat,
  setAnimationCurveTangentsFreeSmooth,
  zoomAnimationCurveView,
} from '../src/animationCurveEditing.ts';

function track() {
  return normalizeAnimationClip({
    name: 'Curve',
    duration: 2,
    frame_rate: 10,
    tracks: [{
      target: '.',
      component: 'Transform',
      property: 'position',
      interpolation: 'cubic',
      keyframes: [
        { time: 0, value: [0, 2] },
        { time: 1, value: [2, 4] },
        { time: 2, value: [0, 6] },
      ],
    }],
  }).tracks[0];
}

function viewport() {
  return {
    timeStart: 0,
    timeEnd: 2,
    minimum: 0,
    maximum: 10,
    width: 1000,
    height: 500,
    paddingLeft: 50,
    paddingRight: 50,
    paddingTop: 20,
    paddingBottom: 30,
  };
}

test('Curve viewport coordinates round trip and clamp to the plot', () => {
  const view = viewport();
  const point = animationCurvePoint(view, 0.5, 7.5);
  assert.deepEqual(point, { x: 275, y: 132.5 });
  assert.deepEqual(animationCurveCoordinates(view, point.x, point.y), { time: 0.5, value: 7.5 });
  assert.deepEqual(animationCurveCoordinates(view, -100, 900), { time: 0, value: 0 });
});

test('Curve channels draw the active channel last so overlapping keys remain selectable', () => {
  assert.deepEqual(animationCurveChannelDrawOrder(3, 0), [1, 2, 0]);
  assert.deepEqual(animationCurveChannelDrawOrder(3, 1), [0, 2, 1]);
  assert.deepEqual(animationCurveChannelDrawOrder(3, 9), [0, 1, 2]);
  assert.deepEqual(animationCurveChannelDrawOrder(Number.NaN, 0), []);
});

test('Curve value bounds include sampled channels and stable padding', () => {
  assert.deepEqual(animationCurveValueBounds(track(), 0, 2, 20), {
    minimum: -0.48,
    maximum: 6.48,
  });
  const constant = { ...track(), keyframes: [{ time: 0, value: 2 }, { time: 2, value: 2 }] };
  assert.deepEqual(animationCurveValueBounds(constant, 0, 2), { minimum: 1.5, maximum: 2.5 });
});

test('Curve framing, cursor zoom and panning preserve stable view bounds', () => {
  assert.equal(animationCurveMaximumZoom(1, 60), 60);
  assert.equal(animationCurveMaximumZoom(2, 60), 64);
  assert.equal(animationCurveMaximumZoom(0.01, 60), 1);
  assert.equal(animationCurveMaximumZoom(Number.NaN, Number.NaN), 1);

  const single = animationCurveSelectionBounds(track(), [1, 1, 99], 0, 2, 10);
  assert.ok(single);
  assert.equal(single.timeStart, 0.8);
  assert.ok(Math.abs(single.timeEnd - 1.2) < 1e-9);
  assert.deepEqual({ minimum: single.minimum, maximum: single.maximum }, {
    minimum: 1.5,
    maximum: 2.5,
  });
  assert.deepEqual(animationCurveSelectionBounds(track(), [0, 2], 1, 2, 10), {
    timeStart: 0,
    timeEnd: 2,
    minimum: 1.52,
    maximum: 6.48,
  });

  const zoomed = zoomAnimationCurveView(viewport(), { time: 0.5, value: 7.5 }, 0.5, 0.5, 2, 0.1);
  assert.deepEqual(zoomed, {
    timeStart: 0.25,
    timeEnd: 1.25,
    minimum: 3.75,
    maximum: 8.75,
  });
  assert.deepEqual(panAnimationCurveView(zoomed, 2, 2, 2), {
    timeStart: 1,
    timeEnd: 2,
    minimum: 5.75,
    maximum: 10.75,
  });
  assert.deepEqual(panAnimationCurveView({
    timeStart: 0,
    timeEnd: 1,
    minimum: 10,
    maximum: Number.NaN,
  }, 0, 0, 2), {
    timeStart: 0,
    timeEnd: 1,
    minimum: 10,
    maximum: 11,
  });
});

test('Curve key movement updates one channel, snaps time and preserves tangents', () => {
  const source = setAnimationCurveTangentChannel(track(), 1, 'out_tangent', 0, 3);
  const moved = moveAnimationCurveKey(source, 1, 1, 1.26, 8, 10, 2);
  assert.ok(moved);
  assert.equal(moved.keyIndex, 1);
  assert.equal(moved.track.keyframes[1].time, 1.3);
  assert.deepEqual(moved.track.keyframes[1].value, [2, 8]);
  assert.deepEqual(moved.track.keyframes[1].out_tangent, [3, 2]);
});

test('Curve marquee selects one channel and batch value offsets preserve other channels', () => {
  const source = track();
  assert.deepEqual(animationCurveKeysInRect(source, 0, viewport(), {
    x: 40,
    y: 430,
    width: 920,
    height: 50,
  }), [0, 2]);
  assert.deepEqual(animationCurveKeysInRect(source, 1, viewport(), {
    x: 40,
    y: 150,
    width: 920,
    height: 260,
  }), [0, 1, 2]);

  const offset = offsetAnimationCurveKeyValues(source, [0, 2, 2, 99], 1, 1.5);
  assert.deepEqual(offset.keyframes.map((key) => key.value), [
    [0, 3.5],
    [2, 4],
    [0, 7.5],
  ]);
  assert.equal(offsetAnimationCurveKeyValues(source, [0], 5, 1), source);
});

test('Curve tangent handles preserve linked, broken, side, flat and automatic modes', () => {
  assert.equal(animationCurveTangentConstraint(track(), 1, 0), 'clamped_auto');
  let source = setAnimationCurveTangentChannel(track(), 1, 'out_tangent', 0, 4);
  assert.equal(animationCurveTangentChannel(source, 1, 'out_tangent', 0), 4);
  assert.equal(animationCurveTangentChannel(source, 1, 'in_tangent', 0), 4);
  assert.equal(source.keyframes[1].broken, undefined);
  assert.equal(animationCurveTangentConstraint(source, 1, 0), 'free_smooth');
  const handle = animationCurveTangentHandle(source, 1, 'out_tangent', 0, viewport(), 0.25);
  assert.deepEqual(handle, animationCurvePoint(viewport(), 1.25, 3));
  assert.equal(animationCurveSlopeFromPoint(1, 2, 1.25, 3), 4);

  source = setAnimationCurveTangentsBroken(source, 1);
  assert.equal(source.keyframes[1].broken, true);
  assert.equal(animationCurveTangentConstraint(source, 1, 0), 'broken');
  source = setAnimationCurveTangentChannel(source, 1, 'out_tangent', 0, 7);
  assert.equal(animationCurveTangentChannel(source, 1, 'in_tangent', 0), 4);
  assert.equal(animationCurveTangentChannel(source, 1, 'out_tangent', 0), 7);

  source = setAnimationCurveTangentSideMode(source, 1, 'in_tangent', 'linear');
  assert.equal(animationCurveTangentChannel(source, 1, 'in_tangent', 0), 2);
  source = setAnimationCurveTangentSideMode(source, 1, 'out_tangent', 'constant');
  assert.equal(animationCurveTangentChannel(source, 1, 'out_tangent', 0), null);
  assert.equal(animationCurveTangentHandle(source, 1, 'out_tangent', 0, viewport(), 0.25), null);
  source = setAnimationCurveTangentSideMode(source, 1, 'out_tangent', 'clamped_auto');
  assert.equal(source.keyframes[1].out_tangent, undefined);
  assert.equal(source.keyframes[1].out_tangent_mode, undefined);
  assert.equal(animationCurveTangentChannel(source, 1, 'out_tangent', 0), 0);

  source = setAnimationCurveTangentsFreeSmooth(source, 0);
  assert.equal(animationCurveTangentConstraint(source, 0, 0), 'free_smooth');
  source = setAnimationCurveTangentsFlat(source, 1);
  assert.deepEqual(source.keyframes[1].in_tangent, [0, 0]);
  assert.deepEqual(source.keyframes[1].out_tangent, [0, 0]);
  assert.equal(animationCurveTangentConstraint(source, 1, 0), 'flat');
  source = setAnimationCurveTangentsAuto(source, 1);
  assert.equal(source.keyframes[1].in_tangent, undefined);
  assert.equal(source.keyframes[1].out_tangent, undefined);
  assert.equal(source.keyframes[1].in_tangent_mode, undefined);
  assert.equal(source.keyframes[1].out_tangent_mode, undefined);
  assert.equal(source.keyframes[1].broken, undefined);
  assert.equal(animationCurveTangentConstraint(source, 1, 0), 'clamped_auto');
});

test('Curve tangent weights control handle time and survive weighted slope edits', () => {
  let source = setAnimationCurveTangentsFreeSmooth(track(), 1);
  source = setAnimationCurveTangentWeight(source, 1, 'out_tangent', 0.75);
  assert.equal(source.keyframes[1].out_weight, 0.75);
  assert.equal(source.keyframes[1].out_tangent_mode, 'free');
  assert.equal(source.keyframes[1].broken, undefined);
  assert.deepEqual(
    animationCurveTangentHandle(source, 1, 'out_tangent', 0, viewport()),
    animationCurvePoint(viewport(), 1.75, 2),
  );
  assert.ok(Math.abs(animationCurveTangentWeightFromPoint(source, 1, 'out_tangent', 1.6) - 0.6) < 1e-9);
  assert.equal(animationCurveTangentWeightFromPoint(source, 1, 'out_tangent', 3), 1);
  assert.equal(animationCurveTangentWeightFromPoint(source, 1, 'out_tangent', 0.5), 0);

  source = setAnimationCurveTangentChannel(source, 1, 'out_tangent', 0, 4, 0.6);
  assert.equal(source.keyframes[1].out_weight, 0.6);
  assert.equal(animationCurveTangentChannel(source, 1, 'out_tangent', 0), 4);
  source = setAnimationCurveTangentWeight(source, 1, 'out_tangent', null);
  assert.equal(source.keyframes[1].out_weight, undefined);

  source = setAnimationCurveTangentWeight(source, 1, 'in_tangent', 0.4);
  source = setAnimationCurveTangentSideMode(source, 1, 'in_tangent', 'linear');
  assert.equal(source.keyframes[1].in_weight, undefined);
  source = setAnimationCurveTangentWeight(source, 1, 'out_tangent', 0.8);
  source = setAnimationCurveTangentsAuto(source, 1);
  assert.equal(source.keyframes[1].in_weight, undefined);
  assert.equal(source.keyframes[1].out_weight, undefined);
});
