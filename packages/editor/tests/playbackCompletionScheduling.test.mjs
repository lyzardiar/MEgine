// Author: MiYu. Exercise the App Play loop with native completion and deterministic timers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { advanceFrameDeadline, frameCadenceDelay } from '../src/frameCadence.ts';
import ts from '../node_modules/typescript/lib/typescript.js';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    let lastTick = performance.now();');
const end = source.indexOf('  }, [props.detachedPanel, store]);', start);
assert.ok(start >= 0 && end > start);
const loop = ts.transpileModule(`(function () { ${source.slice(start, end)} })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(duration, completionDelay = 0, wakeDelay = 0) {
  let now = 0, serial = 0, pending = Promise.resolve(), active = 0, maximumActive = 0, completionSchedules = 0;
  const tasks = new Map(), starts = [], deltas = [], refreshes = [], broadcasts = [];
  const schedule = (callback, delay, repeat = false) => { if (delay === 0) completionSchedules++; const id = ++serial; tasks.set(id, { callback, at: now + (delay === 0 ? completionDelay : delay + wakeDelay), interval: repeat ? delay : null }); return id; };
  const store = { mode: 'play', playBusy: false, playGeneration: 1, tick(dt) {
    assert.equal(this.playBusy, false); this.playBusy = true; starts.push(now); deltas.push(dt); maximumActive = Math.max(maximumActive, ++active);
    const generation = this.playGeneration;
    pending = new Promise(resolve => schedule(() => { if (generation === this.playGeneration) this.playBusy = false; active--; resolve(); }, typeof duration === 'function' ? duration(starts.length) : duration));
  }, waitForPlayRuntime() { return pending; } };
  const dispose = vm.runInNewContext(loop, { advanceFrameDeadline, frameCadenceDelay, store, props: { detachedPanel: false }, performance: { now: () => now }, window: { setTimeout: schedule, clearTimeout: id => tasks.delete(id) }, setInterval: (callback, delay) => schedule(callback, delay, true), clearInterval: id => tasks.delete(id), broadcastScene(...args) { broadcasts.push({at:now,args}); }, refresh: value => refreshes.push(value) })();
  async function advance(to) {
    for (;;) {
      const next = [...tasks].filter(([, task]) => task.at <= to).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next; now = task.at;
      if (task.interval == null) tasks.delete(id); else task.at += task.interval;
      task.callback();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    now = to;
  }
  return { store, starts, deltas, refreshes, broadcasts, dispose, advance, get maximumActive() { return maximumActive; }, get completionSchedules() { return completionSchedules; }, externalStep(duration) { assert.equal(store.mode, 'pause'); store.playBusy = true; pending = new Promise(resolve => schedule(() => { store.playBusy = false; resolve(); }, duration)); } };
}

test('overdue native steps resume at completion without waiting for the next interval', async () => {
  const f = fixture(24); await f.advance(95);
  assert.equal(f.starts.length, 4);
  for (let i = 1; i < f.starts.length; i++) assert.ok(Math.abs(f.starts[i] - f.starts[i - 1] - 24) < 1e-8);
  assert.equal(f.maximumActive, 1); assert.ok(f.deltas.every(dt => dt > 0 && dt <= 0.25)); f.dispose();
});

test('fast native steps retain the 60 Hz cadence', async () => {
  const f = fixture(5); await f.advance(95);
  assert.equal(f.starts.length, 5);
  assert.deepEqual(f.starts,[17,34,50,67,84]);
  assert.equal(f.maximumActive, 1); f.dispose();
});

test('completed frames publish deltas at completion and reject retired owner callbacks', async () => {
  const f=fixture(5);await f.advance(21);assert.equal(f.broadcasts.length,0);await f.advance(22);
  assert.deepEqual(f.broadcasts,[{at:22,args:[false,true]}]);
  await f.advance(35);f.store.playGeneration++;await f.advance(39);assert.equal(f.broadcasts.length,1);
  f.dispose();await f.advance(100);assert.equal(f.broadcasts.length,1);
});

test('slow-to-fast steps recover their timebase without burst catch-up', async () => {
  const f = fixture(step => step === 1 ? 24 : 1); await f.advance(75);
  assert.equal(f.starts.length, 4);
  assert.ok(Math.abs(f.starts[1] - f.starts[0] - 24) < 1e-8);
  assert.deepEqual(f.starts,[17,41,50,67]);
  assert.ok(f.deltas.every(dt => dt >= 1 / 120 - 1e-8)); assert.equal(f.maximumActive, 1); f.dispose();
});

test('a delayed completion timer skips missed slots and bounds adjacent steps', async () => {
  const f = fixture(step => step === 1 ? 24 : 1, 20); await f.advance(85);
  assert.deepEqual(f.starts,[17,61,70,84]);
  assert.ok(Math.abs(f.starts[1] - f.starts[0] - 44) < 1e-8);
  assert.ok(f.deltas.every(dt => dt >= 1 / 120 - 1e-8)); assert.equal(f.maximumActive, 1); f.dispose();
});

test('pausing suppresses completion retries and resuming preserves elapsed time', async () => {
  const f = fixture(24); await f.advance(20); f.store.mode = 'pause'; await f.advance(80);
  assert.equal(f.starts.length, 1); f.store.mode = 'play'; await f.advance(90);
  assert.equal(f.starts.length, 2); assert.ok(f.deltas[1] <= 0.017 + 1e-8); f.dispose();
});

test('disposing while a native step is pending prevents further ticks and panel refreshes', async () => {
  const f = fixture(150); await f.advance(20); f.dispose(); await f.advance(200);
  assert.equal(f.starts.length, 1); assert.equal(f.refreshes.length, 0); assert.equal(f.maximumActive, 1);
});

test('an edit-mode transition prevents a completed old step from restarting Play', async () => {
  const f = fixture(24); await f.advance(20); f.store.mode = 'edit'; await f.advance(100);
  assert.equal(f.starts.length, 1); f.dispose();
});

test('a late old step neither publishes panel updates nor schedules ticks for a restarted session', async () => {
  const f = fixture(100); await f.advance(20);
  f.store.playGeneration++; f.store.playBusy = true; await f.advance(140);
  assert.equal(f.starts.length, 1); assert.equal(f.completionSchedules, 0); assert.equal(f.refreshes.length, 0);
  f.store.playBusy = false; await f.advance(155); assert.equal(f.starts.length, 2); f.dispose();
});

test('the loop continues polling a restarted session while the old operation is still pending', async () => {
  const f = fixture(step => step === 1 ? 100 : 1); await f.advance(20);
  f.store.playGeneration++; f.store.playBusy = true; await f.advance(45);
  f.store.playBusy = false; await f.advance(75);
  assert.equal(f.starts.length, 3); assert.ok(f.starts[1] < 116); assert.ok(f.deltas[1] > 0); f.dispose();
});

test('the next loop check respects a restart and its busy startup operation', async () => {
  const f = fixture(step => step === 1 ? 24 : 1, 20); await f.advance(42);
  assert.equal(f.completionSchedules, 1); f.store.playGeneration++; f.store.playBusy = true; await f.advance(59);
  f.store.playBusy = false; await f.advance(65); assert.equal(f.starts.length, 2); f.dispose();
});

test('pause and external single-step retain the loop cadence when Play resumes', async () => {
  const f = fixture(step => step === 1 ? 24 : 1, 20); await f.advance(42);
  assert.equal(f.completionSchedules, 1); f.store.mode = 'pause'; f.externalStep(13); await f.advance(57);
  f.store.mode = 'play'; await f.advance(65); assert.equal(f.starts.length, 2);
  assert.ok(f.deltas[1] >= 1 / 60 - 1e-8); f.dispose();
});


test('late timers preserve the Play timebase rather than accumulating delay', async () => {
  const f=fixture(5,0,1.3);await f.advance(2000);assert.equal(f.starts.length,119);assert.equal(f.maximumActive,1);
  for(let i=0;i<f.starts.length;i++)assert.ok(Math.abs(f.starts[i]-(i+1)*1000/60)<2.31);
  assert.ok(f.deltas.every(dt=>dt>=1/120-1e-8&&dt<=.25));f.dispose();
});

test('a long native stall skips elapsed slots and keeps the simulation delta cap', async () => {
  const f=fixture(n=>n===1?600:1);await f.advance(650);assert.equal(f.starts.length,4);assert.equal(f.maximumActive,1);
  assert.equal(f.deltas[1],.25);for(let i=1;i<f.starts.length;i++)assert.ok(f.starts[i]-f.starts[i-1]>=1000/120-1e-8);f.dispose();
});
