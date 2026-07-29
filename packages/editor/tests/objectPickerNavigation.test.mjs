import assert from 'node:assert/strict';
import test from 'node:test';

import { nextObjectPickerOptionIndex } from '../src/objectPickerNavigation.ts';

test('Object Picker arrow navigation wraps and recovers from no active option', () => {
  assert.equal(nextObjectPickerOptionIndex(3, -1, 'ArrowDown'), 0);
  assert.equal(nextObjectPickerOptionIndex(3, -1, 'ArrowUp'), 2);
  assert.equal(nextObjectPickerOptionIndex(3, 0, 'ArrowUp'), 2);
  assert.equal(nextObjectPickerOptionIndex(3, 2, 'ArrowDown'), 0);
});

test('Object Picker boundary and page navigation stays within available options', () => {
  assert.equal(nextObjectPickerOptionIndex(25, 12, 'Home'), 0);
  assert.equal(nextObjectPickerOptionIndex(25, 12, 'End'), 24);
  assert.equal(nextObjectPickerOptionIndex(25, 12, 'PageDown'), 22);
  assert.equal(nextObjectPickerOptionIndex(25, 12, 'PageUp'), 2);
  assert.equal(nextObjectPickerOptionIndex(25, 23, 'PageDown'), 24);
  assert.equal(nextObjectPickerOptionIndex(25, 1, 'PageUp'), 0);
});

test('Object Picker navigation rejects empty counts and sanitizes invalid cursors', () => {
  assert.equal(nextObjectPickerOptionIndex(0, 0, 'ArrowDown'), -1);
  assert.equal(nextObjectPickerOptionIndex(-1, 0, 'End'), -1);
  assert.equal(nextObjectPickerOptionIndex(4, 99, 'PageDown'), 0);
  assert.equal(nextObjectPickerOptionIndex(4, Number.NaN, 'PageUp'), 3);
  assert.equal(nextObjectPickerOptionIndex(20, 10, 'PageDown', 3), 13);
  assert.equal(nextObjectPickerOptionIndex(20, 10, 'PageUp', 3), 7);
});
