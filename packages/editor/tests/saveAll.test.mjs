import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeSaveAllTasks,
  mergeSaveAllResults,
  RemoteSaveCoordinator,
} from '../src/saveAll.ts';

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

test('remote save coordinator targets exact peers and scopes out-of-order results', async () => {
  let dispatched = null;
  const coordinator = new RemoteSaveCoordinator(
    (request) => { dispatched = request; },
    100,
    () => 'request-1',
  );
  const pending = coordinator.request([
    { sender: 'material-window', panel: 'material' },
    { sender: 'shader-window', panel: 'shader' },
    { sender: 'material-window', panel: 'ignored-duplicate' },
  ]);

  assert.deepEqual(dispatched, {
    requestId: 'request-1',
    targets: ['material-window', 'shader-window'],
  });
  assert.equal(coordinator.accept('request-1', 'unknown-window', {
    saved: ['Unknown'],
    failures: [],
  }), false);
  assert.equal(coordinator.accept('request-1', 'shader-window', {
    saved: [],
    failures: [{ label: 'Surface Shaders', error: 'invalid source' }],
  }), true);
  assert.equal(coordinator.accept('request-1', 'material-window', {
    saved: ['Materials'],
    failures: [],
  }), true);

  assert.deepEqual(await pending, {
    saved: ['material/Materials'],
    failures: [{ label: 'shader/Surface Shaders', error: 'invalid source' }],
  });
});

test('remote save coordinator reports a bounded timeout for every missing window', async () => {
  const coordinator = new RemoteSaveCoordinator(
    () => undefined,
    5,
    () => 'request-timeout',
  );
  const result = await coordinator.request([
    { sender: 'timeline-window', panel: 'timeline' },
  ]);

  assert.deepEqual(result, {
    saved: [],
    failures: [{
      label: 'timeline',
      error: 'Background editor window did not respond within 5 ms',
    }],
  });
});

test('save all result merging preserves deterministic source order', () => {
  assert.deepEqual(mergeSaveAllResults([
    { saved: ['Local'], failures: [] },
    { saved: ['Remote'], failures: [{ label: 'Remote', error: 'failed' }] },
  ]), {
    saved: ['Local', 'Remote'],
    failures: [{ label: 'Remote', error: 'failed' }],
  });
});
