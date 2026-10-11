// Author: MiYu. Native Scene mesh selection regions must match the browser preview without drawing pixels.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawSolidCube, drawTriangleMesh } from '../src/math3d.ts';

const viewport = { x: 0, y: 0, w: 800, h: 600 };
const camera = { eye: [0, 2, 8], target: [0, 0, 0], fovYDeg: 60 };
const positions = [[-1, -1, 0], [1, -1, 0], [0, 1, 0], [0, 0, 1]];
const indices = [0, 1, 2, 0, 2, 3, 9, 10, 11];
const context = () => { let calls = 0; return { get calls() { return calls; }, beginPath() { calls++; }, moveTo() { calls++; }, lineTo() { calls++; }, closePath() { calls++; }, fill() { calls++; }, stroke() { calls++; }, fillRect() { calls++; } }; };

test('native mesh hit regions retain translated, mirrored, rotated and near-plane selection without Canvas drawing', () => {
  for (const center of [[0, 0, 0], [2, -1, 2], [0, 2, 7.99], [0, 2, 10]]) for (const scale of [[1, 2, 1], [-2, 1, 0.5]]) for (const rotation of [undefined, [0, Math.sin(0.4), 0, Math.cos(0.4)]]) {
    const drawn = context(), selection = context();
    assert.deepEqual(drawTriangleMesh(selection, camera, viewport, center, scale, positions, indices, false, rotation, undefined, true), drawTriangleMesh(drawn, camera, viewport, center, scale, positions, indices, false, rotation));
    assert.equal(selection.calls, 0);
    const cubeDrawn = context(), cubeSelection = context();
    assert.deepEqual(drawSolidCube(cubeSelection, camera, viewport, center, scale, false, rotation, undefined, true), drawSolidCube(cubeDrawn, camera, viewport, center, scale, false, rotation));
    assert.equal(cubeSelection.calls, 0);
  }
});
