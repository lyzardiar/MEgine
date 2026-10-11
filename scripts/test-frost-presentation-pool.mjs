// Author: MiYu. Validate model pools against deferred native commits and variable part counts.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(source.replace('  return {tick};','  return {tick,actor,environment,effectPool};'),context);
const tick=()=>{context.onTick(0);world.commit();};tick();
assert.ok(scene.entities.length<10000);assert.ok(!world.entity('Unit 159'));assert.ok(!world.entity('Missile 255'));assert.ok(!world.entity('Scenery 139'));
const part={mesh:'cube',material:'Assets/Materials/Selection.mmat',visible:true,color:[1,1,1,1]},parts=[part,part,part],position=[3,2,5];
for(const name of ['Unit 159','Missile 255']){
 context.FrostClient.actor(name,parts,position);world.commit();assert.equal(world.entity(name).active,false);
 for(let i=0;i<3;i++){tick();context.FrostClient.actor(name,parts,position);world.commit();}
 for(let i=0;i<3;i++){const node=world.entity(name+(i?' part '+i:''));assert.equal(node.active,true);assert.deepEqual(node.components.Transform.position,position);assert.ok(node.parent);}
 const count=world.snapshot.entities.length;context.FrostClient.actor(name,[part],position);world.commit();assert.equal(world.entity(name+' part 2').active,false);
 context.FrostClient.actor(name,null);world.commit();assert.equal(world.entity(name).active,false);context.FrostClient.actor(name,parts,[9,0,8]);world.commit();assert.equal(world.snapshot.entities.length,count);
}
const expanded=Array.from({length:context.FrostVisual.actorPartCount()},()=>part);context.FrostClient.actor('Unit 159',expanded,position);world.commit();for(let i=0;i<3;i++){tick();context.FrostClient.actor('Unit 159',expanded,position);world.commit();}assert.equal(world.entity('Unit 159 part '+(expanded.length-1)).active,true);
const visual={parts,scale:2,rotation:[0,0,0,1]};context.FrostClient.environment('Scenery 139',visual,position);world.commit();
for(let i=0;i<3;i++){tick();context.FrostClient.environment('Scenery 139',visual,position);world.commit();}
assert.deepEqual(world.entity('Scenery 139 part 2').components.Transform.scale,[2,2,2]);assert.ok(world.entity('Scene / Environment/Scenery/Slots 128-159'));
const before=world.snapshot.entities.length;for(let i=0;i<1000;i++)context.FrostClient.actor('Unit '+(1000+i),null);world.commit();assert.equal(world.snapshot.entities.length,before);
context.FrostClient.effectPool.beginFrame();world.commit();context.FrostClient.actor('Unit 159',null);world.commit(true);tick();assert.equal(world.entity('Unit 159').active,false,'discarded hides are retried');
console.log('PASS presentation pools: compact scene, deferred Unit/Missile/environment creation, exact model part counts, grouped parents, grow/shrink/hide/reuse and discarded-command recovery');
