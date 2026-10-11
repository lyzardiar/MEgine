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
    await run({ ...mocks, server, runtime, emptyPlayInput, retainedNativePlayWorld, createEditorStore, createPlayWorldSync, retainPlayWorld });
  } finally { runtime?.stop(); await new Promise(resolve => setImmediate(resolve)); clearMocks?.(); globalThis.window = savedWindow; await server.close(); }
}

const entity = (id, name = 'Root') => ({ entity: id, name, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, Custom: { values: [1] } } });
const host = (entities, frame = 0, color = [0, 0, 0, 1]) => ({ entities, frame, sim_frame: frame, elapsed: frame / 10, clear_color: color });

test('Scene visibility and camera-preview snapshots share verified native records and fall back after deep edits or restart', async () => fixture(async ({ mockIPC, runtime, createEditorStore, server }) => {
  const { createNativeViewportWorldArgs, nativeSceneBrowserWorld, nativeViewportFrameWorldCurrent } = await server.ssrLoadModule('/src/nativeViewportFrame.ts');
  const { nativeSceneFrameForPresentation, nativeSceneFrameRequestIdentity } = await server.ssrLoadModule('/src/nativeSceneFrame.ts');
  const store = createEditorStore(); let session = 80;
  const records = [entity(1, 'Interface'), { ...entity(2, 'Child'), parent: 1 }, { ...entity(3, 'Camera'), components: { ...entity(3).components, Camera3D: { primary: true }, Text: { text: 'first' } } }];
  mockIPC(cmd => { if (cmd === 'start_editor_play') return { sessionId: ++session, snapshot: host(records) }; });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  const scene = hidden => {
    const live = store.playRenderSnapshot(), visible = live.entities.filter(e => !hidden.includes(e.entity));
    return createNativeViewportWorldArgs({ entities: visible, clearColor: live.clearColor, simulationTime: live.simulationTime, runtimeSessionId: live.runtimeSessionId, browserWorldReference: nativeSceneBrowserWorld(live.nativeWorldReference, live.entities, visible, hidden) }, true);
  };
  const first = scene([1]), firstWorld = first.frameWorld(), initial = store.playRenderSnapshot();
  assert.equal(firstWorld.entities[1], initial.entities[2]); assert.ok(Object.isFrozen(firstWorld.entities[1]));
  assert.deepEqual(first.worldArgs().snapshot.entities.map(e => e.entity), [3]); assert.equal(first.worldArgs().playSessionId, undefined);
  assert.deepEqual(scene([]).worldArgs().snapshot.entities.map(e => e.entity), [1, 2, 3]);
  const viewport = { w: 800, h: 600 }, camera = { eye: [0, 3, 8], target: [0, 0, 0], fovYDeg: 60 }, identity = nativeSceneFrameRequestIdentity(camera, viewport, 1, [1]);
  const frame = { presentationKey: identity.presentationKey, world: firstWorld };
  assert.equal(nativeSceneFrameForPresentation(frame, nativeSceneFrameRequestIdentity(camera, viewport, 1, [])), null);
  const editable = store.playViewportSnapshot().entities[2]; editable.components.Text.text = 'second'; editable.parent = 1;
  assert.equal(store.playRenderSnapshot().nativeWorldReference, undefined);
  const dirty = scene([1]), dirtyWorld = dirty.frameWorld();
  assert.equal(dirtyWorld.entities[1].components.Text.text, 'second'); assert.notEqual(dirtyWorld.entities[1], editable); assert.equal(dirty.worldArgs().snapshot.entities.length, 0);
  editable.components.Text.text = 'third'; assert.equal(dirtyWorld.entities[1].components.Text.text, 'second'); assert.equal(firstWorld.entities[1].components.Text.text, 'first');
  store.stop(); assert.equal(store.playRenderSnapshot(), null);
  store.play(); await store.waitForPlayRuntime(); store.pause();
  assert.equal(nativeViewportFrameWorldCurrent(firstWorld, store.playRenderSnapshot()), false); assert.deepEqual(scene([1]).worldArgs().snapshot.entities.map(e => e.entity), [3]);
  store.stop();
}));

test('hierarchy presentation uses the displayed world and keeps live reference edits checked across native revisions', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(); let revision = 0, upload;
  const records = [entity(1, 'Root'), { ...entity(2, 'Child'), parent: 1 }, { ...entity(3, 'Inactive'), active: false }];
  store.loadSceneJson(JSON.stringify({ version: 1, name: 'Hierarchy', world: { entities: records } }));
  store.setSceneVisibility(1, false); store.setScenePickability(1, false); store.expandAll();
  mockIPC((cmd, args) => {
    if (cmd === 'start_editor_play') return { sessionId: 82, snapshot: host(records) };
    if (cmd === 'step_editor_play') {
      upload = args.snapshot;
      const changed = upload ? upload.entities : [{ ...records[1], name: 'Next child' }];
      return { snapshot: host(changed, revision + 1, upload?.clearColor), entityOrder: upload?.entities.map(record => record.entity), reset: !!upload, baseRevision: revision, revision: ++revision };
    }
  });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  const first = store.presentationSnapshot(), rows = store.hierarchyPresentation(first.entities);
  assert.deepEqual(rows.map(row => [row.entity.name, row.depth, row.hasChildren]), [['Root', 0, true], ['Child', 1, false], ['Inactive', 0, false]]);
  assert.equal(rows[1].entity, first.entities[1]); assert.ok(Object.isFrozen(rows[1].entity));
  assert.throws(() => { rows[1].entity.name = 'Illegal'; }, TypeError);
  for (const record of records) { store.activeInHierarchy(record.entity); store.sceneVisible(record.entity); store.scenePickable(record.entity); }
  assert.equal(store.activeInHierarchy(2), true); assert.equal(store.activeInHierarchy(3), false); assert.equal(store.activeInHierarchy(999), false);
  assert.equal(store.sceneVisible(2), false); assert.equal(store.scenePickable(2), false); assert.equal(store.sceneVisible(3), true);
  store.step(.1); await store.waitForPlayRuntime(); assert.equal(upload, undefined);
  assert.equal(store.hierarchyPresentation(store.presentationSnapshot().entities)[1].entity.name, 'Next child');
  assert.equal(store.hierarchyPresentation(first.entities)[1].entity.name, 'Child');
  store.collapseAll(); assert.equal(store.hierarchyPresentation(first.entities).length, 2); store.expandAll();
  const editable = store.getVisibleFlat()[1].entity; editable.components.Custom.values.push(7); editable.parent = 3;
  assert.equal(store.playRenderSnapshot().nativeWorldReference, undefined); assert.equal(store.activeInHierarchy(2), false);
  store.step(.1); await store.waitForPlayRuntime(); assert.ok(upload);
  assert.deepEqual(upload.entities.find(record => record.entity === 2).components.Custom.values, [1, 7]);
  assert.equal(upload.entities.find(record => record.entity === 2).parent, 3);
  assert.equal(store.hierarchyPresentation(first.entities)[1].entity.parent, 1); store.stop();
  store.rename(2, 'Authored child');
  assert.equal(store.hierarchyPresentation(first.entities)[1].entity.name, 'Authored child');
}));

test('render snapshots freeze native records, preserve array identity and allow unbound fallback callbacks', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(); let revision = 0;
  mockIPC((cmd, args) => {
    if (cmd === 'start_editor_play') return { sessionId: 61, snapshot: host([entity(1), entity(2)]) };
    if (cmd === 'step_editor_play') { assert.equal(args.snapshot, undefined); return { snapshot: host([], revision + 1), reset: false, baseRevision: revision, revision: ++revision }; }
  });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  const getter = store.playRenderSnapshot, first = getter();
  assert.equal(first.entities, getter().entities); assert.equal(first.clearColor, getter().clearColor);
  assert.ok(Object.isFrozen(first.entities)); assert.throws(() => { first.entities[0].components.Transform.position[0] = 9; }, TypeError);
  assert.throws(() => first.entities.reverse(), TypeError); assert.throws(() => { first.clearColor[0] = .8; }, TypeError);
  assert.equal(store.step(.1), true); await store.waitForPlayRuntime();
  assert.equal(getter().nativeWorldReference.revision, 1); assert.equal(getter().entities[0], first.entities[0]);
  assert.equal(first.nativeWorldReference.revision, 0); store.stop(); assert.equal(getter(), null);
  const generic = createEditorStore(); generic.play(); generic.pause(); const fallback = generic.playRenderSnapshot;
  assert.equal(fallback().entities, fallback().entities); assert.equal(Object.isFrozen(fallback().entities), false); generic.stop();
}));

test('Transform, tree, reparent, component aliases, colors and public array mutations force uploads', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const mutations = [
    store => { store.getTransform(1).position[0] = 9; },
    store => { store.getVisibleFlat()[0].entity.components.Custom.values.push(2); },
    store => { assert.equal(store.setParent([1], 2), true); },
    store => { const value = { values: [7] }; store.setComponent(1, 'Custom', value); value.values.push(8); },
    store => { store.snapshot().clearColor[0] = .6; },
    store => { store.playViewportSnapshot().entities.reverse(); },
  ];
  for (const mutate of mutations) {
    const store = createEditorStore(); let upload;
    mockIPC((cmd, args) => {
      if (cmd === 'start_editor_play') return { sessionId: 62, snapshot: host([entity(1), entity(2), entity(3)]) };
      if (cmd === 'step_editor_play') { upload = args.snapshot; return { snapshot: host(upload.entities.map(e => ({ ...e, sibling_index: e.siblingIndex })), 1, upload.clearColor), entityOrder: upload.entities.map(e => e.entity), reset: true, baseRevision: 0, revision: 1 }; }
    });
    store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
    assert.ok(Object.isFrozen(store.playRenderSnapshot().entities)); mutate(store);
    assert.equal(store.nativePlaySessionId, undefined); assert.equal(store.playRenderSnapshot().nativeWorldReference, undefined);
    assert.equal(store.step(.1), true); await store.waitForPlayRuntime(); assert.ok(upload); assert.equal(store.nativePlaySessionId, 62); store.stop();
  }
}));

test('pending individual aliases stay checked across reuse and detach when native records change', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(); let revision = 0, release, next, upload;
  mockIPC((cmd, args) => {
    if (cmd === 'start_editor_play') return { sessionId: 63, snapshot: host([entity(1), entity(2)]) };
    if (cmd === 'step_editor_play') { upload = args.snapshot; return new Promise(resolve => { release = () => resolve({ snapshot: host([], revision + 1), reset: false, ...next, baseRevision: revision, revision: ++revision }); }); }
  });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  const rendered = store.playRenderSnapshot(), transform = store.getTransform(1), root = store.getVisibleFlat()[0].entity;
  assert.equal(store.step(.1), true); assert.equal(upload, undefined); transform.position[0] = 12; root.name = 'During IPC';
  release(); await store.waitForPlayRuntime(); assert.equal(store.nativePlaySessionId, undefined); assert.equal(rendered.entities[0].name, 'Root');
  assert.equal(store.step(.1), true); assert.equal(upload.entities[0].components.Transform.position[0], 12);
  next = { snapshot: host([entity(1, 'Native changed')], 2) }; release(); await store.waitForPlayRuntime();
  transform.position[0] = 30; root.name = 'Detached'; assert.equal(store.nativePlaySessionId, 63); assert.equal(store.playRenderSnapshot().entities[0].name, 'Native changed'); store.stop();
}));

test('private comparisons preserve Object.keys accessors and changes made by an exposed Proxy', async () => fixture(async ({ mockIPC, runtime, createEditorStore }) => {
  const store = createEditorStore(), original = Object.getOwnPropertyDescriptor(Object, 'keys'), keys = Object.keys;
  mockIPC(cmd => cmd === 'start_editor_play' ? { sessionId: 64, snapshot: host([entity(1), { ...entity(2), parent: 1 }]) } : undefined);
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  try {
    assert.ok(Object.isFrozen(store.playRenderSnapshot().entities)); let reads = 0;
    Object.defineProperty(Object, 'keys', { configurable: true, get() { reads++; return keys; } });
    assert.equal(store.nativePlaySessionId, 64); assert.ok(reads > 0); Object.defineProperty(Object, 'keys', original);
    store.stop(); store.play(); await store.waitForPlayRuntime(); store.pause();
    let captured;
    Object.keys = value => { if (!Object.isFrozen(value) && value?.position) captured = value; return keys(value); };
    assert.equal(store.nativePlaySessionId, 64); Object.defineProperty(Object, 'keys', original);
    assert.ok(captured); captured.position[0] = 7; assert.equal(store.nativePlaySessionId, undefined);
    store.stop(); store.play(); await store.waitForPlayRuntime(); store.pause();
    assert.ok(Object.isFrozen(store.playRenderSnapshot().entities));
    const root = store.getVisibleFlat()[0].entity;
    root.components.Custom = new Proxy({ values: [1] }, { ownKeys(target) { Object.keys = value => Object.isFrozen(value) && 'entity' in value && value.entity === 2 ? [] : keys(value); return Reflect.ownKeys(target); } });
    assert.equal(Object.isFrozen(store.playRenderSnapshot().entities), false);
  } finally { Object.defineProperty(Object, 'keys', original); store.stop(); }
}));

test('dynamic Behaviour registration and enable disable callbacks synchronize private editable records', async () => fixture(async ({ mockIPC, server, runtime, createEditorStore }) => {
  const { Behaviour, RegisterBehaviour } = await server.ssrLoadModule('@mengine/behaviour');
  const type = 'NativePrivateLifecycleProbe', store = createEditorStore(); let revision = 0, upload;
  mockIPC((cmd, args) => {
    if (cmd === 'start_editor_play') return { sessionId: 65, snapshot: host([{ ...entity(1), components: { ...entity(1).components, [type]: {} } }]) };
    if (cmd === 'step_editor_play') { upload = args.snapshot; return { snapshot: host(upload.entities.map(e => ({ ...e, sibling_index: e.siblingIndex })), revision + 1), entityOrder: upload.entities.map(e => e.entity), reset: true, baseRevision: revision, revision: ++revision }; }
  });
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause(); assert.ok(Object.isFrozen(store.playRenderSnapshot().entities));
  class Probe extends Behaviour {
    onEnable(ctx) { ctx.get('Transform').position[0] += 1; }
    onUpdate(ctx) { ctx.get('Transform').position[0] += 10; }
    onDisable(ctx) { ctx.get('Transform').position[0] += 100; }
  }
  RegisterBehaviour(type)(Probe);
  assert.equal(store.step(.1), true); await store.waitForPlayRuntime(); assert.equal(upload.entities[0].components.Transform.position[0], 11);
  store.setActive(1, false); assert.equal(store.step(.1), true); await store.waitForPlayRuntime(); assert.equal(upload.entities[0].components.Transform.position[0], 111);
  store.setActive(1, true); assert.equal(store.step(.1), true); await store.waitForPlayRuntime(); assert.equal(upload.entities[0].components.Transform.position[0], 122); store.stop();
}));

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
