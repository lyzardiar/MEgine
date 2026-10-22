// Author: MiYu. Exercise the native Game request block with deterministic completion and animation timers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import { nativeGameFrameMatchesRequest, nativeGameRequestInterval } from '../src/nativeViewportFrame.ts';

const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const helpers = ts.transpileModule(readFileSync(new URL('../src/nativeViewportRequests.ts', import.meta.url), 'utf8').replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const start = source.indexOf('    const gameRequestKey =');
const end = source.indexOf('    // Native Game requests continue', start);
assert.ok(start >= 0 && end > start);
const requestBlock = ts.transpileModule(`(function (p, now, nativeWorld, presentationKey, requestWorldFrame) { ${source.slice(start, end)} })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const cleanupStart = source.indexOf('    return () => {\n      cancelAnimationFrame(raf);');
const cleanupEnd = source.indexOf('    // eslint-disable-next-line', cleanupStart);
assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart);
const cleanup = ts.transpileModule(`(function () { ${source.slice(cleanupStart, cleanupEnd)} })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const subscription = ts.transpileModule(source.slice(source.indexOf('  useEffect(() => props.subscribeRuntimeFrames'), source.indexOf('  useEffect(() => {', source.indexOf('  useEffect(() => props.subscribeRuntimeFrames'))), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(duration, timerDelay = 0, integerTimers = false, revision) {
  let now = 0, serial = 0, active = 0, maxActive = 0, released = 0;
  const tasks = new Map(), starts = [], uploaded = [];
  const propsRef = { current: { tab: 'game', playing: true, runtimeSessionId: 1, revision, entities: [], clearColor: [0, 0, 0, 1], simulationTime: 0, gameResolution: { width: 1280, height: 720 } } };
  const nativeGameRequestRef = { current: null }, nativeGameFrameRef = { current: null }, lastProfilerFrameRef = { current: 1 };
  const setTimeout = (callback, delay) => { const id = ++serial; tasks.set(id, { callback, at: now + (integerTimers ? Math.trunc(delay) : delay) + (delay === 0 ? timerDelay : 0) }); return id; };
  const env = { window: { __TAURI_INTERNALS__: {}, setTimeout, clearTimeout: id => tasks.delete(id) }, performance: { now: () => now }, propsRef, nativeGameRequestRef, nativeGameFrameRef, lastProfilerFrameRef, vp: { w: 640, h: 360 }, dpr: 1, nativeGpuTimingRevisionRef: { current: 0 }, nativeGameRequestInterval, nativeGameFrameMatchesRequest, nativeGamePreviewSize: () => ({ width: 1280, height: 720 }), currentViewportProps: () => propsRef.current, nativeViewportFrameWorldCurrent: (world, props) => world.runtimeSessionId === props.runtimeSessionId, releaseNativeViewportFrame: () => released++, uploadNativeViewportFrame: buffer => { uploaded.push(buffer); return { profile: { counts: {}, worldRevision: buffer.revision }, image: {}, width: 1280, height: 720 }; }, recordNativeViewportProfile() {}, console: { warn() {} }, raf: 0, cancelAnimationFrame() {} };
  Object.assign(env, { clearTimeout: env.window.clearTimeout, setTimeout, projectGeneration: 0, projectAssetSessionGeneration: () => 0, canvas: { getBoundingClientRect: () => ({ width: env.vp.w, height: env.vp.h }) }, letterbox: () => env.vp, recordOwnedNativeViewportProfile() {} });
  Object.defineProperty(env.window, 'devicePixelRatio', { get: () => env.dpr });
  const context = vm.createContext(env); vm.runInContext(helpers, context);
  nativeGameRequestRef.current = vm.runInContext('createNativeViewportRequestState()', context);
  const request = vm.runInContext(requestBlock, context);
  const paint = () => {
    const p = { ...propsRef.current };
    Object.assign(env, { requestedProps: p, isGame: p.tab === 'game', p, now, presentationKey: JSON.stringify([p.gameResolution, p.gameDisplay, p.timelineCameraPreview]), nativeWorld: { requestKey: () => `${p.runtimeSessionId}:${p.revision ?? (p.playing ? now : 'edit')}`, frameWorld: () => ({ entities: p.entities, sourceEntities: p.entities, runtimeSessionId: p.runtimeSessionId, clearColor: p.clearColor, simulationTime: p.simulationTime }), worldArgs: () => ({ playSessionId: p.runtimeSessionId, playRevision: p.revision }) }, requestWorldFrame: () => {
      starts.push(now); const submission = starts.length; maxActive = Math.max(maxActive, ++active);
      return new Promise((resolve, reject) => { const id = ++serial; tasks.set(id, { at: now + (typeof duration === 'function' ? duration(starts.length) : duration), callback: () => { active--; env.fail ? reject(env.error ?? Error('render failed')) : resolve({ submission, runtimeSessionId: p.runtimeSessionId, revision: p.revision }); } }); });
    } });
    request(p, now, env.nativeWorld, env.presentationKey, env.requestWorldFrame);
  };
  env.paint = paint;
  let notify;
  env.props = { subscribeRuntimeFrames: listener => { notify = listener; return () => { notify = undefined; }; } };
  let unsubscribe;
  env.useEffect = callback => { unsubscribe = callback(); };
  vm.runInContext(subscription, context);
  const clearRequest = vm.runInContext(cleanup, context)();
  const dispose = () => { unsubscribe(); clearRequest(); };
  async function advance(to, animation = true) {
    if (animation) for (let at = Math.ceil((now + .00001) / 16) * 16; at <= to; at += 16) { const id = ++serial; tasks.set(id, { at, callback: paint }); }
    for (;;) {
      const next = [...tasks].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next; now = task.at; tasks.delete(id); task.callback();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    now = to;
  }
  paint();
  return { propsRef, env, starts, uploaded, nativeGameRequestRef, nativeGameFrameRef, dispose, paint, advance, notify: () => notify?.(), get pendingTasks() { return tasks.size; }, get maxActive() { return maxActive; }, get released() { return released; } };
}

test('slow native Game requests continue on completion without waiting for animation', async () => {
  const f = fixture(24); await f.advance(95);
  assert.deepEqual(f.starts, [0, 17, 34, 51, 68, 85]); assert.equal(f.maxActive, 2); f.dispose();
});

test('fast and slow-to-fast requests retain the 60 Hz minimum period', async () => {
  for (const duration of [5, n => n === 1 ? 24 : 1]) {
    const f = fixture(duration); await f.advance(95);
    for (let i = 1; i < f.starts.length; i++) assert.ok(f.starts[i] - f.starts[i - 1] >= 1000 / 60 - 1e-8);
    assert.equal(f.maxActive, typeof duration === 'number' ? 1 : 2); f.dispose();
  }
});

test('animation cancels delayed completion retries instead of duplicating requests', async () => {
  const f = fixture(24, 20); await f.advance(95);
  assert.deepEqual(f.starts, [0, 17, 34, 51, 68, 85]); assert.equal(f.maxActive, 2); f.dispose();
});

test('stopping Play requests one owned edit frame and stops the live completion loop', async () => {
  const f = fixture(24); f.propsRef.current.playing = false; f.propsRef.current.runtimeSessionId = undefined; await f.advance(95);
  assert.equal(f.starts.length, 2); assert.equal(f.nativeGameRequestRef.current.resumeTimer, null); f.dispose();
});

test('switching to Scene cancels the pending completion path', async () => {
  const f = fixture(24, 20); await f.advance(25, false); f.propsRef.current.tab = 'scene'; await f.advance(95);
  assert.equal(f.starts.length, 2); assert.equal(f.nativeGameRequestRef.current.resumeTimer, null); f.dispose();
});

test('integer WebView timers keep fast requests advancing without animation frames', async () => {
  const f = fixture(5, 0, true); await f.advance(95, false);
  assert.deepEqual(f.starts, [0, 17, 34, 51, 68, 85]); assert.equal(f.maxActive, 1); f.dispose();
});

test('unmount cancels the scheduled completion timer', async () => {
  const f = fixture(5); await f.advance(6, false); assert.notEqual(f.nativeGameRequestRef.current.resumeTimer, null);
  f.dispose(); await f.advance(95, false); assert.equal(f.starts.length, 1); assert.equal(f.nativeGameRequestRef.current.resumeTimer, null);
});

test('asset invalidation prevents the old completion from scheduling or uploading', async () => {
  const f = fixture(24); f.nativeGameRequestRef.current.generation++; await f.advance(30, false);
  assert.equal(f.uploaded.length, 0); assert.equal(f.nativeGameRequestRef.current.resumeTimer, null); f.dispose();
});

test('unmount clears its timer and ignores pending native results', async () => {
  const f = fixture(24); f.dispose(); await f.advance(95, false);
  assert.equal(f.starts.length, 1); assert.equal(f.uploaded.length, 0); assert.equal(f.released, 1); assert.equal(f.nativeGameRequestRef.current.resumeTimer, null);
});

test('render errors rely on animation retry and do not create a completion loop', async () => {
  const f = fixture(24); f.env.fail = true; await f.advance(95, false);
  assert.equal(f.starts.length, 2); assert.equal(f.nativeGameRequestRef.current.reportedError, true); assert.equal(f.nativeGameRequestRef.current.resumeTimer, null); f.dispose();
});

test('a restarted session releases old pixels and requests the current session', async () => {
  const f = fixture(24); f.propsRef.current = { ...f.propsRef.current, runtimeSessionId: 2 }; await f.advance(60);
  assert.equal(f.released, 1); assert.ok(f.uploaded.every(buffer => buffer.runtimeSessionId === 2)); assert.equal(f.maxActive, 2); f.dispose();
});

test('exact native revisions reuse pixels and render the newest revision after an in-flight request', async () => {
  const f = fixture(24, 0, false, 0);
  await f.advance(95); assert.equal(f.starts.length, 1); assert.equal(f.nativeGameFrameRef.current.worldRevision, 0);
  f.propsRef.current = { ...f.propsRef.current, revision: 1 }; f.paint();
  f.propsRef.current = { ...f.propsRef.current, revision: 2 }; f.paint();
  await f.advance(145, false);
  assert.deepEqual(f.uploaded.map(buffer => buffer.revision), [0, 1, 2]); assert.equal(f.maxActive, 2); f.dispose();
});

test('resize, DPR, display, session restart and nonrevisioned worlds bypass pixel reuse', async () => {
  const f = fixture(5, 0, true, 0); await f.advance(30, false);
  for (const change of [() => f.env.vp.w++, () => f.env.dpr++, () => f.propsRef.current.gameDisplay = 1, () => f.propsRef.current.runtimeSessionId++, () => f.propsRef.current.revision = undefined]) {
    const before = f.starts.length; change(); f.paint(); await f.advance(before * 30 + 30, false); assert.ok(f.starts.length > before);
  }
  f.dispose();
});

test('simulation completion wakes a reused frame and preserves the pending request deadline', async () => {
  const f = fixture(5, 0, true, 0); await f.advance(20, false); assert.deepEqual(f.starts,[0]);
  f.propsRef.current = {...f.propsRef.current,revision:1}; f.notify(); await f.advance(36,false);
  f.propsRef.current = {...f.propsRef.current,revision:2}; f.notify(); await f.advance(45,false);
  assert.deepEqual(f.starts,[0,20,37]); assert.deepEqual(f.uploaded.map(buffer=>buffer.revision),[0,1,2]); assert.equal(f.maxActive,1); f.dispose();
});

test('full unmount unsubscribes simulation notifications before clearing pending timers', async () => {
  const f=fixture(5,0,true,0); await f.advance(20,false); f.dispose();
  f.propsRef.current={...f.propsRef.current,revision:1}; f.notify(); await f.advance(80,false);
  assert.deepEqual(f.starts,[0]); assert.equal(f.nativeGameRequestRef.current.resumeTimer,null);
});

// MiYu: late failures belong to the request's session and must not disable the current viewport.
test('failed requests from an expired session leave the current Game renderer available', async () => {
  const f = fixture(24); f.env.fail = true; f.propsRef.current = { ...f.propsRef.current, runtimeSessionId: 2 }; await f.advance(25, false);
  assert.equal(f.nativeGameRequestRef.current.reportedError, false); f.env.fail = false; await f.advance(55, false);
  assert.ok(f.uploaded.some(buffer => buffer.runtimeSessionId === 2)); f.dispose();
});


test('out-of-order Game completion never uploads older pixels over a newer owned frame', async () => {
  const f = fixture(n => n === 1 ? 50 : 5);
  await f.advance(60, false);
  assert.equal(f.maxActive, 2); assert.equal(f.released, 1);
  assert.deepEqual(f.uploaded.map(frame => frame.submission), [2, 3, 4]);
  assert.equal(f.nativeGameRequestRef.current.presentedSequence, 4); f.dispose();
});

test('busy and expired native tickets retry without a persistent renderer failure', async () => {
  for (const error of ['offscreen readback busy: all three slots have outstanding tickets', 'Viewport session expired', 'Play session expired']) {
    const f = fixture(5); f.env.fail = true; f.env.error = error;
    await f.advance(6, false); assert.equal(f.nativeGameRequestRef.current.reportedError, false);
    f.env.fail = false; await f.advance(50, false);
    assert.ok(f.uploaded.length > 0); assert.ok(f.starts[1] >= 21); assert.ok(f.maxActive <= 2); f.dispose();
  }
});

test('resize and project changes reject their pending pixels before upload', async () => {
  for (const change of [f => { f.env.vp.w++; }, f => { f.env.projectGeneration = 1; f.env.projectAssetSessionGeneration = () => 1; }]) {
    const f = fixture(50, 0, false, 0); await f.advance(10, false); change(f); f.paint(); await f.advance(65, false);
    assert.equal(f.released, 1); assert.deepEqual(f.uploaded.map(frame => frame.submission), [2]); assert.equal(f.maxActive, 2); f.dispose();
  }
});

test('a permanent early failure cancels its already scheduled second-slot wakeup', async () => {
  const f = fixture(5); f.env.fail = true; await f.advance(80, false);
  assert.equal(f.starts.length, 1); assert.equal(f.nativeGameRequestRef.current.reportedError, true); f.dispose();
});


test('GPU timing publication keeps pending pixel ownership compatible', async () => {
  const f = fixture(50, 0, false, 0); await f.advance(10, false);
  f.env.nativeGpuTimingRevisionRef.current++; f.paint(); await f.advance(70, false);
  assert.equal(f.released, 0); assert.deepEqual(f.uploaded.map(frame => frame.submission), [1, 2]); f.dispose();
});


test('an exact reused revision leaves no hidden-window polling timer', async () => {
  const f = fixture(5, 0, true, 0); await f.advance(1000, false);
  assert.deepEqual(f.starts, [0]); assert.equal(f.pendingTasks, 0); f.dispose();
});
