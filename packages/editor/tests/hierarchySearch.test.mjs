import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterHierarchyTree,
  fuzzyHierarchyMatch,
  hierarchyEntityMatches,
  hierarchySearchTokens,
} from '../src/hierarchySearch.ts';

const entity = (id, name, parent, siblingIndex, components, tag = 'Untagged', layer = 0) => ({
  entity: id,
  name,
  parent,
  siblingIndex,
  active: true,
  tag,
  layer,
  components,
});

test('hierarchy search parses field filters and supports ordered fuzzy text', () => {
  assert.deepEqual(hierarchySearchTokens('player t:Sprite tag:UI layer:5'), [
    { field: 'text', value: 'player' },
    { field: 'type', value: 'sprite' },
    { field: 'tag', value: 'ui' },
    { field: 'layer', value: '5' },
  ]);
  assert.equal(fuzzyHierarchyMatch('Player Health Bar', 'phb'), true);
  assert.equal(fuzzyHierarchyMatch('Player Health Bar', 'camera'), false);
});

test('hierarchy search matches metadata and keeps ancestor context for collapsed branches', () => {
  const entities = [
    entity(1, 'Canvas', null, 0, { Canvas: {} }),
    entity(2, 'HUD', 1, 0, { RectTransform: {} }),
    entity(3, 'Player Health', 2, 0, { RectTransform: {}, Image: {} }, 'Gameplay', 5),
    entity(4, 'World Camera', null, 1, { Camera3D: {} }),
  ];
  assert.equal(hierarchyEntityMatches(entities[2], 'health t:image tag:game layer:5'), true);
  assert.deepEqual(
    filterHierarchyTree(entities, 't:image').map((node) => [node.entity.entity, node.depth]),
    [[1, 0], [2, 1], [3, 2]],
  );
});
