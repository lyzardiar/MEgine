import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Play-mode Active, Tag, and Layer edits affect only the live clone', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const entity = store.createGameObject('Runtime Metadata', {
      Transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    });
    assert.notEqual(entity, null);
    store.play();

    assert.equal(store.setActive(entity, false), true);
    assert.equal(store.setTag(entity, 'RuntimeOnly'), true);
    assert.equal(store.setLayer(entity, 7), true);
    assert.deepEqual(
      store.snapshot().entities.find((candidate) => candidate.entity === entity),
      {
        ...store.authoredEntities().find((candidate) => candidate.entity === entity),
        active: false,
        tag: 'RuntimeOnly',
        layer: 7,
      },
    );
    assert.deepEqual(
      {
        active: store.authoredEntities().find((candidate) => candidate.entity === entity).active,
        tag: store.authoredEntities().find((candidate) => candidate.entity === entity).tag,
        layer: store.authoredEntities().find((candidate) => candidate.entity === entity).layer,
      },
      { active: true, tag: 'Untagged', layer: 0 },
    );
    assert.equal(store.canUndo, false);
    assert.equal(store.undoLabel, null);

    store.stop();
    const restored = store.snapshot().entities.find((candidate) => candidate.entity === entity);
    assert.deepEqual(
      { active: restored.active, tag: restored.tag, layer: restored.layer },
      { active: true, tag: 'Untagged', layer: 0 },
    );
    assert.equal(store.undoLabel, 'Create Runtime Metadata');
  } finally {
    await server.close();
  }
});
