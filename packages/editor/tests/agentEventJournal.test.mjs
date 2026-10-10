import assert from 'node:assert/strict';
import test from 'node:test';
import {createPlayWorldSync} from '../src/playWorldSync.ts';
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

test('scene signatures detect live nested edits and isolate returned payloads across id reuse', () => {
  const tracker = new SceneChangeTracker();
  const entities = [{ entity: 1, components: { Transform: { position: [0, 0, 0] } } }];
  tracker.observe('Main', entities);
  assert.equal(tracker.observe('Main', entities), null);
  entities[0].components.Transform.position[0] = 4;
  assert.deepEqual(tracker.observe('Main', entities).changed, [1]);
  const diff = tracker.diff(1, entities);
  diff.entities[0].components.Transform.position[0] = 999;
  assert.equal(tracker.diff(1, entities).entities[0].components.Transform.position[0], 4);
  const reset = tracker.diff(0, entities);
  reset.entities[0].components.Transform.position[1] = 999;
  assert.equal(entities[0].components.Transform.position[1], 0);
  assert.equal(tracker.observe('Main', entities), null);
  assert.deepEqual(tracker.observe('Main', []).removed, [1]);
  assert.deepEqual(tracker.observe('Main', entities).added, [1]);
  assert.deepEqual(tracker.diff(2, entities).changed, [1]);
  assert.throws(() => tracker.observe('Main', [...entities, entities[0]]), /duplicate entity id/);
  assert.equal(tracker.observe('Main', entities), null);
});

test('immutable Play signatures reuse records, retain independent tracker caches and reset across ID reuse', () => {
  const sync=createPlayWorldSync(),live=[{entity:1,components:{Custom:{value:1}}},{entity:2,components:{}}],color=[0,0,0,1];
  sync.capture(live,color);const first=sync.viewportSnapshot().entities,tracker=new SceneChangeTracker(),calls=new Map(),stringify=JSON.stringify;
  JSON.stringify=function(value,...args){if(first.includes(value)||value===changed)calls.set(value,(calls.get(value)||0)+1);return stringify.call(this,value,...args);};
  let changed;
  try {
    tracker.observe('Main',first);assert.equal(tracker.observe('Main',first),null);assert.equal(calls.get(first[0]),1);assert.equal(calls.get(first[1]),1);
    live[0].components.Custom.value=3;sync.capture(live,color);const second=sync.viewportSnapshot().entities;changed=second[0];
    assert.deepEqual(tracker.observe('Main',second).changed,[1]);assert.equal(calls.get(first[1]),1);assert.equal(calls.get(changed),1);assert.equal(tracker.observe('Main',second),null);
    const diff=tracker.diff(1,second);assert.equal(diff.entities[0].components.Custom.value,3);diff.entities[0].components.Custom.value=9;assert.equal(changed.components.Custom.value,3);
    assert.equal(tracker.observe('Other',second).resetRequired,true);assert.equal(calls.get(changed),1);
    assert.equal(tracker.observe('Other',second,{clearColor:[.2,0,0,1]}).sceneStateChanged,true);
    assert.throws(()=>tracker.observe('Other',[...second,second[0]]),/duplicate entity id/);
    assert.throws(()=>tracker.observe('Other',[{entity:NaN}]),/invalid.*entity id/);
    assert.deepEqual(tracker.observe('Other',[second[1]]).removed,[1]);assert.deepEqual(tracker.observe('Other',second).added,[1]);
    const another=new SceneChangeTracker();another.observe('Main',second);assert.equal(calls.get(changed),2);
    tracker.reset();assert.equal(tracker.revision,0);tracker.observe('Main',second);assert.equal(calls.get(changed),3);
    assert.equal(first[0].components.Custom.value,1);
  } finally {JSON.stringify=stringify;}
});

test('ordinary and shallow-frozen records still detect nested edits, getters and custom JSON values', () => {
  const tracker=new SceneChangeTracker(),nested={value:1},record=Object.freeze({entity:1,components:{Custom:nested}});let getterValue=1,jsonValue=1;
  const getter=Object.freeze({entity:2,get name(){return 'Value '+getterValue;}}),custom=Object.freeze({entity:3,toJSON(){return {entity:3,name:'JSON '+jsonValue};}});
  const entities=[record,getter,custom];tracker.observe('Main',entities);assert.equal(tracker.observe('Main',entities),null);
  nested.value=4;getterValue=2;jsonValue=3;assert.deepEqual(tracker.observe('Main',entities).changed,[1,2,3]);assert.equal(tracker.observe('Main',entities),null);
});

test('prototype JSON hooks cannot make retained serialization caches hide changes', () => {
  const sync=createPlayWorldSync();sync.capture([{entity:1,components:{Custom:{values:[1]}}}],[0,0,0,1]);const entities=sync.viewportSnapshot().entities,record=entities[0],array=record.components.Custom.values,tracker=new SceneChangeTracker();
  tracker.observe('Main',entities);let value=2;
  const objectHook=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON'),arrayHook=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  try {
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){return this===record?{entity:1,name:'Object '+value}:this;}});
    assert.deepEqual(tracker.observe('Main',entities).changed,[1]);value=3;assert.deepEqual(tracker.observe('Main',entities).changed,[1]);
    if(objectHook)Object.defineProperty(Object.prototype,'toJSON',objectHook);else delete Object.prototype.toJSON;
    assert.deepEqual(tracker.observe('Main',entities).changed,[1]);
    Object.defineProperty(Array.prototype,'toJSON',{configurable:true,value(){return this===array?[value]:this;}});
    assert.deepEqual(tracker.observe('Main',entities).changed,[1]);value=4;assert.deepEqual(tracker.observe('Main',entities).changed,[1]);
  } finally {
    if(objectHook)Object.defineProperty(Object.prototype,'toJSON',objectHook);else delete Object.prototype.toJSON;
    if(arrayHook)Object.defineProperty(Array.prototype,'toJSON',arrayHook);else delete Array.prototype.toJSON;
  }
  assert.deepEqual(tracker.observe('Main',entities).changed,[1]);assert.equal(tracker.observe('Main',entities),null);
});

test('mutable record serialization can change prototype JSON hooks before a retained record in the same batch', () => {
  const sync=createPlayWorldSync();sync.capture([{entity:1,name:'Retained'}],[0,0,0,1]);const record=sync.viewportSnapshot().entities[0],tracker=new SceneChangeTracker();let install=false;
  const hook=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  const installer={entity:2,toJSON(){if(install)Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){return this===record?{entity:1,name:'Hook value'}:this;}});return {entity:2};}};
  try {
    tracker.observe('Main',[installer,record]);install=true;assert.deepEqual(tracker.observe('Main',[installer,record]).changed,[1]);
  } finally {if(hook)Object.defineProperty(Object.prototype,'toJSON',hook);else delete Object.prototype.toJSON;}
});
