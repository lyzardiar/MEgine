import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Scene View prefab and model drops preserve one-step Undo and the drop position', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { unpackSelectedPrefab } = await server.ssrLoadModule('/src/prefabWorkflow.ts');
    const store = createEditorStore();
    const initialCount = store.authoredEntities().length;
    const prefab = {
      version: 2,
      name: 'Drop Me',
      root: {
        id: 'root',
        name: 'Drop Me',
        active: true,
        tag: 'Untagged',
        layer: 0,
        components: {
          Transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
        children: [{
          id: 'child',
          name: 'Child',
          active: true,
          tag: 'Untagged',
          layer: 0,
          components: {
            Transform: { position: [0, 4, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          },
          children: [],
        }],
      },
    };

    const prefabRoot = store.instantiatePrefabAsset(
      'Assets/Prefabs/Drop Me.prefab',
      prefab,
      null,
      [12, 3, -8],
    );
    assert.notEqual(prefabRoot, null);
    const prefabEntities = store.authoredEntities();
    const droppedRoot = prefabEntities.find((entity) => entity.entity === prefabRoot);
    const droppedChild = prefabEntities.find((entity) => entity.parent === prefabRoot);
    assert.deepEqual(droppedRoot.components.Transform.position, [12, 3, -8]);
    assert.deepEqual(droppedChild.components.Transform.position, [0, 4, 0]);
    assert.equal(droppedRoot.components.__MEnginePrefab.root, true);
    assert.equal(store.undoLabel, 'Instantiate Prefab');
    assert.equal(store.undo(), true);
    assert.equal(store.authoredEntities().length, initialCount);

    const model = store.spawnModel('Assets/Models/Robot.glb', [-4, 2, 9]);
    assert.notEqual(model, null);
    assert.deepEqual(
      store.authoredEntities().find((entity) => entity.entity === model).components.Transform.position,
      [-4, 2, 9],
    );
    assert.equal(store.undoLabel, 'Create Robot');
    assert.equal(store.undo(), true);
    assert.equal(store.authoredEntities().length, initialCount);

    const lockedPrefabRoot = store.instantiatePrefabAsset(
      'Assets/Prefabs/Drop Me.prefab',
      prefab,
      null,
      [2, 1, 4],
    );
    assert.notEqual(lockedPrefabRoot, null);
    const other = store.createEmpty();
    assert.notEqual(other, null);
    assert.equal(store.selected, other);

    assert.equal(unpackSelectedPrefab(store, lockedPrefabRoot), 'Assets/Prefabs/Drop Me.prefab');
    assert.equal(
      store.authoredEntities().find((entity) => entity.entity === lockedPrefabRoot)
        .components.__MEnginePrefab,
      undefined,
    );
    assert.equal(
      store.authoredEntities().find((entity) => entity.entity === other)
        .components.__MEnginePrefab,
      undefined,
    );
    assert.equal(store.undoLabel, 'Unpack Prefab Instance');
    assert.equal(store.undo(), true);
    assert.equal(
      store.authoredEntities().find((entity) => entity.entity === lockedPrefabRoot)
        .components.__MEnginePrefab.root,
      true,
    );
  } finally {
    await server.close();
  }
});
