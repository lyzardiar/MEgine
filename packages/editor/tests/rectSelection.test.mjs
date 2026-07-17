import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedRectRoots } from '../src/rectSelection.ts';

const rect = (entity, parent = null) => ({
  entity,
  parent,
  components: { RectTransform: {} },
});

test('parent and child selection moves only the selected rect root', () => {
  const entities = [rect(1), rect(2, 1), rect(3, 2)];
  assert.deepEqual(selectedRectRoots(entities, [1, 2, 3]), [1]);
});

test('independent selected branches preserve hierarchy order', () => {
  const entities = [rect(1), rect(2, 1), rect(3), rect(4, 3)];
  assert.deepEqual(selectedRectRoots(entities, [4, 2]), [2, 4]);
});

test('non-RectTransform selections are ignored', () => {
  const entities = [rect(1), { entity: 2, parent: null, components: { Transform: {} } }];
  assert.deepEqual(selectedRectRoots(entities, [1, 2]), [1]);
});
