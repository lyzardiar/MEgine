// Author: MiYu. Compare terrain chunks and generated bindings through retained frames, fog and live geometry edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const sources=[execFileSync('git',['show','7a7a7ee:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8')];
function fixture(source){
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){},input:{keys:[],pressedKeys:['Probe'],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);vm.runInContext(source.replace('function set(n,c,v){',"function set(n,c,v){if(/^(Ground|Water|Riverbed) /.test(n)&&c==='MeshRenderer')globalThis.meshCalls++;").replace('  return {tick};',"  return {tick,install(next,nextMode='editor'){state=next;editMap=next.map;mode=nextMode;paused=true;selected=[];},edit(fn){changeMap(()=>fn(editMap));}};"),context);context.meshCalls=0;context.onTick(0);world.commit();
  const map=context.Frost.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.relief.fill(0);map.surfaces.fill(0);map.doodads=[];const state=context.Frost.create('skirmish',{map,ai:[false,false]});state.units=[];state.resources=[];for(let i=0;i<2;i++){state.visible[i].fill(1);state.explored[i].fill(1);}
  context.FrostClient.install(state);let chunks=0;const chunk=context.FrostTerrain.chunk;context.FrostTerrain.chunk=(...args)=>{chunks++;return chunk(...args);};
  return {world,context,state,counts:()=>({chunks,meshes:context.meshCalls}),tick(dt=0){chunks=0;context.meshCalls=0;context.onTick(dt);world.commit();}};
}
const before=fixture(sources[0]),after=fixture(sources[1]);let comparisons=0;
const nodes=f=>f.world.snapshot.entities.filter(e=>/^(Ground|Water|Riverbed) /.test(e.name));
function compare(label,dt=0,retained=false){before.tick(dt);after.tick(dt);assert.deepEqual(nodes(after),nodes(before),label+' native terrain');if(retained){assert.equal(after.counts().chunks,0,label+' no repacking');assert.equal(after.counts().meshes,0,label+' no mesh serialization');assert.equal(before.counts().chunks,64);assert.ok(before.counts().meshes>=64);}comparisons++;}
function edit(fn){for(const f of [before,after])f.context.FrostClient.edit(fn);}
compare('initial plain map');compare('retained plain map',0,true);
edit(m=>{m.terrain[0]=1;m.terrain[1023]=1;m.terrain[528]=1;});compare('border and interior water');compare('retained water',0,true);compare('animated water',.1,true);
edit(m=>{m.heights[528]=2;m.ramps[527]=1;m.relief[17*33+17]=.5;});compare('height ramp relief');compare('retained height',0,true);
for(const tileset of [1,2,0]){edit(m=>{m.tileset=tileset;m.cliffStyle=tileset;});compare('tileset and cliff '+tileset);compare('retained tileset '+tileset,0,true);}
for(const f of [before,after]){f.state.visible[0].fill(0);f.state.explored[0].fill(0);f.context.FrostClient.install(f.state,'playing');}compare('unexplored fog');compare('retained fog',0,true);
for(const f of [before,after])f.state.explored[0][528]=1;compare('single fog tile');
for(const f of [before,after]){f.state.visible[0].fill(1);f.context.FrostClient.install(f.state,'editor');}compare('restored editor');compare('retained restored editor',0,true);
const T=after.context.FrostTerrain,data=Array.from({length:1024},(_,i)=>i/7),oracle=(x,z)=>{const values=[];for(let dz=-1;dz<=4;dz++)for(let dx=-1;dx<=4;dx++)values.push(data[Math.min(31,Math.max(0,z*4+dz))*32+Math.min(31,Math.max(0,x*4+dx))]);return Array.from({length:9},(_,i)=>values.slice(i*4,i*4+4));};
let chunkComparisons=0;for(const [x,z] of [...Array.from({length:64},(_,i)=>[i%8,Math.floor(i/8)]),[-1,0],[8,0],[0,-1],[0,8],[.5,2]]){const values=T.chunk(data,x,z);assert.deepEqual(JSON.parse(JSON.stringify(values)),oracle(x,z));assert.equal(T.chunkMatches(data,x,z,values),true);values[0][0]=-999;assert.equal(T.chunkMatches(data,x,z,values),false);chunkComparisons++;}
console.log(JSON.stringify({author:'MiYu',passed:true,comparisons,chunkComparisons,scope:'Generated native terrain equivalence; unchanged packing/mesh calls, three water locations and clock, height/ramp/relief, tileset/cliff materials, fog and editor restoration; independent chunk oracle including borders and out-of-map coordinates.'}));
