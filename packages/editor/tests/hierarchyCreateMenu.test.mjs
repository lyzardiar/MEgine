import assert from 'node:assert/strict';
import test from 'node:test';
import { filterHierarchyCreateItems } from '../src/hierarchyCreateMenu.ts';

const entry = (path, priority) => {
  const segments = path.split('/');
  return {
    path,
    root: segments[0],
    label: segments.at(-1),
    segments,
    action() {},
    priority,
    separatorBefore: false,
    agentInvokable: false,
  };
};

test('Hierarchy create search prioritizes UI in Canvas context without hiding other categories', () => {
  const entries = [
    entry('GameObject/Create Empty', 0),
    entry('GameObject/3D Object/Cube', 100),
    entry('GameObject/UI/Button', 312),
    entry('GameObject/UI/Scroll View', 321),
  ];
  assert.deepEqual(
    filterHierarchyCreateItems(entries, '', true).map((item) => item.path),
    [
      'GameObject/UI/Button',
      'GameObject/UI/Scroll View',
      'GameObject/Create Empty',
      'GameObject/3D Object/Cube',
    ],
  );
  assert.deepEqual(
    filterHierarchyCreateItems(entries, 'scroll ui', true).map((item) => item.path),
    ['GameObject/UI/Scroll View'],
  );
});
