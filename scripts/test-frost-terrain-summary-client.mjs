// Author: MiYu. Compare generated HUD telemetry with the preceding client across in-place terrain edits and map replacement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const baseline=execFileSync('git',['show','26006b7:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),candidate=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
function fixture(source){
 const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
 engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};
 vm.runInContext(source.replace('  return {tick};','  return {tick,present(next,nextMode){state=next;editMap=next.map;mode=nextMode;team=0;render(engine.input);}};'),context);context.onTick(0);world.commit();
 const state=context.Frost.create('skirmish',{map:context.Frost.defaultMap(),ai:[false,false]});state.units=[];
 return {state,present(mode){context.FrostClient.present(state,mode);world.commit();return JSON.parse(world.entity('Frost telemetry').components.Text.text);}};
}
const before=fixture(baseline),after=fixture(candidate);let comparisons=0;
function compare(label,mode='editor'){assert.deepEqual(after.present(mode),before.present(mode),label);comparisons++;}
function edit(fn){for(const f of [before,after])fn(f.state.map,f.state);}
compare('authored map','playing');compare('editor');
edit(m=>{m.heights.fill(0);m.ramps.fill(0);m.terrain.fill(0);m.surfaces.fill(0);m.cliffs=Array(1024).fill(0);m.relief.fill(0);});compare('flat map');
edit(m=>{for(let i=0;i<1024;i++){m.heights[i]=i%4;m.ramps[i]=i%5;m.terrain[i]=i%3;m.surfaces[i]=i%5;m.cliffs[i]=i%4;}for(let i=0;i<1089;i++)m.relief[i]=(i%33-16)/8;});compare('all heights, ramps, surfaces, cliffs and relief');
edit(m=>{m.relief[0]=-3;m.relief[1088]=3;m.terrain[0]=1;m.surfaces[0]=4;m.cliffs[0]=3;});compare('in-place edits without advancing simulation');
edit(m=>delete m.cliffs);compare('legacy map without per-tile cliffs');
edit(m=>{m.cliffs=Array(1024).fill(2);m.relief.fill(0);});compare('restore cliffs and flatten relief');
edit((m,s)=>{s.map=JSON.parse(JSON.stringify(m));s.map.name='Replacement terrain';s.map.surfaces.fill(3);});compare('replacement map');compare('return to playing','playing');compare('hidden title','title');
console.log(JSON.stringify({passed:true,comparisons,scope:'Exact complete generated telemetry equality across terrain editing, legacy cliffs, map replacement, playing and title transitions.'}));
