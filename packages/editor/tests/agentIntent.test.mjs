import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandIntent,
  INTENT_DEFINITIONS,
  INTENT_SCHEMA,
  validateIntent,
} from '../../agent/src/index.ts';

test('intent catalog is self-describing and only advertises supported semantics', () => {
  assert.deepEqual(
    INTENT_DEFINITIONS.map((definition) => definition.kind),
    ['SpawnMesh', 'SetTransform', 'SetClearColor'],
  );
  assert.equal(INTENT_SCHEMA.oneOf.length, INTENT_DEFINITIONS.length);
  assert.equal(validateIntent({
    kind: 'SpawnEnemy',
    archetype: 'fake-placeholder',
    at: [0, 0, 0],
  }).ok, false);
});

test('intent validation rejects malformed, non-finite, extra, and out-of-range values', () => {
  for (const value of [
    null,
    { kind: 'SpawnMesh', mesh: '', at: [0, 0, 0] },
    { kind: 'SpawnMesh', mesh: 'cube', at: [0, Number.NaN, 0] },
    { kind: 'SpawnMesh', mesh: 'cube', at: [0, 0, 0], surprise: true },
    { kind: 'SetTransform', entity: 1 },
    { kind: 'SetTransform', entity: 1.5, position: [0, 0, 0] },
    { kind: 'SetClearColor', color: [1, 0, 2, 1] },
  ]) {
    assert.equal(validateIntent(value).ok, false, JSON.stringify(value));
    assert.throws(() => expandIntent(value), /Invalid intent/);
  }
});

test('partial SetTransform expansion preserves omitted fields through explicit context', () => {
  const intent = {
    kind: 'SetTransform',
    entity: 7,
    position: [4, 5, 6],
  };
  assert.throws(
    () => expandIntent(intent),
    /requires current transform context/,
  );
  assert.deepEqual(
    expandIntent(intent, {
      getTransform: (entity) => entity === 7
        ? {
            position: [1, 2, 3],
            rotation: [0, 0.5, 0, 0.5],
            scale: [2, 3, 4],
          }
        : null,
    }),
    [{
      op: 'setComponent',
      entity: 7,
      component: 'Transform',
      value: {
        position: [4, 5, 6],
        rotation: [0, 0.5, 0, 0.5],
        scale: [2, 3, 4],
      },
    }],
  );
});

test('spawn and clear-color intents expand to deterministic WorldCommands', () => {
  assert.deepEqual(
    expandIntent({
      kind: 'SpawnMesh',
      mesh: 'sphere',
      material: 'glass',
      at: [1, 2, 3],
      name: 'Orb',
    }),
    [{
      op: 'spawn',
      name: 'Orb',
      components: {
        Transform: {
          position: [1, 2, 3],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        MeshRenderer: { mesh: 'sphere', material: 'glass' },
      },
    }],
  );
  assert.deepEqual(
    expandIntent({ kind: 'SetClearColor', color: [0.1, 0.2, 0.3, 1] }),
    [{ op: 'setClearColor', r: 0.1, g: 0.2, b: 0.3, a: 1 }],
  );
});
