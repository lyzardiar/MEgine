// Author: MiYu. Existing IDs, names, components, pool activation and UI sibling order remain unchanged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {groupFrostScene} from './frost-scene-groups.mjs';
const scene = JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Scenes/Main.mscene',import.meta.url)));
const entities = scene.world.entities.filter(e => !e.name?.startsWith('Scene / '));
// Resolve existing identity folders when testing an already grouped scene.
const oldIds = new Set(entities.map(e=>e.entity));
for (const e of entities) if (e.parent != null && !oldIds.has(e.parent)) e.parent = null;
const before = structuredClone(entities), roots = before.filter(e=>e.parent==null).length;
const result = groupFrostScene(entities), folders = new Map(entities.slice(before.length).map(e=>[e.entity,e]));
for (let i=0;i<before.length;i++) {
  const old = before[i], current = entities[i];
  assert.deepEqual({...current,parent:old.parent},old);
  if (old.parent != null || old.components.Canvas || old.components.RectTransform) assert.equal(current.parent,old.parent);
  else assert.ok(folders.has(current.parent),current.name);
}
for (const folder of folders.values()) {
  assert.equal(folder.active,true);
  assert.deepEqual(folder.components.Transform,{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]});
}
assert.equal(new Set(entities.map(e=>e.entity)).size,entities.length);
const once = JSON.stringify(entities); groupFrostScene(entities); assert.equal(JSON.stringify(entities),once);
assert.ok(result.roots < 20); assert.ok(result.groups < 2000);
console.log(JSON.stringify({passed:true,rootsBefore:roots,...result}));
