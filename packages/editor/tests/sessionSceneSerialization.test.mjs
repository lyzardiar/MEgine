// Author: MiYu. Cross-window serialization preserves live edits and committed native metadata.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
async function withModules(run) {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try { await run(await server.ssrLoadModule('/src/store.ts'), await server.ssrLoadModule('/src/sessionSceneSerialization.ts'), await server.ssrLoadModule('/src/playWorldSync.ts')); }
  finally { await server.close(); }
}

test('compact sessions preserve authored format, preferences, runtime changes and detached loads', async () => withModules(async ({ createEditorStore }) => {
  const store = createEditorStore();
  store.loadSceneJson(JSON.stringify({ version: 1, name: 'Map', world: { entities: [{ entity: 1, name: 'Root', components: { Custom: { text: '中文\\"\n世界', values: [1, 2] } } }, { entity: 2, parent: 1, components: {} }] } }));
  const saved = store.saveSceneJson('Map');
  assert.ok(saved.includes('\n  "version"')); assert.deepEqual(JSON.parse(store.saveSessionSceneJson('Map')), JSON.parse(saved));
  assert.ok(store.saveSessionSceneJson('Map').length < saved.length);
  let world, revision = 0;
  store.setPlayRuntime({ retainsWorld: true, sessionId: 41, start: async snapshot => world = { ...snapshot, nativeSessionId: 41, nativeRevision: revision, simulationTime: 0 }, step: async snapshot => world = { ...(snapshot ?? world), frame: world.frame + 1, nativeSessionId: 41, nativeRevision: ++revision, simulationTime: revision / 10 }, stop() {}, onError(error) { throw error; } });
  store.play(); await store.waitForPlayRuntime(); store.pause();
  const first = JSON.parse(store.saveSessionSceneJson('Map'));
  store.selectMany([2], 'replace'); store.setSceneCamera({ yaw: 83 }); store.setComponent(2, 'Text', { text: 'edited' });
  const edited = JSON.parse(store.saveSessionSceneJson('Map'));
  assert.equal(edited.world.entities[1].components.Text.text, 'edited'); assert.deepEqual(edited.world.selectedIds, [2]); assert.equal(edited.sceneCamera.yaw, 83);
  assert.equal(first.world.entities[1].components.Text, undefined);
  store.step(.1); await store.waitForPlayRuntime();
  const json = store.saveSessionSceneJson('Map'), detached = createEditorStore();
  detached.loadRemoteSceneJson(json, 'pause', 41, 1);
  assert.deepEqual(detached.snapshot().entities, store.snapshot().entities); assert.equal(detached.nativePlayRevision, 1);
  assert.equal(JSON.parse(json).world.simulationTime, .1);
  const live = store.playViewportSnapshot().entities; live[0].components.Custom.values.push(3); live.reverse();
  assert.deepEqual(JSON.parse(store.saveSessionSceneJson()).world.entities.map(e => e.entity), [2, 1]);
  assert.deepEqual(JSON.parse(store.saveSessionSceneJson()).world.entities[1].components.Custom.values, [1, 2, 3]);
  store.stop(); assert.deepEqual(JSON.parse(store.saveSceneJson('Map')).world.entities, JSON.parse(saved).world.entities);
  assert.deepEqual(JSON.parse(store.saveSessionSceneJson('Map')), JSON.parse(store.saveSceneJson('Map')));
}));

test('immutable records survive clock changes, replacements, removal, reordering and escaped metadata', async () => withModules(async (_, { createSessionSceneSerializer }, { retainPlayWorld }) => {
  const serialize = createSessionSceneSerializer();
  const a = retainPlayWorld({ entities: [{ entity: 1, components: { Text: { text: '"world":{}\n中文' } } }, { entity: 2, components: {} }], clearColor: [0, 0, 0, 1], frame: 0, selected: null });
  const doc = { version: 1, name: '"world"\n地图', world: { ...a, selectedIds: [] }, sceneCamera: { yaw: 35 }, gameDisplay: 0 };
  for (let frame = 0; frame < 3; frame++) { doc.world.frame = frame; assert.deepEqual(JSON.parse(serialize(doc)), doc); }
  const b = retainPlayWorld({ ...a, entities: [a.entities[1], { entity: 1, components: { Text: { text: 'replacement' } } }] });
  doc.world.entities = b.entities; assert.deepEqual(JSON.parse(serialize(doc)), doc);
  doc.world.entities = [b.entities[1]]; assert.deepEqual(JSON.parse(serialize(doc)), doc);
  doc.world.entities = []; assert.deepEqual(JSON.parse(serialize(doc)), doc);
  assert.deepEqual(JSON.parse(serialize({ world: { entities: [] } })), { world: { entities: [] } });
}));

test('mutable records and customized global serialization never reuse stale fragments', async () => withModules(async (_, { createSessionSceneSerializer }, { retainPlayWorld }) => {
  const serialize = createSessionSceneSerializer(), mutable = { entity: 1, components: { Text: { text: 'before' } } };
  const doc = { world: { entities: [mutable] }, name: 'Map' };
  serialize(doc); mutable.components.Text.text = 'after'; assert.deepEqual(JSON.parse(serialize(doc)), doc);
  doc.world.entities = retainPlayWorld({ entities: [mutable], frame: 0, clearColor: [0, 0, 0, 1], selected: null }).entities;
  const original = serialize(doc);
  Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, value(key) { return key === 'components' ? { marker: 'custom' } : this; } });
  try { assert.equal(serialize(doc), JSON.stringify(doc)); assert.equal(JSON.parse(serialize(doc)).world.entities[0].components.marker, 'custom'); }
  finally { delete Object.prototype.toJSON; }
  assert.equal(serialize(doc), original);
}));
