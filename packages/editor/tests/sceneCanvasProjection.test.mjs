// Author: MiYu. Verify GPU Canvas projection coordinates, texture revisions and fallback.
import assert from 'node:assert/strict';
import test from 'node:test';
import { projectSceneCanvasTexture } from '../src/ui/sceneCanvasProjection.ts';

const surface = { bounds: { x: 10, y: 20, w: 100, h: 50 }, pixels: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }], corners: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 50 }, { x: 20, y: 50 }], inverseW: [1, .5, .5, 1] };
function fixture() {
  const calls = [], listeners = {}, gl = { COMPILE_STATUS: 1, LINK_STATUS: 2, ARRAY_BUFFER: 3, STREAM_DRAW: 4, TRIANGLE_FAN: 5, FLOAT: 6, maxSize: 4096, getParameter() { return this.maxSize; }, lost: false, createShader() { return {}; }, getShaderParameter() { return true; }, createProgram() { return {}; }, createBuffer() { return {}; }, createTexture() { return {}; }, getProgramParameter() { return true; }, getAttribLocation(_, name) { return name === 'position' ? 0 : 1; }, isContextLost() { return this.lost; }, bufferData(_, value) { calls.push(['vertices', [...value]]); }, texImage2D(...args) { calls.push(['upload', args.at(-1)]); }, drawArrays(...args) { calls.push(['draw', ...args]); } };
  for (const name of ['shaderSource', 'compileShader', 'deleteShader', 'attachShader', 'linkProgram', 'bindTexture', 'texParameteri', 'viewport', 'clearColor', 'clear', 'useProgram', 'activeTexture', 'pixelStorei', 'bindBuffer', 'enableVertexAttribArray', 'vertexAttribPointer']) gl[name] = () => {};
  const gpuCanvas = { width: 0, height: 0, getContext(type) { assert.equal(type, 'webgl'); return gl; }, addEventListener(name, fn) { listeners[name] = fn; } };
  const canvas = { width: 200, height: 100, ownerDocument: { createElement() { return gpuCanvas; } } };
  const ctx = { canvas, transform: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, getTransform() { return this.transform; }, save() {}, restore() {}, setTransform(...args) { calls.push(['transform', ...args]); }, drawImage(image) { calls.push(['composite', image]); } };
  return { ctx, calls, gl, listeners, gpuCanvas };
}

test('GPU projection preserves DPR, homogeneous position and matching source UV with one draw', () => {
  const { ctx, calls, gpuCanvas } = fixture(), image = { width: 100, height: 50 };
  assert.equal(projectSceneCanvasTexture(ctx, surface, image, 1), true);
  assert.deepEqual(calls.find(c => c[0] === 'vertices')[1], [-1, 1, 1, 0, 0, 2, 2, 2, 1, 0, 1.2000000476837158, -2, 2, 1, 1, -.6000000238418579, -1, 1, 0, 1]);
  assert.equal(calls.filter(c => c[0] === 'draw').length, 1);
  assert.deepEqual(calls.find(c => c[0] === 'transform'), ['transform', 1, 0, 0, 1, 0, 0]);
  assert.equal(calls.find(c => c[0] === 'composite')[1], gpuCanvas);
});

test('texture upload revisions, viewport resize and context loss preserve fallback behavior', () => {
  const { ctx, calls, gl, listeners } = fixture(), image = { width: 100, height: 50 };
  projectSceneCanvasTexture(ctx, surface, image, 1); projectSceneCanvasTexture(ctx, surface, image, 1);
  assert.equal(calls.filter(c => c[0] === 'upload').length, 1);
  assert.equal(calls.filter(c => c[0] === 'draw').length, 1);
  projectSceneCanvasTexture(ctx, surface, image, 2);
  assert.equal(calls.filter(c => c[0] === 'upload').length, 2);
  ctx.canvas.width = 400; projectSceneCanvasTexture(ctx, surface, image, 2);
  assert.equal(calls.filter(c => c[0] === 'upload').length, 2);
  assert.equal(projectSceneCanvasTexture(ctx, surface, { width: 8192, height: 32 }, 3), false, 'GPU limits retain CPU fallback');
  gl.lost = true; assert.equal(projectSceneCanvasTexture(ctx, surface, image, 2), false);
  gl.lost = false; listeners.webglcontextrestored(); projectSceneCanvasTexture(ctx, surface, image, 2);
  assert.equal(calls.filter(c => c[0] === 'upload').length, 3);
  const noGpu = { canvas: { ownerDocument: { createElement() { return { getContext() { return null; } }; } } } };
  assert.equal(projectSceneCanvasTexture(noGpu, surface, image), false);
});

test('unchanged projected pixels reuse one GPU draw while composition remains current', () => {
  const { ctx, calls } = fixture(), image = { width: 100, height: 50 };
  for (let frame = 0; frame < 60; frame++) assert.equal(projectSceneCanvasTexture(ctx, structuredClone(surface), image, 1), true);
  for (const kind of ['draw', 'vertices', 'upload']) assert.equal(calls.filter(c => c[0] === kind).length, 1, kind);
  assert.equal(calls.filter(c => c[0] === 'composite').length, 60, 'cached projection still composites under the caller clip, alpha and selection drawing');
  assert.equal(calls.filter(c => c[0] === 'transform').length, 60);
});

test('camera projection, clipped geometry, UV bounds and destination transform each invalidate cached pixels', () => {
  const { ctx, calls } = fixture(), image = { width: 100, height: 50 }, count = () => calls.filter(c => c[0] === 'draw').length;
  let current = structuredClone(surface), draws = 0;
  const check = () => {
    assert.equal(projectSceneCanvasTexture(ctx, current, image, 1), true); assert.equal(count(), ++draws);
    assert.equal(projectSceneCanvasTexture(ctx, structuredClone(current), image, 1), true); assert.equal(count(), draws);
  };
  check(); current.corners[0].x++; check(); current.inverseW[1] *= .5; check(); current.pixels[0].x++; check(); current.bounds.x++; check(); current.bounds.w++; check();
  ctx.transform = { ...ctx.transform, e: 12, f: -3 }; check();
  ctx.transform = { a: 0, b: 2, c: -2, d: 0, e: 0, f: 0 }; check();
  current.corners.pop(); current.pixels.pop(); current.inverseW.pop(); check();
  current = { ...current, pixels: [], corners: [], inverseW: [] }; check();
  assert.equal(calls.filter(c => c[0] === 'upload').length, 1, 'projection changes retain unchanged texture content');
});

test('resize redraws even when normalized vertices match, and source size or revision invalidates content', () => {
  const { ctx, calls } = fixture(), image = { width: 100, height: 50 }, count = kind => calls.filter(c => c[0] === kind).length;
  projectSceneCanvasTexture(ctx, surface, image, 1); const vertices = calls.find(c => c[0] === 'vertices')[1];
  ctx.canvas.width *= 2; ctx.canvas.height *= 2; ctx.transform = { ...ctx.transform, a: 4, d: 4 };
  projectSceneCanvasTexture(ctx, surface, image, 1); assert.equal(count('draw'), 2); assert.equal(count('upload'), 1);
  assert.deepEqual(calls.filter(c => c[0] === 'vertices').at(-1)[1], vertices, 'resized drawing buffer was invalid even though projected inputs match');
  image.width++; projectSceneCanvasTexture(ctx, surface, image, 1); assert.equal(count('draw'), 3); assert.equal(count('upload'), 2);
  image.height++; projectSceneCanvasTexture(ctx, surface, image, 1); assert.equal(count('draw'), 4); assert.equal(count('upload'), 3);
  projectSceneCanvasTexture(ctx, surface, image, 2); assert.equal(count('draw'), 5); assert.equal(count('upload'), 4);
  projectSceneCanvasTexture(ctx, surface, { ...image }, 2); assert.equal(count('draw'), 6); assert.equal(count('upload'), 5);
});

test('unversioned content redraws and separate destinations never share a projected image', () => {
  const first = fixture(), second = fixture(), image = { width: 100, height: 50 };
  for (let i = 0; i < 3; i++) projectSceneCanvasTexture(first.ctx, surface, image);
  assert.equal(first.calls.filter(c => c[0] === 'draw').length, 3); assert.equal(first.calls.filter(c => c[0] === 'upload').length, 3);
  projectSceneCanvasTexture(first.ctx, surface, image, 1); projectSceneCanvasTexture(second.ctx, surface, image, 1);
  assert.equal(second.calls.filter(c => c[0] === 'draw').length, 1); assert.equal(second.calls.filter(c => c[0] === 'upload').length, 1);
  assert.equal(second.calls.find(c => c[0] === 'composite')[1], second.gpuCanvas);
});
