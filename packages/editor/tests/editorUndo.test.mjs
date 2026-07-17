import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureEditorUndoState,
  editorUndoStatesEqual,
  restoreEditorUndoState,
} from '../src/editorUndo.ts';

test('undo snapshots isolate entities and all editor state from later mutations', () => {
  const entities = [{ entity: 0, data: { value: 1 } }, { entity: 2, data: { value: 2 } }];
  const state = captureEditorUndoState(entities, [0, 2], 2, 3, [0.1, 0.2, 0.3, 1]);
  entities[0].data.value = 99;
  const restored = restoreEditorUndoState(state);
  assert.equal(restored.entities[0].data.value, 1);
  assert.deepEqual(restored.selectedIds, [0, 2]);
  assert.equal(restored.selectionAnchor, 2);
  assert.equal(restored.nextId, 3);
  assert.deepEqual(restored.clearColor, [0.1, 0.2, 0.3, 1]);
});

test('undo restoration filters stale selection and repairs nextId', () => {
  const restored = restoreEditorUndoState({
    entities: [{ entity: 5 }],
    selectedIds: [99, 5, 5],
    selectionAnchor: 99,
    nextId: 1,
    clearColor: [0, 0, 0, 1],
  });
  assert.deepEqual(restored.selectedIds, [5]);
  assert.equal(restored.selectionAnchor, 5);
  assert.equal(restored.nextId, 6);
});

test('undo state equality detects real edits but ignores object key order', () => {
  const before = captureEditorUndoState(
    [{ entity: 1, components: { Transform: { position: [0, 1, 2], scale: 1 } } }],
    [1],
    1,
    2,
    [0.1, 0.2, 0.3, 1],
  );
  const reordered = captureEditorUndoState(
    [{ entity: 1, components: { Transform: { scale: 1, position: [0, 1, 2] } } }],
    [1],
    1,
    2,
    [0.1, 0.2, 0.3, 1],
  );
  assert.equal(editorUndoStatesEqual(before, reordered), true);

  reordered.entities[0].components.Transform.position[1] = 9;
  assert.equal(editorUndoStatesEqual(before, reordered), false);
});
