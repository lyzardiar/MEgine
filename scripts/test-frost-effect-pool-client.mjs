// Author: MiYu. Check real generated client status, spell and attachment lifetime against deferred native commands.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world,source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8');
assert.equal(source.split('  return {tick};').length,2);
const world=clientWorldFixture(scene,true),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(source.replace('  return {tick};','  return {tick,spell,effectPool};'),context);
const tick=()=>{context.onTick(0);world.commit();};tick();
const part={mesh:'cube',material:'Assets/Materials/Selection.mmat',visible:true,color:[1,.5,.25,1]},effect={component:{effect:context.FrostEffectArt.effects.HealingSalveTarget.effect,clip:0,playing:false,looping:true,time_seconds:.3,speed:1},position:[3,4,5],scale:[2,2,2],rotation:[0,0,0,1],parts:[part]};
const names=['Classic spell 201 holyLight','Classic status 159 recovery','Classic attachment 158 0'];
for(const name of names){const value={...effect,parts:name.includes('status')?[]:[part]};context.FrostClient.spell(name,value);world.commit();assert.equal(world.entity(name).active,false);for(let i=0;i<3;i++){tick();context.FrostClient.spell(name,value);world.commit();}assert.equal(world.entity(name).active,true);assert.deepEqual(world.entity(name).components.Transform.position,effect.position);assert.ok(world.entity(name).parent);if(value.parts.length){assert.equal(world.entity(name+' mesh 0').parent,world.entity(name).entity);assert.deepEqual(world.entity(name+' mesh 0').components.Transform.position,[0,0,0]);}}
const attachment=names[2],larger={...effect,parts:[part,part,part]};context.FrostClient.spell(attachment,larger);world.commit();for(let i=0;i<3;i++){tick();context.FrostClient.spell(attachment,larger);world.commit();}assert.equal(world.entity(attachment+' mesh 2').active,true);
context.FrostClient.spell(attachment,effect);world.commit();assert.equal(world.entity(attachment+' mesh 1').active,false);assert.equal(world.entity(attachment+' mesh 2').active,false);
context.FrostClient.spell(attachment,null);world.commit();assert.equal(world.entity(attachment).active,false);
const before=world.queries();
for(let i=0;i<1000;i++)context.FrostClient.spell('Classic spell '+(300+i)+' holyLight',null);
assert.equal(world.queries(),before);
const existing=world.snapshot.entities.length;context.FrostClient.spell(attachment,effect);world.commit();assert.equal(world.entity(attachment).active,true);assert.equal(world.snapshot.entities.length,existing);
context.FrostClient.spell(attachment,null);world.commit();tick();context.FrostClient.spell(attachment,{...effect,position:[8,9,10]});world.commit(true);assert.equal(world.entity(attachment).active,false);
tick();context.FrostClient.spell(attachment,{...effect,position:[8,9,10]});world.commit();assert.equal(world.entity(attachment).active,true);assert.deepEqual(world.entity(attachment).components.Transform.position,[8,9,10]);
context.FrostClient.effectPool.beginFrame();world.commit();context.FrostClient.spell(attachment,null);world.commit(true);assert.equal(world.entity(attachment).active,true);context.FrostClient.effectPool.beginFrame();world.commit();assert.equal(world.entity(attachment).active,false,'a one-off hide survives a discarded script tick');
context.FrostClient.effectPool.beginFrame();world.commit();const confirmed=world.queries();context.FrostClient.effectPool.beginFrame();world.commit();assert.equal(world.queries(),confirmed,'native field order, defaults and f32 values acknowledge static writes');
console.log(JSON.stringify({author:'MiYu',passed:true,checks:16,initialEntities:scene.entities.length,finalEntities:world.snapshot.entities.length,scope:'Generated Main.js with deferred commits; all three pool kinds, slots beyond LIMIT, identity child transforms, part growth/shrink, hide/reuse, absent-hide lookup suppression, discarded command recovery and native-normalized snapshot acknowledgement.'}));
