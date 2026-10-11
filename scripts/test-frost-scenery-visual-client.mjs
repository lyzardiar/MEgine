// Author: MiYu. Compare generated scenery nodes across map edits, fog, zoom and deferred native creation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const sources=[execFileSync('git',['show','d705816:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8')];
const input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};
function fixture(source){
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);vm.runInContext(source.replace('  return {tick};',"  return {tick,effectPool,present(next,nextMode,nextZoom){state=next;editMap=next.map;mode=nextMode;team=0;zoom=nextZoom;render(engine.input);}};"),context);engine.input=input;context.onTick(0);world.commit();
  const map=context.Frost.defaultMap();for(const key of ['terrain','surfaces','heights','ramps','relief','cliffs'])if(map[key])map[key].fill(0);map.doodads=[];
  const state=context.Frost.create('skirmish',{map,ai:[false,false]});state.units=[];state.resources=[];state.blight=[];for(let i=0;i<2;i++){state.visible[i].fill(1);state.explored[i].fill(1);}
  let calls=0;const original=context.FrostVisual.scenery;context.FrostVisual.scenery=(...args)=>{calls++;return original(...args);};
  return {world,state,context,calls:()=>calls,present(mode,zoom,drop){calls=0;context.FrostClient.effectPool.beginFrame();context.FrostClient.present(state,mode,zoom);world.commit(drop);}};
}
const before=fixture(sources[0]),after=fixture(sources[1]);let comparisons=0,baselineRepeatedCalls=0;
const nodes=f=>f.world.snapshot.entities.filter(e=>/^Scenery \d+( part \d+)?$/.test(e.name)).map(e=>({name:e.name,parent:e.parent,active:e.active,components:e.components}));
function compare(label,mode='editor',zoom=27,frames=3,drop=false,unchanged=false){
  for(let i=0;i<frames;i++){before.present(mode,zoom,drop);after.present(mode,zoom,drop);}
  assert.deepEqual(nodes(after),nodes(before),label+' native scenery');
  if(unchanged){baselineRepeatedCalls+=before.calls();assert.equal(after.calls(),0,label+' no repeated visual generation');assert.ok(before.calls()>0,label+' baseline regenerates visible scenery');}
  comparisons++;
}
function edit(fn){for(const f of [before,after])fn(f.state,f.context.Frost);}
compare('initial spawn dropped','editor',27,1,true);compare('pending creation recovery','editor',27,5);compare('unchanged editor','editor',27,1,false,true);
compare('close LOD','editor',14);compare('unchanged close LOD','editor',12,1,false,true);compare('far LOD','editor',14.01);compare('unchanged far LOD','editor',40,1,false,true);
for(const tileset of [1,2,0]){edit(s=>s.map.tileset=tileset);compare('tileset '+tileset);compare('unchanged tileset '+tileset,'editor',27,1,false,true);}
edit(s=>{s.map.heights.fill(2);s.map.relief[18*33+18]=.5;});compare('raised edited map');
edit(s=>{s.map.terrain.fill(1);});compare('water hides interior');edit(s=>s.map.terrain.fill(0));compare('dry ground restores interior');
edit(s=>{s.visible[0].fill(0);s.explored[0].fill(0);});compare('unexplored fog','playing');edit(s=>s.explored[0].fill(1));compare('explored fog','playing');edit(s=>s.visible[0].fill(1));compare('visible fog','playing');
edit(s=>s.map.doodads=[{kind:'rock',variant:0,x:0,z:0,scale:3,yaw:0}]);compare('doodad obstruction');edit(s=>s.map.doodads=[]);compare('obstruction removed');
edit((s,S)=>{const map=JSON.parse(JSON.stringify(s.map));map.tileset=2;map.heights.fill(0);map.relief.fill(0);s.map=S.validateMap(map);});compare('replacement map');
compare('title hides scenery','title');compare('return to world');compare('unchanged restored world','editor',27,1,false,true);
console.log(JSON.stringify({author:'MiYu',passed:true,comparisons,baselineRepeatedCalls,candidateRepeatedCalls:0,scope:'Generated native scenery equivalence; dropped spawn recovery, LOD threshold, same LOD zoom, all tilesets, ground elevation, water, fog, doodad blockers, map replacement and menu transitions.'}));
