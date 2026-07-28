import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentEventJournal,
  MAX_AGENT_EVENT_WAITERS,
  SceneChangeTracker,
} from '../src/agent/eventJournal.ts';

test('agent event journal uses loss-detecting cursors and deterministic topic paging', () => {
  const journal = new AgentEventJournal(3);
  journal.append('mode.changed', { mode: 'play' }, 10);
  journal.append('selection.changed', { selectedIds: [1] }, 20);
  journal.append('mode.changed', { mode: 'pause' }, 30);
  journal.append('log.added', { message: 'paused' }, 40);
  journal.append('mode.changed', { mode: 'play' }, 50);

  const page = journal.list({
    afterSequence: 0,
    topics: ['mode.changed'],
    limit: 1,
  });
  assert.equal(page.truncated, true);
  assert.equal(page.hasMore, true);
  assert.equal(page.oldestSequence, 3);
  assert.equal(page.nextSequence, 3);
  assert.deepEqual(page.events.map((event) => event.sequence), [3]);

  const drained = journal.list({
    afterSequence: page.nextSequence,
    topics: ['mode.changed'],
    limit: 10,
  });
  assert.equal(drained.hasMore, false);
  assert.equal(drained.nextSequence, 5);
  assert.deepEqual(drained.events.map((event) => event.sequence), [5]);
});

test('agent event waits resolve only for matching topics and report bounded timeouts', async () => {
  const journal = new AgentEventJournal();
  let settled = false;
  const pending = journal.wait({
    afterSequence: 0,
    topics: ['mode.changed'],
    limit: 10,
  }, 1_000).then((page) => {
    settled = true;
    return page;
  });

  journal.append('selection.changed', { selectedIds: [1] }, 10);
  await Promise.resolve();
  assert.equal(settled, false);

  journal.append('mode.changed', { mode: 'play' }, 20);
  const page = await pending;
  assert.equal(page.timedOut, false);
  assert.equal(page.currentSequence, 2);
  assert.equal(page.nextSequence, 2);
  assert.deepEqual(page.events.map((event) => event.sequence), [2]);

  const timeout = await journal.wait({ afterSequence: 2 }, 0);
  assert.equal(timeout.timedOut, true);
  assert.equal(timeout.waitedMs, 0);
  assert.deepEqual(timeout.events, []);
});

test('agent event waits return already-buffered and truncated pages immediately', async () => {
  const journal = new AgentEventJournal(1);
  journal.append('mode.changed', { mode: 'play' });
  const buffered = await journal.wait({ afterSequence: 0 }, 1_000);
  assert.equal(buffered.timedOut, false);
  assert.equal(buffered.waitedMs, 0);
  assert.equal(buffered.events.length, 1);

  journal.append('mode.changed', { mode: 'pause' });
  const truncated = await journal.wait({ afterSequence: 0 }, 1_000);
  assert.equal(truncated.timedOut, false);
  assert.equal(truncated.truncated, true);
});

test('agent event waits are concurrency-bounded and release their slots', async () => {
  const journal = new AgentEventJournal();
  const pending = Array.from({ length: MAX_AGENT_EVENT_WAITERS }, () => journal.wait({
    afterSequence: 0,
    topics: ['mode.changed'],
  }, 1_000));
  assert.throws(
    () => journal.wait({ afterSequence: 0 }, 1_000),
    /event wait limit reached/,
  );
  assert.equal(MAX_AGENT_EVENT_WAITERS, 64);

  journal.append('mode.changed', { mode: 'play' });
  const pages = await Promise.all(pending);
  assert.ok(pages.every((page) => page.timedOut === false));
  const released = await journal.wait({ afterSequence: 1 }, 0);
  assert.equal(released.timedOut, true);
});

test('agent event wait cancellation rejects promptly and releases its slot', async () => {
  const journal = new AgentEventJournal();
  const controller = new AbortController();
  const pending = journal.wait(
    { afterSequence: 0, topics: ['mode.changed'] },
    15_000,
    controller.signal,
  );

  controller.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof Error
      && error.name === 'AbortError'
      && /cancelled/.test(error.message),
  );

  const replacements = Array.from(
    { length: MAX_AGENT_EVENT_WAITERS },
    () => journal.wait(
      { afterSequence: 0, topics: ['mode.changed'] },
      1_000,
    ),
  );
  journal.append('mode.changed', { mode: 'play' });
  await Promise.all(replacements);

  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(
    journal.wait({ afterSequence: 1 }, 1_000, alreadyCancelled.signal),
    { name: 'AbortError' },
  );
});

test('scene changes coalesce into a compact revision diff with current entity payloads', () => {
  const tracker = new SceneChangeTracker();
  const baseline = [
    { entity: 1, name: 'Root', components: { Transform: { x: 0 } } },
    { entity: 2, name: 'Removed', components: {} },
  ];
  assert.equal(tracker.observe('Main', baseline)?.resetRequired, true);
  assert.equal(tracker.revision, 1);

  tracker.observe('Main', [
    { entity: 1, name: 'Root', components: { Transform: { x: 1 } } },
    { entity: 3, name: 'Added', components: {} },
  ]);
  tracker.observe('Main', [
    { entity: 1, name: 'Root', components: { Transform: { x: 2 } } },
    { entity: 3, name: 'Added Renamed', components: {} },
  ]);

  assert.deepEqual(tracker.diff(1, [
    { entity: 1, name: 'Root', components: { Transform: { x: 2 } } },
    { entity: 3, name: 'Added Renamed', components: {} },
  ]), {
    fromRevision: 1,
    toRevision: 3,
    resetRequired: false,
    sceneStateChanged: false,
    sceneState: null,
    added: [3],
    removed: [2],
    changed: [1],
    entities: [
      { entity: 1, name: 'Root', components: { Transform: { x: 2 } } },
      { entity: 3, name: 'Added Renamed', components: {} },
    ],
  });
});

test('scene identity changes and expired revisions require a full reset snapshot', () => {
  const tracker = new SceneChangeTracker(1);
  tracker.observe('Main', [{ entity: 1, name: 'Main Root' }]);
  tracker.observe('Other', [{ entity: 1, name: 'Other Root' }]);
  tracker.observe('Other', [{ entity: 1, name: 'Other Root Updated' }]);

  const diff = tracker.diff(1, [{ entity: 1, name: 'Other Root Updated' }]);
  assert.equal(diff.resetRequired, true);
  assert.equal(diff.toRevision, 3);
  assert.deepEqual(diff.entities, [{ entity: 1, name: 'Other Root Updated' }]);
  assert.equal(diff.sceneStateChanged, true);
  assert.deepEqual(diff.sceneState, {});
});

test('scene-level authored state advances revisions and is returned by incremental diffs', () => {
  const tracker = new SceneChangeTracker();
  const entities = [{ entity: 1, name: 'Root' }];
  tracker.observe('Main', entities, { clearColor: [0, 0, 0, 1] });

  const delta = tracker.observe('Main', entities, { clearColor: [0.1, 0.2, 0.3, 1] });
  assert.equal(delta?.sceneStateChanged, true);
  assert.equal(tracker.revision, 2);
  assert.deepEqual(tracker.diff(
    1,
    entities,
    { clearColor: [0.1, 0.2, 0.3, 1] },
  ), {
    fromRevision: 1,
    toRevision: 2,
    resetRequired: false,
    sceneStateChanged: true,
    sceneState: { clearColor: [0.1, 0.2, 0.3, 1] },
    added: [],
    removed: [],
    changed: [],
    entities: [],
  });
});
