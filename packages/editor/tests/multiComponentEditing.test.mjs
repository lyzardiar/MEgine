import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectMultiComponentFields,
  inspectorValuesEqual,
  planMultiComponentEdit,
} from '../src/multiComponentEditing.ts';

const entities = [
  {
    entity: 1,
    components: {
      PointLight: {
        color: [1, 0.2, 0.3, 1],
        intensity: 8,
        nested: { x: 1, y: 2 },
        __refs: { hidden: true },
      },
    },
  },
  {
    entity: 2,
    components: {
      PointLight: {
        color: [0.5, 0.7, 0.3, 1],
        intensity: 4,
        nested: { y: 2, x: 9 },
        __refs: { hidden: false },
      },
    },
  },
];

test('multi-component field inspection reports structural mixed values and vector axes', () => {
  assert.equal(inspectorValuesEqual({ x: 1, y: [2, 3] }, { y: [2, 3], x: 1 }), true);
  const state = inspectMultiComponentFields(entities, 'PointLight');
  assert.deepEqual(state.fields, ['color', 'intensity', 'nested']);
  assert.deepEqual([...state.mixedFields], ['color', 'intensity', 'nested']);
  assert.deepEqual(state.mixedArrayIndices.color, [true, true, false, false]);
});

test('multi-component edits preserve every untouched scalar, vector axis, and nested field', () => {
  const before = entities[0].components.PointLight;
  const after = {
    ...before,
    color: [1, 0.9, 0.3, 1],
    intensity: 5,
    nested: { x: 3, y: 2 },
  };
  assert.deepEqual(planMultiComponentEdit(entities, 'PointLight', before, after), [
    {
      entity: 1,
      patch: {
        color: [1, 0.9, 0.3, 1],
        intensity: 5,
        nested: { x: 3, y: 2 },
      },
    },
    {
      entity: 2,
      patch: {
        color: [0.5, 0.9, 0.3, 1],
        intensity: 5,
        nested: { y: 2, x: 3 },
      },
    },
  ]);
  assert.deepEqual(planMultiComponentEdit(entities, 'PointLight', before, before), []);
});

test('an explicit mixed-field edit applies even when it chooses the primary value', () => {
  const mixedEntities = [
    {
      entity: 1,
      components: {
        BoxCollider3D: { size: [1, 2, 3], is_trigger: false },
      },
    },
    {
      entity: 2,
      components: {
        BoxCollider3D: { size: [4, 5, 6], is_trigger: true },
      },
    },
  ];
  const primary = mixedEntities[1].components.BoxCollider3D;

  assert.deepEqual(
    planMultiComponentEdit(
      mixedEntities,
      'BoxCollider3D',
      primary,
      primary,
      ['is_trigger'],
    ),
    [
      { entity: 1, patch: { is_trigger: true } },
      { entity: 2, patch: { is_trigger: true } },
    ],
  );
  assert.deepEqual(
    planMultiComponentEdit(
      mixedEntities,
      'BoxCollider3D',
      primary,
      primary,
      ['size', 1],
    ),
    [
      { entity: 1, patch: { size: [1, 5, 3] } },
      { entity: 2, patch: { size: [4, 5, 6] } },
    ],
  );
});
