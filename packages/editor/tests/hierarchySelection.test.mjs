import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedHierarchyRoots } from '../src/hierarchySelection.ts';

const entities = [
  { entity: 0, parent: null },
  { entity: 1, parent: 0 },
  { entity: 2, parent: 1 },
  { entity: 3, parent: null },
];

test('entity id zero remains a valid selected parent', () => {
  assert.deepEqual(selectedHierarchyRoots(entities, [0, 1]), [0]);
});

test('selected descendants are excluded through unselected intermediate nodes', () => {
  assert.deepEqual(selectedHierarchyRoots(entities, [0, 2, 3]), [0, 3]);
});

test('selection order is preserved and stale ids are ignored', () => {
  assert.deepEqual(selectedHierarchyRoots(entities, [3, 99, 1]), [3, 1]);
});

test('cycles cannot make root planning loop forever', () => {
  const cyclic = [
    { entity: 4, parent: 5 },
    { entity: 5, parent: 4 },
  ];
  assert.deepEqual(selectedHierarchyRoots(cyclic, [4]), [4]);
  assert.deepEqual(selectedHierarchyRoots(cyclic, [4, 5]), []);
});
