import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectTrailSegments2D,
  createTrailState2D,
  stepTrail2D,
} from '../src/trails/trailSystem.ts';

const trail = {
  enabled: true,
  emitting: true,
  time: 0.5,
  min_vertex_distance: 0.1,
  max_points: 3,
  width_start: 0.2,
  width_end: 0,
  color_start: [1, 1, 1, 1],
  color_end: [1, 0, 0, 0],
};

test('2D trails only sample meaningful movement and stay bounded', () => {
  const state = createTrailState2D();
  stepTrail2D(state, trail, 0.1, [0, 0, 0]);
  stepTrail2D(state, trail, 0.1, [0.05, 0, 0]);
  assert.equal(state.points.length, 1);
  for (let index = 1; index <= 4; index += 1) {
    stepTrail2D(state, trail, 0.1, [index * 0.2, 0, 0]);
  }
  assert.equal(state.points.length, 3);
  assert.equal(collectTrailSegments2D(state, trail).length, 2);
});

test('2D trail width and color fade with age, then expire', () => {
  const state = createTrailState2D();
  stepTrail2D(state, trail, 0, [0, 0, 0]);
  stepTrail2D(state, trail, 0.25, [0.2, 0, 0]);
  const [segment] = collectTrailSegments2D(state, trail);
  assert.ok(segment.width < trail.width_start);
  assert.ok(segment.color[3] < trail.color_start[3]);
  stepTrail2D(state, { ...trail, emitting: false }, 0.5, [1, 0, 0]);
  assert.deepEqual(collectTrailSegments2D(state, trail), []);
});

test('disabling a 2D trail immediately clears its state', () => {
  const state = createTrailState2D();
  stepTrail2D(state, trail, 0, [0, 0, 0]);
  stepTrail2D(state, trail, 0, [0.2, 0, 0]);
  stepTrail2D(state, { ...trail, enabled: false }, 0.1, [0.4, 0, 0]);
  assert.deepEqual(state, { points: [], head: null });
});
