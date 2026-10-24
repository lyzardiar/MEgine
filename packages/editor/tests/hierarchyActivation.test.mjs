// Author: MiYu. Preserve Play activation semantics while bounding large-scene ancestor searches.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHierarchyActiveLookup, createOwnedHierarchyActiveReader, viewportActiveLookup} from '../src/hierarchyActivation.ts';

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

test('owned activation survives component-only revisions and old frames retain their own hierarchy', () => {
  const read=createOwnedHierarchyActiveReader(), initial=[{entity:1,components:{Transform:{position:[0,0,0]}}},{entity:2,parent:1},{entity:3,parent:2}];
  const first=read(initial);assert.equal(first(3),true);assert.equal(read(initial),first);
  const moved=[{...initial[0],components:{Transform:{position:[10,0,0]}}},...initial.slice(1)];
  assert.equal(read(moved),first,'animation does not rebuild the activation index');
  const hidden=[{...moved[0],active:false},...moved.slice(1)], next=read(hidden);
  assert.notEqual(next,first);assert.equal(next(3),false);assert.equal(first(3),true);
  const reparented=[...hidden.slice(0,2),{...hidden[2],parent:null}], detached=read(reparented);
  assert.equal(detached(3),true);assert.equal(detached(2),false);assert.equal(next(3),false);
  assert.equal(read(initial)(3),true);assert.equal(next(3),false);
});

test('owned activation matches a fresh lookup for duplicate IDs, reorder, missing parents, cycles and removal', () => {
  const read=createOwnedHierarchyActiveReader();
  const cases=[[],[{entity:1,parent:2},{entity:2,parent:1},{entity:3,parent:1}], [{entity:1,parent:2},{entity:2,parent:1,active:false},{entity:3,parent:1}], [{entity:1,parent:99},{entity:2,parent:1}], [{entity:1},{entity:1,active:false},{entity:2,parent:1}], [{entity:1,active:false},{entity:1},{entity:2,parent:1}], [{entity:1},{entity:2,parent:1}], [{entity:2,parent:1}], [{entity:1,active:false},{entity:2,parent:1}], []];
  const retained=[];
  for(const entities of cases){
    const actual=read(entities),expected=createHierarchyActiveLookup(entities),ids=[3,2,1,99];
    assert.deepEqual(ids.map(actual),ids.map(expected));retained.push({actual,expected,ids});
    assert.equal(read(entities.map(e=>({...e,components:{Text:{text:'changed'}}}))),actual);
  }
  for(const {actual,expected,ids} of retained)assert.deepEqual(ids.map(actual),ids.map(expected));
});
