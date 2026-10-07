// Author: MiYu. Source poison values, real impacts, save continuity, dispels and bounded public state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),root=new URL('../samples/frostbound-realms/',import.meta.url),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),cmd=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra});
function fixture(kind='soldier',extra={},factions=[2,0]){const map=S.defaultMap();map.units=[];map.props=[];map.triggers=[];map.doodads=[];map.startingHour=12;for(const key of ['terrain','heights','relief','ramps'])map[key].fill(0);const s=S.create('skirmish',{map,factions,ai:[false,false]});s.units=[];S.spawn(s,'hall',0,-24,24);S.spawn(s,'hall',1,24,-24);const a=S.spawn(s,'dryad',0,0,0,{abolishAuto:false}),b=S.spawn(s,kind,1,3,0,{damage:0,order:{type:'hold'},...extra});S.visibility(s);return {s,a,b};}
function hit(s,a,b){const before=b.slowPoison?.length||0;a.stun=0;assert.equal(S.fire(s,a,b),true);a.stun=10;for(let n=0;n<30&&(b.slowPoison?.length||0)===before;n++)S.tick(s);assert.equal(b.slowPoison?.length,before+1);return b.slowPoison.at(-1);}
{
 const receipt=JSON.parse(fs.readFileSync(new URL('slow-poison-sources.json',root))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');for(const r of receipt.files){const b=fs.readFileSync(new URL(r.path,root));assert.equal(b.length,r.bytes);assert.equal(hash(b),r.sha256,r.path);}for(const [path,value] of Object.entries(receipt.inputs))assert.equal(hash(fs.readFileSync(new URL(path,root))),value,path);const r=S.slowPoisonRules;assert.equal(r.damagePerSecond,4);assert.equal(r.duration,5);assert.equal(r.heroDuration,1);assert.equal(r.moveReduction,.5);assert.equal(r.attackReduction,.25);assert.equal(r.stackMask,1);assert.equal(r.flags.damage.enabled,true);assert.equal(r.flags.movement.enabled,false);assert.equal(r.flags.attackRate.enabled,false);assert.equal(r.flags.killUnit.enabled,false);assert.equal(r.initialAbolishAutocast,true);assert.equal(r.slot,9);const {s}=fixture(),u=S.spawn(s,'dryad',0,-3,0);assert.equal(u.abolishAuto,true);assert.equal(s.dryadVersion,2);s.dryadVersion=1;assert.equal(S.spawn(s,'dryad',0,-4,0).abolishAuto,false);
}
console.log('PASS source Slow Poison: signed art/editor inputs, 4 DPS, 5s/1s, 50%/25%, damage-only stacking mask, nonlethal flag and configured initial autocast');
{
 const {s,a,b}=fixture();const p=hit(s,a,b);assert.equal(p.left,5);const hp=b.hp;close(S.moveRate(b),.5);close(S.attackRate(b),.75);step(s,10);close(hp-b.hp,4);const saved=S.restore(s);step(s,40);step(saved,40);assert.deepEqual(s,saved);close(hp-b.hp,20);assert.equal(b.slowPoison,undefined);close(S.moveRate(b),1);close(S.attackRate(b),1);
 const h=fixture('hero');hit(h.s,h.a,h.b);const heroHp=h.b.hp;step(h.s,10);close(heroHp-h.b.hp,4);assert.equal(h.b.slowPoison,undefined);
}
console.log('PASS actual missile poison: no early ticking, ordinary/hero source lifetime, full duration damage, 50% move/25% attack slowdown and exact saved continuation');
{
 const {s,a,b}=fixture();hit(s,a,b);step(s,10);const first=b.slowPoison[0].left;hit(s,a,b);assert.equal(b.slowPoison.length,2);assert.ok(b.slowPoison[0].left<first);assert.equal(b.slowPoison[1].left,5);const hp=b.hp;step(s,10);close(hp-b.hp,8);close(S.moveRate(b),.5);close(S.attackRate(b),.75);const other=S.spawn(s,'dryad',0,0,1,{abolishAuto:false});hit(s,other,b);assert.equal(new Set(b.slowPoison.map(p=>p.source)).size,2);const hp2=b.hp;step(s,10);close(hp2-b.hp,12);assert.ok(S.restore(s));
}
console.log('PASS implemented stacking contract: independent repeated and multi-attacker impacts, retained original timers, additive damage and non-stacking slows; original runtime comparison pending');
{
 const {s,a,b}=fixture();hit(s,a,b);b.hp=1.2;step(s,30);close(b.hp,1);assert.ok(b.slowPoison);assert.equal(s.teams[0].kills,0);const copy=S.restore(s);step(s,20);step(copy,20);assert.deepEqual(s,copy);assert.equal(b.slowPoison,undefined);assert.equal(s.corpses.some(c=>c.id===b.id),false);
 const d=fixture();hit(d.s,d.a,d.b);d.b.hp=1;const killer=S.spawn(d.s,'rifleman',0,0,1,{damage:9999});S.fire(d.s,killer,d.b);killer.stun=10;step(d.s,5);assert.equal(d.b.hp,0);assert.equal(d.b.slowPoison,undefined);assert.ok(S.restore(d.s));
}
console.log('PASS nonlethal poison and death: source kill flag caps at 1 HP without reward/corpse, ordinary attacks still kill and remove poison');
{
 const {s,a,b}=fixture();hit(s,a,b);s.units=s.units.filter(u=>u.id!==a.id);const hp=b.hp;const saved=S.restore(s);step(s,10);step(saved,10);assert.deepEqual(s,saved);close(hp-b.hp,4);const view=S.publicState(s,1),victim=view.units.find(u=>u.id===b.id);assert.equal(victim.slowPoison,undefined);close(victim.slowPoisonLeft,4);close(S.moveRate(victim),.5);close(S.attackRate(victim),.75);assert.ok(!JSON.stringify(victim).includes('"impact"'));
}
console.log('PASS poison source lifecycle/privacy: exact saves after caster removal, retained DOT, displayed remaining time and slow rates without caster/projectile identity');
{
 const {s,a,b}=fixture();hit(s,a,b);s.teams[1].faction=2;s.teams[1].abolishMagic=1;const cleanser=S.spawn(s,'dryad',1,3,1,{mana:150,abolishAuto:false});S.visibility(s);assert.equal(cmd(s,cleanser,'abolish',{target:b.id}),null);step(s,3);assert.equal(b.slowPoison,undefined);close(S.moveRate(b),1);close(S.attackRate(b),1);assert.ok(S.restore(s));
 const w=fixture();hit(w.s,w.a,w.b);w.s.teams[1].faction=2;const worker=S.spawn(w.s,'worker',1,3,1);S.visibility(w.s);assert.equal(cmd(w.s,worker,'detonate',{x:worker.x,z:worker.z}),null);step(w.s,1);assert.equal(w.b.slowPoison,undefined);assert.ok(S.restore(w.s));
 const immune=fixture('dryad',{abolishAuto:false});assert.equal(S.fire(immune.s,immune.a,immune.b),true);immune.a.stun=10;step(immune.s,5);assert.equal(immune.b.slowPoison,undefined);const machine=fixture('catapult');assert.equal(S.fire(machine.s,machine.a,machine.b),true);machine.a.stun=10;step(machine.s,5);assert.equal(machine.b.slowPoison,undefined);const item=fixture();hit(item.s,item.a,item.b);item.b.itemMagicImmune=5;step(item.s,1);assert.equal(item.b.slowPoison,undefined);
}
console.log('PASS current dispel/immunity integration: friendly Abolish/Wisp clear poison; innate/item immunity and mechanical targets excluded; original runtime comparison pending');
{
 const {s,a,b}=fixture('hero',{inventory:[25],itemUses:[1],itemTimers:[0]});hit(s,a,b);assert.equal(cmd(s,b,'useItem',{slot:0,item:25}),null);assert.equal(b.itemMagicImmune,15);assert.equal(b.slowPoison,undefined);const saved=S.restore(s);step(s,10);step(saved,10);assert.deepEqual(s,saved);
}
console.log('PASS legal Anti-magic Potion: poisoned hero consumes item25, clears poison synchronously and saves immediately with exact continuation');
{
 const map=S.defaultMap();map.units=[];map.props=[{kind:'mine',x:6,z:0,amount:1000}];map.triggers=[];map.doodads=[];map.startingHour=12;for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);const s=S.create('skirmish',{map,factions:[2,2],ai:[false,false]});s.units=[];S.spawn(s,'hall',0,-24,24);const base=S.spawn(s,'hall',1,0,0),mine=S.startEntangle(s,base,s.resources[0],true),wisp=S.spawn(s,'worker',1,7.3,0,{order:{type:'hold'}}),dryad=S.spawn(s,'dryad',0,9,1,{abolishAuto:false});S.visibility(s);hit(s,dryad,wisp);const hp=wisp.hp;assert.equal(cmd(s,wisp,'gather',{resource:0}),null);step(s,1);assert.equal(wisp.inside,mine.id);close(wisp.slowPoison[0].left,4.9);close(hp-wisp.hp,.4);const saved=S.restore(s);step(s,60);step(saved,60);assert.deepEqual(s,saved);assert.equal(wisp.inside,mine.id);assert.equal(wisp.slowPoison,undefined);close(hp-wisp.hp,20);assert.ok(s.teams[1].gold>500);
}
console.log('PASS legal poisoned Wisp mining: actual gather entry keeps poison damage/timer active, expires after 5s inside mine and preserves saved income/continuation');
{
 const f=fixture('worker',{},[2,2]);hit(f.s,f.a,f.b);assert.equal(cmd(f.s,f.b,'detonate',{x:f.b.x,z:f.b.z}),null);assert.ok(S.restore(f.s));step(f.s,1);assert.equal(f.b.hp,0);assert.equal(f.b.slowPoison,undefined);assert.ok(S.restore(f.s));
 const g=fixture('skeletonwarrior',{summoned:true,expires:50});hit(g.s,g.a,g.b);g.b.expires=g.s.frame+1;step(g.s,1);assert.equal(g.b.hp,0);assert.equal(g.b.slowPoison,undefined);assert.ok(S.restore(g.s));
 const h=fixture('worker',{},[2,2]);hit(h.s,h.a,h.b);assert.equal(cmd(h.s,h.b,'build',{kind:'barracks',x:6,z:0}),null);step(h.s,5);const building=h.s.units.find(u=>u.construction?.worker===h.b.id)||h.s.units.find(u=>u.team===1&&u.kind==='barracks');assert.ok(building?.built<1&&h.b.consumed);building.built=.9999;step(h.s,1);assert.equal(building.built,1);assert.equal(h.b.hp,0);assert.equal(h.b.slowPoison,undefined);assert.ok(S.restore(h.s));
}
console.log('PASS poisoned unit consumption: legal Wisp Detonate/build completion and summon expiry synchronously clear poison for immediate valid saves');
{
 for(const patch of [p=>p.left=6,p=>p.left=0,p=>p.source=999999,p=>p.impact=999999,p=>p.team=1,p=>p.damage=9999]){const {s,a,b}=fixture();hit(s,a,b);patch(b.slowPoison[0]);assert.throws(()=>S.restore(s),/Poison/);}const {s,a,b}=fixture();hit(s,a,b);const duplicate=S.clone(s);duplicate.units.find(u=>u.id===b.id).slowPoison.push(S.clone(b.slowPoison[0]));assert.throws(()=>S.restore(duplicate),/Poison/);const legacy=S.clone(s);legacy.dryadVersion=1;assert.throws(()=>S.restore(legacy),/Poison/);delete legacy.units.find(u=>u.id===b.id).slowPoison;const old=S.restore(legacy);assert.equal(old.dryadVersion,1);const victim=old.units.find(u=>u.id===b.id),attacker=old.units.find(u=>u.id===a.id);attacker.stun=0;S.fire(old,attacker,victim);attacker.stun=10;step(old,5);assert.equal(victim.slowPoison,undefined);
}
console.log('PASS strict poison saves/legacy: forged times/sources/impacts/teams/rules and duplicate impacts rejected, prior Dryad-version games preserve their attack rules');
