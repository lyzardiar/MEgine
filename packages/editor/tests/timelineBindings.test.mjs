import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearTimelineBinding,
  moveTimelineBinding,
  parseTimelineBindingTable,
  resetTimelineBindingsOnAssetChange,
  resolveTimelineBinding,
  setTimelineBinding,
} from '../src/timelineBindings.ts';

test('Timeline bindings normalize paths and preserve full decimal entity ids', () => {
  const table = parseTimelineBindingTable(JSON.stringify({
    bindings: { ' Characters\\Hero ': { entity: '4294967298', name: ' Hero ' } },
  }));
  assert.deepEqual({ ...table.bindings }, {
    'Characters/Hero': { entity: '4294967298', name: 'Hero' },
  });
});

test('Timeline bindings assign, resolve, move and clear without editing the asset', () => {
  const bound = setTimelineBinding('{}', 'Characters/Hero', { entity: 2, name: 'Hero' });
  assert.equal(resolveTimelineBinding(bound, 'Characters/Hero', [{ entity: 2, name: 'Renamed' }]).status, 'bound');
  assert.equal(resolveTimelineBinding(bound, 'Characters/Hero', [{ entity: 3 }]).status, 'stale');
  assert.equal(resolveTimelineBinding(
    '{"bindings":{"Characters/Hero":{"entity":"2","name":"Hero","missing":true}}}',
    'Characters/Hero',
    [{ entity: 2 }],
  ).status, 'stale');
  const moved = moveTimelineBinding(bound, 'Characters/Hero', 'Actors/Lead');
  assert.equal(resolveTimelineBinding(moved, 'Actors/Lead', [{ entity: 2 }]).status, 'bound');
  const cleared = clearTimelineBinding(moved, 'Actors/Lead');
  assert.equal(resolveTimelineBinding(cleared, 'Actors/Lead', [{ entity: 2 }]).status, 'legacy');
});

test('Timeline bindings reject unsafe ids, traversal paths and duplicate moves', () => {
  assert.throws(() => setTimelineBinding('{}', '../Hero', { entity: 2 }), /cannot contain/);
  assert.throws(() => setTimelineBinding('{}', 'Hero', { entity: Number.MAX_SAFE_INTEGER + 1 }), /unsigned decimal/);
  const first = setTimelineBinding('{}', 'Hero', { entity: 2 });
  const both = setTimelineBinding(first, 'Camera', { entity: 3 });
  assert.throws(() => moveTimelineBinding(both, 'Hero', 'Camera'), /already exists/);
});

test('changing a Director asset clears bindings while ordinary patches preserve them', () => {
  const current = { asset: 'Assets/A.mtimeline', bindings_json: '{"bindings":{"Hero":{"entity":"2"}}}' };
  assert.deepEqual(resetTimelineBindingsOnAssetChange(current, { time: 1 }), { time: 1 });
  assert.deepEqual(resetTimelineBindingsOnAssetChange(current, { asset: current.asset }), { asset: current.asset });
  assert.deepEqual(resetTimelineBindingsOnAssetChange(current, { asset: 'Assets/B.mtimeline', bindings_json: 'stale' }), {
    asset: 'Assets/B.mtimeline',
    bindings_json: '{}',
  });
});
