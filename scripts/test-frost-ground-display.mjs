// Author: MiYu. Compare complete native-normalized worlds across display geometry edits and minimap layout transitions.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),baseline=process.argv[2]??'bdeb052',scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const old=execFileSync('git',['show',baseline+':samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),current=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
const clients=[old,current].map(source=>{
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},input:{keys:[],pressedKeys:['RenderProbe'],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  vm.runInContext(source.replace('  return {tick};',"  return {tick,install(value,next='editor'){state=value;editMap=value.map;mode=next;paused=true;selected=[];},edit(fn){changeMap(()=>fn(editMap));},mode(next){mode=next;},fog(on){state.explored=[Array(1024).fill(on),Array(1024).fill(on)];state.visible=[Array(1024).fill(on),Array(1024).fill(on)];}};"),context);
  context.onTick(0);world.commit();return {world,context,engine};
});
let worlds=0;
function tick(label,dt=0){for(const {world,context} of clients){context.onTick(dt);world.commit();}assert.deepEqual(clients[1].world.snapshot,clients[0].world.snapshot,label);worlds++;}
for(const mapName of ['defaultMap','highlandMap','siegeMap']){
  for(const {context} of clients){const S=context.Frost;context.FrostClient.install(S.create('skirmish',{map:S[mapName](),ai:[false,false]}));}
  for(const viewport of [[1280,720],[960,720],[800,1100],[1920,1080]]){
    for(const {engine} of clients)engine.input.viewport=viewport;
    tick(mapName+' editor '+viewport);tick(mapName+' retained editor '+viewport);
  }
  for(const [name,edit] of [['flat',m=>{m.heights.fill(0);m.ramps.fill(0);m.relief.fill(0);}],['raised',m=>{m.heights.fill(1);}],['relief and water',m=>{m.relief.fill(.25);m.terrain[19]=1;}],['cliff and doodad',m=>{m.heights[17]=2;m.surfaces[20]=3;m.doodads=[{kind:'rock',variant:0,scale:1,yaw:.5,x:4,z:4}];}],['forest',m=>{m.tileset=1;m.cliffStyle=1;}],['barrens surface',m=>{m.tileset=2;m.surfaces.fill(4);}]]){
    for(const {context} of clients)context.FrostClient.edit(edit);
    tick(mapName+' '+name);tick(mapName+' retained '+name);
  }
  for(const mode of ['playing','title','playing','editor','title','editor']){for(const {context} of clients)context.FrostClient.mode(mode);tick(mapName+' transition '+mode);}
  tick(mapName+' water clock first frame',.1);tick(mapName+' water clock second frame',.1);
  for(const on of [false,true]){for(const {context} of clients){context.FrostClient.mode('playing');context.FrostClient.fog(on);}tick(mapName+' fog '+on);}
}
console.log(JSON.stringify({author:'MiYu',passed:true,baseline,completeWorldsCompared:worlds,entities:scene.entities.length,scope:'Three map families, four viewport shapes, retained frames, live editor geometry/water/surface/doodad/tileset edits, animated water clocks, fog reveal/hide, menu/editor/game reactivation and native-normalized component values.'}));
