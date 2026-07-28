import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAgentSceneJson } from '../src/agent/sceneJsonValidation.ts';

const sceneJson = (world, name = 'Agent Scene') => JSON.stringify({
  version: 1,
  name,
  world,
});

const entity = (id, overrides = {}) => ({
  entity: id,
  name: `Entity ${id}`,
  parent: null,
  active: true,
  components: {
    Transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
  },
  ...overrides,
});

function assertInvalid(json, pattern) {
  assert.throws(
    () => validateAgentSceneJson(json),
    (error) => error?.code === 'INVALID_ARGS' && pattern.test(error.message),
  );
}

test('accepts a complete hierarchy and returns a bounded import summary', () => {
  const summary = validateAgentSceneJson(sceneJson({
    entities: [
      entity(20, {
        parent: 10,
        siblingIndex: 1,
        components: {
          Transform: {},
          MeshRenderer: { mesh: 'cube', material: 'default' },
        },
      }),
      entity(10, { siblingIndex: 0 }),
      entity(30, { parent: 10 }),
      entity(40, { siblingIndex: 3, components: {} }),
    ],
    selected: 20,
    selectedIds: [30, 20],
    clearColor: [0.1, 0.2, 0.3, 1],
  }));

  assert.deepEqual(summary, {
    version: 1,
    name: 'Agent Scene',
    entityCount: 4,
    rootCount: 2,
    componentCount: 4,
  });
});

test('rejects malformed roots, unsupported versions, and scalar components', () => {
  assertInvalid('{', /Scene JSON is invalid/);
  assertInvalid(JSON.stringify({ version: 2, world: { entities: [] } }), /version.*must be 1/);
  assertInvalid(JSON.stringify({ version: 1, world: [] }), /world.*must be an object/);
  assertInvalid(sceneJson({
    entities: [entity(1, { components: { Transform: 42 } })],
  }), /component "Transform".*must be an object/);
});

test('rejects duplicate ids, missing parents, and hierarchy cycles', () => {
  assertInvalid(sceneJson({
    entities: [entity(1), entity(1, { siblingIndex: 1 })],
  }), /Duplicate entity id 1/);
  assertInvalid(sceneJson({
    entities: [entity(1, { parent: 99 })],
  }), /missing parent 99/);
  assertInvalid(sceneJson({
    entities: [
      entity(1, { parent: 2 }),
      entity(2, { parent: 1 }),
    ],
  }), /hierarchy contains a cycle/);
});

test('rejects collisions between explicit and effective sibling slots', () => {
  assertInvalid(sceneJson({
    entities: [
      entity(1, { parent: 9 }),
      entity(9, { siblingIndex: 0 }),
      entity(2, { parent: 9, siblingIndex: 0 }),
    ],
  }), /duplicate effective siblingIndex 0/);
});

test('rejects stale selections and invalid authored colors', () => {
  assertInvalid(sceneJson({
    entities: [entity(1)],
    selectedIds: [1, 1],
  }), /duplicate entity 1/);
  assertInvalid(sceneJson({
    entities: [entity(1)],
    selected: 2,
  }), /selected references missing entity 2/);
  assertInvalid(sceneJson({
    entities: [entity(1)],
    clearColor: [0, 0, 2, 1],
  }), /values must be at most 1/);
});
