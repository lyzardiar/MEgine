import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PREFAB_LINK_COMPONENT,
  capturePrefabAsset,
  clonePrefabLinkedComponents,
  findPrefabInstance,
  flattenPrefabNodes,
  parsePrefabAsset,
  serializePrefabAsset,
} from '../src/prefabAsset.ts';

const entities = [
  {
    entity: 10,
    name: 'Panel',
    parent: null,
    siblingIndex: 0,
    active: true,
    components: { RectTransform: { size_delta: [300, 200] } },
  },
  {
    entity: 12,
    name: 'Second',
    parent: 10,
    siblingIndex: 1,
    active: false,
    components: { Text: { text: 'Second' } },
  },
  {
    entity: 11,
    name: 'First',
    parent: 10,
    siblingIndex: 0,
    active: true,
    components: { Text: { text: 'First' } },
  },
];

test('captures ordered hierarchy and round trips the versioned format', () => {
  let id = 0;
  const captured = capturePrefabAsset('Panel', entities, 10, {
    createNodeId: () => `node-${++id}`,
  });
  assert.deepEqual(captured.asset.root.children.map((node) => node.name), ['First', 'Second']);
  assert.equal(captured.asset.root.children[1].active, false);
  const parsed = parsePrefabAsset(serializePrefabAsset(captured.asset));
  assert.deepEqual(parsed, captured.asset);
  assert.equal(flattenPrefabNodes(parsed).length, 3);
});

test('Apply preserves linked node ids but captures new children', () => {
  const linked = structuredClone(entities);
  linked[0].components[PREFAB_LINK_COMPONENT] = {
    source: 'Assets/Prefabs/Panel.prefab', instance: 'i1', node: 'root-id', root: true,
  };
  linked[1].components[PREFAB_LINK_COMPONENT] = {
    source: 'Assets/Prefabs/Panel.prefab', instance: 'i1', node: 'second-id', root: false,
  };
  let id = 0;
  const captured = capturePrefabAsset('Panel', linked, 10, {
    source: 'Assets/Prefabs/Panel.prefab',
    createNodeId: () => `new-${++id}`,
  });
  assert.equal(captured.nodeIds.get(10), 'root-id');
  assert.equal(captured.nodeIds.get(12), 'second-id');
  assert.equal(captured.nodeIds.get(11), 'new-1');
  assert.equal(captured.asset.root.components[PREFAB_LINK_COMPONENT], undefined);
});

test('finds instance root from a linked child and upgrades legacy assets', () => {
  const linked = structuredClone(entities);
  linked[0].components[PREFAB_LINK_COMPONENT] = {
    source: 'Assets/Prefabs/Panel.prefab', instance: 'i1', node: 'root', root: true,
  };
  linked[2].components[PREFAB_LINK_COMPONENT] = {
    source: 'Assets/Prefabs/Panel.prefab', instance: 'i1', node: 'first', root: false,
  };
  assert.equal(findPrefabInstance(linked, 11)?.root, 10);

  const legacy = parsePrefabAsset(JSON.stringify({
    version: 1,
    name: 'Root',
    components: {},
    children: [{ name: 'Child', components: {} }],
  }));
  assert.equal(legacy.root.id, 'root');
  assert.equal(legacy.root.children[0].id, 'node-0');
});

test('rejects duplicate ids and invalid component payloads', () => {
  assert.throws(() => parsePrefabAsset(JSON.stringify({
    version: 1,
    name: 'Bad',
    root: {
      id: 'same', name: 'Root', components: {}, children: [
        { id: 'same', name: 'Child', components: {}, children: [] },
      ],
    },
  })), /duplicate/);
  assert.throws(() => parsePrefabAsset(JSON.stringify({
    version: 1,
    name: 'Bad',
    root: { id: 'root', name: 'Root', components: [], children: [] },
  })), /components must be an object/);
});

test('cloning rekeys complete instances and unpacks partial prefab subtrees', () => {
  const linked = structuredClone(entities);
  linked[0].components[PREFAB_LINK_COMPONENT] = {
    source: 'Assets/Prefabs/Panel.prefab', instance: 'original', node: 'root', root: true,
  };
  linked[2].components[PREFAB_LINK_COMPONENT] = {
    source: 'Assets/Prefabs/Panel.prefab', instance: 'original', node: 'first', root: false,
  };
  const complete = clonePrefabLinkedComponents(linked, { createInstanceId: () => 'copy' });
  assert.equal(complete.get(10)[PREFAB_LINK_COMPONENT].instance, 'copy');
  assert.equal(complete.get(11)[PREFAB_LINK_COMPONENT].instance, 'copy');

  const partial = clonePrefabLinkedComponents([linked[2]], { createInstanceId: () => 'unused' });
  assert.equal(partial.get(11)[PREFAB_LINK_COMPONENT], undefined);

  const moved = clonePrefabLinkedComponents(linked, { preserveInstanceIds: true });
  assert.equal(moved.get(10)[PREFAB_LINK_COMPONENT].instance, 'original');
});

test('capture stores internal persistent-call targets as stable prefab node references', () => {
  const linked = structuredClone(entities);
  linked[0].components.Button = {
    on_click: { target: 11, component: 'Menu', method: 'Open' },
  };
  const captured = capturePrefabAsset('Panel', linked, 10, {
    createNodeId: (() => {
      let id = 0;
      return () => `stable-${++id}`;
    })(),
  });
  assert.deepEqual(captured.asset.root.components.Button.on_click.target, {
    $mengine_entity_ref: { kind: 'prefab_node', node: captured.nodeIds.get(11) },
  });
  assert.deepEqual(parsePrefabAsset(serializePrefabAsset(captured.asset)), captured.asset);
});
