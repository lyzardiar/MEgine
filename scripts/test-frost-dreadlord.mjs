// Author: MiYu. Authoritative Dreadlord traveling swarm, phased sleep, aura, Inferno and strict save checks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dreadlordFixture} from './frost-dreadlord-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),D=require('../samples/frostbound-realms/game/dreadlord.js'),hold={cd:10000,order:{type:'hold'}},step=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),learn=(s,h,slot,rank=1)=>{for(let i=0;i<rank;i++)assert.equal(cmd(s,h,'learn',{slot}),null);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,h}=dreadlordFixture(S);assert.equal(h.sourceHero,'Udre');assert.equal(h.maxHp,600);assert.equal(h.mana,100);assert.equal(S.maxMana(h),270);assert.equal(h.damage,27);near(h.armorValue,2.8);assert.ok(S.restore(s));assert.throws(()=>S.create('skirmish',{dreadlordVersion:2}),/Dreadlord/);const bad=S.clone(s);bad.units[0].strength++;assert.throws(()=>S.restore(bad),/Dreadlord/);
 const old=S.create('skirmish',{map:s.map,factions:[3,0],dreadlordVersion:0});S.spawn(old,'hero',0,0,0,{heroClass:2});delete old.dreadlordVersion;delete old.carrionSwarms;delete old.infernos;assert.equal(S.restore(old).dreadlordVersion,0);
}
console.log('PASS Dreadlord source recruitment, strength stats, version gate and forged identity');
for(const rank of [1,2,3]){
 const {s,h}=dreadlordFixture(S,6);learn(s,h,0,rank);h.mana=S.maxMana(h);const targets=Array.from({length:8},(_,i)=>S.spawn(s,'soldier',1,2+i*.7,0,{...hold,hp:2000,maxHp:2000})),ally=S.spawn(s,'ghoul',0,3,0,hold),immune=S.spawn(s,'dryad',1,3,1,hold),outside=S.spawn(s,'soldier',1,2,4,hold);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,2);assert.equal(s.carrionSwarms.length,0);step(s);assert.equal(s.carrionSwarms[0].travel,0);const saved=S.restore(s);step(s,8);step(saved,8);assert.deepEqual(saved,s);near(targets.reduce((n,v)=>n+2000-v.hp,0),[300,600,1000][rank-1]);assert.equal(ally.hp,ally.maxHp);assert.equal(immune.hp,immune.maxHp);assert.equal(outside.hp,outside.maxHp);assert.equal(s.carrionSwarms.length,0);assert.ok(S.restore(s));
}
console.log('PASS ranked traveling conical Swarm damage budget, alliance/immunity and deterministic restore');
{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,0);h.mana=S.maxMana(h);const tip=S.spawn(s,'soldier',1,7,2.5,hold),early=S.spawn(s,'soldier',1,1,2,hold),air=S.spawn(s,'dragon',1,5,0,hold);S.visibility(s);const hp=[tip,early,air].map(v=>v.hp);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,3);assert.equal(cmd(s,h,'move',{x:-5,z:0}),null);step(s,8);near(tip.hp,hp[0]-75);assert.equal(early.hp,hp[1]);near(air.hp,hp[2]-75);assert.ok(S.restore(s));
}
console.log('PASS Swarm expanding cone edges, air targets and independence from subsequent movement');
for(const rank of [1,2,3]){
 const {s,h}=dreadlordFixture(S,6);learn(s,h,1,rank);h.mana=S.maxMana(h);const v=S.spawn(s,'soldier',1,4,0,hold),ally=S.spawn(s,'soldier',1,5,0,hold);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:1,target:v.id}),null);step(s,3);near(v.dreadSleep.left,rank*20);near(S.sleepProtection(v),2);assert.equal(S.asleep(s,v),true);assert.equal(S.canAttack(ally,v),false);const hp=v.hp;S.fire(s,ally,v);assert.equal(v.hp,hp);assert.ok(v.dreadSleep);assert.match(cmd(s,v,'spell',{slot:0}),/asleep/);const saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(saved,s);near(S.sleepProtection(v),0);const pub=S.publicState(s,1).units.find(u=>u.id===v.id);assert.equal(pub.dreadSleep,undefined);near(pub.sleepLeft,v.dreadSleep.left);assert.equal(pub.sleeping,true);assert.equal(S.canDeny(s,1,v),true);S.fire(s,ally,v);assert.ok(v.hp<hp);assert.equal(v.dreadSleep,undefined);assert.ok(S.restore(s));
}
console.log('PASS ranked Sleep, initial protection, damage wakeup, allied wake attacks and private projection');
{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,1);h.mana=S.maxMana(h);const hero=S.spawn(s,'hero',1,4,0,{...hold,heroClass:1,level:6,skillPoints:6});learn(s,hero,0);hero.mana=S.maxMana(hero);S.visibility(s);assert.equal(cmd(s,hero,'spell',{slot:0,target:h.id}),null);assert.equal(cmd(s,h,'spell',{slot:1,target:hero.id}),null);step(s,3);assert.equal(hero.mountainKingCast,undefined);near(hero.dreadSleep.left,5);step(s,50);assert.equal(hero.dreadSleep,undefined);assert.ok(S.restore(s));
}
console.log('PASS Sleep interrupts an enemy hero cast and uses hero duration');
for(const rank of [1,2,3]){
 const {s,h}=dreadlordFixture(S,6);learn(s,h,2,rank);const melee=S.spawn(s,'soldier',0,3,0,{...hold,hp:100}),enemy=S.spawn(s,'soldier',1,4,0,{...hold,hp:1}),ranged=S.spawn(s,'rifleman',0,3,2,{...hold,hp:100});S.visibility(s);near(S.vampiricAura(s,melee),[.15,.3,.45][rank-1]);S.fire(s,melee,enemy);near(melee.hp,100+[.15,.3,.45][rank-1]);assert.equal(melee.vampiricFrame,s.frame);const v=S.spawn(s,'soldier',1,5,2,hold);S.fire(s,ranged,v);step(s,10);assert.equal(ranged.vampiricFrame,undefined);assert.ok(S.restore(s));assert.match(cmd(s,h,'spell',{slot:2}),/passive/);h.hp=0;near(S.vampiricAura(s,melee),0);
}
console.log('PASS strongest ranked melee Vampiric Aura, effective damage, ranged exclusion and passive command');
{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);const v=S.spawn(s,'soldier',1,5,0,{...hold,hp:2000,maxHp:2000}),hero=S.spawn(s,'hero',1,6,1,{...hold,heroClass:0}),ally=S.spawn(s,'ghoul',0,4,0,hold),building=S.spawn(s,'farm',1,6,-1),air=S.spawn(s,'dragon',1,5,1,hold);S.visibility(s);const hp=[v,hero,ally,building,air].map(v=>v.hp);assert.equal(cmd(s,h,'spell',{slot:3,x:5,z:0}),null);step(s,3);assert.equal(s.infernos[0].left,1);assert.equal(cmd(s,h,'move',{x:-5,z:0}),null);const saved=S.restore(s);step(s,9);assert.equal(v.hp,hp[0]);step(s);step(saved,10);assert.deepEqual(saved,s);near(v.hp,hp[0]-50);assert.equal(s.events.find(e=>e.type==='damage'&&e.x===hero.x&&e.z===hero.z).amount,35);assert.ok(hero.hp<hp[1]);near(v.dreadStun.left,4);near(hero.dreadStun.left,2);near(building.hp,hp[3]-50);assert.equal(ally.hp,hp[2]);assert.equal(air.hp,hp[4]);const infernal=s.units.find(S.infernalUnit);assert.ok(infernal);assert.equal(infernal.maxHp,1500);assert.equal(infernal.damage,54.5);assert.equal(S.magicImmune(infernal),true);assert.equal(S.heroDuration(infernal),true);assert.equal(infernal.expires-infernal.infernalBorn,1800);assert.ok(S.restore(s));const before=v.hp;step(s,10);assert.ok(v.hp<=before-10);assert.ok(S.restore(s));
 const corrupt=S.clone(s);corrupt.units.find(S.infernalUnit).expires++;assert.throws(()=>S.restore(corrupt),/Infernal/);step(s,infernal.expires-s.frame);assert.equal(infernal.hp,0);
}
console.log('PASS delayed Inferno landing, hero/structure/air rules, saved continuation and original Infernal lifetime/passives');
{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,0);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);assert.match(cmd(s,h,'move',{x:100,z:0}),/map|point|outside|destination/i);assert.ok(h.dreadlordCast);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.dreadlordCast,undefined);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,3);const bad=S.clone(s);bad.carrionSwarms[0].damageLeft--;assert.throws(()=>S.restore(bad),/Swarm/);bad.carrionSwarms[0].damageLeft++;bad.carrionSwarms[0].hits=[h.id];assert.throws(()=>S.restore(bad),/Swarm/);
}
console.log('PASS accepted/rejected order interruption and forged Swarm state rejection');

{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,1);h.mana=S.maxMana(h);s.teams[1].shamanism=2;const shaman=S.spawn(s,'shaman',1,4,0,{...hold,bloodlustAuto:false}),ally=S.spawn(s,'soldier',1,5,0,hold);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:1,target:shaman.id}),null);step(s,3);const mana=shaman.mana;assert.match(cmd(s,shaman,'casterSpell',{spell:'bloodlust',target:ally.id}),/asleep/);assert.equal(shaman.mana,mana);assert.ok(!ally.bloodlust);assert.ok(S.restore(s));
 const hero=S.spawn(s,'hero',1,4,2,{...hold,heroClass:0,inventory:[25]});h.spell[1]=0;h.mana=S.maxMana(h);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:1,target:hero.id}),null);step(s,3);assert.match(cmd(s,hero,'useItem',{slot:0,item:25}),/asleep/);assert.deepEqual(hero.inventory,[25]);assert.ok(hero.dreadSleep);assert.ok(S.restore(s));
 assert.equal(cmd(s,shaman,'move',{x:6,z:0}),null);const x=shaman.x;step(s);assert.equal(shaman.x,x);
 const other=dreadlordFixture(S,6);other.s.teams[1].faction=2;other.s.teams[1].abolishMagic=1;learn(other.s,other.h,1);other.h.mana=S.maxMana(other.h);const sleeper=S.spawn(other.s,'soldier',1,4,0,hold),dryad=S.spawn(other.s,'dryad',1,5,0,{...hold,abolishAuto:false});S.visibility(other.s);assert.equal(cmd(other.s,other.h,'spell',{slot:1,target:sleeper.id}),null);step(other.s,3);assert.equal(cmd(other.s,dryad,'abolish',{target:sleeper.id}),null);step(other.s,3);assert.equal(sleeper.dreadSleep,undefined);assert.ok(S.restore(other.s));
}
console.log('PASS Sleep blocks immediate caster/items without consuming mana/items; allied dispel and queued movement');
{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);s.teams[1].faction=1;const tauren=S.spawn(s,'hero',1,5,0,{...hold,heroClass:2,level:6,skillPoints:6});learn(s,tauren,3);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:3,x:5,z:0}),null);step(s,13);assert.ok(tauren.dreadStun);S.spawn(s,'soldier',0,4,0,{damage:9999,cd:0,order:{type:'attack',target:tauren.id}});step(s);assert.ok(tauren.reincarnation);assert.equal(tauren.dreadStun,undefined);const restored=S.restore(s);step(s,35);step(restored,35);assert.deepEqual(restored,s);
}
console.log('PASS Inferno-stunned Tauren death/reincarnation restores within the same tick and continues deterministically');
{
 const {s,h}=dreadlordFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3,x:5,z:0}),null);step(s,3);while(s.units.length<S.LIMIT-1)assert.ok(S.spawn(s,'soldier',0,-20,20,hold));assert.equal(S.spawn(s,'soldier',0,-20,20,hold),null);step(s,10);assert.equal(s.units.length,S.LIMIT);assert.equal(s.units.filter(S.infernalUnit).length,1);assert.ok(s.infernalImpacts.length);assert.ok(S.restore(s));const bad=S.clone(s);bad.infernalImpacts[0].frame=s.frame+1;assert.throws(()=>S.restore(bad),/Infernal impact/);
}
console.log('PASS released Inferno reserves unit capacity until landing; persistent impact restore and forged clock rejection');
