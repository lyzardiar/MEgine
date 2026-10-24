// Author: MiYu. Exercise the actual viewport candidate preparation with mixed native and browser content.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';
import {compareWorldDrawOrder,component2DSortingSettings} from '../src/worldDrawOrder.ts';

const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
const start=source.indexOf('    const drawn:'),end=source.indexOf('    drawn.sort(compareWorldDrawOrder);',start);
assert.ok(start>0&&end>start);
const code='const {candidates,worldEntries,spatialCandidates,isGame,gameCamera,nativeGameReady,projectEntityCenter,trailDrawByEntity,particleDrawByEntity,component2DSortingSettings,getSortingLayerRank,compareWorldDrawOrder}=env;'+source.slice(start,end)+'drawn.sort(compareWorldDrawOrder); return drawn;';
const prepare=new Function('env',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
const entry=(entity,components,visible=true,name='')=>({e:{entity,components,name},t:{position:[visible?entity:-1,0,entity],scale:[1,1,1]},hierarchyOrder:entity});
function run(worldEntries,options={}){
  return prepare({candidates:worldEntries.map((_,i)=>i),worldEntries,spatialCandidates:worldEntries.map((_,i)=>i),isGame:false,gameCamera:{},nativeGameReady:false,projectEntityCenter:([x,y,depth])=>x<0?null:{x,y,depth},trailDrawByEntity:new Map(),particleDrawByEntity:new Map(),component2DSortingSettings,getSortingLayerRank:layer=>layer==='front'?1:0,compareWorldDrawOrder,...options});
}

test('Scene retains off-origin meshes, camera, named lights, colliders and tiles in world draw order',()=>{
  const values=[entry(1,{MeshRenderer:{}},false),entry(2,{Camera3D:{}},false),entry(3,{},false,'MoonLight'),entry(4,{BoxCollider3D:{}},false),entry(5,{Tilemap:{}},false),entry(6,{SpriteRenderer:{}},false),entry(7,{},false),entry(8,{MeshRenderer:{},PointLight:{},BoxCollider3D:{}}),entry(9,{SpriteRenderer:{sorting_order:2}})];
  const result=run(values);assert.deepEqual(result.map(d=>d.e.entity),[8,1,4,5,9,2,3]);
  assert.equal(result.find(d=>d.e.entity===1).pr,null);assert.equal(result.find(d=>d.e.entity===8).editorGizmo,false);assert.equal(result.find(d=>d.e.entity===3).editorGizmo,true);
});

test('trail, particle and Spine entries keep independent layer, depth and hierarchy ordering',()=>{
  const e=entry(1,{MeshRenderer:{},SpineSkeleton:{sorting_order:3}}),trail={component:{sorting_layer:'front',sorting_order:-10}},particle={component:{},twoDimensional:false};
  const result=run([e],{trailDrawByEntity:new Map([[1,trail]]),particleDrawByEntity:new Map([[1,particle]])});
  assert.deepEqual(result.map(d=>d.renderKind),['entity','particle','spine','trail']);assert.deepEqual(result.map(d=>d.hierarchyOrder),[4,6,7,5]);
  assert.equal(result[2].sortingOrder,3);assert.equal(result[3].sortingLayerOrder,1);
});

test('native Game keeps browser overlays while missing Game camera suppresses all world draws',()=>{
  const values=[entry(1,{MeshRenderer:{}}),entry(2,{SpineSkeleton:{}}),entry(3,{SpineSkeleton:{}},false)];
  assert.deepEqual(run(values,{isGame:true,nativeGameReady:true}).map(d=>[d.e.entity,d.renderKind]),[[2,'spine']]);
  assert.deepEqual(run(values,{isGame:true,gameCamera:null}),[]);assert.deepEqual(run([]),[]);
});

test('mesh entries avoid light-name and collider classification without losing selection candidates',()=>{
  const value=entry(1,{MeshRenderer:{}},false);
  Object.defineProperty(value.e,'name',{get(){assert.fail('Meshes do not need light-name classification');}});
  Object.defineProperty(value.e.components,'BoxCollider3D',{get(){assert.fail('MeshRenderer already keeps this candidate');}});
  assert.equal(run([value])[0].e.entity,1);
});
