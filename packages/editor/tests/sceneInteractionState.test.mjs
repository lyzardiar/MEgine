import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Scene visibility and picking stay editor-only and apply to hierarchy branches', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const parent = store.createGameObject('Parent', {
      Transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    const child = store.createGameObject('Child', {
      Transform: { position: [4, 5, 6], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    }, parent);
    const fingerprint = store.sceneContentFingerprint();
    const undoLabel = store.undoLabel;

    assert.equal(store.setSceneVisibility(parent, false), true);
    assert.deepEqual(store.sceneHiddenIds, [parent, child]);
    assert.equal(store.sceneVisible(parent), false);
    assert.equal(store.sceneVisible(child), false);
    assert.equal(store.sceneContentFingerprint(), fingerprint);
    assert.equal(store.undoLabel, undoLabel);

    assert.equal(store.setSceneVisibility(child, true), true);
    assert.equal(store.sceneVisible(parent), true);
    assert.equal(store.sceneVisible(child), true);

    assert.equal(store.setScenePickability(parent, false), true);
    assert.deepEqual(store.sceneUnpickableIds, [parent, child]);
    assert.equal(store.scenePickable(child), false);
    assert.equal(store.setScenePickability(child, true), true);
    assert.equal(store.scenePickable(parent), true);
    assert.equal(store.scenePickable(child), true);

    store.setSceneInteractionState([parent, 999_999], [child, 999_999]);
    assert.deepEqual(store.sceneHiddenIds, [parent]);
    assert.deepEqual(store.sceneUnpickableIds, [child]);
    assert.equal(store.showAllSceneObjects(), true);
    assert.equal(store.enableAllScenePicking(), true);
    assert.deepEqual(store.sceneHiddenIds, []);
    assert.deepEqual(store.sceneUnpickableIds, []);
  } finally {
    await server.close();
  }
});
