import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptiveSceneGridSpacing,
  buildSceneGrid,
  buildSceneGridAxis,
} from '../src/sceneGrid.ts';

test('keeps visible grid lines on the configured snap lattice', () => {
  assert.deepEqual(adaptiveSceneGridSpacing(10, 1), {
    logicalSpacing: 10,
    screenSpacing: 10,
    skippedSteps: 1,
  });
  assert.deepEqual(adaptiveSceneGridSpacing(10, 0.1), {
    logicalSpacing: 80,
    screenSpacing: 8,
    skippedSteps: 8,
  });
});

test('builds bounded major and minor grid lines from the canvas origin', () => {
  assert.deepEqual(buildSceneGridAxis(3, 45, 10), [
    { position: 3, major: true },
    { position: 13, major: false },
    { position: 23, major: false },
    { position: 33, major: false },
    { position: 43, major: false },
  ]);
  assert.equal(buildSceneGridAxis(0, 100_000, 1, 5, 12).length, 12);
});

test('creates both axes using scene-scaled snap spacing', () => {
  const grid = buildSceneGrid({ x: 20, y: 30, w: 35, h: 25 }, 10, 1);
  assert.equal(grid.spacing, 10);
  assert.deepEqual(grid.vertical.map((line) => line.position), [20, 30, 40, 50]);
  assert.deepEqual(grid.horizontal.map((line) => line.position), [30, 40, 50]);
});

test('invalid settings fall back without producing an unbounded loop', () => {
  assert.equal(adaptiveSceneGridSpacing(Number.NaN, 0).screenSpacing, 10);
  assert.deepEqual(buildSceneGridAxis(0, -1, 10), []);
});
