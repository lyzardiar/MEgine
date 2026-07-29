import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeSaveAllTasks,
  mergeSaveAllResults,
  registerSaveDocumentParticipant,
  RemoteSaveCoordinator,
  sameSaveDocumentPath,
  saveResourceDocument,
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

test('remote save coordinator includes exact document paths only when requested', async () => {
  let dispatched = null;
  const coordinator = new RemoteSaveCoordinator(
    (request) => { dispatched = request; },
    100,
    () => 'request-document',
  );
  const pending = coordinator.request(
    [{ sender: 'material-window', panel: 'material' }],
    ['Assets/Materials/Target.mmat'],
  );

  assert.deepEqual(dispatched, {
    requestId: 'request-document',
    targets: ['material-window'],
    paths: ['Assets/Materials/Target.mmat'],
  });
  coordinator.accept('request-document', 'material-window', {
    saved: ['Assets/Materials/Target.mmat'],
    failures: [],
  });
  assert.deepEqual(await pending, {
    saved: ['material/Assets/Materials/Target.mmat'],
    failures: [],
  });
});

test('save resource document executes only the exact claimed document task', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const saved = [];
  const cleanups = [
    registerSaveDocumentParticipant('Materials', (path) => (
      sameSaveDocumentPath(path, 'Assets/Materials/Target.mmat')
        ? async () => { saved.push(path); }
        : null
    )),
    registerSaveDocumentParticipant('Shaders', (path) => (
      sameSaveDocumentPath(path, 'Assets/Shaders/Other.mshader')
        ? async () => { saved.push(path); }
        : null
    )),
  ];
  try {
    assert.deepEqual(
      await saveResourceDocument('assets\\materials\\TARGET.mmat'),
      { saved: ['assets\\materials\\TARGET.mmat'], failures: [] },
    );
    assert.deepEqual(saved, ['assets\\materials\\TARGET.mmat']);
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('save resource document rejects ambiguous editor ownership without writing', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  let runs = 0;
  const cleanups = [
    registerSaveDocumentParticipant('First', () => async () => { runs += 1; }),
    registerSaveDocumentParticipant('Second', () => async () => { runs += 1; }),
  ];
  try {
    const result = await saveResourceDocument('Assets/Duplicate.mmat');
    assert.deepEqual(result.saved, []);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].error, /Multiple resource editors claimed/);
    assert.equal(runs, 0);
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
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
