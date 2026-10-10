// Author: MiYu. Compare actual EditorStore/native-driver publication against a fixed Git baseline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { createServer } = await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url)), iterations = Number(process.argv[2] ?? 20), base = process.argv[3] ?? '428f4d8d92db832780c5599fbe3fb7ee30ac8089';
assert.ok(Number.isSafeInteger(iterations) && iterations > 0);
const files = ['store.ts', 'playRuntime.ts', 'playWorldSync.ts'], sources = new Map(files.map(file => [file, execFileSync('git', ['show', `${base}:packages/editor/src/${file}`], { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })]));
const scene = fs.readFileSync(path.join(repo, 'samples/frostbound-realms/Assets/Scenes/Main.mscene'), 'utf8'), savedWindow = globalThis.window;
globalThis.window = {};
const contexts = [], samples = { before: [], after: [] }, outputs = {}, median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let comparisons = 0;
try {
  for (const name of ['before', 'after']) {
    const server = await createServer({ root: path.join(repo, 'packages/editor'), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true }, plugins: name === 'before' ? [{ name: 'fixed-git-baseline', enforce: 'pre', load(id) { const clean = id.replaceAll('\\', '/').split('?')[0]; for (const [file, source] of sources) if (clean.endsWith(`/packages/editor/src/${file}`)) return source; } }] : [] });
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts'), { createNativePlayRuntime } = await server.ssrLoadModule('/src/playRuntime.ts'), mocks = await server.ssrLoadModule('@tauri-apps/api/mocks');
    const store = createEditorStore(); store.loadSceneJson(scene);
    const initial = store.snapshot(), authored = store.authoredEntities(), targets = authored.filter(entity => entity.components.Transform).slice(0, 4), host = (entities, frame) => ({ entities: entities.map(entity => ({ ...entity, sibling_index: entity.siblingIndex })), frame, sim_frame: frame, elapsed: frame / 10, clear_color: initial.clearColor.slice(), selected: initial.selected });
    let revision = 0;
    const ipc = (cmd, args) => {
      if (cmd === 'start_editor_play') return { sessionId: 41, snapshot: host(structuredClone(authored), 0) };
      if (cmd === 'step_editor_play') {
        assert.equal(args.snapshot, undefined, 'unchanged live world must use a revision');
        const changed = structuredClone(targets); for (const entity of changed) entity.components.Transform.position[0] += (revision + 1) / 10;
        return { snapshot: host(changed, revision + 1), baseRevision: revision, revision: ++revision, reset: false };
      }
    };
    mocks.mockIPC(ipc); const runtime = createNativePlayRuntime(error => { throw error; }); store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
    contexts.push({ name, server, store, mocks, ipc, targets: targets.map(entity => entity.entity) });
  }
  for (let i = 0; i < iterations + 2; i++) {
    for (const name of i % 2 ? ['after', 'before'] : ['before', 'after']) {
      const context = contexts.find(context => context.name === name), { store, mocks, ipc } = context; mocks.mockIPC(ipc);
      const previous = store.playViewportSnapshot().entities, started = performance.now(); assert.equal(store.step(.1), true); await store.waitForPlayRuntime(); const publicationMs = performance.now() - started;
      const lookupStarted = performance.now(), session = store.nativePlaySessionId, sessionLookupMs = performance.now() - lookupStarted; assert.equal(session, 41);
      const current = store.playViewportSnapshot().entities, reusedEditableRecords = current.filter((entity, index) => entity === previous[index]).length;
      if (name === 'after') assert.equal(reusedEditableRecords, current.length - context.targets.length);
      outputs[name] = { snapshot: store.snapshot(), reference: store.playViewportSnapshot().nativeWorldReference };
      if (i >= 2) samples[name].push({ publicationMs, sessionLookupMs, reusedEditableRecords });
    }
    assert.deepEqual(outputs.after, outputs.before); comparisons++;
  }
  console.log(JSON.stringify({ author: 'MiYu', baseCommit: base, scope: 'Real 24,671-entity Frostbound EditorStore and createNativePlayRuntime with mocked IPC deltas affecting four records; includes Behaviour tick, live equality, updater and publication. Excludes native scripts, IPC transport, React, GPU and native FPS.', sourceSceneSha256: createHash('sha256').update(scene).digest('hex'), entities: contexts[0].store.authoredEntities().length, changedRecordsPerDelta: 4, iterations, warmups: 2, fullWorldComparisons: comparisons, outputEqual: true, mediansMs: Object.fromEntries(['before', 'after'].map(name => [name, { publication: median(samples[name].map(sample => sample.publicationMs)), sessionLookup: median(samples[name].map(sample => sample.sessionLookupMs)) }])), samples }));
} finally {
  for (const { store, mocks, ipc, server } of contexts) { mocks.mockIPC(ipc); store.stop(); await new Promise(resolve => setImmediate(resolve)); mocks.clearMocks(); await server.close(); }
  globalThis.window = savedWindow;
}
