// Author: MiYu. Cached native Scene picking must match exact projected geometry and follow frame, viewport and preview changes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSceneMeshHitCache } from '../src/nativeSceneMeshHit.ts';
import { drawSolidCube, drawTriangleMesh } from '../src/math3d.ts';

const context = new Proxy({}, { get() { throw Error('Picking must not rasterize'); }, set() { throw Error('Picking must not rasterize'); } });
const view = () => ({ x: 17, y: 23, w: 1024, h: 768 });
const mesh = { positions: [[-2, -1, 0], [2, -1, 0], [0, 3, 0], [1, 1, 1]], indices: [0, 1, 2, 1, 2, 3] };
const camera = () => ({ eye: [4, 7, 11], target: [0, 0, 0], fovYDeg: 53, near: .25, far: 40 });
const project = (cam, vp, preview = mesh, selected = false) => drawTriangleMesh(context, cam, vp, [1, 2, 0], [-2, 3, .5], preview.positions, preview.indices, selected, [0, Math.sin(.3), 0, Math.cos(.3)], undefined, true);

test('repeated paints retain exact perspective and orthographic hit regions without projecting again', () => {
  for (const projection of ['perspective', 'orthographic']) {
    const cache = createNativeSceneMeshHitCache(), frame = {}, vp = view(), cam = { ...camera(), projection, orthographicSize: 8 };
    let projections = 0; const compute = () => { projections++; return project(cam, vp); };
    cache.beginFrame(frame, vp); const first = cache.read(4294967297, mesh, compute);
    assert.ok(first); assert.deepEqual(first, project(cam, vp, mesh, true));
    for (let i = 0; i < 100; i++) { cache.beginFrame(frame, { ...vp }); assert.equal(cache.read(4294967297, mesh, compute), first); }
    assert.equal(projections, 1);
    const lowIdHit = drawSolidCube(context, cam, vp, [-4, 0, 0], [.5, .5, .5], false, undefined, undefined, true);
    assert.notDeepEqual(cache.read(1, mesh, () => lowIdHit), first, 'high-generation entity IDs remain distinct');
    assert.equal(cache.read(1, mesh, () => null), lowIdHit);
  }
});

test('new native camera frames and viewport resizes refresh picking while returning frames retain correct geometry', () => {
  const cache = createNativeSceneMeshHitCache(), firstFrame = {}, nextFrame = {}, vp = view(), firstCam = camera(), nextCam = { ...camera(), eye: [-7, 2, 6] };
  cache.beginFrame(firstFrame, vp); const first = cache.read(7, mesh, () => project(firstCam, vp));
  cache.beginFrame(nextFrame, vp); const moved = cache.read(7, mesh, () => project(nextCam, vp));
  assert.notDeepEqual(moved, first); assert.deepEqual(moved, project(nextCam, vp));
  vp.w = 600; vp.x = -50; cache.beginFrame(nextFrame, vp);
  assert.deepEqual(cache.read(7, mesh, () => project(nextCam, vp)), project(nextCam, vp));
  cache.beginFrame(firstFrame, view()); assert.deepEqual(cache.read(7, mesh, () => project(firstCam, view())), first);
});

test('asynchronous preview loading and invalidation replace cube fallback and stale model hit regions', () => {
  const cache = createNativeSceneMeshHitCache(), frame = {}, vp = view(), cam = camera();
  cache.beginFrame(frame, vp);
  const cube = () => drawSolidCube(context, cam, vp, [1, 2, 0], [.5, .5, .5], false, undefined, undefined, true);
  const fallback = cache.read(4, null, cube), loaded = cache.read(4, mesh, () => project(cam, vp));
  assert.notDeepEqual(loaded, fallback); assert.deepEqual(loaded, project(cam, vp));
  const replacement = { ...mesh, positions: mesh.positions.map(p => p.map(value => value * .2)) };
  const changed = cache.read(4, replacement, () => project(cam, vp, replacement));
  assert.notDeepEqual(changed, loaded); assert.deepEqual(changed, project(cam, vp, replacement));
  assert.deepEqual(cache.read(4, null, cube), fallback);
});

test('clipped null regions refresh on a new frame and browser fallback always observes mutable camera edits', () => {
  const cache = createNativeSceneMeshHitCache(), vp = view(), hidden = { ...camera(), eye: [0, 0, -10], target: [0, 0, -20] };
  cache.beginFrame({}, vp); let reads = 0;
  const clipped = () => { reads++; return project(hidden, vp); };
  assert.equal(cache.read(9, mesh, clipped), null); assert.equal(cache.read(9, mesh, clipped), null); assert.equal(reads, 1);
  cache.beginFrame({}, vp); assert.ok(cache.read(9, mesh, () => project(camera(), vp)));
  cache.beginFrame(null, vp); const cam = camera(), first = cache.read(9, mesh, () => project(cam, vp));
  cam.eye[0] = -12; assert.notDeepEqual(cache.read(9, mesh, () => project(cam, vp)), first);
});
