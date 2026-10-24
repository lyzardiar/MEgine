// Author: MiYu. Check delta baselines, topology, recovery and exact scene semantics.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

async function withModules(run) {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try { await run(await server.ssrLoadModule('/src/sessionSceneSerialization.ts'), await server.ssrLoadModule('/src/store.ts')); }
  finally { await server.close(); }
}
const doc = () => ({ version: 3, name: '地图"\n', world: { entities: [{ entity: 1, components: { Text: { text: '中文\\"\n' } } }, { entity: 2, parent: 1, components: {} }], clearColor: [0, 0, 0, 1], frame: 0 } });

test('clock and one-entity deltas reconstruct the complete document and preserve prior messages', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc();
  const first = publisher.publish(document, 'a', 'map:41', false), original = receiver.read(first, 'a');
  assert.deepEqual(JSON.parse(original), document); assert.equal(first.sceneDelta.changed.length, 2);
  document.world.frame++;
  const clock = publisher.publish(document, 'b', 'map:41', true); assert.equal(clock.sceneDelta.base, 'a'); assert.deepEqual(clock.sceneDelta.changed, []);
  assert.deepEqual(JSON.parse(receiver.read(clock, 'b')), document);
  document.world.entities[0].components.Text.text = 'replacement';
  const edit = publisher.publish(document, 'c', 'map:41', true); assert.deepEqual(edit.sceneDelta.changed.map(([i]) => i), [0]);
  assert.deepEqual(JSON.parse(receiver.read(edit, 'c')), document); assert.equal(JSON.parse(original).world.frame, 0);
  assert.equal(JSON.parse(original).world.entities[0].components.Text.text, '中文\\"\n');
}));

test('insertion, removal, ordering, empty worlds and reused IDs reconstruct exactly', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc(); let state = 0;
  const check = () => { const id = String(++state); assert.deepEqual(JSON.parse(receiver.read(publisher.publish(document, id, 'same', true), id)), document); };
  check(); document.world.entities.reverse(); check(); document.world.entities.push({ entity: 3, components: {} }); check();
  document.world.entities.splice(1, 1); check(); document.world.entities[0] = { entity: 2, components: { Text: { text: 'reused' } } }; check();
  document.world.entities = []; check(); document.world.entities = doc().world.entities; check();
}));

test('missed or reordered deltas require one checkpoint without advancing the accepted baseline', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc();
  receiver.read(publisher.publish(document, 'a', 'same', true), 'a');
  const missing = publisher.publish(document, 'b', 'same', true), next = publisher.publish(document, 'c', 'same', true);
  assert.equal(receiver.read(next, 'c'), undefined); assert.equal(receiver.requestCheckpoint(), true); assert.equal(receiver.requestCheckpoint(), false);
  assert.deepEqual(JSON.parse(receiver.read(missing, 'b')), document); assert.deepEqual(JSON.parse(receiver.read(next, 'c')), document);
  const checkpoint = publisher.publish(document, 'd', 'same', false); assert.equal(checkpoint.sceneDelta.base, null);
  receiver.read(checkpoint, 'd'); assert.equal(receiver.read(next, 'c'), undefined); assert.equal(receiver.requestCheckpoint(), true);
  receiver.read(publisher.publish(document, 'e', 'new-session', true), 'e');
  receiver.read({ sceneJson: JSON.stringify(document) }, 'legacy'); assert.equal(receiver.read(publisher.publish(document, 'f', 'new-session', true), 'f'), undefined);
}));

test('invalid changes never replace the last valid transport baseline', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc();
  receiver.read(publisher.publish(document, 'a', 'same', true), 'a'); const next = publisher.publish(document, 'b', 'same', true);
  for (const changed of [[[2, '{}']], [[0, '{}'], [0, '{}']], [[-1, '{}']], [[0, 42]]]) assert.throws(() => receiver.read({ sceneDelta: { ...next.sceneDelta, changed } }, 'bad'));
  assert.throws(() => receiver.read({ sceneDelta: { ...next.sceneDelta, base: null, changed: [] } }, 'bad'));
  assert.deepEqual(JSON.parse(receiver.read(next, 'b')), document);
}));

test('store checkpoints preserve native revisions and mutable edits switch to complete messages', async () => withModules(async ({ createSessionSceneReceiver }, { createEditorStore }) => {
  const source = createEditorStore(), target = createEditorStore(), receiver = createSessionSceneReceiver();
  source.loadRemoteSceneJson(JSON.stringify(doc()), 'pause', 41, 0);
  const load = (id, allowDelta = true) => { const message = source.publishSessionScene(id, allowDelta, 'Map'); target.loadRemoteSceneJson(receiver.read(message, id), source.mode, source.playSessionId, source.nativePlayRevision); return message; };
  assert.equal(load('a').sceneDelta.base, null); assert.deepEqual(load('b').sceneDelta.changed, []); assert.equal(target.nativePlayRevision, 0);
  source.setComponent(1, 'Text', { text: 'runtime edit' }); assert.equal(typeof load('c').sceneJson, 'string'); assert.equal(target.entitySnapshot(1).components.Text.text, 'runtime edit');
  source.loadRemoteSceneJson(JSON.stringify(doc()), 'pause', 73, 0); assert.equal(load('d').sceneDelta.base, null); assert.equal(target.nativePlaySessionId, 73);
  source.stop(); assert.equal(typeof load('e').sceneJson, 'string'); assert.equal(target.mode, 'edit');
}));

test('custom serialization uses complete JSON and restores a fresh checkpoint afterwards', async () => withModules(({ createSessionScenePublisher, createSessionSceneReceiver }) => {
  const publisher = createSessionScenePublisher(), receiver = createSessionSceneReceiver(), document = doc();
  receiver.read(publisher.publish(document, 'a', 'same', true), 'a');
  Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, value(key) { return key === 'components' ? { marker: 'custom' } : this; } });
  try { const message = publisher.publish(document, 'b', 'same', true); assert.equal(message.sceneJson, JSON.stringify(document)); assert.equal(receiver.read(message, 'b'), message.sceneJson); }
  finally { delete Object.prototype.toJSON; }
  const message = publisher.publish(document, 'c', 'same', true); assert.equal(message.sceneDelta.base, null); assert.deepEqual(JSON.parse(receiver.read(message, 'c')), document);
}));
