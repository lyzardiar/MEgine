// Author: MiYu. Preserve Play activation semantics while bounding large-scene ancestor searches.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHierarchyActiveLookup, viewportActiveLookup} from '../src/hierarchyActivation.ts';

test('activation preserves missing, inactive, duplicate ID and active-cycle behavior', () => {
  const active = createHierarchyActiveLookup([{entity:0},{entity:1,parent:0},{entity:2,parent:99},{entity:3,active:false},{entity:4,parent:3},{entity:5,parent:6},{entity:6,parent:5},{entity:7,parent:5},{entity:8,parent:8},{entity:1,active:false}]);
  for (const id of [0,1,5,6,7,8]) assert.equal(active(id),true);
  for (const id of [2,3,4,99]) assert.equal(active(id),false);
  const inactiveCycle = createHierarchyActiveLookup([{entity:1,parent:2},{entity:2,parent:3,active:false},{entity:3,parent:1},{entity:4,parent:3}]);
  for (const id of [4,1,3,2]) assert.equal(inactiveCycle(id),false);
});
test('90k-deep activation queries read each ancestor once and next paint reflects mutations', () => {
  let reads=0;
  const entities=Array.from({length:90000},(_,i)=>({entity:i,get parent(){reads++;return i?i-1:null;}}));
  const active=createHierarchyActiveLookup(entities);
  assert.equal(active(89999),true);
  for(let i=0;i<90000;i++) assert.equal(active(i),true);
  assert.equal(reads,90000);
  entities[0].active=false;
  assert.equal(createHierarchyActiveLookup(entities)(89999),false);
});
test('edit, filtered Scene and absent callbacks retain their existing activation contract', () => {
  const entities=[{entity:1,parent:99}], fallback=id=>id===1;
  assert.equal(viewportActiveLookup(entities,false,false,[],fallback)(1),true);
  assert.equal(viewportActiveLookup(entities,true,false,[99],fallback)(1),true);
  assert.equal(viewportActiveLookup(entities,true,true,[99],fallback)(1),false);
  assert.equal(viewportActiveLookup(entities,true,false,[],fallback)(1),false);
  assert.equal(viewportActiveLookup(entities,true,false,[])(99),true);
});

test('unused viewport activation builds no index and first use reads the current paint source', () => {
  let ids=0;
  const root={get entity(){ids++;return 1;},active:true},entities=[root];
  const active=viewportActiveLookup(entities,true,true,[],()=>true);
  assert.equal(ids,0);
  root.active=false;assert.equal(active(1),false);assert.ok(ids>0);
  root.active=true;assert.equal(active(1),true,'self-inactive nodes remain live within the same lookup');
});

test('inactive starts read no parents and activation still captures membership at construction', () => {
  let parents=0;
  const entity={entity:1,active:false,get parent(){parents++;return null;}},entities=[entity],active=createHierarchyActiveLookup(entities);
  for(let i=0;i<5;i++)assert.equal(active(1),false);
  assert.equal(parents,0);entity.active=true;assert.equal(active(1),true);assert.equal(parents,1);
  entities.push({entity:2});assert.equal(active(2),false);assert.equal(createHierarchyActiveLookup(entities)(2),true);
});
