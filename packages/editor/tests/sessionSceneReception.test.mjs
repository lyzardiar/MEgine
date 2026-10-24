// Author: MiYu. Parsed session reuse preserves normalization, mutable editing and native ownership.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

async function withModules(run) {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try { await run(await server.ssrLoadModule('/src/sessionSceneSerialization.ts'), await server.ssrLoadModule('/src/store.ts'), await server.ssrLoadModule('@mengine/behaviour')); }
  finally { await server.close(); }
}
const doc = () => ({ version: 3, name: 'Map', world: { entities: [
  { entity: 1, components: { Transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, Custom: { values: [1, 2] } } },
  { entity: 2, parent: 1, components: { Text: { text: '中文' } } },
], clearColor: [.1, .2, .3, 1], frame: 1, simulationTime: .25, selectedIds: [1] }, sceneCamera: { yaw: 35, pitch: 25, distance: 8, pivot: [0, 0, 0] }, gameResolution: { width: 1280, height: 720 }, gameDisplay: 0 });

test('parsed deltas share frozen unchanged entities and keep earlier documents independent', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver, isSessionSceneDocument }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc();
  const first = receiver.readDocument(publisher.publish(document, 'a', 'map', true), 'a');
  assert.ok(isSessionSceneDocument(first)); assert.equal(Object.isFrozen(first.world.entities[0].components.Custom.values), true);
  document.world.frame++; document.world.entities[1].components.Text.text = 'updated';
  const next = receiver.readDocument(publisher.publish(document, 'b', 'map', true), 'b');
  assert.equal(first.world.entities[0], next.world.entities[0]); assert.notEqual(first.world.entities[1], next.world.entities[1]);
  assert.equal(first.world.entities[1].components.Text.text, '中文'); assert.equal(first.world.frame, 1); assert.deepEqual(next, document);
  assert.throws(() => next.world.entities[0].components.Custom.values.push(3)); assert.throws(() => next.world.entities.reverse());
}));

test('runtime store matches complete JSON through edits, exposed mutations, focus, topology and Stop', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }, { createEditorStore }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc(), store = createEditorStore(), baseline = createEditorStore(); let sequence = 0;
  const load = () => { const id = String(++sequence), input = receiver.readDocument(publisher.publish(document, id, 'map', true), id); store.loadRemoteSceneJson(input, 'pause', 41, sequence); baseline.loadRemoteSceneJson(JSON.stringify(document), 'pause', 41, sequence); assert.deepEqual(store.snapshot(), baseline.snapshot()); assert.equal(store.sceneContentFingerprint(), baseline.sceneContentFingerprint()); return input; };
  const input = load(), first = store.playRenderSnapshot(); document.world.frame++; load(); assert.equal(first.entities[0], store.playRenderSnapshot().entities[0]);
  assert.equal(first.nativeWorldReference.revision, 1); assert.equal(store.playRenderSnapshot().nativeWorldReference.revision, 2); assert.equal(first.nativeWorldReference.simulationTime, .25);
  store.setComponent(1, 'Custom', { values: [99] }); store.playViewportSnapshot().entities[1].components.Text.text = 'mutable'; load();
  assert.deepEqual(store.entitySnapshot(1).components.Custom.values, [1, 2]); assert.equal(input.world.entities[1].components.Text.text, '中文');
  store.setSceneCamera({ yaw: 60 }); store.selectMany([1], 'replace'); store.frameSelected(); assert.equal(input.sceneCamera.yaw, 35); load();
  document.world.entities.reverse(); load(); assert.equal(store.entitySnapshot(1).siblingIndex, 1); assert.equal(store.entitySnapshot(2).siblingIndex, 0);
  document.world.entities.pop(); load(); document.world.entities = []; load(); document.world.entities = doc().world.entities; load();
  store.stop(); baseline.stop(); assert.deepEqual(store.snapshot(), baseline.snapshot()); store.setComponent(1, 'Custom', { values: [5] }); assert.deepEqual(input.world.entities[0].components.Custom.values, [1, 2]);
}));

test('behavior entity-reference schema changes invalidate normalization of unchanged wire entities', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }, { createEditorStore }, { RegisterBehaviour, Behaviour, getBehaviour }) => {
  const type = 'SessionSchemaTest'; RegisterBehaviour(type)(class extends Behaviour {}); const fields = getBehaviour(type).fields;
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), store = createEditorStore(), baseline = createEditorStore(), document = doc();
  document.world.entities[0].components[type] = { target: 2, next: 1 };
  const load = id => { const input = receiver.readDocument(publisher.publish(document, id, 'same', true), id); store.loadRemoteSceneJson(input, 'pause', 41, 1); baseline.loadRemoteSceneJson(JSON.stringify(document), 'pause', 41, 1); assert.deepEqual(store.snapshot(), baseline.snapshot()); };
  load('a'); assert.equal(store.entitySnapshot(1).components[type].__mengine_entity_reference_fields, undefined);
  fields.push({ key: 'target', type: 'entity', serialize: true }); load('b'); assert.deepEqual(store.entitySnapshot(1).components[type].__mengine_entity_reference_fields, ['target']);
  fields.push({ key: 'next', type: 'entity', serialize: true }); load('c'); assert.deepEqual(store.entitySnapshot(1).components[type].__mengine_entity_reference_fields, ['target', 'next']);
  fields[0].serialize = false; load('d'); assert.deepEqual(store.entitySnapshot(1).components[type].__mengine_entity_reference_fields, ['next']); fields.length = 0;
}));

test('legacy scenes, unowned input and customized parsing use complete migration semantics', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver, isSessionSceneDocument }, { createEditorStore }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), store = createEditorStore(), document = doc(); document.version = 1; document.world.entities[0].components.Canvas = {};
  const legacy = receiver.readDocument(publisher.publish(document, 'a', 'same', true), 'a'); assert.equal(typeof legacy, 'string'); store.loadRemoteSceneJson(legacy, 'pause', 41, 1); assert.ok(store.entitySnapshot(1).components.GraphicRaycaster);
  assert.equal(document.world.entities[0].components.GraphicRaycaster, undefined); document.version = 3;
  const raw = structuredClone(document); assert.equal(isSessionSceneDocument(raw), false); store.loadRemoteSceneJson(raw, 'pause', 41, 2); raw.world.entities[1].components.Text.text = 'external'; assert.equal(store.entitySnapshot(2).components.Text.text, '中文');
  const parse = JSON.parse; JSON.parse = (...args) => parse(...args);
  try { assert.equal(typeof receiver.readDocument(publisher.publish(document, 'b', 'same', true), 'b'), 'string'); }
  finally { JSON.parse = parse; }
  const restored = receiver.readDocument(publisher.publish(document, 'c', 'same', true), 'c'); assert.ok(isSessionSceneDocument(restored)); store.loadRemoteSceneJson(restored, 'pause', 41, 3);
}));

test('malformed fragment parsing does not advance the receiver baseline', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc();
  receiver.readDocument(publisher.publish(document, 'a', 'same', true), 'a'); const next = publisher.publish(document, 'b', 'same', true);
  assert.throws(() => receiver.readDocument({ sceneDelta: { ...next.sceneDelta, changed: [[0, '{']] } }, 'bad'));
  assert.deepEqual(receiver.readDocument(next, 'b'), document);
}));
