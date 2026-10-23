// Author: MiYu. Profile accounting, publication ownership and stale completion rejection.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { playStepTimingStages } from '../src/playStepTiming.ts';
import { nativeViewportTimingSample } from '../src/editorProfiler.ts';

test('simulation stages partition nested measurements and preserve unknown scopes', () => {
  const timing = { sessionId: 9, revision: 3, totalMs: 20, prepareMs: 2, invokeMs: 12, applyMs: 3, acceptMs: 2, native: { workerQueueMs: 2, simulationMs: 4, workerMs: 5, commandMs: 9 } };
  const stages = playStepTimingStages(timing);
  assert.deepEqual(stages.map(stage => stage.ms), [2, 2, 4, 1, 2, 3, 3, 2, 1]);
  assert.equal(stages.reduce((sum, stage) => sum + stage.ms, 0), timing.totalMs);
  const sample = nativeViewportTimingSample({ worldRevision: 2, simulationTiming: timing });
  assert.equal(sample.worldRevision, 2); assert.equal(sample.simulationTiming.revision, 3);
  timing.native.workerMs = 99; assert.equal(sample.simulationTiming.native.workerMs, 5);
  const absent = playStepTimingStages({ sessionId: 9, revision: 4, invokeMs: 10, applyMs: 1 });
  assert.equal(absent[5].ms, undefined); assert.equal(absent[6].ms, 1); assert.equal(absent[8].ms, undefined);
  const bad = playStepTimingStages({ ...timing, prepareMs: NaN, native: { workerQueueMs: -1, simulationMs: 8, workerMs: 3, commandMs: Infinity } });
  for (const i of [0, 1, 3, 4, 5, 8]) assert.equal(bad[i].ms, undefined);
});

test('native and store timings belong to accepted revisions and clear across stop and restart', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const savedWindow = globalThis.window; globalThis.window = {};
  let runtime, clearMocks;
  try {
    const mocks = await server.ssrLoadModule('@tauri-apps/api/mocks'); clearMocks = mocks.clearMocks;
    const { createNativePlayRuntime, emptyPlayInput } = await server.ssrLoadModule('/src/playRuntime.ts');
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore(); let sessionId = 70, revision = 0, pending, entered;
    const snapshot = { entities: [], frame: 0, sim_frame: 0, clear_color: [0, 0, 0, 1] };
    mocks.mockIPC(async (command) => {
      if (command === 'start_editor_play') { revision = 0; return { sessionId: ++sessionId, snapshot }; }
      if (command !== 'step_editor_play') return;
      if (pending) { entered(); await pending; }
      return { snapshot: { ...snapshot, frame: revision + 1, sim_frame: revision + 1 }, baseRevision: revision++, revision, reset: false, timing: { workerQueueMs: 0, simulationMs: 0, workerMs: 0, commandMs: 0 } };
    });
    runtime = createNativePlayRuntime(error => { throw error; }); store.setPlayRuntime(runtime);
    store.play(); await store.waitForPlayRuntime(); store.pause();
    store.step(.1); await store.waitForPlayRuntime();
    const first = store.playRenderSnapshot().simulationTiming;
    assert.equal(first.sessionId, sessionId); assert.equal(first.revision, 1); assert.ok(first.totalMs >= 0);
    for (const key of ['prepareMs', 'invokeMs', 'applyMs', 'acceptMs']) assert.ok(first[key] >= 0);
    assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.native));
    store.step(.1); await store.waitForPlayRuntime(); assert.equal(store.playRenderSnapshot().simulationTiming.revision, 2); assert.equal(first.revision, 1);
    store.stop(); assert.equal(runtime.stepTiming, undefined); assert.equal(store.playRenderSnapshot(), null);
    store.play(); await store.waitForPlayRuntime(); store.pause(); assert.equal(store.playRenderSnapshot().simulationTiming, undefined);
    let release; pending = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { entered = resolve; });
    const old = runtime.step(undefined, emptyPlayInput(), .1); const rejected = assert.rejects(old, /expired/);
    await started; store.stop(); release(); await rejected; assert.equal(runtime.stepTiming, undefined);
    pending = undefined;
  } finally { runtime?.stop(); await new Promise(resolve => setImmediate(resolve)); clearMocks?.(); globalThis.window = savedWindow; await server.close(); }
});
