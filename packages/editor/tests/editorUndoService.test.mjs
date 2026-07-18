import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorUndoService } from '../src/editorUndoService.ts';

function recorder(initial = 0) {
  let value = initial;
  return {
    capture: () => value,
    restore: (next) => { value = next; },
    get value() { return value; },
    set value(next) { value = next; },
  };
}

test('global undo service preserves names and symmetric snapshot state', () => {
  const service = createEditorUndoService();
  const state = recorder(1);
  service.recordSnapshot({
    scope: 'scene', label: 'Move Cube', state: state.capture(),
    capture: state.capture, restore: state.restore,
  });
  state.value = 5;
  assert.equal(service.undoLabel, 'Move Cube');
  assert.equal(service.undo(), true);
  assert.equal(state.value, 1);
  assert.equal(service.redoLabel, 'Move Cube');
  assert.equal(service.redo(), true);
  assert.equal(state.value, 5);
});

test('new records clear redo and capacity drops the oldest transaction', () => {
  const service = createEditorUndoService(2);
  const state = recorder();
  for (const [label, next] of [['One', 1], ['Two', 2], ['Three', 3]]) {
    service.recordSnapshot({
      scope: 'scene', label, state: state.capture(),
      capture: state.capture, restore: state.restore,
    });
    state.value = next;
  }
  assert.equal(service.undoDepth, 2);
  service.undo();
  assert.equal(state.value, 2);
  assert.equal(service.canRedo, true);
  service.recordSnapshot({
    scope: 'scene', label: 'Branch', state: state.capture(),
    capture: state.capture, restore: state.restore,
  });
  assert.equal(service.canRedo, false);
});

test('scope clearing and checkpoints preserve unrelated ordered history', () => {
  const service = createEditorUndoService();
  const scene = recorder();
  const timeline = recorder();
  service.recordSnapshot({
    scope: 'scene', label: 'Scene', state: 0,
    capture: scene.capture, restore: scene.restore,
  });
  scene.value = 1;
  const checkpoint = service.checkpoint();
  service.recordSnapshot({
    scope: 'timeline:a', label: 'Timeline', state: 0,
    capture: timeline.capture, restore: timeline.restore,
  });
  timeline.value = 1;
  service.restoreCheckpoint(checkpoint);
  assert.equal(service.undoLabel, 'Scene');
  service.recordSnapshot({
    scope: 'timeline:a', label: 'Timeline', state: 0,
    capture: timeline.capture, restore: timeline.restore,
  });
  service.clear('scene');
  assert.equal(service.undoLabel, 'Timeline');
});

test('failed capture or restore leaves both history stacks unchanged', () => {
  const service = createEditorUndoService();
  service.recordSnapshot({
    scope: 'scene', label: 'Broken', state: 1,
    capture: () => 2,
    restore: () => { throw new Error('restore failed'); },
  });
  assert.throws(() => service.undo(), /restore failed/);
  assert.equal(service.undoDepth, 1);
  assert.equal(service.redoDepth, 0);

  const captureFailure = createEditorUndoService();
  captureFailure.recordSnapshot({
    scope: 'scene', label: 'Capture Broken', state: 1,
    capture: () => { throw new Error('capture failed'); },
    restore: () => {},
  });
  assert.throws(() => captureFailure.undo(), /capture failed/);
  assert.equal(captureFailure.undoDepth, 1);
  assert.equal(captureFailure.redoDepth, 0);
});

test('restore callbacks cannot record a nested transaction', () => {
  const service = createEditorUndoService();
  service.recordSnapshot({
    scope: 'scene', label: 'Outer', state: 0,
    capture: () => 1,
    restore: () => {
      service.recordSnapshot({
        scope: 'scene', label: 'Nested', state: 0,
        capture: () => 1, restore: () => {},
      });
    },
  });
  assert.throws(() => service.undo(), /while history is restoring/);
  assert.equal(service.undoLabel, 'Outer');
  assert.equal(service.redoDepth, 0);
  assert.equal(service.isRestoring, false);
});
