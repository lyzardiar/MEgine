import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rotateTransformAround,
  scaleTransformAlong,
  selectedTransformRoots,
  transformHandleOrigin,
} from '../src/transformSelection.ts';

const transform = (entity, position, parent = null) => ({
  entity,
  parent,
  components: {
    Transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  },
});

test('Center handle uses the bounds center of selected Transform roots', () => {
  const entities = [
    transform(1, [-4, 2, 6]),
    transform(2, [8, 10, -2]),
    transform(3, [100, 100, 100], 2),
  ];
  assert.deepEqual(selectedTransformRoots(entities, [1, 2, 3], 2), [1, 2]);
  assert.deepEqual(transformHandleOrigin(entities, [1, 2, 3], 2, 'center'), [2, 6, 2]);
});

test('Pivot handle follows the active object and ignores invalid selection entries', () => {
  const entities = [
    transform(1, [1, 2, 3]),
    { entity: 2, parent: null, components: { RectTransform: {} } },
  ];
  assert.deepEqual(transformHandleOrigin(entities, [1, 2], 1, 'pivot'), [1, 2, 3]);
  assert.deepEqual(transformHandleOrigin(entities, [2], 2, 'center'), null);
});

test('group rotation moves the position around the shared pivot and rotates the object', () => {
  const source = transform(1, [2, 0, 0]).components.Transform;
  const result = rotateTransformAround(source, [1, 0, 0], [0, 0, 1], 90);
  assert.ok(Math.abs(result.position[0] - 1) < 1e-8);
  assert.ok(Math.abs(result.position[1] - 1) < 1e-8);
  assert.ok(Math.abs(result.rotation[2] - Math.SQRT1_2) < 1e-8);
});

test('axis scaling keeps the shared pivot fixed and scales the selected axis', () => {
  const source = transform(1, [3, 4, 0]).components.Transform;
  const result = scaleTransformAlong(source, [1, 1, 0], 0, [1, 0, 0], 2);
  assert.deepEqual(result.position, [5, 4, 0]);
  assert.deepEqual(result.scale, [2, 1, 1]);
});
