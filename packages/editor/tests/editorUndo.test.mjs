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

test('successive snapshots share only unchanged entities and isolate restored edits', () => {
  const entities = [{ entity: 1, data: { values: [1, 2] } }, { entity: 2, data: { values: [3] } }];
  const first = captureEditorUndoState(entities, [1], 1, 3, [0, 0, 0, 1]);
  entities[0].data.values[0] = 7;
  const second = captureEditorUndoState(entities, [2], 2, 4, [1, 0, 0, 1], first);
  assert.notEqual(second.entities[0], first.entities[0]);
  assert.equal(second.entities[1], first.entities[1]);
  const restored = restoreEditorUndoState(second);
  restored.entities[1].data.values[0] = 99;
  entities[1].data.values[0] = 88;
  assert.equal(first.entities[1].data.values[0], 3);
  assert.equal(second.entities[1].data.values[0], 3);
  assert.equal(first.entities[0].data.values[0], 1);
  assert.equal(second.entities[0].data.values[0], 7);
  assert.deepEqual(first.selectedIds, [1]);
  assert.deepEqual(second.selectedIds, [2]);
  assert.equal(second.selectionAnchor, 2);
  assert.equal(second.nextId, 4);
  assert.deepEqual(second.clearColor, [1, 0, 0, 1]);
});

test('sharing preserves entity order, additions, removals and nested field deletion', () => {
  const entities = [{ entity: 1, data: { value: 1 } }, { entity: 2, data: { value: 2 } }];
  const first = captureEditorUndoState(entities, [], null, 3, [0, 0, 0, 1]);
  const second = captureEditorUndoState([entities[1], { entity: 3 }, entities[0]], [], null, 4, [0, 0, 0, 1], first);
  assert.deepEqual(second.entities.map(entity => entity.entity), [2, 3, 1]);
  assert.equal(second.entities[0], first.entities[1]);
  assert.equal(second.entities[2], first.entities[0]);
  delete entities[0].data.value;
  const third = captureEditorUndoState([entities[0]], [], null, 4, [0, 0, 0, 1], second);
  assert.deepEqual(restoreEditorUndoState(third).entities, [{ entity: 1, data: {} }]);
  assert.equal(first.entities[0].data.value, 1);
});

test('non-plain structured-clone component values cannot compare as empty objects', () => {
  const entities = [{ entity: 1, data: new Map([['value', 1]]) }];
  const first = captureEditorUndoState(entities, [], null, 2, [0, 0, 0, 1]);
  entities[0].data.set('value', 2);
  const second = captureEditorUndoState(entities, [], null, 2, [0, 0, 0, 1], first);
  assert.equal(first.entities[0].data.get('value'), 1);
  assert.equal(second.entities[0].data.get('value'), 2);
});

test('128 sparse edits retain unchanged entity data once across the history', () => {
  const entities = [{ entity: 1, data: { value: 0 } }, { entity: 2, data: { value: 9 } }];
  const states = [];
  for (let step = 0; step < 128; step++) {
    states.push(captureEditorUndoState(entities, [], null, 3, [0, 0, 0, 1], states.at(-1)));
    entities[0].data.value++;
  }
  assert.equal(new Set(states.flatMap(state => state.entities)).size, 129);
  assert.equal(states[0].entities[1], states.at(-1).entities[1]);
  assert.equal(restoreEditorUndoState(states[0]).entities[0].data.value, 0);
  assert.equal(restoreEditorUndoState(states.at(-1)).entities[0].data.value, 127);
});
