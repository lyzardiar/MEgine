import assert from 'node:assert/strict';
import test from 'node:test';
import { nextHorizontalTabIndex } from '../src/tabKeyboardNavigation.ts';

test('horizontal tab navigation wraps arrows and honors boundaries', () => {
  assert.equal(nextHorizontalTabIndex(3, 0, 'ArrowLeft'), 2);
  assert.equal(nextHorizontalTabIndex(3, 2, 'ArrowRight'), 0);
  assert.equal(nextHorizontalTabIndex(3, 1, 'Home'), 0);
  assert.equal(nextHorizontalTabIndex(3, 1, 'End'), 2);
});

test('horizontal tab navigation ignores unrelated keys and invalid groups', () => {
  assert.equal(nextHorizontalTabIndex(3, 1, 'ArrowDown'), null);
  assert.equal(nextHorizontalTabIndex(0, 0, 'ArrowRight'), null);
  assert.equal(nextHorizontalTabIndex(-1, 0, 'Home'), null);
  assert.equal(nextHorizontalTabIndex(2.5, 0, 'End'), null);
});
