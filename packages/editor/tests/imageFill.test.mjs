import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const { planFilledImage } = await server.ssrLoadModule('/src/ui/imageFill.ts');
test.after(() => server.close());

const rounded = (value) => JSON.parse(JSON.stringify(value, (_key, item) =>
  typeof item === 'number' ? Number(item.toFixed(6)) : item));

test('Filled Image linear methods crop geometry from their Unity origins', () => {
  assert.deepEqual(planFilledImage('Horizontal', 0.25, true, 0), [
    [[0, 1], [0, 0], [0.25, 0], [0.25, 1]],
  ]);
  assert.deepEqual(planFilledImage('Horizontal', 0.25, true, 1), [
    [[0.75, 1], [0.75, 0], [1, 0], [1, 1]],
  ]);
  assert.deepEqual(planFilledImage('Vertical', 0.25, true, 0), [
    [[0, 1], [0, 0.75], [1, 0.75], [1, 1]],
  ]);
  assert.deepEqual(planFilledImage('Vertical', 0.25, true, 1), [
    [[0, 0.25], [0, 0], [1, 0], [1, 0.25]],
  ]);
});

test('Radial90 uses the same clockwise and counter-clockwise half quads as uGUI', () => {
  assert.deepEqual(rounded(planFilledImage('Radial90', 0.5, true, 0)), [
    [[0, 1], [0, 0], [1, 0], [1, 0]],
  ]);
  assert.deepEqual(rounded(planFilledImage('Radial90', 0.5, false, 0)), [
    [[0, 1], [1, 0], [1, 0], [1, 1]],
  ]);
});

test('Radial180 and Radial360 phase their quadrants from method-specific origins', () => {
  assert.deepEqual(planFilledImage('Radial180', 0.5, true, 0), [
    [[0, 1], [0, 0], [0.5, 0], [0.5, 1]],
  ]);
  assert.deepEqual(planFilledImage('Radial360', 0.25, true, 0), [
    [[0, 1], [0, 0.5], [0.5, 0.5], [0.5, 1]],
  ]);
  assert.deepEqual(planFilledImage('Radial360', 0.25, true, 1), [
    [[0.5, 1], [0.5, 0.5], [1, 0.5], [1, 1]],
  ]);
});

test('Filled Image clamps amount and sanitizes invalid origins', () => {
  assert.deepEqual(planFilledImage('Radial360', 0), []);
  assert.equal(planFilledImage('Radial360', 5, true, 99).length, 1);
  assert.deepEqual(
    planFilledImage('Horizontal', 0.25, true, 99),
    planFilledImage('Horizontal', 0.25, true, 0),
  );
});
