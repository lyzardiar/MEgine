import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('retained runtime omits unchanged worlds and synchronizes Inspector edits before the next step', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    store.removeComponent(store.snapshot().entities[2].entity, 'AutoRotate');
    let world, incoming = [];
    store.setPlayRuntime({
      retainsWorld: true, sessionId: 42,
      start: async snapshot => { world = structuredClone(snapshot); return snapshot; }, stop() {}, onError(error) { throw error; },
      step: async snapshot => {
        incoming.push(snapshot);
        if (snapshot) world = snapshot;
        world.frame++;
        world.simulationTime = 0.25;
        world.clearColor = [0.9, 0.2, 0.1, 1];
        return structuredClone(world);
      },
    });
    store.play(); await store.waitForPlayRuntime(); store.pause();
    assert.equal(store.playViewportSnapshot().nativeSessionId, 42);
    const detachedCallback = store.playViewportSnapshot;
    assert.equal(detachedCallback().nativeSessionId, 42);
    store.step(); await store.waitForPlayRuntime();
    assert.equal(incoming[0], undefined);
    const target = store.playViewportSnapshot().entities[0];
    target.name = 'Inspector edit';
    assert.equal(store.playViewportSnapshot().nativeSessionId, undefined);
    store.step(); await store.waitForPlayRuntime();
    assert.equal(incoming[1].entities[0].name, 'Inspector edit');
    assert.equal(store.playViewportSnapshot().nativeSessionId, 42);
    store.step(); await store.waitForPlayRuntime();
    assert.equal(incoming[2], undefined);
    const detached = createEditorStore();
    detached.loadRemoteSceneJson(store.saveSessionSceneJson(), 'pause', 42);
    assert.equal(detached.playViewportSnapshot().nativeSessionId, 42);
    assert.equal(detached.simulationTime, store.simulationTime);
    assert.deepEqual(detached.snapshot().clearColor, store.snapshot().clearColor);
    assert.equal(detached.playSessionId, 42);
    store.stop();
    assert.equal(store.nativePlaySessionId, undefined);
  } finally { await server.close(); }
});

test('project runtime applies completed frames, consumes input edges, restores authored world and ignores stale completion', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { Behaviour, RegisterBehaviour } = await server.ssrLoadModule('@mengine/behaviour');
    const calls = [];
    class LifecycleProbe extends Behaviour {
      onEnable() { calls.push('enable'); }
      onDisable() { calls.push('disable'); }
    }
    RegisterBehaviour('PlayLifecycleProbe')(LifecycleProbe);
    const store = createEditorStore();
    store.addComponent(store.snapshot().entities[0].entity, 'PlayLifecycleProbe', {});
    const authored = store.snapshot();
    assert.equal(store.playViewportSnapshot(), null);
    let release;
    let inputs = [];
    store.setPlayRuntime({
      start: async (snapshot) => { snapshot.entities[0].entity = 99; return snapshot; }, stop: () => {}, onError: (error) => { throw error; },
      step: async (snapshot, input) => {
        inputs.push(input);
        if (inputs.length === 3) await new Promise(resolve => { release = resolve; });
        snapshot.entities[0].name = 'Runtime only';
        snapshot.clearColor = [1, 0, 0, 1];
        snapshot.simulationTime = 0.25;
        return snapshot;
      },
    });
    store.play(); assert.deepEqual(calls, []); await store.waitForPlayRuntime(); store.pause();
    assert.deepEqual(calls, ['enable']);
    assert.equal(store.snapshot().entities[0].entity, 99);
    store.setPlayInput({ keys: ['KeyD'], buttons: [0], pointer: [10, 20], viewport: [800, 600] });
    assert.equal(store.step(), true); await store.waitForPlayRuntime();
    assert.equal(store.snapshot().entities[0].name, 'Runtime only');
    assert.deepEqual(store.snapshot().clearColor, [1, 0, 0, 1]);
    assert.equal(store.snapshot().simulationTime, 0.25);
    const live = store.playViewportSnapshot();
    assert.equal(live.entities[0].name, 'Runtime only');
    assert.equal(live.simulationTime, 0.25);
    const copy = store.snapshot();
    copy.entities[0].name = 'Must stay isolated';
    assert.equal(live.entities[0].name, 'Runtime only');
    assert.deepEqual(inputs[0].pressedKeys, ['KeyD']);
    store.step(); await store.waitForPlayRuntime();
    assert.deepEqual(inputs[1].pressedKeys, []);
    assert.deepEqual(inputs[1].keys, ['KeyD']);
    store.step(); store.stop(); release(); await store.waitForPlayRuntime();
    assert.equal(store.mode, 'edit');
    assert.equal(store.playViewportSnapshot(), null);
    assert.deepEqual(calls, ['enable', 'disable']);
    assert.deepEqual(store.snapshot().entities, authored.entities);
    assert.deepEqual(store.snapshot().clearColor, authored.clearColor);
  } finally { await server.close(); }
});
