import assert from 'node:assert/strict';
import test from 'node:test';

import { nextMenuItemIndex } from '../src/menuKeyboardNavigation.ts';

test('menu arrow navigation wraps through enabled items', () => {
  assert.equal(nextMenuItemIndex(3, -1, 'ArrowDown'), 0);
  assert.equal(nextMenuItemIndex(3, -1, 'ArrowUp'), 2);
  assert.equal(nextMenuItemIndex(3, 2, 'ArrowDown'), 0);
  assert.equal(nextMenuItemIndex(3, 0, 'ArrowUp'), 2);
});

test('menu boundary navigation selects the first and last item', () => {
  assert.equal(nextMenuItemIndex(4, 2, 'Home'), 0);
  assert.equal(nextMenuItemIndex(4, 1, 'End'), 3);
});

test('menu navigation rejects empty lists and sanitizes stale indexes', () => {
  assert.equal(nextMenuItemIndex(0, 0, 'ArrowDown'), -1);
  assert.equal(nextMenuItemIndex(-1, 0, 'End'), -1);
  assert.equal(nextMenuItemIndex(2, 99, 'ArrowDown'), 0);
  assert.equal(nextMenuItemIndex(2, Number.NaN, 'ArrowUp'), 1);
});
