import assert from 'node:assert/strict';
import test from 'node:test';
import { SerialTaskQueue } from '../src/agent/serialQueue.ts';

test('agent writes run in FIFO order without overlapping', async () => {
  const queue = new SerialTaskQueue();
  const order = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    order.push('first:start');
    active += 1;
    maxActive = Math.max(maxActive, active);
    await firstGate;
    active -= 1;
    order.push('first:end');
    return 1;
  });
  const second = queue.run(async () => {
    order.push('second:start');
    active += 1;
    maxActive = Math.max(maxActive, active);
    active -= 1;
    order.push('second:end');
    return 2;
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(order, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);
  assert.equal(maxActive, 1);
});

test('a rejected agent write does not poison the queue', async () => {
  const queue = new SerialTaskQueue();
  const failed = queue.run(async () => {
    throw new Error('expected failure');
  });
  const recovered = queue.run(async () => 'continued');

  await assert.rejects(failed, /expected failure/);
  assert.equal(await recovered, 'continued');
});
