// Author: MiYu. Original caster windup, movement, interruption, Purge recovery, command cards and legacy saves.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {sourceCasterCases,sourceCasterFixture,stepCasters} from './test-frost-source-casters.mjs';
import {spellstealFixture} from './frost-human-spellsteal-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
export function casterFixture(key,options={}){const r=S.casterSpellRules.spells[key],c=sourceCasterCases.find(c=>c.kind===r.caster),f=sourceCasterFixture(c,options),{s,unit:u}=f;s.teams[0][c.field]=2;u.casterRank=2;u.hp=u.maxHp=S.sourceCasterRules.units[c.kind].hp+80;u.mana=400;u.x=0;u.z=-6;u.bloodlustAuto=u.raiseDeadAuto=false;const v=S.spawn(s,'soldier',key==='cripple'||key==='purge'?1:0,3,-6,{order:{type:'hold'},hp:10000,maxHp:10000,damage:0});let target=v.id;if(key==='raise'){const gun=S.spawn(s,'rifleman',1,12,-6,{damage:20000,order:{type:'hold'}});S.fire(s,gun,v);s.units=s.units.filter(w=>w!==gun);const body=s.corpses.find(c=>c.id===v.id);assert.ok(body);body.age=10;target=body.id;}S.visibility(s);return {...f,u,v,key,r,target};}
export const orderCaster=f=>S.command(f.s,0,{type:f.key==='raise'?'raiseDead':'casterSpell',ids:[f.u.id],...(f.key==='raise'?{corpse:f.target}:{spell:f.key,target:f.target})});
const active=f=>f.key==='raise'?f.s.units.filter(u=>u.summoned&&u.team===0).length===2:f.key==='purge'?f.v.purgeLeft>0:f.v[f.key]>0;
for(const key of Object.keys(S.casterSpellRules.spells)){
 const f=casterFixture(key),{s,u,r}=f;assert.equal(orderCaster(f),null);assert.equal(u.mana,400);assert.equal(active(f),false);S.tick(s);assert.equal(u.casterCast.left,r.castPoint);assert.equal(active(f),false);const during=S.restore(s);stepCasters(s,Math.ceil(r.castPoint/S.DT)-1);stepCasters(during,Math.ceil(r.castPoint/S.DT)-1);assert.deepEqual(s,during);assert.equal(active(f),false);const mana=u.mana;S.tick(s);S.tick(during);assert.deepEqual(s,during);assert.equal(active(f),true);assert.equal(u.casterCast,undefined);near(u.casterBackswing,r.castBackswing);near(u.mana,mana-r.cost);assert.ok(S.restore(s));const resumed=S.restore(s);stepCasters(s,Math.ceil(r.castBackswing/S.DT));stepCasters(resumed,Math.ceil(r.castBackswing/S.DT));assert.deepEqual(s,resumed);assert.equal(u.casterBackswing,undefined);
 console.log('PASS source spell '+key+': source cast point, deferred mana/effect/cooldown, full backswing and exact windup/backswing save continuation');
 for(const command of [{type:'stop'},{type:'move',x:-4,z:-6}]){const f=casterFixture(key);assert.equal(orderCaster(f),null);S.tick(f.s);S.tick(f.s);assert.ok(f.u.casterCast);assert.equal(S.command(f.s,0,{...command,ids:[f.u.id]}),null);assert.equal(f.u.casterCast,undefined);stepCasters(f.s,10);assert.equal(f.u.mana,400);assert.equal(active(f),false);assert.ok(S.restore(f.s));}
 const legacy=casterFixture(key,{casterSpellVersion:0});assert.equal(orderCaster(legacy),null);assert.equal(active(legacy),true);assert.equal(legacy.u.casterCast,undefined);legacy.s.pendingEvents=[];legacy.s.events=[];const old=S.clone(legacy.s);delete old.casterSpellVersion;const restored=S.restore(old);assert.equal(restored.casterSpellVersion,0);S.tick(legacy.s);S.tick(restored);assert.deepEqual(legacy.s,restored);
}
console.log('PASS all six source spells: stop/move interruption spends nothing; missing-version saves retain immediate legacy casting');
{
 const f=casterFixture('frenzy');f.v.x=10;S.visibility(f.s);assert.equal(orderCaster(f),null);let moved=false,started=false;for(let i=0;i<100&&!started;i++){const x=f.u.x;S.tick(f.s);moved ||=f.u.x!==x;started=!!f.u.casterCast;assert.equal(f.v.frenzy||0,0);}assert.ok(moved&&started);assert.ok(S.distance(f.u,f.v)<=f.r.range+1e-7);const saved=S.restore(f.s);stepCasters(f.s,5);stepCasters(saved,5);assert.deepEqual(f.s,saved);assert.ok(f.v.frenzy>0);
 for(const change of [f=>f.u.stun=1,f=>f.v.x=20,f=>f.u.hp=0]){const f=casterFixture('frenzy');orderCaster(f);S.tick(f.s);S.tick(f.s);change(f);S.tick(f.s);assert.equal(f.u.casterCast,undefined);assert.equal(f.u.mana,400);assert.equal(f.v.frenzy||0,0);assert.ok(S.restore(f.s));}
}
console.log('PASS source spell walking into range, invalidated target/stun/death cancellation and resource conservation');
for(const hero of [false,true]){
 const f=casterFixture('purge');if(hero){f.v.hp=0;f.v=S.spawn(f.s,'hero',1,3,-6,{heroClass:0,order:{type:'hold'}});f.target=f.v.id;S.visibility(f.s);}orderCaster(f);stepCasters(f.s,7);assert.ok(f.v.root>(hero?.8:2.8));assert.equal(f.v.sourcePurgeDuration,hero?5:15);near(S.moveRate(f.v),.2);stepCasters(f.s,hero?9:29);near(S.moveRate(f.v),.25);near(S.moveRate(S.publicState(f.s,0).units.find(v=>v.id===f.v.id)),.25);assert.ok(S.restore(f.s));const resumed=S.restore(f.s);stepCasters(f.s,hero?40:120);stepCasters(resumed,hero?40:120);assert.deepEqual(f.s,resumed);near(S.moveRate(f.v),1);
}
console.log('PASS source Purge: 3/1-second pauses, reciprocal five-step movement recovery, hero duration and saved continuation');
{
 const f=casterFixture('lightningShield');orderCaster(f);stepCasters(f.s,7);near(f.u.lightningShieldCd,3);assert.ok(orderCaster(f));assert.ok(S.restore(f.s));
 const old=casterFixture('lightningShield',{casterSpellVersion:0});orderCaster(old);assert.equal(old.u.lightningShieldCd,0);
}
console.log('PASS original Lightning Shield three-second cooldown and legacy zero-cooldown compatibility');
for(const key of ['raise','bloodlust']){
 const f=casterFixture(key);if(key==='raise')f.u.raiseDeadAuto=true;else{f.u.bloodlustAuto=true;f.v.damage=100;S.spawn(f.s,'soldier',1,4,-6,{order:{type:'hold'},damage:0});}S.visibility(f.s);S.tick(f.s);assert.ok(f.u.casterCast?.auto);assert.equal(active(f),false);const resumed=S.restore(f.s);stepCasters(f.s,Math.ceil(f.r.castPoint/S.DT));stepCasters(resumed,Math.ceil(f.r.castPoint/S.DT));assert.deepEqual(f.s,resumed);assert.equal(active(f),true);
}
console.log('PASS source Raise Dead and Bloodlust autocast use the same delayed, saved casting path');
{
 const f=casterFixture('frenzy');orderCaster(f);S.tick(f.s);for(const patch of [{left:-1},{left:9},{spell:'purge'},{target:0},{frame:f.s.frame+1},{auto:'true'}]){const raw=S.clone(f.s);Object.assign(raw.units.find(u=>u.id===f.u.id).casterCast,patch);assert.throws(()=>S.restore(raw),/caster spell/);}for(const value of [null,-1,2,'1']){assert.throws(()=>S.create('skirmish',{casterSpellVersion:value}),/caster spell/);const raw=S.clone(f.s);raw.casterSpellVersion=value;assert.throws(()=>S.restore(raw),/caster spell/);}for(const mode of ['moba','td','rpg'])assert.equal(S.create(mode).casterSpellVersion,0);assert.equal(S.create('skirmish',{sourceCasterVersion:0}).casterSpellVersion,0);
}
{
 globalThis.Frost=S;globalThis.FrostArt={};const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js'),f=casterFixture('raise');orderCaster(f);stepCasters(f.s,10);near(V.castPhase(f.u,{},false),.9);S.tick(f.s);assert.equal(V.castPhase(f.u,{},false),null);const legacy=casterFixture('raise',{casterSpellVersion:0});orderCaster(legacy);stepCasters(legacy.s,5);assert.notEqual(V.castPhase(legacy.u,{},false),null);
}
console.log('PASS source Raise Dead animation ends at original backswing without legacy cooldown phase replay');
for(const hero of [false,true]){
 const {s,breaker,donor,recipient:friend}=spellstealFixture(S);let enemy=donor;if(hero){s.units=s.units.filter(u=>u!==donor);enemy=S.spawn(s,'hero',1,1,0,{heroClass:2,cd:99,order:{type:'hold'}});}friend.purgeLeft=15;friend.sourcePurgeDuration=15;friend.root=3;S.visibility(s);assert.equal(S.command(s,0,{type:'spellSteal',ids:[breaker.id],target:friend.id}),null);stepCasters(s,4);assert.equal(enemy.sourcePurgeDuration,hero?5:15);assert.ok(enemy.purgeLeft>0&&enemy.purgeLeft<=(hero?5:15));assert.ok(enemy.root>0&&enemy.root<=(hero?1:3));assert.equal(friend.sourcePurgeDuration,undefined);assert.equal(friend.root,0);const restored=S.restore(s);stepCasters(s,2);stepCasters(restored,2);assert.deepEqual(s,restored);s.teams[0].humanSanctum.Rhpt=1;const priest=S.spawn(s,'humanpriest',0,-2,0,{mana:200,sanctumAuto:false,innerFireAuto:false,cd:99,order:{type:'hold'}});S.visibility(s);assert.equal(S.command(s,0,{type:'priestSpell',ids:[priest.id],spell:'Adis',x:enemy.x,z:enemy.z}),null);stepCasters(s,6);assert.equal(enemy.sourcePurgeDuration,undefined);assert.equal(enemy.purgeLeft,0);assert.equal(enemy.root,0);assert.ok(S.restore(s));
}
console.log('PASS source Purge Spell Steal preserves/caps hero recovery and root, real Priest dispel clears all source state');
const root=new URL('../samples/frostbound-realms/',import.meta.url),receipt=JSON.parse(fs.readFileSync(new URL('caster-spells-sources.json',root)));for(const r of receipt.files){const raw=fs.readFileSync(new URL(r.path,root));assert.equal(raw.length,r.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),r.sha256);}
console.log('PASS source cast/order/version validation and '+receipt.files.length+' authenticated spell-source/card files');
