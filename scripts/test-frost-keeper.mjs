// Author: MiYu. Source Keeper spells, atomic summons, save continuation and paid hero lifecycle.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {keeperFixture} from './frost-keeper-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function continuation(s,n){const restored=S.restore(s);step(s,n);step(restored,n);assert.deepEqual(restored,s);}
{
 const {s,h}=keeperFixture(S);assert.equal(h.sourceHero,'Ekee');assert.equal(h.maxHp,500);assert.equal(h.damage,23);assert.equal(S.maxMana(h),270);assert.equal(S.armorValue(h),2.5);assert.equal(S.unitType(h).range,6);assert.equal(S.unitType(h).antiAir,true);assert.deepEqual(S.sourceHeroAttributes(h),{strength:16,agility:15,intelligence:18});assert.match(cmd(s,h,'learn',{slot:3}),/level 6/);assert.equal(cmd(s,h,'learn',{slot:2}),null);assert.match(cmd(s,h,'spell',{slot:2}),/passive/);assert.ok(S.restore(s));
 for(const change of [{sourceHero:'other'},{maxHp:1},{mana:271},{thornsAura:.1},{keeperCast:{slot:2,rank:1,left:.1}},{tranquility:{left:30,pulse:0,frame:0}}])assert.throws(()=>S.restore({...s,units:[{...h,...change}]}));
 const legacy=S.create('skirmish',{factions:[2,0],ai:[false,false]});legacy.keeperVersion=0;const old=S.spawn(legacy,'hero',0,0,0,{heroClass:1});delete legacy.keeperVersion;assert.equal(S.restore(legacy).keeperVersion,0);assert.equal(old.sourceHero,undefined);assert.equal(S.create('moba',{factions:[2,0]}).units.find(u=>u.kind==='hero').sourceHero,undefined);
}
console.log('PASS Keeper identity: source INT attributes, HP/mana/armor/ranged weapon, learning gates, strict save and legacy/MOBA isolation');
for(const reversed of [false,true]){
 const {s,h}=keeperFixture(S),v=S.spawn(s,'soldier',1,2,0,{damage:0,order:{type:'hold'}});if(reversed)s.units.reverse();S.visibility(s);cmd(s,h,'learn',{slot:0});const hp=v.hp;assert.equal(cmd(s,h,'spell',{slot:0,target:v.id}),null);assert.equal(h.mana,100);continuation(s,6);assert.equal(v.hp,hp);continuation(s,1);assert.equal(v.keeperRoots.left,9);assert.equal(v.hp,hp);near(h.mana,25+.7*.91);continuation(s,89);near(v.hp,hp-133.5);assert.ok(v.keeperRoots);continuation(s,1);near(v.hp,hp-135);assert.equal(v.keeperRoots,undefined);assert.ok(v.root<1e-7);
}
console.log('PASS Entangling Roots: .7s deferred payment, complete 9s/135 damage, unit-order independence and exact per-stage saved continuation');
{
 const {s,h}=keeperFixture(S,3),v=S.spawn(s,'hero',1,2,0,{heroClass:1,damage:0,order:{type:'hold'}});cmd(s,h,'learn',{slot:0});S.visibility(s);cmd(s,h,'spell',{slot:0,target:v.id});step(s,2);assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.equal(h.keeperCast.rank,1);continuation(s,5);assert.equal(v.keeperRoots.left,3);const hp=v.hp;continuation(s,30);near(v.hp,hp-45);assert.equal(v.keeperRoots,undefined);
 h.spell[0]=0;h.mana=200;cmd(s,h,'spell',{slot:0,target:v.id});const saved=S.clone(s);assert.ok(cmd(s,h,'move',{x:NaN,z:0}));assert.deepEqual(s,saved);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.keeperCast,undefined);assert.ok(S.restore(s));
}
console.log('PASS hero Roots duration and rank snapshot, invalid-order preservation and paid-cast cancellation');
{
 const {s,h}=keeperFixture(S,6);h.mana=200;cmd(s,h,'learn',{slot:1});assert.equal(cmd(s,h,'spell',{slot:1,resource:0}),null);continuation(s,7);const treants=s.units.filter(S.keeperTreant);assert.equal(treants.length,2);assert.equal(s.resources.filter(r=>r.amount===0).length,2);for(const t of treants){assert.equal(t.maxHp,300);assert.equal(t.damage,16);assert.equal(t.speed,2.2);assert.equal(t.armorValue,0);assert.equal(t.mana,0);assert.equal(S.projectileSpeed(t),0);}assert.ok(S.restore(s));
 const hall=S.spawn(s,'hall',0,-8,-8);hall.queue=[{research:'naturesBlessing',left:.1}];step(s,1);for(const t of treants){assert.equal(t.armorValue,5);assert.equal(t.speed,2.2);}assert.ok(S.restore(s));continuation(s,598);assert.ok(treants.every(t=>t.hp>0));step(s,1);assert.ok(treants.every(t=>t.hp===0));assert.ok(S.restore(s));
 const blocked=keeperFixture(S,6);blocked.h.mana=200;cmd(blocked.s,blocked.h,'learn',{slot:1});cmd(blocked.s,blocked.h,'spell',{slot:1,resource:0});for(let x=0;x<7;x++)for(let z=-3;z<4;z++)S.spawn(blocked.s,'hall',1,x,z);step(blocked.s,7);assert.equal(blocked.s.resources.filter(r=>r.amount===0).length,0);assert.equal(blocked.s.units.filter(S.keeperTreant).length,0);assert.equal(blocked.h.spell[1],0);assert.ok(blocked.h.mana>200);
}
console.log('PASS Force of Nature: deterministic two-tree summons, source Treant stats, same-frame Nature armor and 60s expiry, blocked-space atomicity');
{
 const {s,h}=keeperFixture(S,6);h.mana=200;cmd(s,h,'learn',{slot:3});const v=S.spawn(s,'soldier',0,2,0,{hp:1,maxHp:1000,damage:0,order:{type:'hold'}}),foe=S.spawn(s,'soldier',1,2,2,{hp:1,maxHp:1000,damage:0,order:{type:'hold'}});h.hp=100;assert.equal(cmd(s,h,'spell',{slot:3}),null);continuation(s,7);assert.equal(h.tranquility.left,30);assert.equal(v.hp,1);continuation(s,9);assert.equal(v.hp,1);continuation(s,1);assert.equal(v.hp,21);assert.equal(foe.hp,1);continuation(s,290);assert.equal(v.hp,601);assert.equal(h.tranquility,undefined);assert.ok(S.restore(s));
 h.spell[3]=0;h.mana=200;cmd(s,h,'spell',{slot:3});step(s,7);h.cyclone=2;step(s,1);assert.equal(h.tranquility,undefined);assert.ok(S.restore(s));
}
console.log('PASS Tranquility: delayed payment, first 1s pulse, full 30s/600 healing, self/allies, enemy exclusion, channel interruption and save continuation');
{
 const {s,h}=keeperFixture(S);cmd(s,h,'learn',{slot:2});const ally=S.spawn(s,'soldier',0,2,0,{damage:0,order:{type:'hold'}}),a=S.spawn(s,'soldier',1,2.5,0,{damage:10,order:{type:'hold'}});const hp=ally.hp,ahp=a.hp;S.fire(s,a,ally);near(a.hp,ahp-(hp-ally.hp)*.1);assert.equal(a.thornsHitFrame,s.frame);assert.equal(S.publicState(s,0).units.find(u=>u.id===ally.id).thornsAura,.1);assert.ok(S.restore(s));
 const ranged=S.spawn(s,'archer',1,4,0,{damage:10,order:{type:'hold'}}),rhp=ranged.hp;S.fire(s,ranged,ally);step(s,10);assert.equal(ranged.hp,rhp);assert.ok(S.restore(s));
}
console.log('PASS Thorns Aura: source percentage on direct melee HP damage, ranged exclusion, public aura state and nonrecursive saved effects');
for(const method of ['purge','detonate','abolish']){
 const {s,h}=keeperFixture(S);s.teams[1].faction=2;const v=S.spawn(s,'soldier',1,2,0,{damage:0,order:{type:'hold'}});cmd(s,h,'learn',{slot:0});S.visibility(s);cmd(s,h,'spell',{slot:0,target:v.id});step(s,7);assert.ok(v.keeperRoots);
 if(method==='purge'){const caster=S.spawn(s,'shaman',1,2,1,{mana:200,damage:0,order:{type:'hold'}});assert.equal(cmd(s,caster,'casterSpell',{spell:'purge',target:v.id}),null);}
 else if(method==='detonate'){const w=S.spawn(s,'worker',0,1,0);assert.equal(cmd(s,w,'detonate',{x:w.x,z:w.z}),null);step(s,1);}
 else{s.teams[1].abolishMagic=1;const dryad=S.spawn(s,'dryad',1,2,1,{order:{type:'hold'}});S.visibility(s);assert.equal(cmd(s,dryad,'abolish',{target:v.id}),null);step(s,4);}
 assert.equal(v.keeperRoots,undefined);assert.ok(S.restore(s));const hp=v.hp;step(s,5);assert.equal(v.hp,hp);
}
console.log('PASS immediate Roots dispel saves: friendly Purge, Wisp Detonate and learned Dryad Abolish remove source DOT immediately');
{
 const {s,h}=keeperFixture(S);cmd(s,h,'learn',{slot:2});const ally=S.spawn(s,'soldier',0,1,0,{hp:5,damage:0}),a=S.spawn(s,'soldier',1,1.5,0,{damage:10000,itemMagicImmune:10});const hp=a.hp;S.fire(s,a,ally);assert.equal(ally.hp,0);near(a.hp,hp-.5);assert.ok(S.restore(s));
 const shield=S.spawn(s,'soldier',0,2,0,{shield:20000,shieldLeft:10,damage:0});const before=a.hp;S.fire(s,a,shield);assert.equal(a.hp,before);assert.ok(S.restore(s));
}
console.log('PASS Thorns lethal damage clamp and complete shield absorption, with magic-immune attackers and immediate death saves');
{
 const {s,h}=keeperFixture(S,6);S.setAI(s,0,true);step(s,40);assert.deepEqual(h.skills,[2,3,0,1]);assert.ok(S.restore(s));const target=S.spawn(s,'soldier',1,2,0,{hp:1000,maxHp:1000,damage:0,order:{type:'hold'}});S.visibility(s);h.mana=400;step(s,40);assert.ok(h.keeperCast||target.keeperRoots||s.units.some(S.keeperTreant));assert.ok(S.restore(s));
}
console.log('PASS source Keeper AI first-hero skill order, valid organic targeting and deterministic saved spell decisions');
{
 const {s}=keeperFixture(S);s.units=[];s.teams[0].gold=1000;s.teams[0].wood=1000;S.spawn(s,'hall',0,-8,-8);const altar=S.spawn(s,'altar',0,0,0),killer=S.spawn(s,'soldier',1,20,20,{damage:100000,order:{type:'hold'}});assert.equal(cmd(s,altar,'train',{kind:'hero',heroClass:1}),null);continuation(s,550);const h=s.units.find(S.keeperUnit);assert.ok(h);assert.equal(h.maxHp,500);assert.ok(h.inventory.includes(S.townPortal.item));cmd(s,h,'learn',{slot:0});S.fire(s,killer,h);assert.equal(h.hp,0);assert.equal(cmd(s,altar,'revive',{target:h.id}),null);assert.equal(s.teams[0].gold,830);assert.equal(altar.queue[0].left,35.75);continuation(s,358);assert.equal(h.hp,h.maxHp);assert.ok(h.mana>=100&&h.mana<101);assert.equal(h.skills[0],1);assert.ok(S.restore(s));
 const target=S.spawn(s,'dragon',1,5,0,{damage:0,order:{type:'hold'}});assert.equal(S.fire(s,h,target),true);const missile=s.projectiles.at(-1);assert.equal(missile.art,'keeper');assert.equal(missile.sourceHero,'Ekee');assert.notEqual(missile.skills,h.skills);continuation(s,15);assert.ok(target.hp<target.maxHp);
}
console.log('PASS original Keeper Altar recruitment, paid revival with retained skills/items and independent saved original missile snapshots');
