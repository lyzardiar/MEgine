import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentEventJournal,
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
});
