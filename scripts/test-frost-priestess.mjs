// Author: MiYu. Deterministic original Priestess skills, hostile save rejection and continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {priestessFixture} from './frost-priestess-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),learn=(s,h,slot)=>assert.equal(cmd(s,h,'learn',{slot}),null);
function continuation(s,n){const restored=S.restore(s);step(s,n);step(restored,n);assert.deepEqual(restored,s);}
{
 const {s,h}=priestessFixture(S);assert.equal(h.sourceHero,'Emoo');assert.equal(h.maxHp,550);assert.equal(h.damage,26);assert.equal(S.maxMana(h),225);assert.equal(S.armorValue(h),3.7);assert.equal(h.searingAuto,false);assert.match(cmd(s,h,'learn',{slot:3}),/level 6/);learn(s,h,2);assert.match(cmd(s,h,'spell',{slot:2}),/passive/);assert.ok(S.restore(s));
 for(const change of [{sourceHero:'other'},{maxHp:1},{mana:226},{trueshotAura:.1},{searingAuto:1},{priestessCast:{slot:2,rank:1,left:.1}},{starfall:{left:45,pulse:0,frame:0}}])assert.throws(()=>S.restore({...s,units:[{...h,...change}]}));
 const legacy=S.create('skirmish',{factions:[2,0],ai:[false,false]});legacy.priestessVersion=0;const old=S.spawn(legacy,'hero',0,0,0,{heroClass:2});delete legacy.priestessVersion;assert.equal(S.restore(legacy).priestessVersion,0);assert.equal(old.sourceHero,undefined);assert.equal(S.create('moba',{factions:[2,0],heroes:[2,2]}).units.find(u=>u.kind==='hero').sourceHero,undefined);
}
console.log('PASS Priestess identity: source AGI weapon/HP/mana/armor, learning gates, strict saves and legacy/MOBA isolation');
for(const rank of [1,2,3]){
 const {s,h}=priestessFixture(S,6);h.skills=[rank,0,0,0];h.skillPoints=6-rank;h.mana=200;const before=h.mana;assert.equal(cmd(s,h,'spell',{slot:0}),null);continuation(s,4);assert.equal(s.units.filter(S.owlScout).length,0);continuation(s,1);const owl=s.units.find(S.owlScout),r=S.priestessRules.units[['nowl','now2','now3'][rank-1]];assert.equal(owl.maxHp,40);assert.equal(owl.hp,40);assert.equal(owl.mana,0);assert.equal(owl.speed,r.speed);assert.equal(S.unitType(owl).flightHeight,2.4);near(h.mana,before-S.priestessRules.abilities.AEst.levels[rank-1].cost+.5*S.priestessRules.units.Emoo.manaRegen+.5*S.sourceHeroAttributes(h).intelligence*Number(S.priestessRules.misc.IntRegenBonus));const a=S.spawn(s,'soldier',1,owl.x+1,owl.z,{damage:100000,order:{type:'hold'}});assert.equal(S.canAttack(a,owl),false);S.fire(s,a,owl);step(s,10);assert.equal(owl.hp,40);assert.equal(S.detected(s,0,{x:owl.x+8.99,z:owl.z}),true);assert.equal(S.detected(s,0,{x:owl.x+9.01,z:owl.z}),false);assert.equal(cmd(s,owl,'move',{x:20,z:20}),null);continuation(s,10);assert.ok(owl.x>1);assert.equal(cmd(s,owl,'hold'),null);
 const remaining=owl.expires-s.frame;continuation(s,remaining-1);assert.equal(owl.hp,40);step(s,1);assert.equal(owl.hp,0);assert.ok(S.restore(s));
}
console.log('PASS Scout: .5s deferred payment, all three source ranks, flight/control, independent 900 detection, invulnerability, exact lifetime and saved continuation');
{
 const {s,h}=priestessFixture(S,6);learn(s,h,0);h.mana=200;cmd(s,h,'spell',{slot:0});step(s,5);const old=s.units.find(S.owlScout);h.mana=200;h.spell[0]=0;cmd(s,h,'spell',{slot:0});continuation(s,5);assert.equal(s.units.filter(S.owlScout).length,1);assert.notEqual(s.units.find(S.owlScout).id,old.id);const copy=S.clone(s);assert.ok(cmd(s,h,'spell',{slot:0}));assert.deepEqual(s,copy);
}
console.log('PASS Scout recast: one owned Owl replacement, no premature cost or duplicate summon on rejected command');
for(const manual of [false,true]){
 const {s,h}=priestessFixture(S,5);learn(s,h,1);const target=S.spawn(s,'soldier',1,4,0,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}});S.visibility(s);h.mana=100;h.cd=0;
 if(manual){assert.equal(cmd(s,h,'spell',{slot:1,target:target.id}),null);assert.equal(h.mana,100);assert.ok(S.restore(s));}
 else assert.equal(cmd(s,h,'searingAuto',{enabled:true}),null);
 assert.equal(S.fire(s,h,target),true);assert.equal(h.mana,92);const shot=s.projectiles.at(-1);assert.equal(shot.art,'priestess-searing');assert.equal(shot.searingRank,1);assert.equal(S.projectileSpeed(shot),15);assert.ok(shot.damage>=h.damage-7+2+10&&shot.damage<=h.damage-7+12+10);continuation(s,6);assert.ok(target.hp<10000);h.mana=7;assert.equal(S.fire(s,h,target),true);assert.equal(s.projectiles.at(-1).art,'priestess');assert.equal(h.mana,7);assert.ok(S.restore(s));
}
console.log('PASS Searing Arrows: manual/autocast, one 8-mana payment at launch, source bonus and speed, low-mana normal arrow and saved projectile snapshot');
{
 const {s,h}=priestessFixture(S,6);learn(s,h,2);const melee=S.spawn(s,'soldier',0,1,0),ranged=S.spawn(s,'archer',0,2,0),other=S.spawn(s,'archer',1,2,0);assert.equal(S.priestessTrueshot(s,h),.1);assert.equal(S.priestessTrueshot(s,melee),0);assert.equal(S.priestessTrueshot(s,ranged),.1);assert.equal(S.priestessTrueshot(s,other),0);ranged.x=9.01;assert.equal(S.priestessTrueshot(s,ranged),0);assert.equal(S.publicState(s,0).units.find(u=>u.id===h.id).trueshotAura,.1);assert.ok(S.restore(s));
}
console.log('PASS Trueshot: source percentage/radius, ranged allies and self, enemy/melee exclusion and public aura state');
{
 const {s,h}=priestessFixture(S,6);learn(s,h,3);h.mana=300;const target=S.spawn(s,'soldier',1,2,0,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}}),ally=S.spawn(s,'soldier',0,2,2,{damage:0,order:{type:'hold'}}),hall=S.spawn(s,'hall',1,4,0,{hp:10000,maxHp:10000});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:3}),null);continuation(s,5);assert.equal(h.starfall.left,45);continuation(s,14);assert.equal(target.hp,10000);continuation(s,1);assert.equal(target.hp,9950);assert.equal(hall.hp,9982.5);assert.equal(ally.hp,ally.maxHp);continuation(s,435);assert.equal(target.hp,8500);assert.equal(hall.hp,9475);assert.equal(h.starfall,undefined);assert.ok(S.restore(s));
 h.spell[3]=0;h.mana=300;cmd(s,h,'spell',{slot:3});step(s,5);const snap=S.clone(s);assert.ok(cmd(s,h,'move',{x:NaN,z:0}));assert.deepEqual(s,snap);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.starfall,undefined);h.spell[3]=0;h.mana=300;cmd(s,h,'spell',{slot:3});step(s,5);h.stun=1;step(s,1);assert.equal(h.starfall,undefined);assert.ok(S.restore(s));
}
console.log('PASS Starfall: .5s paid cast, first 1.5s pulse, 45s/30 pulses, building multiplier, ally exclusion, stop/stun interruption and exact saved continuation');

{
 const {s,h}=priestessFixture(S,6);learn(s,h,0);cmd(s,h,'spell',{slot:0});step(s,5);const owl=s.units.find(S.owlScout),worker=S.spawn(s,'worker',0,3,3);for(const patch of [{summoner:worker.id},{scoutRank:2},{mana:1}]){const bad=S.clone(s);Object.assign(bad.units.find(u=>u.id===owl.id),patch);assert.throws(()=>S.restore(bad));}const duplicated=S.clone(s);duplicated.units.push({...duplicated.units.find(S.owlScout),id:++duplicated.serial});assert.throws(()=>S.restore(duplicated));const forged=S.clone(s);forged.units[0].searingRank=3;assert.throws(()=>S.restore(forged));
}
console.log('PASS hostile Priestess saves: entity missile fields, non-Priestess summoner, duplicate Owl, excessive Scout rank and forged mana rejected');
for(const channel of [false,true]){
 const {s,h}=priestessFixture(S,6);learn(s,h,channel?3:0);h.mana=300;S.spawn(s,'hall',0,-20,-20);const carrier=S.spawn(s,'hero',0,1,1,{heroClass:3,inventory:[16],order:{type:'hold'}});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:channel?3:0}),null);if(channel)step(s,5);assert.ok(h.priestessCast||h.starfall);assert.equal(cmd(s,carrier,'useItem',{slot:0,item:16,target:h.id}),null);assert.equal(h.priestessCast,undefined);assert.equal(h.starfall,undefined);assert.ok(h.x<-10);assert.ok(S.restore(s));
}
console.log('PASS Staff transport: interrupts ally Scout windup and Starfall immediately, with valid same-frame saves');
{
 const {s,h}=priestessFixture(S,6);learn(s,h,3);h.mana=300;const base=S.spawn(s,'hall',0,-20,-20),carrier=S.spawn(s,'hero',0,1,1,{heroClass:3,order:{type:'townPortal',target:base.id,x:base.x,z:base.z,left:.1}});S.visibility(s);cmd(s,h,'spell',{slot:3});step(s,1);assert.equal(h.priestessCast,undefined);assert.ok(h.x<-10);assert.ok(S.restore(s));
}
console.log('PASS Town Portal passenger transport: cancels Priestess pending cast atomically before valid saved arrival');
{
 const {s,h}=priestessFixture(S,6);S.setAI(s,0,true);step(s,40);assert.deepEqual(h.skills,[0,3,2,1]);assert.equal(h.searingAuto,true);assert.ok(S.restore(s));const enemy=S.spawn(s,'soldier',1,2,0,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}});S.spawn(s,'soldier',1,2,2,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}});S.visibility(s);h.mana=400;step(s,40);assert.ok(h.starfall||h.priestessCast);assert.ok(S.restore(s));
}
console.log('PASS source Priestess AI: first hero original Searing/Trueshot/Starfall skill order, autocast and multi-enemy channel decisions');
{
 const {s}=priestessFixture(S);s.units=[];s.teams[0].gold=1000;s.teams[0].wood=1000;S.spawn(s,'hall',0,-8,-8);const altar=S.spawn(s,'altar',0,0,0),killer=S.spawn(s,'soldier',1,20,20,{damage:100000,order:{type:'hold'}});assert.equal(cmd(s,altar,'train',{kind:'hero',heroClass:2}),null);continuation(s,550);const h=s.units.find(S.priestessUnit);assert.ok(h);assert.equal(h.maxHp,550);assert.ok(h.inventory.includes(S.townPortal.item));learn(s,h,1);cmd(s,h,'searingAuto',{enabled:true});S.fire(s,killer,h);assert.equal(h.hp,0);assert.equal(cmd(s,altar,'revive',{target:h.id}),null);continuation(s,358);assert.equal(h.hp,h.maxHp);assert.ok(h.mana>=100&&h.mana<101);assert.equal(h.skills[1],1);assert.ok(S.restore(s));
}
console.log('PASS Priestess Altar recruitment and paid revival: source attributes, Town Portal inventory, learned skills and saved queue continuation');
