import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWorldTransforms,
  parentWorldTransform,
  resolvedTransform,
  worldDeltaToLocal,
  worldAxisScaleDeltaToLocal,
  worldPointToLocal,
  worldTransformToLocal,
} from '../src/worldTransform.ts';

const transform = (position, rotation = [0, 0, 0, 1], scale = [1, 1, 1]) => ({
  position,
  rotation,
  scale,
});

test('editor hierarchy resolves the same nested TRS contract as runtime', () => {
  const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const entities = [
    { entity: 1, components: { Transform: transform([10, 0, 0], quarterTurn, [2, 3, 1]) } },
    { entity: 2, parent: 1, components: { Transform: transform([1, 0, 0], undefined, [0.5, 0.5, 0.5]) } },
  ];
  const nodes = buildWorldTransforms(entities);
  const child = resolvedTransform(nodes, 2);
  assert.ok(Math.abs(child.position[0] - 10) < 1e-6);
  assert.ok(Math.abs(child.position[1] - 2) < 1e-6);
  assert.deepEqual(child.scale, [1, 1.5, 0.5]);
  const parent = parentWorldTransform(entities, nodes, 2);
  const local = worldPointToLocal(parent, child.position);
  assert.ok(Math.abs(local[0] - 1) < 1e-6);
  assert.ok(Math.abs(local[1]) < 1e-6);
});

test('world deltas convert through parent rotation and non-uniform scale', () => {
  const parent = transform([5, 6, 7], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [2, 4, 1]);
  const local = worldDeltaToLocal(parent, [0, 2, 0]);
  assert.ok(Math.abs(local[0] - 1) < 1e-6);
  assert.ok(Math.abs(local[1]) < 1e-6);
  assert.equal(worldAxisScaleDeltaToLocal(parent, 0, 2), 1);
  assert.equal(worldAxisScaleDeltaToLocal(parent, 1, 2), 0.5);
});

test('world Transform converts back to a reparented local Transform', () => {
  const parent = transform([10, 0, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [2, 3, 1]);
  const world = transform([10, 2, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [1, 1.5, 0.5]);
  const local = worldTransformToLocal(parent, world);
  assert.ok(Math.abs(local.position[0] - 1) < 1e-6);
  assert.ok(Math.abs(local.position[1]) < 1e-6);
  assert.deepEqual(local.scale, [0.5, 0.5, 0.5]);
  assert.ok(Math.abs(local.rotation[3] - 1) < 1e-6);
});

test('inactive and cyclic hierarchy branches resolve inactive', () => {
  const entities = [
    { entity: 1, parent: 2, components: { Transform: transform([0, 0, 0]) } },
    { entity: 2, parent: 1, components: { Transform: transform([0, 0, 0]) } },
    { entity: 3, active: false, components: { Transform: transform([0, 0, 0]) } },
    { entity: 4, parent: 3, components: { Transform: transform([0, 0, 0]) } },
  ];
  const nodes = buildWorldTransforms(entities);
  assert.equal(nodes.get(1).active, false);
  assert.equal(nodes.get(2).active, false);
  assert.equal(nodes.get(4).active, false);
});
