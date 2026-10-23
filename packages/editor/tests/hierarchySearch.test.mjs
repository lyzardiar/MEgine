// Author: MiYu. Search results keep direct matches, ancestor context and current entity metadata.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterHierarchyTree,
  fuzzyHierarchyMatch,
  hierarchyEntityMatches,
  hierarchySearchTokens,
  searchHierarchyTree,
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

test('combined search distinguishes matching badges from shared ancestors and preserves sibling order', () => {
  const entities = [entity(4,'Target B',2,1,{Image:{}}),entity(1,'Canvas',null,0,{Canvas:{}}),entity(3,'Target A',2,0,{Image:{}}),entity(2,'HUD',1,0,{RectTransform:{}}),entity(5,'Other',null,1,{})];
  const result=searchHierarchyTree(entities,'t:IMAGE target');
  assert.deepEqual([...result.matches],[4,3]);
  assert.deepEqual(result.nodes.map(n=>[n.entity.entity,n.depth,n.expanded,n.hasChildren]),[[1,0,true,true],[2,1,true,true],[3,2,false,false],[4,2,false,false]]);
  assert.equal(result.nodes[2].entity,entities[2]);
  assert.deepEqual(filterHierarchyTree(entities,'t:IMAGE target'),result.nodes);
});

test('search observes in-place metadata changes and handles missing parents and parent cycles', () => {
  const target=entity(1,'精灵 Archer',null,0,{MeshRenderer:{},__private:{}},'Units',5);
  const entities=[target,entity(2,'Orphan',99,0,{}),entity(3,'Cycle A',4,0,{}),entity(4,'Cycle B',3,0,{})];
  assert.deepEqual([...searchHierarchyTree(entities,'精灵 t:mesh tag:unit layer:5').matches],[1]);
  assert.equal(searchHierarchyTree(entities,'t:private').matches.size,0);
  target.name='Updated';target.components={Image:{}};target.tag='UI';target.layer=2;
  assert.equal(searchHierarchyTree(entities,'精灵 t:mesh').matches.size,0);
  assert.deepEqual([...searchHierarchyTree(entities,'updated type:image tag:ui layer:2').matches],[1]);
  assert.deepEqual(searchHierarchyTree(entities,'orphan').nodes.map(n=>[n.entity.entity,n.depth]),[[2,0]]);
  const cycle=searchHierarchyTree(entities,'cycle');assert.deepEqual([...cycle.matches],[3,4]);assert.deepEqual(cycle.nodes,[]);
  assert.deepEqual(searchHierarchyTree(entities,'  '),{nodes:[],matches:new Set()});
  assert.equal(searchHierarchyTree(entities,'t:').matches.size,4);
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
