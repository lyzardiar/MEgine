import assert from 'node:assert/strict';
import test from 'node:test';
import { recentProjectsRevision } from '../src/recentProjectsRevision.ts';

const first = {
  name: 'First',
  path: 'C:/Projects/First',
  lastOpenedAt: 100,
};
const second = {
  name: 'Second',
  path: 'D:/Projects/Second',
  lastOpenedAt: 200,
};

test('recent project revision covers order, identity, and timestamps', () => {
  const baseline = recentProjectsRevision([first, second]);
  assert.equal(baseline, recentProjectsRevision([first, second]));
  assert.notEqual(baseline, recentProjectsRevision([second, first]));
  assert.notEqual(
    baseline,
    recentProjectsRevision([{ ...first, lastOpenedAt: 300 }, second]),
  );
  assert.notEqual(
    baseline,
    recentProjectsRevision([{ ...first, path: 'E:/Moved/First' }, second]),
  );
  assert.notEqual(baseline, recentProjectsRevision([first]));
});
