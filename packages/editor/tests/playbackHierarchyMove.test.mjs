import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function transform(x) {
  return {
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

test('Play-mode reparenting preserves live world space and never changes authored hierarchy', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { buildWorldTransforms } = await server.ssrLoadModule('/src/worldTransform.ts');
    const store = createEditorStore();
    const parentA = store.createGameObject('Runtime Parent A', { Transform: transform(0) });
    const parentB = store.createGameObject('Runtime Parent B', { Transform: transform(10) });
    const child = store.createGameObject('Runtime Child', { Transform: transform(1) }, parentA);
    assert.notEqual(parentA, null);
    assert.notEqual(parentB, null);
    assert.notEqual(child, null);

    store.play();
    store.setTransform(parentA, transform(20));
    store.setTransform(parentB, transform(100));
    const before = buildWorldTransforms(store.snapshot().entities).get(child).transform;

    assert.equal(store.setParent([child], parentB), true);
    const after = buildWorldTransforms(store.snapshot().entities).get(child).transform;
    assert.deepEqual(after, before);
    assert.equal(
      store.snapshot().entities.find((entity) => entity.entity === child).parent,
      parentB,
    );
    assert.equal(
      store.authoredEntities().find((entity) => entity.entity === child).parent,
      parentA,
    );

    store.stop();
    assert.equal(
      store.snapshot().entities.find((entity) => entity.entity === child).parent,
      parentA,
    );
    assert.equal(store.getTransform(child).position[0], 1);
  } finally {
    await server.close();
  }
});
