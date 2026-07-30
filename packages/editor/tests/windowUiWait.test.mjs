import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForWindowUiChange } from '../src/agent/windowUiWait.ts';

function snapshot(revision) {
  return { snapshotRevision: revision };
}

test('window UI wait returns an already changed semantic snapshot immediately', async () => {
  let inspections = 0;
  const result = await waitForWindowUiChange({
    expectedSnapshotRevision: 'ui-v31-10-0123456789abcdef',
    timeoutMs: 1_000,
    inspect: async () => {
      inspections += 1;
      return snapshot('ui-v31-11-fedcba9876543210');
    },
  });

  assert.equal(inspections, 1);
  assert.equal(result.changed, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.snapshotRevision, 'ui-v31-11-fedcba9876543210');
  assert.equal(result.expectedSnapshotRevision, 'ui-v31-10-0123456789abcdef');
});

test('window UI wait returns the coherent final snapshot on timeout', async () => {
  const revision = 'ui-v31-10-0123456789abcdef';
  const result = await waitForWindowUiChange({
    expectedSnapshotRevision: revision,
    timeoutMs: 0,
    inspect: async () => snapshot(revision),
  });

  assert.equal(result.changed, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.snapshotRevision, revision);
  assert.equal(result.waitedMs, 0);
});

test('window UI wait observes changes after a bounded internal long poll', async () => {
  const original = 'ui-v31-10-0123456789abcdef';
  let inspections = 0;
  const result = await waitForWindowUiChange({
    expectedSnapshotRevision: original,
    timeoutMs: 1_000,
    pollIntervalMs: 0,
    inspect: async () => {
      inspections += 1;
      return snapshot(
        inspections < 3 ? original : 'ui-v31-12-aaaaaaaaaaaaaaaa',
      );
    },
  });

  assert.equal(inspections, 3);
  assert.equal(result.changed, true);
  assert.equal(result.timedOut, false);
});

test('window UI wait releases promptly when its transport request is cancelled', async () => {
  const controller = new AbortController();
  const wait = waitForWindowUiChange({
    expectedSnapshotRevision: 'ui-v31-10-0123456789abcdef',
    timeoutMs: 15_000,
    pollIntervalMs: 10_000,
    signal: controller.signal,
    inspect: async () => snapshot('ui-v31-10-0123456789abcdef'),
  });
  controller.abort();

  await assert.rejects(wait, (error) => {
    assert.equal(error.name, 'AbortError');
    assert.match(error.message, /cancelled/);
    return true;
  });
});
