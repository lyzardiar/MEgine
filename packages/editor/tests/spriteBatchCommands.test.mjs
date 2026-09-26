import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('sprite batch commands preserve authored properties, clone data, validate bounds and support Undo', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    store.applyCommands([{ op: 'spawn', name: 'Bullets', components: { SpriteBatch2D: { sprite: 'Assets/bullets.png', size: [2, 3], instances: [], colors: [] } } }]);
    const entity = store.snapshot().entities.find(value => value.name === 'Bullets').entity;
    const batch = () => store.snapshot().entities.find(value => value.entity === entity).components.SpriteBatch2D;
    const instances = [[1, 2, 0, 1]];
    store.applyCommands([{ op: 'setSpriteBatchData', entity, instances, colors: [] }]);
    instances[0][0] = 9;
    assert.deepEqual(batch().instances, [[1, 2, 0, 1]]);
    assert.equal(batch().sprite, 'Assets/bullets.png');
    assert.deepEqual(batch().size, [2, 3]);
    store.undo(); assert.deepEqual(batch().instances, []);
    store.applyCommands([{ op: 'setSpriteBatchData', entity, instances: [[NaN, 0, 0, 1]], colors: [] }]);
    assert.deepEqual(batch().instances, []);
    store.applyCommands([{ op: 'setSpriteBatchData', entity, instances: [[3.5e38, 0, 0, 1]], colors: [] }]);
    assert.deepEqual(batch().instances, []);
  } finally { await server.close(); }
});
