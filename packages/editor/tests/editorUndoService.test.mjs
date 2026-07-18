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
  const sceneToken = service.recordSnapshot({
    scope: 'scene', label: 'Scene Top', state: 0,
    capture: scene.capture, restore: scene.restore,
  });
  assert.equal(service.isUndoTop(sceneToken), true);
  service.undo();
  assert.equal(service.isUndoTop(sceneToken), false);
  service.redo();
  scene.value = 1;
  const checkpoint = service.checkpoint();
  service.recordSnapshot({
    scope: 'timeline:a', label: 'Timeline', state: 0,
    capture: timeline.capture, restore: timeline.restore,
  });
  timeline.value = 1;
  service.restoreCheckpoint(checkpoint);
  assert.equal(service.undoLabel, 'Scene Top');
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

test('global ordering can restore an inactive asset document by scope', () => {
  const service = createEditorUndoService();
  const documents = new Map();
  let activePath = 'Assets/A.mtimeline';
  let activeValue = 0;
  const capture = (path) => activePath === path ? activeValue : documents.get(path);
  const restore = (path, value) => {
    if (activePath === path) activeValue = value;
    else documents.set(path, value);
  };
  service.recordSnapshot({
    scope: `timeline:${activePath}`, label: 'Edit A', state: 0,
    capture: () => capture('Assets/A.mtimeline'),
    restore: (value) => restore('Assets/A.mtimeline', value),
  });
  activeValue = 1;
  documents.set(activePath, activeValue);
  activePath = 'Assets/B.mtimeline';
  activeValue = 10;
  service.recordSnapshot({
    scope: `timeline:${activePath}`, label: 'Edit B', state: 10,
    capture: () => capture('Assets/B.mtimeline'),
    restore: (value) => restore('Assets/B.mtimeline', value),
  });
  activeValue = 11;

  service.undo();
  assert.equal(activeValue, 10);
  service.undo();
  assert.equal(documents.get('Assets/A.mtimeline'), 0);
  service.redo();
  assert.equal(documents.get('Assets/A.mtimeline'), 1);
  service.redo();
  assert.equal(activeValue, 11);
});
