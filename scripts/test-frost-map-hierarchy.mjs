// Author: MiYu. Map grouping preserves geometry, activation, IDs and existing model subtrees.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { groupMapScene } from './frost-map-hierarchy.mjs';
import { buildWorldTransforms } from '../packages/editor/src/worldTransform.ts';

test('Amazonia grouping preserves every authored world transform and model subtree', () => {
  const scene = JSON.parse(fs.readFileSync('samples/frostbound-realms/Assets/Maps/amazonia/Scenes/Main.mscene'));
  const before = structuredClone(scene.world.entities), world = buildWorldTransforms(before), count = before.length;
  groupMapScene(scene);
  const after = buildWorldTransforms(scene.world.entities);
  for (const entity of before) {
    assert.deepEqual(after.get(entity.entity), world.get(entity.entity), entity.name);
    const actual = scene.world.entities.find(e => e.entity === entity.entity);
    assert.deepEqual(actual.components, entity.components);
    if (entity.parent != null) assert.equal(actual.parent, entity.parent);
  }
  assert.equal(new Set(scene.world.entities.map(e => e.entity)).size, scene.world.entities.length);
  const grouped = structuredClone(scene); groupMapScene(scene); assert.deepEqual(scene, grouped, 'idempotent');
  assert.ok(scene.world.entities.filter(e => e.parent == null).length < 10);
  assert.ok(scene.world.entities.length >= count);
});

test('negative coordinates, sparse IDs and inactive roots retain identity grouping', () => {
  const scene = {world:{entities:[{entity:100,name:'Doodad-1',active:false,components:{Transform:{position:[-1,2,-33]}}},{entity:8,name:'Doodad-1-part',parent:100,components:{}},{entity:101,name:'Camera',components:{}},{entity:3,name:'Unit-1',components:{}}]}};
  groupMapScene(scene); const entities=scene.world.entities,root=entities[0],parent=entities.find(e=>e.entity===root.parent);
  assert.equal(parent.name,'区域 -1, -2'); assert.equal(root.active,false); assert.equal(entities[1].parent,100); assert.equal(entities[2].parent,undefined);
  assert.ok(entities.slice(4).every(e=>e.entity>101)); assert.throws(()=>groupMapScene(scene,0));
});
