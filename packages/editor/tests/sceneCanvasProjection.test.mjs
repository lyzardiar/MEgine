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
  const ctx = { canvas, getTransform() { return { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }; }, save() {}, restore() {}, setTransform(...args) { calls.push(['transform', ...args]); }, drawImage(image) { calls.push(['composite', image]); } };
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
