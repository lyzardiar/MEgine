// Author: MiYu. Source Mountain King targeting, homing projectiles, Bash hits, additive Avatar and strict saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountainKingFixture} from './frost-mountain-king-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),M=require('../samples/frostbound-realms/game/mountain-king.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,args={})=>S.command(s,h.team,{type,ids:[h.id],...args}),learn=(s,h,slot,n=1)=>{for(let i=0;i<n;i++)assert.equal(cmd(s,h,'learn',{slot}),null);},enemy=(s,kind,x=4,z=0,extra={})=>S.spawn(s,kind,1,x,z,{damage:0,cd:10000,order:{type:'hold'},...extra});
{
 const {s,h}=mountainKingFixture(S);assert.equal(h.sourceHero,'Hmkg');assert.equal(h.maxHp,700);assert.equal(h.damage,31);assert.equal(S.maxMana(h),225);assert.ok(Math.abs(h.armorValue-2.3)<1e-8);assert.deepEqual(S.unitType(h).spells.map(r=>r.hotkey),['T','C','B','V']);assert.deepEqual(S.unitType(h).spells.map(r=>r.slot),[8,9,10,11]);assert.deepEqual(S.unitType(h).spells.map(r=>r.researchSlot),[0,1,2,3]);assert.ok(S.restore(s));
 const legacy=S.create('skirmish',{mountainKingVersion:0,heroes:[1,0],factions:[0,3],ai:[false,false]});delete legacy.mountainKingVersion;assert.equal(S.spawn(legacy,'hero',0,0,0,{heroClass:1}).sourceHero,undefined);assert.equal(S.restore(legacy).mountainKingVersion,0);assert.throws(()=>S.create('skirmish',{mountainKingVersion:2}),/version/);
}
console.log('PASS original Mountain King stats, source hotkeys/slots and legacy identity');
for(let rank=1;rank<=3;rank++){
 const {s,h}=mountainKingFixture(S,5);learn(s,h,0,rank);h.mana=S.maxMana(h);const target=enemy(s,'hippogryph',5),ally=S.spawn(s,'soldier',0,2,0),mechanical=enemy(s,'catapult',3),immune=enemy(s,'dryad',3,2);S.visibility(s);
 for(const v of [h,ally,mechanical,immune])assert.match(cmd(s,h,'spell',{slot:0,target:v.id}),/organic enemy/);assert.equal(S.canAttack(h,target),false);assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);const mana=h.mana,hp=target.hp;step(s,4);assert.equal(s.projectiles.length,1);assert.equal(target.hp,hp);assert.ok(h.mana<mana-74);assert.equal(s.projectiles[0].art,'mountain-bolt');assert.equal(s.projectiles[0].mountainBoltRank,rank);
 const saved=S.restore(s);target.z=1;saved.units.find(v=>v.id===target.id).z=1;step(s,8);step(saved,8);assert.deepEqual(saved,s);assert.equal(target.hp,hp-M.rules.abilities.AHtb.levels[rank-1].damage);assert.ok(target.stun>0);assert.ok(S.restore(s));
 const publicEnemy=S.publicState(s,1).units.find(u=>u.id===target.id);assert.ok(publicEnemy.mountainStunLeft>0);assert.equal(publicEnemy.mountainStun,undefined);assert.equal(S.publicState(s,1).units.find(u=>u.id===h.id)?.mountainKingCast,undefined);
}
console.log('PASS all Storm Bolt ranks, flying targets, no melee anti-air restriction, homing and saved flight continuation');
{
 const {s,h}=mountainKingFixture(S,5);learn(s,h,0,3);h.mana=S.maxMana(h);const target=enemy(s,'ghoul',5);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);step(s,2);assert.equal(cmd(s,h,'stop'),null);step(s,6);assert.equal(s.projectiles.length,0);assert.equal(h.spell[0],0);
 assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);target.x=10;step(s,4);assert.equal(h.spell[0],0);target.x=5;S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);step(s,4);const flight=S.restore(s);flight.projectiles[0].damage++;assert.throws(()=>S.restore(flight),/Storm Bolt/);target.itemMagicImmune=2;const hp=target.hp;step(s,10);assert.equal(target.hp,hp);assert.equal(target.stun||0,0);assert.ok(S.restore(s));
}
console.log('PASS cast interruption, target range recheck, immune impact and forged flight rejection');
for(let rank=1;rank<=3;rank++){
 const {s,h}=mountainKingFixture(S,5);learn(s,h,1,rank);h.mana=S.maxMana(h);const target=enemy(s,'abomination',2),air=enemy(s,'hippogryph',1,2),machine=enemy(s,'catapult',1,-2),immune=enemy(s,'dryad',-1,2);S.visibility(s);const hp=target.hp,airHp=air.hp,machineHp=machine.hp,immuneHp=immune.hp;assert.equal(cmd(s,h,'spell',{slot:1}),null);step(s,4);assert.equal(target.hp,hp-M.rules.abilities.AHtc.levels[rank-1].damage);assert.equal(air.hp,airHp);assert.equal(machine.hp,machineHp);assert.equal(immune.hp,immuneHp);assert.equal(target.mountainClap.left,5);assert.equal(S.moveRate(target),.5);assert.equal(S.attackRate(target),.5);const saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(saved,s);assert.ok(S.restore(s));step(s,31);assert.equal(target.mountainClap,undefined);assert.equal(S.moveRate(target),1);
}
console.log('PASS all Thunder Clap ranks, ground organic mask, exact slow/attack reduction, expiry and save continuation');
{
 const {s,h}=mountainKingFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);const target=enemy(s,'ghoul',20,20,{damage:10000}),hp=h.hp,normal=M.stats(h,S.items);h.hp=100;h.slow=2;assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,4);assert.equal(h.maxHp,normal.maxHp+500);assert.equal(h.damage,normal.damage+20);assert.ok(Math.abs(h.armorValue-normal.armorValue-5)<1e-8);assert.ok(h.hp>=600);assert.equal(h.slow,0);assert.equal(h.mountainAvatarLeft,60);assert.ok(S.magicImmune(h));assert.equal(h.avatar,undefined);assert.match(cmd(s,h,'spell',{slot:3}),/not ready/);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.mountainAvatarLeft,60);const saved=S.restore(s);step(s,20);step(saved,20);assert.deepEqual(saved,s);const forged=S.restore(s);forged.units[0].mountainAvatarLeft=61;assert.throws(()=>S.restore(forged),/Avatar|Mountain King/);const badStats=S.restore(s);badStats.units[0].damage++;assert.throws(()=>S.restore(badStats),/Mountain King/);
 h.mountainAvatarLeft=.1;h.hp=200;step(s,1);assert.equal(h.mountainAvatarLeft,undefined);assert.equal(h.maxHp,normal.maxHp);assert.ok(h.hp>=1);assert.equal(h.damage,normal.damage);assert.equal(S.magicImmune(h),false);assert.ok(S.restore(s));h.spell[3]=0;h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,4);S.fire(s,target,h);assert.equal(h.hp,0);assert.equal(h.mountainAvatarLeft,undefined);assert.equal(h.maxHp,normal.maxHp);assert.ok(S.restore(s));assert.ok(hp>0);
}
console.log('PASS additive Avatar stats, health transition, no cancellation, expiry, death reset and strict saves');
{
 const {s,h}=mountainKingFixture(S,5);learn(s,h,2,3);const target=enemy(s,'dryad',20,20,{maxHp:10000,hp:10000}),shield=enemy(s,'hero',20,22,{heroClass:3,sourceHero:undefined});let procs=0;for(let i=0;i<100;i++){const before=s.rng;S.fire(s,h,target);if(target.mountainStun){procs++;assert.equal(target.mountainStun.left,2);delete target.mountainStun;target.stun=0;}assert.notEqual(s.rng,before);}assert.ok(procs>20&&procs<65);const r=s.rng;shield.divineShield=10;S.fire(s,h,shield);assert.equal(s.rng,((Math.imul((Math.imul(r,1664525)+1013904223)>>>0,1664525)+1013904223)>>>0));assert.equal(shield.mountainStun,undefined);assert.match(cmd(s,h,'spell',{slot:2}),/passive/);
}
console.log('PASS deterministic Bash on real hits, magic-immune stun and no proc through invulnerability');
{
 const {s,h}=mountainKingFixture(S,5);learn(s,h,2,3);h.cd=0;const target=enemy(s,'abomination',.6,0,{hp:10000,maxHp:10000});h.order={type:'attack',target:target.id};S.visibility(s);let found=false;for(let i=0;i<100;i++){step(s,1);assert.ok(S.restore(s));if(target.mountainStun){found=true;assert.ok(target.stun+1e-6>=target.mountainStun.left);}}assert.ok(found);
}
console.log('PASS Bash through the actual attack windup/tick loop and restore on every frame');
{
 const {s,h}=mountainKingFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);h.root=2.5;h.cold=4;assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,4);assert.equal(h.root,0);assert.equal(h.cold,0);const tower=enemy(s,'nerubiantower',5,0,{order:null});S.fire(s,tower,h);step(s,30);assert.equal(h.cold,0);assert.equal(S.moveRate(h),1);assert.ok(S.restore(s));
}
console.log('PASS Avatar generic root cleansing and subsequent physical attack debuff immunity');
{
 const {s,h}=mountainKingFixture(S,3);learn(s,h,0,2);h.mana=S.maxMana(h);const target=enemy(s,'abomination',5),worker=S.spawn(s,'worker',0,-3,0,{order:{type:'hold'}});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);step(s,4);const saved=S.restore(s);saved.projectiles[0].source=worker.id;assert.throws(()=>S.restore(saved),/Storm Bolt/);const forged=S.restore(s);forged.units.find(u=>u.id===h.id).skills=[1,0,0,0];forged.units.find(u=>u.id===h.id).skillPoints=2;assert.throws(()=>S.restore(forged),/Storm Bolt/);
}
console.log('PASS Storm Bolt actual caster identity and learned rank validation');
{
 const {s,h}=mountainKingFixture(S);h.inventory=[25];h.itemUses=[S.items[25].charges||0];h.faerieFire=10;h.faerieTeam=1;h.root=2;assert.ok(S.restore(s));assert.equal(cmd(s,h,'useItem',{slot:0,item:25}),null);assert.equal(h.faerieFire,0);assert.equal(h.faerieTeam,undefined);assert.equal(h.root,0);assert.ok(S.magicImmune(h));assert.ok(S.restore(s));
}
console.log('PASS anti-magic potion hostile-effect cleansing and immediately valid save');
{
 const {s,h}=mountainKingFixture(S,6);S.setAI(s,0,true);step(s,40);assert.deepEqual(h.skills,[3,1,1,1]);assert.ok(S.restore(s));
}
console.log('PASS original Mountain King AI learning order');
