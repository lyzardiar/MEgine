// Author: MiYu. Authoritative Crypt Lord Impale phases, Carapace reflection and strict deterministic saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cryptLordFixture} from './frost-crypt-lord-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),H=require('../samples/frostbound-realms/game/crypt-lord.js'),hold={cd:10000,order:{type:'hold'}},step=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),learn=(s,h,slot,rank=1)=>{for(let i=0;i<rank;i++)assert.equal(cmd(s,h,'learn',{slot}),null);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,h}=cryptLordFixture(S);assert.equal(h.sourceHero,'Ucrl');assert.equal(h.maxHp,675);assert.equal(h.damage,31);assert.equal(h.mana,100);assert.equal(S.maxMana(h),210);assert.ok(S.restore(s));assert.throws(()=>S.create('skirmish',{cryptLordVersion:2}),/Crypt Lord/);const bad=S.clone(s);bad.units[0].sourceHero='Udre';assert.throws(()=>S.restore(bad),/identity/);
 const old=S.create('skirmish',{map:s.map,factions:[3,0],cryptLordVersion:0});const generic=S.spawn(old,'hero',0,0,0,{heroClass:3});assert.equal(generic.sourceHero,undefined);delete old.cryptLordVersion;delete old.impales;assert.equal(S.restore(old).cryptLordVersion,0);
}
console.log('PASS opt-in Crypt Lord recruitment, source stats, version/identity validation and legacy saves');
for(const rank of [1,2,3]){
 const {s,h}=cryptLordFixture(S,6);learn(s,h,0,rank);h.mana=S.maxMana(h);const v=S.spawn(s,'soldier',1,3,0,hold),ally=S.spawn(s,'soldier',0,3,1,hold),air=S.spawn(s,'dragon',1,3,1,hold),immune=S.spawn(s,'dryad',1,3,-1,hold),outside=S.spawn(s,'soldier',1,3,4,hold),building=S.spawn(s,'farm',1,4,-1);S.visibility(s);const before=v.hp;
 assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,3);assert.equal(s.impales.length,0);step(s);assert.equal(s.impales[0].travel,0);assert.equal(h.spell[0],9);step(s);assert.ok(v.impaled);near(S.impaleAirLeft(v),1);near(S.impaleLeft(v),rank+2);assert.equal(v.hp,before);assert.equal(S.invulnerable(v),true);const pub=S.publicState(s,1);assert.equal(pub.units.find(u=>u.id===v.id).impaled,undefined);assert.equal(pub.impales[0].source,undefined);assert.equal(pub.impales[0].fromX,undefined);assert.equal(pub.impales[0].travel,undefined);assert.equal(pub.impales[0].frame,undefined);assert.equal(pub.impales[0].hits,undefined);
 assert.equal(cmd(s,h,'move',{x:-5,z:0}),null);const x=v.x;assert.equal(cmd(s,v,'move',{x:8,z:0}),null);step(s,5);assert.equal(v.x,x);near(S.unitHeight(s,v),2.25);assert.equal(S.canAttack(h,v),false);S.fire(s,h,v);assert.equal(v.hp,before);const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);near(v.hp,before-[50,80,110][rank-1]);near(S.impaleAirLeft(v),0);near(S.impaleLeft(v),rank+1);assert.equal(S.invulnerable(v),false);assert.equal(v.impaleLandingFrame,s.frame);assert.equal(s.impales.length,0);
 for(const ignored of [ally,air,immune,outside,building])assert.equal(ignored.hp,ignored.maxHp);assert.ok(S.restore(s));step(s,(rank+1)*10);assert.equal(v.impaled,undefined);near(v.stun,0);assert.equal(v.order.type,'move');assert.ok(S.restore(s));
}
console.log('PASS ranked swept Impale waves, independent cast/air/stun phases, landing damage, airborne invulnerability and restored continuation');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,0);h.mana=S.maxMana(h);const hero=S.spawn(s,'hero',1,3,0,{...hold,heroClass:1,level:6,skillPoints:6});learn(s,hero,0);hero.mana=S.maxMana(hero);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,4);assert.equal(cmd(s,hero,'spell',{slot:0,target:h.id}),null);step(s);assert.equal(hero.mountainKingCast,undefined);near(hero.impaled.left,2);const hp=hero.hp;step(s,10);const hit=s.events.find(e=>e.type==='damage'&&e.x===hero.x&&e.z===hero.z);assert.equal(hit.amount,35);assert.ok(hero.hp<hp);near(hero.impaled.left,1);assert.ok(S.restore(s));step(s,10);assert.equal(hero.impaled,undefined);
}
console.log('PASS Impale hero damage/duration and interrupted enemy spell casts');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,0);h.mana=S.maxMana(h);const base=S.spawn(s,'farm',1,12,0),attacker=S.spawn(s,'soldier',1,3,0,{...hold,order:{type:'attack',target:h.id}}),repairer=S.spawn(s,'worker',1,3,1,{...hold,order:{type:'repair',target:base.id}});base.hp-=100;S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,5);assert.equal(attacker.order.type,'attack');assert.equal(attacker.order.target,h.id);assert.equal(repairer.order.type,'repair');assert.equal(repairer.order.target,base.id);assert.equal(cmd(s,h,'move',{x:-8,z:0}),null);const initial=[attacker.x,attacker.z,repairer.x,repairer.z],saved=S.restore(s);step(s,29);step(saved,29);assert.deepEqual(saved,s);assert.deepEqual([attacker.x,attacker.z,repairer.x,repairer.z],initial);step(s,2);assert.equal(attacker.impaled,undefined);assert.equal(repairer.impaled,undefined);assert.ok(attacker.x!==initial[0]||attacker.z!==initial[1]);assert.ok(repairer.x!==initial[2]||repairer.z!==initial[3]);assert.ok(S.restore(s));
}
console.log('PASS Impale preserves ordinary attack/work orders, pauses motion and resumes after restored stun expiry');
for(const rank of [1,2,3]){
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1,rank);near(h.armorValue,H.stats({...h,skills:[0,0,0,0]},{}).armorValue+[3,5,7][rank-1]);assert.match(cmd(s,h,'spell',{slot:1}),/passive/);const attacker=S.spawn(s,'soldier',1,1,0,{...hold,hp:1000,maxHp:1000,armorValue:30}),raw=S.nightWeaponRoll(s,attacker);s.rng=123456789;const hp=attacker.hp;S.fire(s,attacker,h);near(hp-attacker.hp,raw*[.15,.25,.35][rank-1]);assert.equal(attacker.carapaceHitFrame,s.frame);assert.ok(h.hp<h.maxHp);assert.ok(S.restore(s));
 const ranged=S.spawn(s,'rifleman',1,2,0,{...hold,hp:1000,maxHp:1000});S.fire(s,ranged,h);step(s,10);assert.equal(ranged.carapaceHitFrame,undefined);assert.ok(S.restore(s));
}
console.log('PASS ranked Carapace armor and raw melee damage reflection, independent of attacker numerical armor; ranged exclusion');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);s.teams[1].faction=3;const enemy=S.spawn(s,'hero',1,1,0,{...hold,heroClass:3,level:6,skillPoints:6});learn(s,enemy,1);const rng=s.rng,raw=S.nightWeaponRoll(s,enemy);s.rng=rng;const hp=enemy.hp;S.fire(s,enemy,h);near(hp-enemy.hp,raw*.15*.7);assert.equal(s.events.filter(e=>e.type==='damage').length,2);assert.equal(h.carapaceHitFrame,undefined);assert.ok(S.restore(s));
 const immune=S.spawn(s,'dryad',1,1,2,{...hold,hp:1000,maxHp:1000});assert.equal(S.magicImmune(immune),true);const before=immune.hp;S.fire(s,immune,h);assert.equal(immune.hp,before); // Dryad's source attack is ranged.
}
console.log('PASS Carapace hero category factor and prevention of reflection recursion');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,1);h.shield=500;h.shieldLeft=20;const attacker=S.spawn(s,'soldier',1,1,0,{...hold,hp:1000,maxHp:1000}),before=attacker.hp,hp=h.hp,raw=S.nightWeaponRoll(s,attacker);s.rng=123456789;S.fire(s,attacker,h);assert.equal(h.hp,hp);assert.ok(h.shield<500);near(before-attacker.hp,raw*.15);assert.equal(attacker.carapaceHitFrame,s.frame);assert.ok(S.restore(s));
 s.teams[1].faction=3;const dread=S.spawn(s,'hero',1,2,0,{...hold,heroClass:2,level:6,skillPoints:6});learn(s,dread,3);const infernal=S.spawn(s,'infernal',1,1,1,{...hold,summoned:true,summoner:dread.id,infernalBorn:s.frame,expires:s.frame+1800,infernalPulse:0}),rng=s.rng,value=S.nightWeaponRoll(s,infernal);s.rng=rng;const health=infernal.hp;S.fire(s,infernal,h);assert.equal(S.magicImmune(infernal),true);near(health-infernal.hp,value*.15);assert.ok(S.restore(s));
}
console.log('PASS Carapace raw reflection through fully absorbing shields and source magic-immune melee attackers');
{
 const {s,h}=cryptLordFixture(S,6);learn(s,h,0);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);assert.match(cmd(s,h,'move',{x:100,z:0}),/map|point|outside|destination/i);assert.ok(h.cryptLordCast);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.cryptLordCast,undefined);assert.equal(cmd(s,h,'spell',{slot:0,x:7,z:0}),null);step(s,4);assert.ok(S.restore(s));for(const mutate of [p=>p.travel++,p=>p.frame++,p=>p.hits=[h.id],p=>p.rank=4,p=>p.fromX++,p=>p.secret=1]){const bad=S.clone(s);mutate(bad.impales[0]);assert.throws(()=>S.restore(bad),/Impale/);}
 const target=S.spawn(s,'soldier',1,3,0,hold);step(s);const bad=S.clone(s);bad.units.find(u=>u.id===target.id).impaled.airLeft+=.1;assert.throws(()=>S.restore(bad),/Impale/);
}
console.log('PASS pending cast interruption, strict wave/effect forgery rejection and public state sanitization');
