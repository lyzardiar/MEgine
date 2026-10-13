import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rotateTransformAround,
  scaleTransformAlong,
  scaleTransformUniform,
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

test('Pivot handle resolves child Transform into parent world space', () => {
  const entities = [
    transform(1, [10, 0, 0]),
    transform(2, [2, 3, 4], 1),
  ];
  assert.deepEqual(transformHandleOrigin(entities, [2], 2, 'pivot'), [12, 3, 4]);
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

test('uniform scaling changes all axes and positions around the shared pivot', () => {
  const source = transform(1, [3, 4, 2]).components.Transform;
  const result = scaleTransformUniform(source, [1, 1, 0], 2);
  assert.deepEqual(result.position, [5, 7, 4]);
  assert.deepEqual(result.scale, [2, 2, 2]);
});

test('handle fallback resolves selected roots and ancestors without unrelated transforms', () => {
  const unrelated = { entity: 99, components: { get Transform() { throw Error('unrelated geometry must not be resolved'); } } };
  const entities = [transform(1, [10, 0, 0]), transform(2, [2, 3, 4], 1), transform(3, [-10, 0, 0]), unrelated];
  assert.deepEqual(transformHandleOrigin(entities, [2], 2, 'pivot'), [12, 3, 4]);
  assert.deepEqual(transformHandleOrigin(entities, [1, 2, 3], 2, 'center'), [0, 0, 0]);
});

test('supplied frame transforms preserve parent rotation and scale without recalculation', async () => {
  const { buildWorldTransforms } = await import('../src/worldTransform.ts');
  let parentReads = 0;
  const parentTransform = { position: [10, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale: [-2, 3, 1] };
  const parent = { entity: 1, components: { get Transform() { parentReads++; return parentTransform; } } }, child = transform(2, [2, 3, 4], 1);
  const entities = [parent, child], world = buildWorldTransforms(entities), before = parentReads;
  for (let index = 0; index < 20; index++) {
    const result = transformHandleOrigin(entities, [2], 2, 'pivot', world);
    assert.ok(Math.abs(result[0] - 1) < 1e-8); assert.ok(Math.abs(result[1] + 4) < 1e-8); assert.equal(result[2], 4);
  }
  assert.equal(parentReads, before, 'drawing a handle uses the supplied frame transforms');
  const edited = [transform(1, [20, 0, 0]), child];
  assert.deepEqual(transformHandleOrigin(edited, [2], 2, 'pivot'), [22, 3, 4], 'live gestures resolve current edits');
  assert.deepEqual(transformHandleOrigin(entities, [1, 2], 2, 'center', world), [10, 0, 0]);
});
