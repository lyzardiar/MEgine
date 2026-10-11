// Author: MiYu. Compare generated environment updates with the prior renderer, including deferred and discarded native commands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
scene.entities=scene.entities.filter(e=>e.name!=='Scene / Environment/Scenery/Slots 64-95');
const sources=[execFileSync('git',['show','4b1dcd8:samples/frostbound-realms/Assets/Scripts/Main.js'],{encoding:'utf8',maxBuffer:32*1024*1024}),fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8')];
function fixture(source){
  const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load:()=>null,save(){}},playAudio(){}}),context=vm.createContext({engine});
  assert.equal(source.split('  return {tick};').length,2);
  vm.runInContext(source.replace('function set(n,c,v){',"function set(n,c,v){if(n.startsWith('Scenery 7')||n.startsWith('Prop 7'))globalThis.environmentWrites++;").replace('  return {tick};','  return {tick,environment,effectPool};'),context);
  context.environmentWrites=0;context.onTick(0);world.commit();
  return {world,context};
}
const before=fixture(sources[0]),after=fixture(sources[1]);let comparisons=0;
const part=(mesh='cube',color=[1,.5,.25,1])=>({mesh,material:'Assets/Materials/Selection.mmat',color}),visual={scale:1.25,yaw:.5,parts:[part(),part('sphere')]},position=[3.1,4,5];
function frame(label,value=visual,at=position,drop=false,name='Scenery 7',expectedWrites){
  for(const f of [before,after]){f.context.environmentWrites=0;f.context.FrostClient.effectPool.beginFrame();f.context.FrostClient.environment(name,value,at);f.world.commit(drop);}
  const nodes=f=>f.world.snapshot.entities.filter(e=>e.name===name||e.name.startsWith(name+' part ')).map(e=>({name:e.name,parent:e.parent,active:e.active,components:e.components}));
  assert.deepEqual(nodes(after),nodes(before),label+' native nodes');
  if(expectedWrites!==undefined)assert.equal(after.context.environmentWrites,expectedWrites,label+' component calls');comparisons++;
}
frame('discarded initial spawn',visual,position,true);
for(let i=0;i<6;i++)frame('spawn and parent recovery '+i);
assert.equal(after.world.entity('Scenery 7').active,true);frame('unchanged ready actor',visual,position,false,'Scenery 7',0);
position[0]=8.1;frame('discarded transform',visual,position,true);frame('pending transform retry',visual,position,false,'Scenery 7',0);
assert.equal(after.world.entity('Scenery 7').components.Transform.position[0],Math.fround(8.1));
visual.parts[0].color[0]=.75;frame('caller color mutation');assert.equal(after.world.entity('Scenery 7').components.MaterialPropertyBlock.base_color[0],.75);
visual.rotation=[0,0,.25,.96];frame('explicit rotation');visual.rotation[2]=.5;frame('caller rotation mutation');
visual.scale=2;frame('scale change');visual.parts[0].mesh='cube#pose=0:3@30';frame('animated pose');visual.parts[0].material='Assets/Materials/Ground.mmat';frame('material change');
visual.parts[0].visible=false;frame('part hidden');visual.parts[0].mesh='sphere';frame('hidden part changed');visual.parts[0].visible=true;frame('part shown');
visual.parts.push(part('capsule'));for(let i=0;i<4;i++)frame('part growth '+i);assert.equal(after.world.entity('Scenery 7 part 2').active,true);
visual.parts.length=1;frame('part shrink');assert.equal(after.world.entity('Scenery 7 part 2').active,false);
frame('discarded actor hide',null,position,true);frame('hide retry',null,position,false,'Scenery 7',0);assert.equal(after.world.entity('Scenery 7').active,false);
frame('actor shown');frame('unchanged shown actor',visual,position,false,'Scenery 7',0);
for(let i=0;i<4;i++)frame('second actor creation '+i,visual,position,false,'Prop 7');frame('independent actor unchanged',visual,position,false,'Prop 7',0);
for(const mesh of ['cube#pose=0:4@30','cube#pose=0:5@30']){visual.parts[0].mesh=mesh;frame('resource animation '+mesh,visual,position,false,'Prop 7');assert.equal(after.world.entity('Prop 7').components.MeshRenderer.mesh,mesh);}
frame('empty resource',null,position,false,'Prop 7');assert.equal(after.world.entity('Prop 7').active,false);
frame('new slot group spawn',visual,position,false,'Scenery 70');
let droppedParents=0;
for(const f of [before,after]){const push=f.context.engine.pushCommandJson;f.context.engine.pushCommandJson=raw=>{if(JSON.parse(raw).op==='setParent'){droppedParents++;return;}push(raw);};f.restorePush=()=>{f.context.engine.pushCommandJson=push;};}
frame('discarded new slot group parenting',visual,position,false,'Scenery 70');
assert.ok(droppedParents>0,'parent commands were discarded');for(const f of [before,after])f.restorePush();
for(let i=0;i<5;i++)frame('new slot group parenting recovery '+i,visual,position,false,'Scenery 70');
const group=after.world.entity('Scene / Environment/Scenery/Slots 64-95');assert.ok(group);
assert.equal(group.parent,after.world.entity('Scene / Environment/Scenery').entity);
assert.equal(after.world.entity('Scenery 70').parent,group.entity);
frame('new slot group hidden',null,position,false,'Scenery 70');frame('new slot group restored',visual,position,false,'Scenery 70');assert.equal(after.world.entity('Scenery 70').active,true);
console.log(JSON.stringify({author:'MiYu',passed:true,comparisons,scope:'Generated Main.js against prior native nodes; readiness, discarded spawn/parent/write/hide recovery, detached caller inputs, poses, materials, colors, transforms, part growth/shrink, visibility and independent actor slots.'}));
