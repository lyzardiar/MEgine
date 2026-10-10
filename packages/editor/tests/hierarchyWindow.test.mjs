// Author: MiYu. Large hierarchies render a bounded row window and retain keyboard destinations.
import assert from 'node:assert/strict';
import test from 'node:test';
import {hierarchyWindow, hierarchyScrollTo} from '../src/hierarchyWindow.ts';
test('90k rows stay bounded at both ends, with one pinned rename input', () => {
  for (const top of [0, 24000, 90000 * 24]) {
    const {top:clamped, indices} = hierarchyWindow(90000, top, 480, 50000);
    assert.ok(indices.length <= 37);
    assert.ok(indices.includes(50000));
    assert.ok(indices.every(i => i >= 0 && i < 90000));
    assert.ok(clamped <= 90000 * 24 - 480);
  }
  assert.deepEqual(hierarchyWindow(0, 500, 400).indices, []);
});
test('navigation scrolls to virtual destinations and fold changes clamp the scroll', () => {
  assert.equal(hierarchyScrollTo(89999, 0, 480), 90000 * 24 - 480);
  assert.equal(hierarchyScrollTo(0, 500, 480), 0);
  assert.equal(hierarchyScrollTo(20, 480, 480), 480);
  assert.equal(hierarchyWindow(10, 900000, 120).top, 120);
});
