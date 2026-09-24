// Author: MiYu
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { advanceSnap, accumulatedScaleFactor, EMPTY_SNAP_ACCUMULATOR } from '../src/sceneSnap.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('uniform scaling preserves multi-selection proportions, mirrors, and positions when dragging back', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const create = (name, scale, position) => store.createGameObject(name, { Transform: { position, scale, rotation: [0, 0, 0, 1] } });
    const a = create('Large', [1, 1, 1], [2, 0, 0]);
    const b = create('Small mirror', [-0.05, 0.001, 0], [-3, 2, 0]);
    store.selectMany([a, b], 'replace', a);
    const original = [a, b].map(id => structuredClone(store.getTransform(id)));
    store.beginTransformGesture();
    let state = EMPTY_SNAP_ACCUMULATOR;
    for (const delta of [0.1, 0.1, -2, 1.8]) {
      const next = advanceSnap(state, delta, 0.1, true).state;
      store.scaleSelectedTransformsUniform(a, [0, 0, 0], accumulatedScaleFactor(state.applied, next.applied));
      const factor = Math.max(0.01, 1 + next.applied);
      for (const [index, id] of [a, b].entries()) {
        for (const field of ['scale', 'position']) {
          store.getTransform(id)[field].forEach((value, axis) => assert.ok(Math.abs(value - original[index][field][axis] * factor) < 1e-8, `${id}.${field}[${axis}]: ${value} != ${original[index][field][axis] * factor}`));
        }
      }
      state = next;
    }
    store.endTransformGesture();
    for (const [index, id] of [a, b].entries()) {
      store.getTransform(id).scale.forEach((value, axis) => assert.ok(Math.abs(value - original[index].scale[axis]) < 1e-8));
    }
  } finally {
    await server.close();
  }
});
