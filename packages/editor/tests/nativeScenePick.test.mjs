// Author: MiYu. Verify displayed-frame coordinates, click ordering, cancellation and focus after asynchronous selection.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeScenePickQueue, nativeScenePickPoint } from '../src/nativeScenePick.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
test('native picking uses the displayed letterbox and excludes surrounding pixels', () => {
  const frame = { meshPickToken: '7', viewport: { x: 15, y: 30, w: 400, h: 200 } };
  assert.deepEqual(nativeScenePickPoint(frame, 215, 130), [.5, .5]);
  assert.deepEqual(nativeScenePickPoint(frame, 415, 230), [1, 1]);
  for (const point of [[14, 50], [50, 29], [416, 40], [50, 231]]) assert.equal(nativeScenePickPoint(frame, ...point), null);
  assert.equal(nativeScenePickPoint(frame, NaN, 50), null);
});
test('queries start immediately and apply rapid modifier clicks in gesture order before double-click focus', async () => {
  const queue = createNativeScenePickQueue(), a = deferred(), b = deferred(), results = [], started = [];
  queue.enqueue(() => { started.push(1); return a.promise; }, () => true, id => results.push(id), assert.fail);
  queue.enqueue(() => { started.push(2); return b.promise; }, () => true, id => results.push(id), assert.fail);
  const focused = queue.afterPending(() => results.push('focus'));
  assert.deepEqual(started, [1, 2]); b.resolve(2); await Promise.resolve(); assert.deepEqual(results, []);
  a.resolve(1); await focused; assert.deepEqual(results, [1, 2, 'focus']);
});
test('UI gestures, project changes and disposal cancel pending selection and focus', async () => {
  const queue = createNativeScenePickQueue(), a = deferred(), results = [];
  queue.enqueue(() => a.promise, () => true, id => results.push(id), assert.fail);
  const focused = queue.afterPending(() => results.push('focus')); queue.invalidate(); a.resolve(1); await focused;
  assert.deepEqual(results, []);
  queue.enqueue(async () => 2, () => false, id => results.push(id), assert.fail);
  await queue.afterPending(() => results.push('stale focus')); assert.deepEqual(results, []);
  queue.enqueue(async () => 3, () => true, id => results.push(id), assert.fail);
  await queue.afterPending(() => {}); assert.deepEqual(results, [3]);
});
test('expired queries report failure without clearing selection or poisoning later clicks', async () => {
  const queue = createNativeScenePickQueue(), results = [];
  queue.enqueue(async () => { throw 'Scene picking frame expired'; }, () => true, id => results.push(id), error => results.push(error));
  queue.enqueue(async () => null, () => true, id => results.push(id), assert.fail);
  await queue.afterPending(() => {}); assert.deepEqual(results, ['Scene picking frame expired', null]);
  queue.enqueue(async () => { throw 'expired'; }, () => true, assert.fail, () => {});
  await queue.afterPending(() => results.push('expired focus')); assert.deepEqual(results, ['Scene picking frame expired', null]);
});
