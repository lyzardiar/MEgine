// Author: MiYu. Remote worlds reuse immutable records while local editable views remain independent.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

async function withStore(run) {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try { const { createEditorStore } = await server.ssrLoadModule('/src/store.ts'); await run(createEditorStore); }
  finally { await server.close(); }
}
const document = () => ({ version: 3, name: 'Remote', world: { entities: [
  { entity: 1, name: 'Root', siblingIndex: 0, active: true, components: { Custom: { values: [1, 2] } } },
  { entity: 2, parent: 1, siblingIndex: 0, name: 'Child', components: { Text: { text: 'child' } } },
], frame: 7, clearColor: [.1, .2, .3, 1], simulationTime: .25, selectedIds: [2] }, sceneCamera: { yaw: 35, pitch: 25, distance: 8, pivot: [0, 0, 0] }, gameResolution: { width: 1280, height: 720 }, gameDisplay: 0 });

test('remote clock updates retain entity roots and isolate native session/revision ownership', async () => withStore(createEditorStore => {
  const store = createEditorStore(), doc = document();
  store.loadRemoteSceneJson(JSON.stringify(doc), 'play', 41, 7);
  const first = store.presentationSnapshot(), reference = store.playRenderSnapshot().nativeWorldReference;
  assert.equal(Object.isFrozen(store.playRenderSnapshot().entities[0]), true);
  doc.world.frame = 8; doc.world.simulationTime = .3;
  store.loadRemoteSceneJson(JSON.stringify(doc), 'pause', 41, 8);
  const next = store.presentationSnapshot();
  assert.equal(next.entities[0], first.entities[0]); assert.equal(next.entities[1], first.entities[1]);
  assert.equal(next.frame, 8); assert.equal(next.simulationTime, .3); assert.deepEqual(next.selectedIds, [2]);
  assert.equal(reference.revision, 7); assert.equal(reference.simulationTime, .25);
  assert.equal(store.nativePlayRevision, 8); assert.equal(store.playRenderSnapshot().nativeWorldReference.revision, 8);
  store.loadRemoteSceneJson(JSON.stringify(doc), 'play', 73, 0);
  assert.equal(store.playRenderSnapshot().nativeWorldReference.sessionId, 73); assert.equal(store.nativePlayRevision, 0);
  store.loadRemoteSceneJson(JSON.stringify(doc), 'pause', 73);
  assert.equal(store.playRenderSnapshot().nativeWorldReference, undefined); assert.equal(store.nativePlayRevision, undefined);
  store.stop();
}));

test('fresh authoritative messages replace exposed mutations without changing retained earlier frames', async () => withStore(createEditorStore => {
  const store = createEditorStore(), json = JSON.stringify(document());
  store.loadRemoteSceneJson(json, 'pause', 41, 7);
  const first = store.presentationSnapshot();
  store.setComponent(2, 'Text', { text: 'Inspector edit' });
  assert.equal(store.entitySnapshot(2).components.Text.text, 'Inspector edit'); assert.equal(store.nativePlaySessionId, undefined);
  store.loadRemoteSceneJson(json, 'pause', 41, 7);
  assert.equal(store.entitySnapshot(2).components.Text.text, 'child'); assert.equal(store.nativePlaySessionId, 41);
  const exposed = store.playViewportSnapshot().entities;
  exposed[0].components.Custom.values.push(99); exposed.reverse(); exposed.pop();
  store.loadRemoteSceneJson(json, 'pause', 41, 8);
  const fresh = store.presentationSnapshot(); assert.deepEqual(fresh.entities.map(e => e.entity), [1, 2]);
  assert.deepEqual(fresh.entities[0].components.Custom.values, [1, 2]); assert.deepEqual(first.entities[0].components.Custom.values, [1, 2]);
  assert.notEqual(store.playViewportSnapshot().entities[0], exposed[0]);
  const authored = store.authoredEntities(); authored[0].components.Custom.values.push(100);
  assert.deepEqual(store.authoredEntities()[0].components.Custom.values, [1, 2]);
  store.stop(); store.setComponent(1, 'Custom', { values: [5] }); assert.deepEqual(store.entitySnapshot(1).components.Custom.values, [5]);
  store.loadRemoteSceneJson(json, 'pause', 41, 9); store.stop();
  assert.deepEqual(store.entitySnapshot(1).components.Custom.values, [1, 2]);
}));

test('topology, entity replacement, metadata and edit-mode snapshots remain authoritative', async () => withStore(createEditorStore => {
  const store = createEditorStore(), doc = document();
  store.loadRemoteSceneJson(JSON.stringify(doc), 'play', 41, 7); const first = store.presentationSnapshot();
  doc.world.entities[1].components.Text.text = 'updated'; doc.world.entities[1].parent = null;
  doc.world.entities[0].active = false; doc.world.entities.reverse(); doc.world.selectedIds = [1];
  doc.world.clearColor = [1, 0, 0, 1]; doc.sceneCamera.yaw = 70; doc.gameDisplay = 1;
  store.loadRemoteSceneJson(JSON.stringify(doc), 'play', 41, 8);
  assert.deepEqual(store.snapshot().entities.map(e => e.entity), [2, 1]); assert.equal(store.entitySnapshot(2).parent, null);
  assert.equal(store.entitySnapshot(1).active, false); assert.equal(store.entitySnapshot(2).components.Text.text, 'updated');
  assert.equal(first.entities[1].components.Text.text, 'child'); assert.equal(store.sceneCamera.yaw, 70); assert.equal(store.gameDisplay, 1);
  doc.world.entities = [{ entity: 2, name: 'Reused ID', components: { Custom: { values: [8] } } }]; doc.world.selectedIds = [1, 2];
  store.loadRemoteSceneJson(JSON.stringify(doc), 'pause', 42, 0);
  assert.equal(store.snapshot().entities.length, 1); assert.equal(store.entitySnapshot(2).components.Text, undefined); assert.deepEqual(store.selectedIds, [2]);
  doc.world.entities = []; store.loadRemoteSceneJson(JSON.stringify(doc), 'pause', 42, 1); assert.equal(store.snapshot().entities.length, 0);
  store.loadRemoteSceneJson(JSON.stringify(document()), 'edit'); assert.equal(store.mode, 'edit'); assert.equal(store.nativePlaySessionId, undefined);
  store.setComponent(1, 'Custom', { values: [7] }); assert.deepEqual(store.entitySnapshot(1).components.Custom.values, [7]);
}));

test('remote legacy document migration and mutable custom component values retain prior semantics', async () => withStore(createEditorStore => {
  const store = createEditorStore(), doc = document(); doc.version = 1;
  doc.world.entities[0].components.Canvas = {};
  store.loadRemoteSceneJson(JSON.stringify(doc), 'pause', 41, 0);
  assert.ok(store.entitySnapshot(1).components.GraphicRaycaster);
  const first = store.presentationSnapshot(); store.loadRemoteSceneJson(JSON.stringify(doc), 'pause', 41, 1);
  assert.equal(store.presentationSnapshot().entities[0], first.entities[0]);
  store.stop();
}));
