// Author: MiYu. Blood Mage spells, ethereal combat, mana conservation, Phoenix lifecycle and deterministic saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bloodMageFixture} from './frost-blood-mage-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),B=require('../samples/frostbound-realms/game/blood-mage.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,args={})=>S.command(s,h.team,{type,ids:[h.id],...args}),learn=(s,h,slot,n=1)=>{for(let i=0;i<n;i++)assert.equal(cmd(s,h,'learn',{slot}),null);},target=(s,kind='ghoul',team=1,x=4,extra={})=>S.spawn(s,kind,team,x,0,{damage:0,cd:10000,order:{type:'hold'},...extra});
{
 const {s,h}=bloodMageFixture(S);assert.equal(h.sourceHero,'Hblm');assert.equal(h.maxHp,550);assert.equal(h.damage,24);assert.equal(S.maxMana(h),285);assert.ok(Math.abs(h.armorValue-2.2)<1e-8);assert.deepEqual(S.unitType(h).spells.map(r=>r.hotkey),['F','B','N','X']);assert.ok(S.restore(s));
 const old=S.create('skirmish',{bloodMageVersion:0,heroes:[2,0],factions:[0,3],ai:[false,false]});delete old.bloodMageVersion;delete old.flameStrikes;assert.equal(S.restore(old).bloodMageVersion,0);assert.equal(S.spawn(old,'hero',0,0,0,{heroClass:2}).sourceHero,undefined);assert.throws(()=>S.create('skirmish',{bloodMageVersion:2}),/version/);
}
console.log('PASS Blood Mage source attributes, four hotkeys and legacy identity');
for(let rank=1;rank<=3;rank++){
 const {s,h}=bloodMageFixture(S,5);learn(s,h,0,rank);h.mana=S.maxMana(h);const v=target(s,'ghoul',1,4,{hp:2000,maxHp:2000}),ally=target(s,'soldier',0,4,{hp:2000,maxHp:2000}),air=target(s,'dragon',1,4),immune=target(s,'dryad',1,4);S.visibility(s);const airHp=air.hp,immuneHp=immune.hp;assert.equal(cmd(s,h,'spell',{slot:0,x:4,z:0}),null);step(s,7);assert.equal(s.flameStrikes.length,1);assert.equal(v.hp,2000);const copy=S.restore(s);step(s,60);step(copy,60);assert.deepEqual(copy,s);assert.ok(v.hp<2000);assert.ok(ally.hp<2000);assert.equal(air.hp,airHp);assert.equal(immune.hp,immuneHp);step(s,50);assert.equal(s.flameStrikes.length,0);assert.ok(S.restore(s));
}
console.log('PASS Flame Strike ranks, delay, full/residual damage, friendly fire, air/magic exclusions and saved continuation');
{
 const {s,h}=bloodMageFixture(S,5);learn(s,h,0);h.mana=S.maxMana(h);const v=target(s);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,x:4,z:0}),null);step(s,2);assert.equal(cmd(s,h,'stop'),null);step(s,20);assert.equal(s.flameStrikes.length,0);assert.equal(h.spell[0],0);assert.equal(cmd(s,h,'spell',{slot:0,x:4,z:0}),null);step(s,6);const malformed=S.clone(s);malformed.flameStrikes[0].rank=4;assert.throws(()=>S.restore(malformed),/Flame Strike/);
}
console.log('PASS interrupted Flame Strike spends no mana and invalid saved fire is rejected');
for(let rank=1;rank<=3;rank++){
 const {s,h}=bloodMageFixture(S,5);learn(s,h,1,rank);h.mana=S.maxMana(h);const v=target(s),a=S.spawn(s,'soldier',0,3,0),mage=S.spawn(s,'mage',0,3,0);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:1,target:v.id}),null);step(s,6);assert.ok(v.banish);assert.equal(S.canAttack(v,h),false);assert.equal(S.canAttack(a,v),false);assert.equal(S.canAttack(mage,v),true);assert.equal(S.moveRate(v),.5);const hp=v.hp,p=S.spawn(s,'soldier',0,3,0);S.fire(s,p,v);assert.equal(v.hp,hp);const saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(saved,s);const pub=S.publicState(s,1).units.find(u=>u.id===v.id);assert.equal(pub.banish,undefined);assert.ok(pub.banishLeft>0);
}
console.log('PASS Banish ranks, ethereal attack restrictions, movement, restored duration and public effect');
for(let rank=1;rank<=3;rank++){
 const {s,h}=bloodMageFixture(S,5);learn(s,h,2,rank);h.mana=S.maxMana(h);const v=target(s,'necromancer',1,4,{mana:200});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:2,target:v.id}),null);step(s,6);assert.ok(h.siphonMana);const copy=S.restore(s);step(s,30);step(copy,30);assert.deepEqual(copy,s);assert.ok(h.mana>S.maxMana(h));assert.equal(h.siphonBonusRank,rank);assert.ok(v.mana<200);assert.ok(S.restore(s));const pub=S.publicState(s,1).units.find(u=>u.id===h.id);assert.equal(pub.siphonMana,undefined);assert.ok(pub.siphonManaLeft>0);assert.equal(cmd(s,h,'stop'),null);const excess=h.mana;step(s,10);assert.ok(Math.abs(h.mana-Math.max(S.maxMana(h),excess-3))<1e-6);assert.ok(S.restore(s));
 const bad=S.clone(s);bad.units.find(u=>u.id===h.id).siphonBonusRank=4;assert.throws(()=>S.restore(bad),/Blood Mage/);
}
console.log('PASS Siphon Mana ranks, overflow retention, stop/decay, saved channels and public privacy');
{
 const {s,h}=bloodMageFixture(S,5);learn(s,h,2,3);h.mana=300;const v=target(s,'shaman',0,4,{mana:0});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:2,target:v.id}),null);step(s,16);assert.ok(v.mana>=90);assert.ok(h.mana<210);assert.ok(S.restore(s));v.x=20;step(s,1);assert.equal(h.siphonMana,undefined);h.spell[2]=0;assert.match(cmd(s,h,'spell',{slot:2,target:h.id}),/organic target/);
}
console.log('PASS friendly mana transfer, finite exchange, tether break and self-target rejection');
{
 const {s,h}=bloodMageFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,6);let p=s.units.find(S.phoenixUnit);assert.ok(p);assert.equal(p.maxHp,1250);const initialHp=p.hp;assert.equal(p.kind,'phoenix');assert.equal(p.expires,undefined);assert.ok(S.magicImmune(p));assert.ok(S.restore(s));const saved=S.restore(s);step(s,30);step(saved,30);assert.deepEqual(saved,s);assert.equal(p.hp,initialHp-75);step(s,470);assert.equal(p.kind,'phoenixegg');assert.equal(p.maxHp,200);assert.ok(p.phoenixEggLeft>0);assert.ok(S.restore(s));const eggSave=S.restore(s);step(s,100);step(eggSave,100);assert.deepEqual(eggSave,s);assert.equal(p.kind,'phoenix');assert.equal(p.maxHp,1250);assert.ok(S.restore(s));
 p.hp=1;const attacker=target(s,'ghoul',1,p.x);attacker.damage=100;S.fire(s,attacker,p);assert.equal(p.kind,'phoenixegg');assert.equal(p.hp,200);S.fire(s,attacker,p);S.fire(s,attacker,p);assert.equal(p.hp,0);step(s,110);assert.ok(!s.units.some(u=>u.id===p.id&&u.hp>0));assert.ok(S.restore(s));
}
console.log('PASS Phoenix health decay, permanent summon, egg/rebirth, destructible egg and saved continuation');
{
 const {s,h}=bloodMageFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);const v=target(s,'ghoul',1,4,{hp:2000,maxHp:2000});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,7);const p=s.units.find(S.phoenixUnit);assert.ok(s.projectiles.some(p=>p.phoenixFireProjectile));assert.equal(v.phoenixFire,undefined);step(s,6);assert.ok(v.phoenixFire);assert.ok(v.hp<2000);p.cd=0;S.fire(s,p,v);assert.equal(s.projectiles.at(-1).art,'phoenix');const saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(saved,s);assert.ok(S.restore(s));
}
console.log('PASS Phoenix automatic fire, original projectile and saved fire/flight');
{
 const {s,h}=bloodMageFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,6);const p=s.units.find(S.phoenixUnit);p.cd=10000;const direct=target(s,'ghoul',1,4,{hp:2000,maxHp:2000}),near=target(s,'ghoul',1,4.5,{hp:2000,maxHp:2000}),far=target(s,'ghoul',1,4.9,{hp:2000,maxHp:2000}),immune=target(s,'dryad',1,4.5);S.visibility(s);S.fire(s,p,direct);const raw=s.projectiles.at(-1).damage,immuneHp=immune.hp;p.phoenixFireCd=10000;step(s,3);assert.ok(direct.hp<2000);assert.ok(Math.abs((2000-near.hp)-(2000-direct.hp)*.5)<1e-6);assert.ok(Math.abs((2000-far.hp)-(2000-direct.hp)*.25)<1e-6);assert.equal(immune.hp,immuneHp);assert.ok(raw>=61&&raw<=75);
}
console.log('PASS Phoenix source weapon dice, full/half/quarter splash and magic-immune exclusion');
{
 const {s,h}=bloodMageFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,6);const p=s.units.find(S.phoenixUnit),bad=S.clone(s);bad.units.find(u=>u.id===p.id).summoner=h.id+1;assert.throws(()=>S.restore(bad),/Phoenix/);const duplicate=S.clone(s);duplicate.units.push({...duplicate.units.find(u=>u.id===p.id),id:++duplicate.serial});assert.throws(()=>S.restore(duplicate),/Phoenix/);p.hp=1;step(s,1);const egg=S.clone(s);egg.units.find(u=>u.id===p.id).phoenixEggLeft=1;assert.throws(()=>S.restore(egg),/Phoenix/);
 const f=bloodMageFixture(S,3);learn(f.s,f.h,0);f.h.mana=S.maxMana(f.h);assert.equal(cmd(f.s,f.h,'spell',{slot:0,x:4,z:0}),null);step(f.s,7);const fire=S.clone(f.s);fire.flameStrikes[0].next=fire.flameStrikes[0].age;assert.throws(()=>S.restore(fire),/Flame Strike/);
}
console.log('PASS forged Phoenix owners/duplicates/egg timers and off-schedule Flame Strike saves rejected');
