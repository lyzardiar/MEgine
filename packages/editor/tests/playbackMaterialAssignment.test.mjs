import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('material assignments stay inside the Play clone and restore on Stop', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const entity = store.createGameObject('Runtime Material', {
      Transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      MeshRenderer: { mesh: 'cube', material: 'default' },
      PbrMaterial: { metallic: 1 },
    });
    assert.notEqual(entity, null);
    store.play();

    const assigned = store.assignMaterial(entity, 'Assets/Materials/Runtime.mmat');
    assert.equal(assigned?.changed, true);
    assert.equal(assigned?.removedOverride, true);
    let live = store.snapshot().entities.find((candidate) => candidate.entity === entity);
    assert.deepEqual(live.components.MeshRenderer, {
      mesh: 'cube',
      material: 'Assets/Materials/Runtime.mmat',
    });
    assert.equal(live.components.PbrMaterial, undefined);
    let authored = store.authoredEntities()
      .find((candidate) => candidate.entity === entity);
    assert.deepEqual(authored.components.MeshRenderer, {
      mesh: 'cube',
      material: 'default',
    });
    assert.deepEqual(authored.components.PbrMaterial, { metallic: 1 });
    assert.equal(store.canUndo, false);

    const restoredLiveMaterial = store.assignMaterial(entity, 'default');
    assert.equal(restoredLiveMaterial?.changed, true);
    live = store.snapshot().entities.find((candidate) => candidate.entity === entity);
    assert.equal(live.components.MeshRenderer.material, 'default');
    assert.equal(live.components.PbrMaterial, undefined);

    store.stop();
    authored = store.snapshot().entities.find((candidate) => candidate.entity === entity);
    assert.deepEqual(authored.components.MeshRenderer, {
      mesh: 'cube',
      material: 'default',
    });
    assert.deepEqual(authored.components.PbrMaterial, { metallic: 1 });
    assert.equal(store.undoLabel, 'Create Runtime Material');
  } finally {
    await server.close();
  }
});

test('Inspector compares MeshRenderer material against the active snapshot', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const handler = app.match(
    /onSetComponent=\{\(entity, type, value\) => \{([\s\S]*?)\n\s+onSetComponents=/,
  )?.[1] ?? '';

  assert.match(handler, /store\.snapshot\(\)\.entities/);
  assert.doesNotMatch(handler, /store\.authoredEntities\(\)/);
});
