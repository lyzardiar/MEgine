// Author: MiYu. Actual Death Knight casts, projectiles, aura, original corpse identities and strict save continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deathKnightFixture} from './frost-death-knight-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),D=require('../samples/frostbound-realms/game/death-knight.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,args={})=>S.command(s,h.team,{type,ids:[h.id],...args}),learn=(s,h,slot,n=1)=>{for(let i=0;i<n;i++)assert.equal(cmd(s,h,'learn',{slot}),null);},hold={cd:10000,order:{type:'hold'}};
{
 const {s,h}=deathKnightFixture(S);assert.equal(S.PROTOCOL,71);assert.equal(h.sourceHero,'Udea');assert.equal(h.maxHp,675);assert.equal(h.damage,30);assert.equal(S.maxMana(h),255);assert.equal(h.mana,100);assert.ok(Math.abs(h.armorValue-2.6)<1e-8);assert.deepEqual(S.unitType(h).spells.map(r=>r.hotkey),['C','E','U','D']);assert.ok(S.restore(s));
 const legacy=S.create('skirmish',{deathKnightVersion:0,factions:[3,0],ai:[false,false]});delete legacy.deathKnightVersion;assert.equal(S.restore(legacy).deathKnightVersion,0);assert.equal(S.spawn(legacy,'hero',0,0,0,{heroClass:0}).sourceHero,undefined);assert.throws(()=>S.create('skirmish',{deathKnightVersion:2}),/Death Knight/);
 const bad=S.clone(s);bad.units[0].maxHp++;assert.throws(()=>S.restore(bad),/Death Knight/);bad.units[0].maxHp--;bad.deathKnightVersion=0;assert.throws(()=>S.restore(bad),/Death Knight/);
}
console.log('PASS source Death Knight recruitment profile, protocol, original stats and legacy save gate');
{
 const {s,h}=deathKnightFixture(S,5);learn(s,h,0,3);h.mana=S.maxMana(h);const ally=S.spawn(s,'ghoul',0,4,0,{...hold,hp:10}),enemy=S.spawn(s,'soldier',1,6,0,hold),friendlyLiving=S.spawn(s,'rifleman',0,-2,0,hold),enemyUndead=S.spawn(s,'ghoul',1,-3,0,hold);S.visibility(s);
 for(const v of [h,friendlyLiving,enemyUndead])assert.match(cmd(s,h,'spell',{slot:0,target:v.id}),/undead ally/);
 assert.equal(cmd(s,h,'spell',{slot:0,target:ally.id}),null);step(s,4);assert.equal(s.projectiles.length,0);step(s,1);assert.equal(ally.hp,10);assert.equal(s.projectiles[0].art,'death-coil');assert.equal(S.projectileSpeed(s.projectiles[0]),11);assert.ok(S.restore(s));const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);assert.equal(ally.hp,ally.maxHp);assert.equal(s.projectiles.length,0);assert.ok(ally.deathCoilFrame!==undefined);
 h.spell[0]=0;h.mana=S.maxMana(h);const hp=enemy.hp;assert.equal(cmd(s,h,'spell',{slot:0,target:enemy.id}),null);step(s,5);const forged=S.clone(s);forged.projectiles[0].deathCoilRank=2;assert.throws(()=>S.restore(forged),/Death Coil/);enemy.x=7;step(s,8);assert.equal(enemy.hp,Math.max(0,hp-300));assert.ok(S.restore(s));
 h.spell[0]=0;assert.equal(cmd(s,h,'spell',{slot:0,target:ally.id}),null);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.deathKnightCast,undefined);const mana=h.mana;step(s,5);assert.ok(h.mana>=mana);
}
console.log('PASS ranked traveling homing Death Coil, allegiance, cast point, interruption, projectile validation and save continuation');
{
 const {s,h}=deathKnightFixture(S,5);learn(s,h,1,3);h.hp=100;h.mana=S.maxMana(h);const target=S.spawn(s,'ghoul',0,2,0,{...hold,hp:100}),enemy=S.spawn(s,'ghoul',1,3,0,hold),building=S.spawn(s,'hall',0,20,20);S.visibility(s);
 for(const v of [h,enemy,building])assert.match(cmd(s,h,'spell',{slot:1,target:v.id}),/owned nonhero/);
 assert.equal(cmd(s,h,'spell',{slot:1,target:target.id}),null);const saved=S.restore(s),gold=s.teams[0].gold,kills=s.teams[0].kills;step(s,5);step(saved,5);assert.deepEqual(saved,s);assert.ok(h.hp>=400&&h.hp<402);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].kills,kills);assert.equal(s.teams[1].kills,0);assert.equal(h.spell[1],15);assert.equal(s.corpses.length,1);assert.ok(S.restore(s));
}
console.log('PASS Death Pact sacrifice, current-life conversion, cast continuation and no kill reward');
{
 const {s,h}=deathKnightFixture(S,5);learn(s,h,2,3);const ally=S.spawn(s,'ghoul',0,2,0,{...hold,hp:100}),enemy=S.spawn(s,'soldier',1,3,0,{...hold,hp:100});S.refreshUnholy(s);assert.deepEqual(S.unholyAura(s,ally),{move:.3,regen:1.5});assert.deepEqual(S.unholyAura(s,enemy),{move:0,regen:0});assert.ok(Math.abs(S.moveRate(ally)-Math.min(ally.speed*1.3,Number(D.rules.misc.MaxUnitSpeed)/100)/ally.speed)<1e-8);const hp=ally.hp;step(s,10);assert.ok(Math.abs(ally.hp-hp-1.5)<1e-6);assert.ok(S.restore(s));
 const duplicate=S.spawn(s,'hero',0,-2,0,{...hold,heroClass:0,level:3,skills:[0,0,2,0],skillPoints:1});S.refreshUnholy(s);assert.equal(S.unholyAura(s,ally).move,.3);h.x=20;S.refreshUnholy(s);assert.equal(S.unholyAura(s,ally).move,.2);duplicate.hp=0;S.refreshUnholy(s);assert.equal(ally.unholyMove,undefined);assert.ok(S.restore(s));
}
console.log('PASS strongest-source Unholy Aura, fixed regeneration, movement and immediate range/death update');
{
 const {s,h}=deathKnightFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);s.teams[0].upgrade=3;s.teams[0].necromancy=2;s.teams[1].upgrade=3;
 const killer=S.spawn(s,'ghoul',0,20,20,{...hold,damage:10000}),ids=[];for(const [kind,team,x,z] of [['soldier',1,2,0],['worker',1,3,0],['soldier',0,4,0],['necromancer',0,-2,0],['dryad',1,-3,0],['druidtalon',1,-4,0],['soldier',1,5,0]]){const v=S.spawn(s,kind,team,x,z,hold);ids.push(v.id);S.fire(s,{...killer,team:1-v.team},v);}step(s,1);assert.equal(s.corpses.length,7);assert.equal(S.animateDeadCorpses(s,h).length,7);assert.equal(cmd(s,h,'spell',{slot:3}),null);const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);let raised=s.units.filter(S.animatedUnit);assert.equal(raised.length,6);assert.equal(s.corpses.length,1);assert.ok(raised.every(v=>v.team===h.team&&v.summoned&&S.invulnerable(v)));
 for(const v of raised){const r=D.revival(v.sourceUnit);assert.equal(v.maxHp,r.hp);assert.equal(v.damage,Object.values(r.weapons)[0]?.damage||0);assert.equal(v.speed,r.speed);assert.equal(v.armorValue,r.armorValue);assert.equal(v.nightLevels,undefined);assert.equal(v.casterRank||0,0);assert.equal(v.druidRank||0,0);assert.equal(v.expires,v.animateDeadFrame+400);}
 const footman=raised.find(v=>v.sourceUnit==='hfoo'),worker=raised.find(v=>v.sourceUnit==='hpea');assert.ok(footman);assert.ok(worker);assert.equal(footman.maxHp,420);assert.equal(S.acolyte(s,worker),false);assert.ok(S.restore(s));const forged=S.clone(s);forged.units.find(S.animatedUnit).damage++;assert.throws(()=>S.restore(forged),/Animate Dead/);const seventh=S.clone(s),extra=S.clone(seventh.units.find(S.animatedUnit));extra.id=++seventh.serial;seventh.units.push(extra);assert.throws(()=>S.restore(seventh),/Animate Dead/);
 const enemy=S.spawn(s,'soldier',1,15,0,hold),hp=footman.hp;S.fire(s,enemy,footman);assert.equal(footman.hp,hp);assert.equal(S.canControl(s,0,footman),true);assert.equal(S.canControl(s,1,footman),false);assert.equal(h.spell[3],180);
 step(s,400);raised=s.units.filter(v=>ids.includes(v.id));assert.equal(raised.length,0);assert.equal(s.corpses.length,0);assert.ok(S.restore(s));
}
console.log('PASS six original allied/enemy bodies, baseline stats, no inherited research, ownership, invulnerability, source workers and 40-second expiry');
{
 const {s,h}=deathKnightFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);const hold={cd:10000,order:{type:'hold'}},killer=S.spawn(s,'ghoul',0,20,20,{...hold,damage:10000});for(const [kind,x,z] of [['nighthuntress',2,0],['druidbear',-2,0]]){const v=S.spawn(s,kind,1,x,z,hold);S.fire(s,killer,v);}step(s,1);assert.equal(cmd(s,h,'spell',{slot:3}),null);step(s,5);const huntress=s.units.find(v=>v.sourceUnit==='esen'),bear=s.units.find(v=>v.sourceUnit==='edcm');assert.ok(huntress);assert.ok(bear);
 const first=S.spawn(s,'soldier',1,4,0,{...hold,hp:1000,maxHp:1000}),second=S.spawn(s,'soldier',1,5,1,{...hold,hp:1000,maxHp:1000});assert.equal(S.fire(s,huntress,first),true);assert.equal(s.projectiles[0].bounceLeft,1);assert.ok(S.restore(s));const bad=S.clone(s);bad.projectiles[0].sourceUnit='hfoo';assert.throws(()=>S.restore(bad),/Animate Dead/);const restored=S.restore(s);step(s,12);step(restored,12);assert.deepEqual(restored,s);assert.ok(first.hp<1000);assert.ok(second.hp<1000);assert.ok(S.restore(s));
 const fraction=bear.hp/bear.maxHp;assert.equal(cmd(s,bear,'druidMorph'),null);assert.equal(bear.speed,0);assert.ok(S.restore(s));const morph=S.restore(s);step(s,30);step(morph,30);assert.deepEqual(morph,s);assert.equal(bear.kind,'druidclaw');assert.equal(bear.sourceUnit,'edoc');assert.equal(bear.maxHp,D.revival('edoc').hp);assert.equal(bear.hp/bear.maxHp,fraction);assert.equal(bear.druidRank,0);assert.ok(S.restore(s));assert.match(cmd(s,bear,'druidMorph'),/Master/);
 const expired=S.clone(s);expired.units.find(S.animatedUnit).animateDeadFrame=0;expired.units.find(S.animatedUnit).expires=400;expired.frame=400;assert.throws(()=>S.restore(expired),/Animate Dead|projectile|effect/);
}
console.log('PASS original Huntress bounce/save validation and revived Bear transformation with preserved source profile, mana and health fraction');
{
 const {s,h}=deathKnightFixture(S,3);learn(s,h,1);const phased=S.spawn(s,'faeriedragon',0,2,0,{...hold,phaseLeft:1});S.visibility(s);assert.match(cmd(s,h,'spell',{slot:1,target:phased.id}),/owned nonhero/);assert.equal(h.spell[1],0);assert.equal(h.deathKnightCast,undefined);
}
console.log('PASS Death Pact excludes phased targets before spending resources');
{
 const {s,h}=deathKnightFixture(S,6);S.setAI(s,0,true);step(s,40);assert.deepEqual(h.skills,[3,0,2,1]);assert.ok(S.restore(s));
}
console.log('PASS original Death Knight AI learning order');
