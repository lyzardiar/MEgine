import assert from 'node:assert/strict';
import test from 'node:test';
import { paginateAgentItems } from '../src/agent/pagination.ts';

test('agent pages expose stable continuation cursors without losing tail items', () => {
  const source = Array.from({ length: 7 }, (_, index) => `item-${index}`);
  const first = paginateAgentItems(source, 0, 3);
  const second = paginateAgentItems(source, first.nextOffset, 3);
  const last = paginateAgentItems(source, second.nextOffset, 3);

  assert.deepEqual(first, {
    total: 7,
    offset: 0,
    count: 3,
    nextOffset: 3,
    hasMore: true,
    truncated: true,
    items: ['item-0', 'item-1', 'item-2'],
  });
  assert.deepEqual(
    [...first.items, ...second.items, ...last.items],
    source,
  );
  assert.equal(last.nextOffset, null);
  assert.equal(last.hasMore, false);
  assert.equal(last.truncated, true);
});

test('agent pages return an empty terminal page for an exhausted cursor', () => {
  assert.deepEqual(paginateAgentItems(['only'], 4, 10), {
    total: 1,
    offset: 4,
    count: 0,
    nextOffset: null,
    hasMore: false,
    truncated: true,
    items: [],
  });
});
