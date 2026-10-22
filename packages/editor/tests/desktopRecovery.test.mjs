// Author: MiYu. Recovery replies remain small without caching non-canonical worlds or crossing scene sessions.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

test('checkpoint lazy canonical reads, IO failure and queued project/scene changes', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({root, server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent'});
  const previousWindow = globalThis.window;
  const world = id => ({entities: [{entity: id, name: 'Canonical', active: true, components: {}}], frame: 0, sim_frame: 0, elapsed: 0, clear_color: [0, 0, 0, 1], selected: null});
  const project = id => ({projectId: id, projectName: id, projectRoot: `G:/${id}`, revision: 1, documentRevision: 0, saveRevision: 0, dirty: false, scenePath: 'Assets/Scenes/Main.mscene', world: world(1)});
  let host = project('A'), failWrite = false, releaseOpen, openGate;
  const calls = [];
  globalThis.window = {__TAURI_INTERNALS__: {invoke: async (command, args) => {
    calls.push({command, args});
    if (command === 'open_project') { if (openGate) await openGate; host = project(args.root); return structuredClone(host); }
    if (command === 'open_scene') { if (openGate) await openGate; host = {...host, revision: host.revision + 1, scenePath: args.relativePath}; return structuredClone(host); }
    if (command === 'persist_scene_snapshot') { if (openGate) await openGate; host = {...host, revision: host.revision + 1, scenePath: args.relativePath, dirty: false}; return structuredClone(host); }
    if (command === 'get_project_snapshot') return structuredClone(host);
    if (command === 'checkpoint_scene_snapshot') {
      assert.equal(args.projectId, host.projectId); assert.equal(args.scenePath, host.scenePath);
      host = {...host, revision: host.revision + 1, documentRevision: host.documentRevision + 1, dirty: true, world: world(failWrite ? 777 : 99)};
      if (failWrite) throw Error('simulated durable write failure');
      return {revision: host.revision, documentRevision: host.documentRevision, saveRevision: host.saveRevision, dirty: true, recovery: {scenePath: host.scenePath, sceneName: 'Main', recordedAtMs: 1, documentRevision: host.documentRevision, entityCount: 1}};
    }
    throw Error(`Unexpected IPC ${command}`);
  }}};
  try {
    const session = await server.ssrLoadModule('/src/transport/desktopProjectSession.ts');
    await session.startDesktopProject('A');
    const input = JSON.stringify({world: world(1)});
    calls.length = 0;
    assert.equal((await session.checkpointDesktopScene(input)).entityCount, 1);
    assert.deepEqual(calls.map(c => c.command), ['checkpoint_scene_snapshot']);
    assert.equal(session.getDesktopProject().world, undefined);
    assert.equal(JSON.parse(await session.desktopProjectSceneJson()).world.entities[0].entity, 99);
    await session.desktopProjectSceneJson();
    assert.equal(calls.filter(c => c.command === 'get_project_snapshot').length, 1);
    failWrite = true;
    await assert.rejects(session.checkpointDesktopScene(input), /durable write failure/);
    assert.equal(session.getDesktopProject().world, undefined);
    assert.equal(JSON.parse(await session.desktopProjectSceneJson()).world.entities[0].entity, 777);
    failWrite = false;
    openGate = new Promise(resolve => { releaseOpen = resolve; });
    const opening = session.startDesktopProject('B');
    const stale = session.checkpointDesktopScene(input);
    const before = calls.filter(c => c.command === 'checkpoint_scene_snapshot').length;
    releaseOpen(); await opening;
    assert.equal(await stale, null);
    assert.equal(calls.filter(c => c.command === 'checkpoint_scene_snapshot').length, before);
    // Reopening the same scene also invalidates a checkpoint captured against its prior generation.
    openGate = new Promise(resolve => { releaseOpen = resolve; });
    const reopening = session.openDesktopScene('Main');
    const obsolete = session.checkpointDesktopScene(input);
    releaseOpen(); await reopening;
    assert.equal(await obsolete, null);
    assert.equal(calls.filter(c => c.command === 'checkpoint_scene_snapshot').length, before);
    openGate = new Promise(resolve => { releaseOpen = resolve; });
    const saving = session.persistDesktopScene(input, 'Main');
    const editAfterSaveStarted = session.checkpointDesktopScene(input);
    releaseOpen(); await saving;
    assert.ok(await editAfterSaveStarted, 'Edits made during same-scene save still receive recovery');
    openGate = null;
    assert.ok(await session.checkpointDesktopScene(input));
  } finally {
    globalThis.window = previousWindow;
    await server.close();
  }
});
