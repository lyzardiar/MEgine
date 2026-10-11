import assert from 'node:assert/strict';
import test from 'node:test';
import { planHierarchyMove } from '../src/hierarchyMove.ts';

const item = (id, parent, siblingIndex) => ({ id, parent, siblingIndex });

test('moves downward using the destination list after removal', () => {
  const plan = planHierarchyMove(
    [item(1, null, 0), item(2, null, 1), item(3, null, 2)],
    [1],
    null,
    1,
  );
  assert.deepEqual(plan?.destinationOrder, [2, 1, 3]);
});

test('keeps multi-selection hierarchy order and moves roots atomically', () => {
  const plan = planHierarchyMove(
    [
      item(1, null, 0),
      item(2, 1, 0),
      item(3, null, 1),
      item(4, null, 2),
      item(5, 4, 0),
    ],
    [4, 2, 1],
    3,
  );
  assert.deepEqual(plan?.roots, [1, 4]);
  assert.deepEqual(plan?.destinationOrder, [1, 4]);
  assert.deepEqual(plan?.oldParents, [null]);
});

test('rejects cycles and supports moving a child back to the root', () => {
  const items = [item(1, null, 0), item(2, 1, 0), item(3, 2, 0)];
  assert.equal(planHierarchyMove(items, [1], 3), null);
  const rootPlan = planHierarchyMove(items, [3], null, 1);
  assert.deepEqual(rootPlan?.destinationOrder, [1, 3]);
  assert.deepEqual(rootPlan?.oldParents, [2]);
});

test('moving a leaf in a 90,000-node scene reads parents linearly', () => {
  let reads = 0;
  const count = 90_000;
  const items = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    get parent() { reads++; return null; },
    siblingIndex: index,
  }));
  const plan = planHierarchyMove(items, [count], 1);
  assert.deepEqual(plan?.roots, [count]);
  assert.deepEqual(plan?.destinationOrder, [count]);
  assert.ok(reads <= count * 3, `Expected linear parent reads, got ${reads}`);
});
