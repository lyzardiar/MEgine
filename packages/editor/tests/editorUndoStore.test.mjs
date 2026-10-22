import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('shared history retains 128 edits, restores metadata and preserves redo after cancelled nested gestures', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { createEditorUndoService } = await server.ssrLoadModule('/src/editorUndoService.ts');
    const history = createEditorUndoService();
    const store = createEditorStore(history);
    const id = store.createGameObject('History Target', { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
    store.select(id);
    history.clear();
    const position = () => store.entitySnapshot(id).components.Transform.position[0];
    for (let i = 0; i < 130; i++) store.patchComponent(id, 'Transform', { position: [i + 1, 0, 0] });
    assert.equal(history.undoDepth, 128);
    for (let i = 0; i < 128; i++) assert.equal(store.undo(), true);
    assert.equal(position(), 2);
    assert.equal(store.undo(), false);
    for (let i = 0; i < 128; i++) assert.equal(store.redo(), true);
    assert.equal(position(), 130);
    store.undo();
    const beforeGesture = store.snapshot();
    const undoDepth = history.undoDepth, redoDepth = history.redoDepth;
    store.beginTransformGesture();
    store.beginTransformGesture();
    store.applyTransformDelta(id, 'translate', 'x', 4);
    store.endTransformGesture();
    store.applyTransformDelta(id, 'translate', 'x', -4);
    store.endTransformGesture();
    assert.deepEqual(store.snapshot(), beforeGesture);
    assert.equal(history.undoDepth, undoDepth);
    assert.equal(history.redoDepth, redoDepth);
    assert.equal(store.redo(), true);
    assert.equal(position(), 130);

    store.beginTransformGesture();
    store.applyTransformDelta(id, 'translate', 'x', 3);
    store.applyTransformDelta(id, 'translate', 'x', 4);
    store.endTransformGesture();
    assert.equal(position(), 137);
    store.undo();
    assert.equal(position(), 130);
    store.redo();
    assert.equal(position(), 137);

    const beforeDelete = store.snapshot();
    store.deleteSelection();
    store.undo();
    assert.deepEqual(store.snapshot(), beforeDelete);
    store.redo();
    assert.equal(store.entitySnapshot(id), undefined);
    store.undo();
    const added = store.createGameObject('After Branch', {});
    assert.ok(added > id);
    assert.equal(store.canRedo, false);
    store.undo();
    assert.deepEqual(store.snapshot(), beforeDelete);
    assert.equal(store.createGameObject('Reused ID', {}), added);
    store.undo();
    const color = [...store.snapshot().clearColor];
    store.applyCommands([{ op: 'setClearColor', r: 0.3, g: 0.4, b: 0.5, a: 1 }]);
    store.undo();
    assert.deepEqual(store.snapshot().clearColor, color);
    store.redo();
    assert.deepEqual(store.snapshot().clearColor, [0.3, 0.4, 0.5, 1]);
  } finally {
    await server.close();
  }
});
