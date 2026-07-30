import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Inspector component add and remove operations stay inside the Play clone', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const entity = store.createGameObject('Runtime Components', {
      Transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      MeshRenderer: { mesh: 'cube', material: 'default' },
    });
    assert.notEqual(entity, null);
    store.play();

    assert.equal(store.removeComponent(entity, 'MeshRenderer'), true);
    assert.equal(store.addComponent(entity, 'BoxCollider3D', {
      size: [1, 1, 1],
      center: [0, 0, 0],
      is_trigger: false,
    }), true);
    assert.equal(store.removeComponent(entity, 'Transform'), false);
    const live = store.snapshot().entities.find((candidate) => candidate.entity === entity);
    assert.equal(live.components.MeshRenderer, undefined);
    assert.deepEqual(live.components.BoxCollider3D, {
      size: [1, 1, 1],
      center: [0, 0, 0],
      is_trigger: false,
    });
    const authored = store.authoredEntities()
      .find((candidate) => candidate.entity === entity);
    assert.deepEqual(authored.components.MeshRenderer, {
      mesh: 'cube',
      material: 'default',
    });
    assert.equal(authored.components.BoxCollider3D, undefined);
    assert.equal(store.canUndo, false);

    store.stop();
    const restored = store.snapshot().entities.find((candidate) => candidate.entity === entity);
    assert.deepEqual(restored.components.MeshRenderer, {
      mesh: 'cube',
      material: 'default',
    });
    assert.equal(restored.components.BoxCollider3D, undefined);
    assert.equal(store.undoLabel, 'Create Runtime Components');
  } finally {
    await server.close();
  }
});
