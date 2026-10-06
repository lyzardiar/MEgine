// Author: MiYu. Source Wisp economy, interruption, persistence and original working animation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
globalThis.Frost=S;globalThis.FrostArt=require('../samples/frostbound-realms/model-catalog.json');const V=require('../samples/frostbound-realms/game/visuals.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,u,type,args={})=>S.command(s,u.team,{type,ids:[u.id],...args}),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.units=[];map.triggers=[];map.props=[{kind:'tree',x:0,z:0,amount:100},{kind:'tree',x:8,z:0,amount:100},{kind:'mine',x:-8,z:8,amount:1000}];const s=S.create('skirmish',{map,factions:[2,0],ai:[false,false]});s.units=[];const hall=S.spawn(s,'hall',0,-10,0);S.spawn(s,'hall',1,24,-24);const u=S.spawn(s,'worker',0,1.5,0);S.visibility(s);return {s,u,hall};}
{
 const {s,u,hall}=fixture(),wood=s.teams[0].wood;assert.equal(u.hp,120);assert.equal(u.damage,0);assert.equal(u.speed,2.7);assert.equal(S.unitType(u).armor,'medium');hall.uprooted=true;hall.speed=.4;
 assert.equal(cmd(s,u,'gather',{resource:0}),null);step(s,1);assert.equal(u.order.bonded,true);assert.equal(u.gatherCd,8);step(s,79);assert.equal(s.teams[0].wood,wood);step(s,1);assert.equal(s.teams[0].wood,wood+5);step(s,80);assert.equal(s.teams[0].wood,wood+10);assert.equal(s.resources[0].amount,100);assert.equal(u.cargo,0);assert.equal(s.resources[0].felled,undefined);
 const view=V.model(s,u);assert.equal(view.key,'ClassicWisp');assert.equal(view.asset,FrostArt.ClassicWispWood);assert.ok(view.asset.animations.some(a=>a.name==='Stand Lumber'));assert.equal(V.name(s,u),'Wisp');assert.equal(S.canAttack(u,hall),false);
 s.visible[1].fill(1);const enemy=S.publicState(s,1),visible=enemy.units.find(v=>v.id===u.id);assert.equal(visible.order,null);assert.equal(visible.gatherCd,undefined);assert.equal(visible.cargo,undefined);assert.deepEqual(visible.lumberTarget,{x:0,z:0});assert.equal(V.model(enemy,visible).asset,FrostArt.ClassicWispWood);s.visible[1].fill(0);assert.ok(!S.publicState(s,1).units.some(v=>v.id===u.id));
 step(s,23);const saved=S.restore(s);step(s,137);step(saved,137);assert.deepEqual(saved,s,'mid-cycle save resumes exactly');
}
{
 const {s,u}=fixture();u.x=7;const wood=s.teams[0].wood;cmd(s,u,'gather',{resource:0});step(s,1);assert.equal(u.order.bonded,undefined);assert.notEqual(V.model(s,u).asset,FrostArt.ClassicWispWood);for(let i=0;i<200&&!u.order?.bonded;i++)step(s,1);assert.equal(u.order.bonded,true);const arrived=s.frame;step(s,79);assert.equal(s.teams[0].wood,wood);step(s,1);assert.equal(s.teams[0].wood,wood+5);assert.ok(arrived>1,'travel time does not count as lumber time');
 cmd(s,u,'stop');step(s,100);assert.equal(s.teams[0].wood,wood+5);cmd(s,u,'gather',{resource:0});step(s,1);step(s,79);assert.equal(s.teams[0].wood,wood+5);step(s,1);assert.equal(s.teams[0].wood,wood+10);
 step(s,40);u.stun=.1;step(s,1);assert.equal(u.gatherCd,8,'even one-tick stun starts a fresh bond after expiring');step(s,79);assert.equal(s.teams[0].wood,wood+10);step(s,1);assert.equal(s.teams[0].wood,wood+15);
 cmd(s,u,'move',{x:8,z:5,append:true});step(s,80);assert.equal(u.order?.type,'move');assert.equal(s.teams[0].wood,wood+20);assert.equal(u.gatherCd,0);assert.doesNotThrow(()=>S.restore(s));
}
{
 const {s,u}=fixture();cmd(s,u,'gather',{resource:0});step(s,20);const wood=s.teams[0].wood;cmd(s,u,'gather',{resource:1});assert.equal(u.order.bonded,undefined);step(s,1);assert.equal(u.order.bonded,undefined);assert.equal(s.teams[0].wood,wood);s.resources[1].amount=0;step(s,1);assert.equal(u.order,null);
 cmd(s,u,'gather',{resource:0});u.x=1.5;step(s,1);u.x=3;step(s,1);assert.equal(u.order.bonded,undefined);assert.equal(u.gatherCd,0);assert.equal(s.teams[0].wood,wood);
}
{
 const {s,u}=fixture();for(let z=0;z<32;z++)s.map.terrain[z*32+17]=1;u.x=3;S.visibility(s);cmd(s,u,'gather',{resource:0});step(s,180);assert.equal(s.teams[0].wood,150);assert.equal(u.order?.bonded,undefined,'unreachable tree never pays');
}
{
 const {s,u,hall}=fixture();u.hp=100;step(s,20);assert.equal(u.hp,100);s.map.startingHour=22;step(s,20);close(u.hp,101);u.hp=119.98;step(s,1);assert.equal(u.hp,120);u.hp=0;step(s,10);assert.equal(u.hp,0);
 const gold=s.teams[0].gold;cmd(s,hall,'train',{kind:'worker'});assert.equal(hall.queue[0].left,14);assert.equal(s.teams[0].gold,gold-60);assert.doesNotThrow(()=>S.restore(s));cmd(s,hall,'cancelTrain',{index:0});assert.equal(s.teams[0].gold,gold);cmd(s,hall,'train',{kind:'worker'});step(s,139);assert.equal(hall.queue.length,1);step(s,1);assert.equal(hall.queue.length,0);const trained=s.units.find(v=>v.kind==='worker'&&v.hp>0);assert.equal(trained.maxHp,120);assert.equal(trained.damage,0);assert.doesNotThrow(()=>S.restore(s));
}
{
 const {s,u}=fixture();s.entangledVersion=0;u.x=-8;u.z=8;S.visibility(s);cmd(s,u,'gather',{resource:2});step(s,1);assert.equal(u.cargo,5);assert.equal(u.cargoKind,'mine');assert.doesNotThrow(()=>S.restore(s),'legacy ordinary gold cargo remains valid');const gold=s.teams[0].gold,wood=s.teams[0].wood;cmd(s,u,'gather',{resource:0});step(s,180);assert.equal(u.cargo,0);assert.equal(s.teams[0].gold,gold+5);assert.ok(s.teams[0].wood>wood);assert.equal(s.resources[0].amount,100);
}
{
 const {s,u}=fixture();cmd(s,u,'gather',{resource:0});step(s,30);for(const change of [v=>{delete v.wispRules;},v=>v.wispRules=0,v=>v.damage=1,v=>v.maxHp=200,v=>v.armorValue=2,v=>v.speed=3,v=>v.cargo=5,v=>v.gatherCd=9,v=>v.order.bonded=false,v=>v.order.resource=2,v=>v.x=7]){const bad=S.clone(s);change(bad.units.find(v=>v.id===u.id));assert.throws(()=>S.restore(bad),/Wisp|gathering/);}
 const legacy=S.clone(s);delete legacy.entangledVersion;delete legacy.wispHarvestVersion;const old=legacy.units.find(v=>v.id===u.id);delete old.wispRules;delete old.order.bonded;old.gatherCd=.2;old.maxHp=old.hp=S.types.worker.hp;old.speed=S.types.worker.speed*1.12;old.damage=S.types.worker.damage;const restored=S.restore(legacy);assert.equal(restored.wispHarvestVersion,0);assert.equal(S.wisp(restored,restored.units.find(v=>v.id===u.id)),false);step(restored,20);assert.ok(restored.resources[0].amount<100,'old saves keep ordinary harvesting');assert.doesNotThrow(()=>S.restore(restored));
}
console.log('PASS Wisp: source stats, full 8s/5 direct non-destructive lumber, travel/blocked paths, stop/stun/queue, night healing, 14s training/refund, gold cargo, exact/legacy/malformed saves and original Stand Lumber/private enemy animation');
