// Author: MiYu. Exercise streamed ribbons and sampled effects at cold high slots with deferred and discarded native commands.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(source.replace('  return {tick};','  return {tick,spell,actor,effectPool};'),context);context.onTick(0);world.commit();
const hidden=[0,-100,0],part={mesh:'cube',material:'Assets/Materials/Selection.mmat',visible:true,color:[1,1,1,1]},position=[8,2,3],scale=[2,2,2],rotation=[0,0,0,1],families=['Siphon','Healing Wave','Chain Lightning','Far Sight','Shockwave'];
for(const [i,family] of families.entries()){
 const name='Classic '+family+' '+(1301+i),sampled=i>=3,template=world.entity('Classic '+family+' 0'),effect={component:{...template.components.SampledEffect,time_seconds:.2},position,scale,rotation,parts:sampled?(family==='Shockwave'?[part,part]:[part]):[part]};
 const show=()=>sampled?context.FrostClient.spell(name,effect):context.FrostClient.actor(name,effect.parts,position,scale,rotation);
 const hide=()=>sampled?context.FrostClient.spell(name,null):context.FrostClient.actor(name,null);
 assert.equal(world.entity(name),undefined);hide();world.commit();assert.equal(world.entity(name),undefined,'hide does not allocate a cold slot');
 show();world.commit(true);
 for(let frame=0;frame<9;frame++){context.FrostClient.effectPool.beginFrame();show();world.commit();}
 const created=world.entity(name);assert.equal(created.active,true);assert.deepEqual(created.components.Transform.position,position);assert.ok(created.parent);
 if(sampled)for(let j=0;j<effect.parts.length;j++){const child=world.entity(name+' mesh '+j);assert.equal(child.parent,created.entity);assert.equal(child.active,true);assert.deepEqual(child.components.Transform.position,[0,0,0]);}
 context.FrostClient.effectPool.beginFrame();world.commit();hide();world.commit(true);context.FrostClient.effectPool.beginFrame();world.commit();assert.equal(world.entity(name).active,false,'discarded hide is retried');
 const count=world.snapshot.entities.length;show();world.commit();assert.equal(world.entity(name).active,true);assert.equal(world.snapshot.entities.length,count,'reactivation reuses the existing nodes');hide();world.commit();
}
console.log(JSON.stringify({passed:true,families,coldSlotsAbove:1300,initialEntities:scene.entities.length,finalEntities:world.snapshot.entities.length,deferred:true,droppedSpawnAndHideRecovered:true,reused:true}));
