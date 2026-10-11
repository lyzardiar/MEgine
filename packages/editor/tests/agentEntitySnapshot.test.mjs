// Author: MiYu. Single-entity queries retain active-world, preview and copy semantics.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('single-entity bridge queries preserve active state and hierarchical previews without cloning unrelated entities', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const clone = globalThis.structuredClone;
  let bridge, previousStore, previousReady;
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { agentBridge } = await server.ssrLoadModule('/src/agent/AgentBridge.ts');
    bridge = agentBridge; previousStore = bridge.store; previousReady = bridge.editorBootReady;
    const store = createEditorStore();
    store.loadSceneJson(JSON.stringify({ version: 1, name: 'Query fixture', world: { entities: [
      { entity: 1, name: 'Root', parent: null, components: { Transform: { position: [0, 1, 2] } } },
      { entity: 2, name: 'Duplicate', parent: 1, components: { Transform: { position: [3, 4, 5] } } },
      { entity: 3, name: 'Duplicate', parent: null, components: { Text: { text: 'unrelated' } } },
    ] } }));
    agentBridge.store = store;
    agentBridge.editorBootReady = true;
    const expected = store.snapshot().entities.find(e => e.entity === 2);
    let copiedEntities = 0;
    globalThis.structuredClone = (value, options) => {
      copiedEntities += Array.isArray(value) ? value.length : value?.entity !== undefined ? 1 : 0;
      return clone(value, options);
    };
    const queried = agentBridge.getEntity('Duplicate');
    assert.deepEqual(queried, expected);
    assert.equal(copiedEntities, 1, 'the bridge must copy only the matched entity');
    queried.components.Transform.position[0] = 99;
    assert.equal(agentBridge.getEntity(2).components.Transform.position[0], 3);
    assert.throws(() => agentBridge.getEntity('Missing'), e => e.code === 'ENTITY_NOT_FOUND' && e.message === 'No entity matches "Missing"');
    globalThis.structuredClone = clone;
    store.play();
    store.setTag(2, 'RuntimeOnly');
    assert.equal(agentBridge.getEntity(2).tag, 'RuntimeOnly');
    assert.equal(store.authoredEntities().find(e => e.entity === 2).tag, 'Untagged');
    store.stop();
    assert.equal(agentBridge.getEntity(2).tag, 'Untagged');
    store.setAnimationPreview(1, [{ target: './Duplicate', component: 'Transform', property: 'position.x', value: 7 }]);
    assert.equal(agentBridge.getEntity(2).components.Transform.position[0], 7);
    assert.deepEqual(agentBridge.getEntity(2), store.snapshot().entities.find(e => e.entity === 2));
    store.setTimelinePreview({ activations: [{ entity: 2, active: false }], animations: [], camera: null, particles: [] });
    assert.equal(agentBridge.getEntity(2).active, false);
    assert.deepEqual(agentBridge.getEntity(2), store.snapshot().entities.find(e => e.entity === 2));
    store.clearTimelinePreview();
    assert.equal(agentBridge.getEntity(2).active, true);
  } finally {
    globalThis.structuredClone = clone;
    if (bridge) { bridge.store = previousStore; bridge.editorBootReady = previousReady; }
    await server.close();
  }
});
