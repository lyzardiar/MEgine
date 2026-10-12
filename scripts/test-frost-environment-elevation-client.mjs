// Author: MiYu. Verify static ground placement reuse against the previous native client through live map and resource edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const baseline=execFileSync('git',['show','8eca82d:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),candidate=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
const input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};
function fixture(source){
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  vm.runInContext(source.replace('  return {tick};',"  return {tick,effectPool,present(next,nextMode,nextZoom){state=next;editMap=next.map;mode=nextMode;team=0;zoom=nextZoom;time+=.1;renderResources();render(engine.input);}};"),context);
  engine.input=input;context.onTick(0);world.commit();
  const map=context.Frost.defaultMap();for(const key of ['terrain','surfaces','heights','ramps','relief','cliffs'])if(map[key])map[key].fill(0);map.doodads=[];
  const state=context.Frost.create('skirmish',{map,ai:[false,false]});state.units=[];state.resources=state.resources.slice(0,6);state.blight=[];
  for(let team=0;team<2;team++){state.visible[team].fill(1);state.explored[team].fill(1);}
  // Measure scenery/resource placement separately from progressive grass generation.
  context.FrostTerrain.details=()=>[];
  let calls=0;const elevation=context.Frost.elevation;context.Frost.elevation=(...args)=>{calls++;return elevation(...args);};
  return {world,state,context,calls:()=>calls,present(mode='playing',zoom=27,drop=false){calls=0;context.FrostClient.effectPool.beginFrame();context.FrostClient.present(state,mode,zoom);world.commit(drop);}};
}
const before=fixture(baseline),after=fixture(candidate);let comparisons=0,reusedSamples=0;
const nodes=f=>f.world.snapshot.entities.filter(e=>/^(Scenery|Prop) \d+( part \d+)?$/.test(e.name)).map(e=>({name:e.name,parent:e.parent,active:e.active,components:e.components}));
function compare(label,mode='playing',zoom=27,frames=1,drop=false,reuse=false){
  for(let i=0;i<frames;i++){before.present(mode,zoom,drop);after.present(mode,zoom,drop);}
  assert.deepEqual(nodes(after),nodes(before),label+' native placements and materials');
  if(reuse){assert.equal(after.calls(),0,label+' reuse stationary ground');assert.ok(before.calls()>0,label+' baseline still samples ground');reusedSamples+=before.calls();}
  comparisons++;
}
function edit(fn){for(const f of [before,after])fn(f.state,f.context.Frost);}
compare('dropped first spawn','playing',27,1,true);compare('recover deferred native spawn','playing',27,6);compare('warm static placements','playing',27,30);compare('unchanged ground','playing',27,1,false,true);
compare('close camera LOD','playing',12,1,false,true);compare('far camera LOD','playing',40,1,false,true);
edit(s=>s.map.heights.fill(2));compare('in-place height edit');
edit(s=>{s.map.ramps[16*32+16]=1;s.map.heights[16*32+16]=1;});compare('in-place ramp edit');
edit(s=>s.map.relief[18*33+18]=.75);compare('in-place sculpt edit');
edit(s=>s.map.terrain.fill(1));compare('water edit');edit(s=>s.map.terrain.fill(0));compare('restore dry ground');
for(const tileset of [1,2,0]){edit(s=>s.map.tileset=tileset);compare('tileset '+tileset,'playing',27,1,false,true);}
edit(s=>{s.visible[0].fill(0);s.explored[0].fill(0);});compare('unexplored fog');edit(s=>s.explored[0].fill(1));compare('explored fog');edit(s=>s.visible[0].fill(1));compare('visible fog','playing',27,1,false,true);
edit(s=>{s.resources[0].x+=3;s.resources[0].z-=2;});compare('resource moved');assert.ok(after.calls()>0,'moved resource resampled');
edit(s=>s.resources.reverse());compare('resource slots reordered');
edit(s=>s.map.props[0].x+=2);compare('editor resource moved','editor');
edit(s=>s.map.doodads=[{kind:'rock',variant:0,x:0,z:0,scale:3,yaw:0}]);compare('doodad blocker','editor');edit(s=>s.map.doodads=[]);compare('remove blocker','editor',27,1,false,true);
edit((s,S)=>{const map=S.clone(s.map);map.heights.fill(0);map.relief.fill(0);s.map=S.validateMap(map);});compare('replacement map','editor');
compare('title hides world','title');compare('return to world','playing');compare('unchanged restored world','playing',27,1,false,true);
const map=after.state.map,revision=after.context.Frost.groundRevision(map);assert.equal(revision,after.context.Frost.groundRevision(map));map.relief[0]+=.25;assert.notEqual(after.context.Frost.groundRevision(map),revision,'revision detects raw map mutation');
console.log(JSON.stringify({author:'MiYu',passed:true,comparisons,reusedSamples,candidateRepeatedSamples:0,scope:'Exact native scenery/resource node equivalence across deferred creation, LOD, mutable heights/ramps/sculpt/terrain, tilesets, fog, moved/reordered resources, editor props, blockers, replacement maps and menu transitions.'}));
