import assert from 'node:assert/strict';
import test from 'node:test';

import { executeSaveAllTasks } from '../src/saveAll.ts';

test('save all executes participants in order and reports failures without stopping', async () => {
  const order = [];
  const result = await executeSaveAllTasks([
    { label: 'Scene', run: async () => { order.push('Scene'); } },
    { label: 'Material', run: async () => { order.push('Material'); throw new Error('disk full'); } },
    { label: 'Animator', run: async () => { order.push('Animator'); } },
  ]);
  assert.deepEqual(order, ['Scene', 'Material', 'Animator']);
  assert.deepEqual(result, {
    saved: ['Scene', 'Animator'],
    failures: [{ label: 'Material', error: 'disk full' }],
  });
});
