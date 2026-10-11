// Author: MiYu. Compare generated minimap output with the previous renderer through fog, map edits and layout transitions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const candidate=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),baseline=execFileSync('git',['show','becc870:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024});
const input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};
function fixture(source){
  const world=clientWorldFixture(scene),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  source=source.replace('function set(n,c,v){',"function set(n,c,v){if(n.startsWith('Mini tile ')&&c==='Image')globalThis.minimapWrites++;").replace('  return {tick};',"  return {tick,render,configure:cfg=>{state=cfg.state;mode=cfg.mode;team=cfg.team;editMap=state.map;}};");
  vm.runInContext(source,context);context.minimapWrites=0;context.onTick(0);world.commit();
  const map=context.Frost.defaultMap();map.terrain.fill(0);map.surfaces.fill(0);map.heights.fill(0);map.ramps.fill(0);map.relief.fill(0);map.doodads=[];
  const state=context.Frost.create('skirmish',{map,ai:[false,false]});state.units=[];state.blight=[];
  for(let team=0;team<2;team++){state.visible[team].fill(1);state.explored[team].fill(1);state.teams[team].faction=0;}
  let mode='playing',team=0;
  function render(){context.FrostClient.configure({state,mode,team});context.minimapWrites=0;context.FrostClient.render(input);world.commit();return context.minimapWrites;}
  return {state,world,render,setMode:value=>mode=value,setTeam:value=>team=value};
}
const before=fixture(baseline),after=fixture(candidate);let comparisons=0;
function compare(label,expectedWrites){
  const oldWrites=before.render(),newWrites=after.render();assert.equal(oldWrites,256,label+' baseline visits every tile');
  if(expectedWrites!==undefined)assert.equal(newWrites,expectedWrites,label+' changed tile count');
  for(let j=0;j<256;j++){
    const old=before.world.entity('Mini tile '+j),next=after.world.entity('Mini tile '+j);
    assert.deepEqual(next.components.Image,old.components.Image,label+' color '+j);assert.deepEqual(next.components.RectTransform,old.components.RectTransform,label+' layout '+j);assert.equal(next.active,old.active,label+' visibility '+j);
  }
  comparisons++;
}
function edit(change){for(const f of [before,after])change(f.state);}
compare('initial world');compare('unchanged world',0);
edit(s=>s.visible[0][0]=0);compare('explored fog',1);
edit(s=>s.explored[0][0]=0);compare('unexplored fog',1);
edit(s=>s.visible[0][0]=1);compare('reveal fog',1);
edit(s=>s.map.heights[0]=2);compare('height-only change',1);
edit(s=>s.map.surfaces[2]=1);compare('surface-only change',1);
edit(s=>s.map.terrain[4]=1);compare('water-only change',1);
edit(s=>s.blight=[{x:-19,z:-31,radius:.1}]);compare('blight-only change',1);
edit(s=>s.map.tileset=1);compare('tileset change',256);compare('unchanged forest',0);
for(const f of [before,after])f.setTeam(1);compare('player perspective');compare('unchanged perspective',0);
for(const f of [before,after])f.setMode('editor');compare('editor layout');compare('unchanged editor layout',0);
for(const f of [before,after])f.setMode('title');compare('hidden world');
for(const f of [before,after])f.setMode('playing');compare('restored world');compare('unchanged restored world',0);
edit(s=>{s.map=JSON.parse(JSON.stringify(s.map));s.map.heights[6]=3;});compare('replacement map with edited height',1);
edit(s=>s.mode='td');compare('tower defense route');compare('unchanged tower defense route',0);
console.log(JSON.stringify({author:'MiYu',passed:true,comparisons,tilesPerComparison:256,scope:'Actual generated Main.js against prior rendering output; colors, rectangles, visibility, fog, heights, surfaces, water, blight, tileset, team, map replacement, editor/menu transitions and TD route.'}));
