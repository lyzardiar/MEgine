import assert from 'node:assert/strict';
import test from 'node:test';

import { project } from '../src/math3d.ts';
import {
  drawTransformGizmo,
  gizmoPartEquals,
  hitTestTransformGizmo,
  worldDeltaOnPlane,
} from '../src/transformGizmo.ts';

const viewport = { x: 0, y: 0, w: 800, h: 600 };
const camera = { eye: [3, 4, 7], target: [0, 0, 0], fovYDeg: 60 };

function drawingContext() {
  return new Proxy({}, {
    get(target, key) {
      return key in target ? target[key] : () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

test('plane drag solves projected axes together without double-counting oblique motion', () => {
  const origin = [0, 0, 0];
  const target = [2, -1, 0];
  const start = project(origin, camera, viewport);
  const end = project(target, camera, viewport);
  assert.ok(start && end);
  const delta = worldDeltaOnPlane(
    origin,
    [1, 0, 0],
    [0, 1, 0],
    { dx: end.x - start.x, dy: end.y - start.y },
    camera,
    viewport,
  );
  assert.ok(Math.abs(delta[0] - 2) < 1e-6);
  assert.ok(Math.abs(delta[1] + 1) < 1e-6);
  assert.ok(Math.abs(delta[2]) < 1e-6);
});

test('typed hit geometry picks rings, center, axes, and planes predictably', () => {
  const ellipse = {
    kind: 'axis', axis: 'z', shape: 'ellipse', center: { x: 100, y: 100 },
    radius: 50, u: { x: 1, y: 0 }, v: { x: 0, y: 0.5 },
  };
  const center = { kind: 'center', shape: 'circle', center: { x: 100, y: 100 }, radius: 8, band: 0 };
  const axis = { kind: 'axis', axis: 'x', shape: 'segment', start: { x: 110, y: 100 }, end: { x: 180, y: 100 } };
  const plane = {
    kind: 'plane', plane: 'xy', corners: [
      { x: 115, y: 115 }, { x: 135, y: 115 }, { x: 135, y: 135 }, { x: 115, y: 135 },
    ],
  };
  const hits = [plane, axis, center, ellipse];
  assert.deepEqual(hitTestTransformGizmo(hits, 100, 75), { kind: 'axis', axis: 'z' });
  assert.deepEqual(hitTestTransformGizmo(hits, 100, 100), { kind: 'center' });
  assert.deepEqual(hitTestTransformGizmo(hits, 160, 103), { kind: 'axis', axis: 'x' });
  assert.deepEqual(hitTestTransformGizmo(hits, 118, 118), { kind: 'plane', plane: 'xy' });
});

test('gizmo parts compare by stable semantic identity', () => {
  assert.equal(gizmoPartEquals({ kind: 'axis', axis: 'x' }, { kind: 'axis', axis: 'x' }), true);
  assert.equal(gizmoPartEquals({ kind: 'axis', axis: 'x' }, { kind: 'axis', axis: 'y' }), false);
  assert.equal(gizmoPartEquals({ kind: 'center' }, { kind: 'center' }), true);
});

test('Unity-style gizmos stay large enough to read and hit at any camera distance', () => {
  for (const sceneCamera of [camera, { ...camera, eye: [30, 40, 70] }]) {
    const translate = drawTransformGizmo(
      drawingContext(), sceneCamera, viewport, [0, 0, 0], null, 'translate', null, null,
    );
    const axes = translate.filter((hit) => hit.kind === 'axis' && hit.shape === 'segment');
    const planes = translate.filter((hit) => hit.kind === 'plane');
    assert.equal(axes.length, 3);
    assert.equal(planes.length, 3);
    for (const axis of axes) {
      assert.ok(Math.hypot(axis.end.x - axis.start.x, axis.end.y - axis.start.y) >= 84);
    }
    assert.equal(translate.find((hit) => hit.kind === 'center')?.radius, 10);
  }

  const rotate = drawTransformGizmo(
    drawingContext(), camera, viewport, [0, 0, 0], null, 'rotate', null, null,
  );
  const rings = rotate.filter((hit) => hit.kind === 'axis' && hit.shape === 'ellipse');
  assert.equal(rings.length, 3);
  assert.ok(rings.every((ring) => ring.radius === 72));
  assert.ok(rings.some((ring) => (
    Math.abs(Math.hypot(ring.u.x, ring.u.y) - Math.hypot(ring.v.x, ring.v.y)) > 0.05
  )), '3D rotation rings preserve projected foreshortening instead of becoming tangled circles');
  assert.equal(rotate.find((hit) => hit.kind === 'center')?.radius, 86);
});
