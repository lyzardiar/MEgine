import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('native Play serializes pending startup and stop before restart and rejects stale steps', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const savedWindow = globalThis.window;
  globalThis.window = {};
  try {
    const { mockIPC, clearMocks } = await server.ssrLoadModule('@tauri-apps/api/mocks');
    const { createNativePlayRuntime, emptyPlayInput } = await server.ssrLoadModule('/src/playRuntime.ts');
    const snapshot = { entities: [], frame: 0, sim_frame: 0, clear_color: [0, 0, 0, 1] };
    const calls = [], errors = [];
    let releaseStart, releaseStep, session = 0;
    mockIPC(async (cmd, args) => {
      calls.push([cmd, args.sessionId]);
      if (cmd === 'start_editor_play') {
        const id = ++session;
        if (id === 1) await new Promise(resolve => { releaseStart = resolve; });
        return { sessionId: id, snapshot };
      }
      if (cmd === 'step_editor_play') {
        await new Promise(resolve => { releaseStep = resolve; });
        return { snapshot, entityOrder: [], baseRevision: 0, revision: 1, reset: false };
      }
    });
    const runtime = createNativePlayRuntime(error => errors.push(error));
    const first = runtime.start({});
    await new Promise(resolve => setImmediate(resolve));
    runtime.stop();
    const second = runtime.start({});
    assert.deepEqual(calls, [['start_editor_play', undefined]]);
    releaseStart();
    assert.equal(await first, undefined);
    await second;
    assert.deepEqual(calls, [['start_editor_play', undefined], ['stop_editor_play', 1], ['start_editor_play', undefined]]);
    assert.equal(runtime.sessionId, 2);
    const step = runtime.step(undefined, emptyPlayInput(), 0.1);
    await new Promise(resolve => setImmediate(resolve));
    runtime.stop();
    await runtime.start({});
    releaseStep();
    await assert.rejects(step, /session expired/);
    assert.equal(runtime.sessionId, 3);
    assert.deepEqual(errors, []);
    runtime.stop();
    await new Promise(resolve => setImmediate(resolve));
    clearMocks();
  } finally { globalThis.window = savedWindow; await server.close(); }
});

test('Play snapshot deltas preserve full state, identity, ordering and explicit editor resets', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { applyPlayWorldUpdate } = await server.ssrLoadModule('/src/playRuntime.ts');
    const { toWorldSnapshotView } = await server.ssrLoadModule('/src/transport/editorTransport.ts');
    const initial = { entities: [{ entity: 1, name: 'First', components: { Custom: { value: 4 } } }, { entity: 2, name: 'Second', components: {} }], frame: 0, sim_frame: 0, elapsed: 0, clear_color: [0, 0, 0, 1] };
    const previous = toWorldSnapshotView(initial);
    const payload = { ...initial, entities: [{ entity: 2, name: 'Changed', active: false, parent: 1, sibling_index: 3, tag: 'Hero', layer: 5, components: { Transform: { position: [3, 4, 5] } } }], frame: 1, sim_frame: 1, elapsed: 0.1, selected: 2, clear_color: [1, 0, 0, 1] };
    const delta = { snapshot: payload, entityOrder: [2, 1], revision: 1, baseRevision: 0, reset: false };
    const result = applyPlayWorldUpdate(previous, 0, delta);
    assert.deepEqual(result, toWorldSnapshotView({ ...payload, entities: [payload.entities[0], initial.entities[0]] }));
    assert.equal(result.entities[1], previous.entities[0]);
    assert.equal(previous.entities[1].name, 'Second');
    const next = { snapshot: { ...payload, entities: [{ entity: 4294967297, name: 'Reused slot', components: {} }] }, entityOrder: [4294967297, 2], baseRevision: 1, revision: 2, reset: false };
    const removed = applyPlayWorldUpdate(result, 1, next);
    assert.deepEqual(removed.entities.map(e => e.entity), [4294967297, 2]);
    assert.equal(removed.entities[1], result.entities[0]);
    result.entities[0].name = 'Local Inspector edit';
    const reset = applyPlayWorldUpdate(result, 1, { ...next, snapshot: initial, entityOrder: [1, 2], reset: true });
    assert.deepEqual(reset, previous);
    assert.throws(() => applyPlayWorldUpdate(previous, 1, delta), /revision mismatch/);
    assert.throws(() => applyPlayWorldUpdate(previous, 0, { ...delta, entityOrder: [2, 2] }), /entity order/);
    assert.throws(() => applyPlayWorldUpdate(previous, 0, { ...delta, entityOrder: [999] }), /entity order/);
    assert.throws(() => applyPlayWorldUpdate(previous, 0, { ...delta, reset: true }), /entity order/);
  } finally { await server.close(); }
});

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
    store.setPlayInput({ pointerDelta: [4, -2], pointerLocked: true });
    store.setPlayInput({ pointerDelta: [3, 1] });
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
    assert.deepEqual(inputs[0].pointerDelta, [7, -1]);
    assert.equal(inputs[0].pointerLocked, true);
    store.step(); await store.waitForPlayRuntime();
    assert.deepEqual(inputs[1].pressedKeys, []);
    assert.deepEqual(inputs[1].pointerDelta, [0, 0]);
    assert.deepEqual(inputs[1].keys, ['KeyD']);
    store.step(); store.stop(); release(); await store.waitForPlayRuntime();
    assert.equal(store.mode, 'edit');
    assert.equal(store.playViewportSnapshot(), null);
    assert.deepEqual(calls, ['enable', 'disable']);
    assert.deepEqual(store.snapshot().entities, authored.entities);
    assert.deepEqual(store.snapshot().clearColor, authored.clearColor);
  } finally { await server.close(); }
});
