// Author: MiYu. Native Scene mesh selection regions must match the browser preview without drawing pixels.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawSolidCube, drawTriangleMesh, projectTriangleMeshHit } from '../src/math3d.ts';

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

const noRaster = new Proxy({}, { get() { throw Error('Mesh picking must not rasterize'); }, set() { throw Error('Mesh picking must not rasterize'); } });
const oracle = (cam, vp, center, scale, vertices, triangles, rotation, selected = false) => drawTriangleMesh(context(), cam, vp, center, scale, vertices, triangles, selected, rotation);

test('direct mesh picking exactly matches rasterized selection across clipping, projection and deterministic geometry', () => {
  let seed = 71233;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let frame = 0; frame < 480; frame++) {
    const vp = { x: -31, y: 17, w: frame % 11 ? 1280 : 0, h: frame % 13 ? 720 : 0 };
    const cam = { ...camera, projection: frame % 2 ? 'perspective' : 'orthographic', orthographicSize: 3, near: frame % 3 ? .08 : 2, far: frame % 5 ? 100 : 5, up: frame % 7 ? undefined : [1, 0, 0] };
    const vertices = Array.from({ length: 30 }, () => [random() * 16 - 8, random() * 12 - 6, random() * 12 - 6]);
    vertices[frame % 30] = frame % 17 ? vertices[frame % 30] : [NaN, 0, 0];
    const triangles = Array.from({ length: 102 }, () => Math.floor(random() * 35) - 2);
    const center = [random() * 8 - 4, random() * 6 - 3, random() * 12 - 4], scale = [random() * 4 - 2, random() * 4 - 2, random() * 4 - 2];
    const rotation = frame % 4 ? [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1, random() * 2 - 1] : undefined;
    const expected = oracle(cam, vp, center, scale, vertices, triangles, rotation, !!(frame % 2));
    assert.deepEqual(projectTriangleMeshHit(cam, vp, center, scale, vertices, triangles, rotation), expected);
    assert.deepEqual(drawTriangleMesh(noRaster, cam, vp, center, scale, vertices, triangles, true, rotation, undefined, true), expected);
  }
});

test('direct selection retains triangle cap, sparse vertices and near/far boundary behavior', () => {
  const vertices = [[-1, -1, 0], [1, -1, 0], [0, 1, 0], [10000, 10000, 0]], capped = [...Array.from({ length: 10000 }, () => [0, 1, 2]).flat(), 0, 1, 3];
  const actual = projectTriangleMeshHit(camera, viewport, [0, 0, 0], [1, 1, 1], vertices, capped);
  assert.deepEqual(actual, oracle(camera, viewport, [0, 0, 0], [1, 1, 1], vertices, capped));
  assert.deepEqual(actual, projectTriangleMeshHit(camera, viewport, [0, 0, 0], [1, 1, 1], vertices, [0, 1, 2]));
  const sparse = vertices.slice(); delete sparse[1];
  for (const triangles of [[], [0, 1, 2], [0, 2, 3, 0, 1, 2], [-1, .5, 2], [0, 2, 3, 0, 2]]) assert.deepEqual(projectTriangleMeshHit(camera, viewport, [0, 0, 0], [1, 1, 1], sparse, triangles), oracle(camera, viewport, [0, 0, 0], [1, 1, 1], sparse, triangles));
  const cam = { eye: [0, 0, 8], target: [0, 0, 0], fovYDeg: 60, near: 1, far: 5 };
  for (const z of [7, 7.00001, 6.99999, 3, 2.99999, 3.00001]) {
    const center = [0, 0, z];
    assert.deepEqual(projectTriangleMeshHit(cam, viewport, center, [1, 1, 1], vertices, [0, 1, 2], [0, 0, 0, 0]), oracle(cam, viewport, center, [1, 1, 1], vertices, [0, 1, 2], [0, 0, 0, 0]));
  }
});
