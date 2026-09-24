import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SCENE_SNAP,
  EMPTY_SNAP_ACCUMULATOR,
  advanceSnap,
  accumulatedScaleFactor,
  normalizeSceneSnapSettings,
} from '../src/sceneSnap.ts';

test('small pointer deltas accumulate instead of being discarded', () => {
  let state = EMPTY_SNAP_ACCUMULATOR;
  const applied = [];
  for (const delta of [2, 2, 2, 2, 2, 2]) {
    const next = advanceSnap(state, delta, 10, true);
    state = next.state;
    applied.push(next.delta);
  }
  assert.deepEqual(applied, [0, 0, 10, 0, 0, 0]);
  assert.equal(state.raw, 12);
  assert.equal(state.applied, 10);
});

test('snapped output can move back across an increment boundary', () => {
  let state = advanceSnap(EMPTY_SNAP_ACCUMULATOR, 16, 10, true).state;
  const next = advanceSnap(state, -12, 10, true);
  state = next.state;
  assert.equal(next.delta, -20);
  assert.equal(state.applied, 0);
});

test('settings reject invalid increments', () => {
  assert.deepEqual(
    normalizeSceneSnapSettings({ enabled: true, move: 0, rotate: -1, scale: 'bad' }),
    { ...DEFAULT_SCENE_SNAP, enabled: true },
  );
});

test('uniform scale snapping is independent of pointer event count and reversible', () => {
  for (const enabled of [true, false]) {
    let state = EMPTY_SNAP_ACCUMULATOR;
    let scale = 1;
    for (const delta of [0.1, 0.1, -0.1, -0.1]) {
      const next = advanceSnap(state, delta, 0.1, enabled).state;
      scale *= accumulatedScaleFactor(state.applied, next.applied);
      assert.ok(Math.abs(scale - (1 + next.applied)) < 1e-10);
      state = next;
    }
    assert.ok(Math.abs(scale - 1) < 1e-10);
  }
  assert.equal(accumulatedScaleFactor(0, -2), 0.01);
  assert.equal(accumulatedScaleFactor(-2, -3), 1);
  assert.equal(accumulatedScaleFactor(-3, 0), 100);
});
