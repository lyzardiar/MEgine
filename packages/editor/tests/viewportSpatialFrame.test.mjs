// Author: MiYu. Preserve displayed-frame culling while deferring unused opaque Scene index work.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from '../node_modules/typescript/lib/typescript.js';
import {createViewportSpatialFrame, createViewportSpatialIndex, viewportPlanes} from '../src/viewportSpatial.ts';
import {compareWorldDrawOrder, component2DSortingSettings} from '../src/worldDrawOrder.ts';

const camera=x=>({eye:[x,0,5],target:[x,0,0],up:[0,1,0],fovYDeg:60,near:.1,far:100});
const box=x=>({min:[x-.1,-.1,-.1],max:[x+.1,.1,.1]});

test('each displayed frame updates and queries lazily once, including empty results',()=>{
  const calls=[],index=createViewportSpatialIndex(),wrapped={update:(...args)=>{calls.push('update');index.update(...args);},query:(...args)=>{calls.push('query');return index.query(...args);}};
  const read=createViewportSpatialFrame(wrapped,[box(0),box(100),null],viewportPlanes(camera(0),1),true);
  assert.deepEqual(calls,[]);const found=read();assert.deepEqual(found,[0,2]);assert.equal(read(),found);assert.deepEqual(calls,['update','query']);
  const empty=createViewportSpatialFrame(wrapped,[box(100)],viewportPlanes(camera(0),1));assert.deepEqual(calls,['update','query']);
  const result=empty();assert.deepEqual(result,[]);assert.equal(empty(),result);assert.equal(calls.length,4);
});

test('older displayed bounds and camera remain usable after a newer owner updates the shared index',()=>{
  const index=createViewportSpatialIndex(),before=createViewportSpatialFrame(index,[box(0),box(100),null],viewportPlanes(camera(0),1),true);
  const after=createViewportSpatialFrame(index,[box(200),box(100),null],viewportPlanes(camera(100),1),true);
  assert.deepEqual(after(),[1,2]);assert.deepEqual(before(),[0,2]);assert.deepEqual(after(),[1,2]);
  const reload=createViewportSpatialFrame(index,[box(200),box(0),null],viewportPlanes(camera(0),1),true);assert.deepEqual(reload(),[1,2]);assert.deepEqual(before(),[0,2]);
});

test('failed collection retries without publishing partial or stale candidates',()=>{
  let fail=true,updates=0;const read=createViewportSpatialFrame({update:()=>{updates++;},query:()=>{if(fail)throw Error('query failed');return[3];}},[],[],false);
  assert.throws(read,/query failed/);fail=false;assert.deepEqual(read(),[3]);assert.deepEqual(read(),[3]);assert.equal(updates,2);
});

test('actual opaque Scene prepares only selected helpers without spatial queries; other paths query immediately',()=>{
  const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
  const line=source.split('\n').find(line=>line.includes('const drawn = prepareDrawn(deferSceneHits ?'));assert.ok(line);
  const render=new Function('env',ts.transpileModule('const {prepareDrawn,deferSceneHits,worldEntries,selSet,spatialCandidates}=env;'+line+'return drawn;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
  const worldEntries=[9,8,7,6].map(entity=>({e:{entity}}));let queries=0;
  const env={worldEntries,selSet:new Set([9,7]),spatialCandidates:()=>{queries++;return[0,1,2];},prepareDrawn:candidates=>candidates,deferSceneHits:true};
  assert.deepEqual(render(env),[0,2]);assert.equal(queries,0);env.deferSceneHits=false;assert.deepEqual(render(env),[0,1,2]);assert.equal(queries,1);
  env.selSet.clear();env.deferSceneHits=true;assert.deepEqual(render(env),[]);assert.equal(queries,1);
});

test('actual deferred draw preparation requests the displayed spatial candidates on its first ordinary hit',()=>{
  const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8'),start=source.indexOf('    const prepareDrawn = (candidates = spatialCandidates())'),end=source.indexOf('    const drawWorld =',start);
  assert.ok(start>0&&end>start);
  const code='const {spatialCandidates,worldEntries,isGame,gameCamera,nativeGameReady,projectEntityCenter,trailDrawByEntity,particleDrawByEntity,component2DSortingSettings,getSortingLayerRank,compareWorldDrawOrder,nativeSceneFrame,selSet}=env;'+source.slice(start,end)+'return {drawn,prepareDrawn};';
  const prepare=new Function('env',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
  const index=createViewportSpatialIndex();let updates=0,queries=0;
  const candidates=createViewportSpatialFrame({update:(...args)=>{updates++;index.update(...args);},query:(...args)=>{queries++;return index.query(...args);}},[box(0),null],viewportPlanes(camera(0),1),true);
  const worldEntries=[{e:{entity:1,components:{MeshRenderer:{}}},t:{position:[0,0,0],scale:[1,1,1]},hierarchyOrder:0},{e:{entity:2,components:{Camera3D:{}}},t:{position:[0,0,0],scale:[1,1,1]},hierarchyOrder:1}];
  const result=prepare({spatialCandidates:candidates,worldEntries,isGame:false,gameCamera:{},nativeGameReady:false,projectEntityCenter:()=>({x:10,y:10,depth:1}),trailDrawByEntity:new Map(),particleDrawByEntity:new Map(),component2DSortingSettings,getSortingLayerRank:()=>0,compareWorldDrawOrder,nativeSceneFrame:{opaquePixels:true},selSet:new Set([2])});
  assert.deepEqual(result.drawn.map(d=>d.e.entity),[2]);assert.equal(queries,0);
  assert.deepEqual(result.prepareDrawn().map(d=>d.e.entity),[1,2]);result.prepareDrawn();assert.equal(updates,1);assert.equal(queries,1);
});
