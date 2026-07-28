import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExecuteFingerprint,
  IdempotencyConflictError,
  IdempotentRequestCache,
} from '../src/agent/idempotency.ts';

test('duplicate in-flight agent writes share one operation', async () => {
  const cache = new IdempotentRequestCache(8);
  let executions = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const first = cache.run('request-a', 'same', async () => {
    executions += 1;
    await gate;
    return { ok: true, value: 7 };
  });
  const retry = cache.run('request-a', 'same', () => {
    executions += 1;
    return { ok: true, value: 99 };
  });
  release();

  const [initial, replay] = await Promise.all([first, retry]);
  assert.equal(executions, 1);
  assert.deepEqual(initial, {
    value: { ok: true, value: 7 },
    replayed: false,
    fromCompleted: false,
  });
  assert.deepEqual(replay, {
    value: { ok: true, value: 7 },
    replayed: true,
    fromCompleted: false,
  });
});

test('completed writes replay compact results and reject key collisions', async () => {
  const cache = new IdempotentRequestCache(
    8,
    ({ screenshot: _screenshot, ...value }) => value,
  );
  const first = await cache.run('request-b', 'fingerprint-a', async () => ({
    ok: true,
    screenshot: 'large-image',
  }));
  const replay = await cache.run('request-b', 'fingerprint-a', async () => ({
    ok: true,
    screenshot: 'must-not-run',
  }));

  assert.equal(first.value.screenshot, 'large-image');
  assert.equal(replay.fromCompleted, true);
  assert.equal(replay.value.screenshot, undefined);
  await assert.rejects(
    cache.run('request-b', 'fingerprint-b', async () => ({ ok: true })),
    IdempotencyConflictError,
  );
});

test('failed writes remain retryable and the completed cache is bounded', async () => {
  const cache = new IdempotentRequestCache(1);
  let attempts = 0;
  await assert.rejects(
    cache.run('retryable', 'same', async () => {
      attempts += 1;
      throw new Error('temporary');
    }),
    /temporary/,
  );
  await cache.run('retryable', 'same', async () => {
    attempts += 1;
    return 'recovered';
  });
  await cache.run('newer', 'same', async () => 'new');
  const evicted = await cache.run('retryable', 'same', async () => {
    attempts += 1;
    return 'executed-after-eviction';
  });

  assert.equal(attempts, 3);
  assert.equal(evicted.replayed, false);
});

test('execute fingerprints ignore JSON object key order', () => {
  const first = createExecuteFingerprint(
    'entity.set_component',
    { entity: 1, value: { x: 1, y: 2 } },
    { screenshot: false, expectedSceneRevision: 3 },
  );
  const second = createExecuteFingerprint(
    'entity.set_component',
    { value: { y: 2, x: 1 }, entity: 1 },
    { expectedSceneRevision: 3, screenshot: false },
  );
  assert.equal(first, second);
});
