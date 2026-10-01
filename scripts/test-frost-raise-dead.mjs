// Author: MiYu. Raise Dead atomicity, ownership, fog, placement, lifetime and save continuity.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function fixture(){const map=S.defaultMap();map.terrain.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map});s.units=[];const n=S.spawn(s,'necromancer',0,0,0,{damage:0,order:{type:'hold'}}),gun=S.spawn(s,'rifleman',0,2,1,{damage:100000}),v=S.spawn(s,'soldier',1,2,2,{hp:1,damage:0,speed:0});gun.order={type:'attack',target:v.id};S.visibility(s);S.tick(s);assert.equal(v.hp,0);s.units=s.units.filter(u=>u.id!==gun.id);S.visibility(s);return {s,n,c:s.corpses[0]};}
const cmd=(s,n,extra={})=>S.command(s,0,{type:'raiseDead',ids:[n.id],...extra});
{
 const {s,n,c}=fixture(),food=S.population(s,0).used,mana=n.mana;assert.equal(n.raiseDeadAuto,false);assert.equal(cmd(s,n,{corpse:c.id}),null);assert.equal(s.corpses.length,0);assert.equal(n.mana,mana-75);assert.equal(n.raiseDeadCd,8);assert.equal(S.population(s,0).used,food);const summons=s.units.filter(u=>u.summoned);assert.equal(summons.length,2);assert.ok(summons.every(u=>u.kind==='skeletonwarrior'&&u.team===0&&u.expires===s.frame+400));assert.notEqual(summons[0].id,summons[1].id);assert.ok(S.distance(...summons)>.8);assert.equal(S.command(s,0,{type:'move',ids:summons.map(u=>u.id),x:6,z:4}),null);
 assert.equal(S.command(s,0,{type:'raiseDeadAuto',ids:[n.id],enabled:true}),null);const copy=S.restore(S.clone(s));assert.deepEqual(copy.units,s.units);step(s,10);step(copy,10);assert.deepEqual(copy.units,s.units);step(copy,391);assert.ok(!copy.units.some(u=>u.summoned));assert.equal(copy.corpses.length,0,'expiry creates no recyclable corpses');
}
for(const setup of [({n})=>n.mana=74,({n})=>n.raiseDeadCd=1,({n})=>n.stun=1,({n})=>n.hp=0,({n})=>n.built=.5,({n})=>n.team=1,({n})=>n.kind='soldier',({s})=>s.corpses=[],({c})=>c.kind='hero',({c})=>c.x=25,({s})=>s.visible[0].fill(0),({s})=>s.map.terrain.fill(1),({s})=>{while(s.units.length<S.LIMIT-1)S.spawn(s,'soldier',1,-25,-25);}]){
 const f=fixture();setup(f);const before=S.clone(f.s);assert.equal(typeof cmd(f.s,f.n),'string');assert.deepEqual(f.s,before,'failed cast is atomic');
}
{
 const {s,n,c}=fixture(),before=S.clone(s);for(const corpse of [null,-1,1.5,NaN,'1',c.id+100]){assert.equal(typeof cmd(s,n,{corpse}),'string');assert.deepEqual(s,before);}
 assert.equal(typeof S.command(s,1,{type:'raiseDeadAuto',ids:[n.id],enabled:true}),'string');assert.equal(typeof S.command(s,0,{type:'raiseDeadAuto',ids:[n.id],enabled:1}),'string');step(s,2);assert.equal(s.corpses.length,1,'autocast starts disabled');assert.equal(S.command(s,0,{type:'raiseDeadAuto',ids:[n.id],enabled:true}),null);step(s,1);assert.equal(s.corpses.length,0);assert.equal(s.units.filter(u=>u.summoned).length,2);
 const beforeReload=S.clone(s);for(const patch of [{raiseDeadAuto:1},{raiseDeadAuto:null},{raiseDeadCd:-1},{raiseDeadCd:9},{raiseDeadCd:null},{raiseDeadCd:NaN},{mana:201},{castYaw:4}]){const raw=S.clone(beforeReload);Object.assign(raw.units.find(u=>u.id===n.id),patch);assert.throws(()=>S.restore(raw));}
 const old=S.clone(beforeReload),caster=old.units.find(u=>u.id===n.id);delete caster.raiseDeadAuto;delete caster.raiseDeadCd;const restored=S.restore(old).units.find(u=>u.id===n.id);assert.equal(restored.raiseDeadAuto,false);assert.equal(restored.raiseDeadCd,0);
}
{
 const {s,n}=fixture();n.raiseDeadAuto=true;n.order={type:'move',x:0,z:5};step(s,1);assert.equal(s.corpses.length,1,'explicit movement takes priority');n.order={type:'hold'};step(s,1);assert.equal(s.corpses.length,0);
 const enemy=S.spawn(s,'soldier',1,3,2,{hp:5000,maxHp:5000,damage:10000,order:{type:'hold'}}),skeleton=s.units.find(u=>u.summoned);skeleton.x=3;skeleton.z=3;skeleton.damage=0;enemy.order={type:'attack',target:skeleton.id};S.visibility(s);step(s,2);assert.ok(!s.units.includes(skeleton));assert.ok(!s.corpses.some(c=>c.id===skeleton.id),'killed summons create no recyclable corpses');
}
{const {s,n}=fixture();n.raiseDeadAuto=true;n.order={type:'attackMove',x:0,z:5};step(s,1);assert.equal(s.corpses.length,0,'attack-move permits autocast');}
console.log('PASS: Raise Dead consumes one body for two sword/shield warriors; mana, cooldown, fog/ownership, atomic capacity/terrain rejection, autocast, save continuity, expiry and death');
