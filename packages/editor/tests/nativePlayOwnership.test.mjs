// Author: MiYu. Native publication stays independent from live editing, including pending IPC replies.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

async function fixture(run) {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const savedWindow = globalThis.window; globalThis.window = {};
  let clearMocks, runtime;
  try {
    const mocks = await server.ssrLoadModule('@tauri-apps/api/mocks'); clearMocks = mocks.clearMocks;
    const { createNativePlayRuntime, emptyPlayInput, retainedNativePlayWorld } = await server.ssrLoadModule('/src/playRuntime.ts');
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { createPlayWorldSync, retainPlayWorld } = await server.ssrLoadModule('/src/playWorldSync.ts');
    runtime = createNativePlayRuntime(error => { throw error; });
    await run({ ...mocks, runtime, emptyPlayInput, retainedNativePlayWorld, createEditorStore, createPlayWorldSync, retainPlayWorld });
  } finally { runtime?.stop(); await new Promise(resolve => setImmediate(resolve)); clearMocks?.(); globalThis.window = savedWindow; await server.close(); }
}

const entity = (id, name = 'Root') => ({ entity: id, name, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, Custom: { values: [1] } } });
const host = (entities, frame = 0, color = [0, 0, 0, 1]) => ({ entities, frame, sim_frame: frame, elapsed: frame / 10, clear_color: color });

test('native publications own JSON, retain unchanged records and clocks, and isolate reset/reorder/reused IDs', async () => fixture(async ({ mockIPC, runtime, emptyPlayInput, retainedNativePlayWorld, createPlayWorldSync, retainPlayWorld }) => {
  const initial = host([entity(1), entity(2, 'Second')]); let revision = 0, session = 0, next;
  mockIPC(cmd => {
    if (cmd === 'start_editor_play') { revision = 0; return { sessionId: ++session, snapshot: initial }; }
    if (cmd === 'step_editor_play') return { snapshot: host([], revision + 1), reset: false, ...next, baseRevision: revision, revision: ++revision };
  });
  const first = await runtime.start({}), sync = createPlayWorldSync();
  assert.equal(retainedNativePlayWorld(first), first); assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.entities));
  assert.ok(Object.isFrozen(first.selectedIds)); assert.throws(() => first.selectedIds.push(1), TypeError);
  assert.notEqual(first.entities[0].components, initial.entities[0].components);
  assert.throws(() => { first.entities[0].components.Custom.values.push(2); }, TypeError);
  initial.entities[0].components.Custom.values.push(3); assert.deepEqual(first.entities[0].components.Custom.values, [1]);
  sync.captureRetained(first); const frame = sync.viewportSnapshot();
  const reordered = await runtime.step(undefined, emptyPlayInput(), .1);
  assert.equal(reordered.entities[0], first.entities[0]); assert.equal(reordered.clearColor, first.clearColor);
  next = { entityOrder: [2, 1] }; const moved = await runtime.step(undefined, emptyPlayInput(), .1);
  assert.equal(moved.entities[1], first.entities[0]); assert.equal(moved.simulationTime, .2);
  next = { snapshot: host([entity(4294967297, 'Large ID')], 3), entityOrder: [4294967297, 2] };
  const removed = await runtime.step(undefined, emptyPlayInput(), .1); assert.equal(removed.entities[1], first.entities[1]);
  next = { snapshot: host([entity(1, 'New record')], 4), entityOrder: [1, 2] };
  const reused = await runtime.step(undefined, emptyPlayInput(), .1); assert.notEqual(reused.entities[0], first.entities[0]);
  next = { snapshot: host([entity(1), entity(2)], 5), entityOrder: [1, 2], reset: true };
  const reset = await runtime.step(undefined, emptyPlayInput(), .1); assert.notEqual(reset.entities[1], first.entities[1]);
  assert.equal(first.frame, 0); assert.equal(first.nativeRevision, 0); assert.equal(first.simulationTime, 0);
  assert.deepEqual(frame.entities[0].components.Custom.values, [1]); assert.deepEqual(frame.clearColor, [0, 0, 0, 1]);
  assert.throws(() => sync.captureRetained({ ...reset }), /owned world/);
  assert.equal(retainedNativePlayWorld({ ...reset }), undefined);
  assert.equal(retainedNativePlayWorld(retainPlayWorld(reset)), undefined);
  runtime.stop(); const restarted = await runtime.start({}); assert.equal(restarted.nativeSessionId, 2); assert.notEqual(restarted.entities[1], reset.entities[1]);
}));

test('store mutable copies follow native record identity through reorder, deletion, ID reuse and restart', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(); let revision = 0, session = 0, next;
  mockIPC(cmd => {
    if (cmd === 'start_editor_play') { revision = 0; return { sessionId: ++session, snapshot: host([entity(1), entity(2)]) }; }
    if (cmd === 'step_editor_play') return { snapshot: host([], revision + 1), reset: false, ...next, baseRevision: revision, revision: ++revision };
  });
  const start = async () => { store.play(); await store.waitForPlayRuntime(); store.pause(); };
  const step = async update => { next = update; assert.equal(store.step(.1), true); await store.waitForPlayRuntime(); };
  store.setPlayRuntime(runtime); await start();
  const original = store.playViewportSnapshot().entities;
  await step({ entityOrder: [2, 1] }); assert.equal(store.playViewportSnapshot().entities[1], original[0]);
  await step({ entityOrder: [2] });
  await step({ snapshot: host([entity(1, 'Replacement')], 3), entityOrder: [1, 2] });
  const replacement = store.playViewportSnapshot().entities[0]; assert.notEqual(replacement, original[0]); assert.equal(replacement.name, 'Replacement');
  original[0].name = 'Detached alias'; assert.equal(store.nativePlaySessionId, 1);
  await step({ snapshot: host([entity(1), entity(2)], 4), entityOrder: [1, 2], reset: true });
  assert.notEqual(store.playViewportSnapshot().entities[0], replacement); assert.notEqual(store.playViewportSnapshot().entities[1], original[1]);
  store.stop(); await start(); assert.equal(store.nativePlaySessionId, 2); assert.notEqual(store.playViewportSnapshot().entities[1], original[1]); store.stop();
}));

test('pending direct edits survive unchanged native records and upload before the next step', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(), requests = []; let revision = 0, release, response;
  mockIPC((cmd, args) => {
    if (cmd === 'start_editor_play') return { sessionId: 51, snapshot: host([entity(1), entity(2, 'Second')]) };
    if (cmd === 'step_editor_play') {
      requests.push(args.snapshot && structuredClone(args.snapshot));
      return new Promise(resolve => { release = () => resolve({ snapshot: host([], revision + 1), reset: false, ...response, baseRevision: revision, revision: ++revision }); });
    }
  });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  const original = store.playViewportSnapshot(), editable = original.entities[0], color = original.clearColor;
  const nativeFrame = original.nativeWorldReference;
  assert.equal(store.step(.1), true); assert.equal(requests[0], undefined);
  store.getTransform(1).position[0] = 5; editable.name = 'Pending name'; editable.parent = 2; editable.siblingIndex = 3; editable.active = false; editable.tag = 'Hero'; editable.layer = 4;
  const external = { values: [10] }; store.setComponent(1, 'Custom', external); external.values.push(11);
  delete editable.components.Transform.rotation; color[0] = .8;
  release(); await store.waitForPlayRuntime();
  assert.equal(store.playViewportSnapshot().entities[0], editable); assert.equal(store.snapshot().clearColor, color);
  assert.equal(store.nativePlaySessionId, undefined); assert.equal(store.playViewportSnapshot().nativeWorldReference, undefined);
  assert.deepEqual(nativeFrame.entities[0].components.Custom.values, [1]); assert.equal(nativeFrame.entities[0].parent, null); assert.equal(nativeFrame.clearColor[0], 0);
  assert.equal(store.step(.1), true); const upload = requests[1];
  assert.deepEqual(upload.entities[0], editable); assert.equal(upload.clearColor[0], .8);
  response = { snapshot: host(upload.entities.map(e => ({ ...e, sibling_index: e.siblingIndex })), 2, upload.clearColor), entityOrder: [1, 2], reset: true };
  release(); await store.waitForPlayRuntime(); assert.equal(store.nativePlaySessionId, 51);
  assert.notEqual(store.playViewportSnapshot().entities[0], editable); assert.deepEqual(store.playViewportSnapshot().entities[0].components.Custom.values, [10, 11]);
  response = undefined; assert.equal(store.step(.1), true); assert.equal(requests[2], undefined);
  const current = store.playViewportSnapshot().entities[0]; current.name = 'Late edit'; store.snapshot().clearColor[0] = .6;
  response = { snapshot: host([entity(1, 'Native changed')], 3, [.2, 0, 0, 1]) };
  release(); await store.waitForPlayRuntime(); assert.equal(store.playViewportSnapshot().entities[0].name, 'Native changed'); assert.equal(store.snapshot().clearColor[0], .2); assert.equal(store.nativePlaySessionId, 51);
  store.stop();
}));

test('pending color changes are independent from uploaded requests and custom drivers keep live JSON comparison', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(); let revision = 0, release, uploaded;
  mockIPC((cmd, args) => {
    if (cmd === 'start_editor_play') return { sessionId: 52, snapshot: host([entity(1)]) };
    if (cmd === 'step_editor_play') { uploaded = args.snapshot; return new Promise(resolve => { release = () => resolve({ snapshot: host([], 1, uploaded.clearColor), reset: false, baseRevision: revision, revision: ++revision }); }); }
  });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  store.playViewportSnapshot().entities[0].name = 'Upload'; assert.equal(store.step(.1), true);
  store.snapshot().clearColor[0] = .7; assert.equal(uploaded.clearColor[0], 0);
  release(); await store.waitForPlayRuntime(); assert.equal(store.snapshot().clearColor[0], .7); assert.equal(store.nativePlaySessionId, undefined); store.stop();
  const custom = createEditorStore(); let world, incoming;
  custom.setPlayRuntime({ retainsWorld: true, sessionId: 60, start: async snapshot => { world = structuredClone(snapshot); return { ...world, nativeSessionId: 60, nativeRevision: 0 }; }, step: async snapshot => { incoming = snapshot; if (snapshot) world = snapshot; return { ...world, nativeSessionId: 60, nativeRevision: 1 }; }, stop() {}, onError(error) { throw error; } });
  custom.play(); await custom.waitForPlayRuntime(); custom.pause();
  assert.equal(Object.isFrozen(custom.playViewportSnapshot().entities[0]), false);
  custom.getTransform(custom.playViewportSnapshot().entities[0].entity).position[0] = 9;
  assert.equal(custom.nativePlaySessionId, undefined); custom.step(.1); await custom.waitForPlayRuntime(); assert.ok(incoming); assert.equal(custom.nativePlaySessionId, 60);
  custom.stop();
}));
