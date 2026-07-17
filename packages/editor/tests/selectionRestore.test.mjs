import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreSceneSelection } from '../src/selectionRestore.ts';

test('restores legacy single selection when selectedIds is absent', () => {
  assert.deepEqual(restoreSceneSelection([0, 1, 2], undefined, 2), [2]);
});

test('drops stale and duplicate ids while preserving valid selection order', () => {
  assert.deepEqual(restoreSceneSelection([0, 1, 2], [1, 99, 1, 0], null), [1, 0]);
});

test('serialized primary selection remains last and therefore primary', () => {
  assert.deepEqual(restoreSceneSelection([0, 1, 2], [2, 0, 1], 0), [2, 1, 0]);
});

test('falls back to the first entity only when no saved selection is valid', () => {
  assert.deepEqual(restoreSceneSelection([4, 5], [99], 98), [4]);
  assert.deepEqual(restoreSceneSelection([], [99], 98), []);
});
