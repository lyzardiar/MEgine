// Author: MiYu. Exercise actual App query scheduling and empty restriction getters.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';
import { createSceneInteractionQuery } from '../src/sceneInteractionQuery.ts';
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8').replaceAll('\r\n','\n');
const start=app.indexOf('  const sceneHiddenIds = store.sceneHiddenIds;'), end=app.indexOf('  const timelinePreviewActive =',start);assert.ok(start>0&&end>start);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const render=vm.runInNewContext(compile(`(function(store,snap,viewTab,selected,selectedIds,useMemo,visiblePanels){${app.slice(start,end)}return {viewportEntities,viewportSelected,viewportSelectedIds};})`));
function fixture(hidden=[],unpickable=[]){
  let calls=0,cached;const entities=[{entity:1,parent:null},{entity:2,parent:1},{entity:3,parent:null}],snap={entities};
  const store={sceneHiddenIds:hidden,sceneInteractionQuery:()=>{calls++;return createSceneInteractionQuery(entities,new Set(hidden),new Set(unpickable));}};
  const memo=(callback,deps)=>{if(!cached||deps.some((v,i)=>v!==cached.deps[i]))cached={deps,data:callback()};return cached.data;};
  return {render:(tab='scene',selected=null,ids=[],panels=new Set([tab]))=>render(store,snap,tab,selected,ids,memo,panels),get calls(){return calls;}};
}
test('Game view and an unrestricted unselected Scene need no interaction snapshot',()=>{
  const f=fixture([1],[3]);const game=f.render('game',2,[2]);assert.equal(f.calls,0);assert.equal(game.viewportSelected,2);assert.deepEqual(game.viewportSelectedIds,[2]);
  const empty=fixture();empty.render();empty.render();assert.equal(empty.calls,0);
});
test('memoized visibility filtering reuses its result without rebuilding the parent query',()=>{
  const f=fixture([1]);assert.deepEqual(f.render().viewportEntities.map(e=>e.entity),[3]);assert.equal(f.calls,1);f.render();assert.equal(f.calls,1);
});
test('visibility filtering and primary/multiple selection share one immutable query',()=>{
  const f=fixture([1],[3]),r=f.render('scene',2,[1,2,3]);assert.equal(f.calls,1);assert.equal(r.viewportSelected,null);assert.deepEqual(r.viewportSelectedIds,[]);
  f.render('scene',3,[3]);assert.equal(f.calls,2,'each required render observes current restrictions');
});
const storeSource=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8').replaceAll('\r\n','\n');
const getterStart=storeSource.indexOf('    get sceneHiddenIds() {'),getterEnd=storeSource.indexOf('    sceneInteractionQuery()',getterStart);assert.ok(getterStart>0&&getterEnd>getterStart);
const getters=vm.runInNewContext(compile(`(function(editEntities,sceneHiddenIds,sceneUnpickableIds){return {${storeSource.slice(getterStart,getterEnd)}};})`));
test('empty restriction getters do not enumerate scene objects',()=>{
  const f=getters({map:()=>assert.fail('unrestricted getter must not scan entities')},new Set(),new Set());assert.equal(f.sceneHiddenIds.length,0);assert.equal(f.sceneUnpickableIds.length,0);
});
test('restricted getters preserve entity order and omit absent ids',()=>{
  const f=getters([{entity:2},{entity:1}],new Set([1,2,99]),new Set([1,99]));assert.deepEqual(Array.from(f.sceneHiddenIds),[2,1]);assert.deepEqual(Array.from(f.sceneUnpickableIds),[1]);
});

test('visibility and picking changes are observed on the next required query',()=>{
  const hidden=[1],unpickable=[3],f=fixture(hidden,unpickable);f.render();hidden.splice(0,1,3);let r=f.render('scene',2,[2]);assert.deepEqual(r.viewportEntities.map(e=>e.entity),[1,2]);assert.equal(r.viewportSelected,2);assert.equal(f.calls,2);
  hidden.splice(0);unpickable.splice(0);r=f.render('scene',3,[3]);assert.equal(r.viewportSelected,3);assert.deepEqual(r.viewportSelectedIds,[3]);assert.equal(f.calls,3);
});

test('actual dock visibility controls queries when the template tab differs or both views are visible',()=>{
  const game=fixture([1],[3]);game.render('scene',2,[2],new Set(['game']));assert.equal(game.calls,0);
  const split=fixture([1],[3]),r=split.render('game',2,[1,2,3],new Set(['scene','game']));assert.equal(split.calls,1);assert.deepEqual(r.viewportEntities.map(e=>e.entity),[3]);assert.equal(r.viewportSelected,null);assert.deepEqual(r.viewportSelectedIds,[]);
});
