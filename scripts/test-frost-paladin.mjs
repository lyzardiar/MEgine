// Author: MiYu. Original Paladin targets, ranks, armor, invulnerability, corpses and save continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {paladinFixture} from './frost-paladin-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),P=require('../samples/frostbound-realms/game/paladin.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,args={})=>S.command(s,h.team,{type,ids:[h.id],...args}),learn=(s,h,slot,n=1)=>{for(let i=0;i<n;i++)assert.equal(cmd(s,h,'learn',{slot}),null);};
{
 const {s,h}=paladinFixture(S);assert.equal(h.sourceHero,'Hpal');assert.equal(h.maxHp,650);assert.equal(h.damage,29);assert.equal(S.maxMana(h),255);assert.ok(Math.abs(h.armorValue-3.9)<1e-8);assert.deepEqual(S.unitType(h).spells.map(r=>r.hotkey),['T','D','V','R']);assert.deepEqual(S.unitType(h).spells.map(r=>r.slot),[8,9,10,11]);assert.deepEqual(P.rules.skillBuilds.first,[0,2,0,1,0,3,2,2,1,1]);assert.ok(S.restore(s));
 const legacy=S.create('skirmish',{paladinVersion:0,factions:[0,3],ai:[false,false]});delete legacy.paladinVersion;const old=S.spawn(legacy,'hero',0,0,0,{heroClass:3});assert.equal(old.sourceHero,undefined);assert.equal(S.restore(legacy).paladinVersion,0);
}
console.log('PASS original Paladin stats, command/research slots, hotkeys, AI source order and legacy identity');
{
 const {s,h}=paladinFixture(S,5);learn(s,h,0,3);h.mana=300;const ally=S.spawn(s,'soldier',0,2,0,{hp:20,damage:0,cd:10000,order:{type:'hold'}}),enemy=S.spawn(s,'abomination',1,3,0,{damage:0,cd:10000,order:{type:'hold'}}),living=S.spawn(s,'shaman',1,4,0,{damage:0,cd:10000,order:{type:'hold'}}),friendlyDead=S.spawn(s,'ghoul',0,-2,0,{hp:100,damage:0,cd:10000,order:{type:'hold'}});S.visibility(s);
 for(const v of [h,living,friendlyDead])assert.match(cmd(s,h,'spell',{slot:0,target:v.id}),/living ally/);
 assert.equal(cmd(s,h,'spell',{slot:0,target:ally.id}),null);assert.equal(h.mana,300);step(s,5);assert.equal(ally.hp,ally.maxHp);assert.ok(h.mana<240);assert.ok(h.spell[0]>4);assert.equal(ally.holyLightFrame,s.frame);assert.ok(S.restore(s));
 h.spell[0]=0;h.mana=300;const before=enemy.hp;assert.equal(cmd(s,h,'spell',{slot:0,target:enemy.id}),null);const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);assert.equal(enemy.hp,before-300);assert.ok(S.restore(s));
 h.spell[0]=0;assert.equal(cmd(s,h,'spell',{slot:0,target:ally.id}),null);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.paladinCast,undefined);const mana=h.mana;step(s,5);assert.ok(h.mana>=mana);
 enemy.itemMagicImmune=1;assert.match(cmd(s,h,'spell',{slot:0,target:enemy.id}),/living ally/);ally.itemMagicImmune=1;assert.equal(cmd(s,h,'spell',{slot:0,target:ally.id}),null);assert.ok(S.restore(s));
}
console.log('PASS ranked Holy Light, undead allegiance, self exclusion, mana at impact, interrupted casts and save continuation');
{
 const {s,h}=paladinFixture(S,5);learn(s,h,1,3);h.mana=200;assert.equal(cmd(s,h,'spell',{slot:1}),null);step(s,5);assert.equal(h.divineShield,45);assert.equal(h.spell[1],65);assert.ok(S.invulnerable(h));const enemy=S.spawn(s,'ghoul',1,20,20,{damage:500,cd:10000,order:{type:'hold'}}),hp=h.hp;S.fire(s,enemy,h);assert.equal(h.hp,hp);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.divineShield,45);assert.equal(P.spell(h,1).canDeactivate,false);assert.ok(S.restore(s));step(s,450);assert.equal(h.divineShield,undefined);assert.ok(!S.invulnerable(h));enemy.damage=25;S.fire(s,enemy,h);assert.ok(h.hp<h.maxHp);assert.ok(S.restore(s));
}
console.log('PASS source Divine Shield duration/cooldown, damage immunity, continued orders and expiry');
{
 const {s,h}=paladinFixture(S,5);learn(s,h,2,3);const ally=S.spawn(s,'soldier',0,2,0,{damage:0,order:{type:'hold'}}),enemy=S.spawn(s,'soldier',1,3,0,{damage:0,order:{type:'hold'}});assert.equal(S.devotionAura(s,ally),4.5);assert.equal(S.devotionAura(s,enemy),0);assert.equal(S.armorValue(ally,s),S.armorValue(ally)+4.5);step(s,1);assert.equal(ally.devotionBuff.left,4);assert.equal(h.devotionBuff.left,2);const duplicate=S.spawn(s,'hero',0,-2,0,{heroClass:3,level:3,skills:[0,0,2,0],skillPoints:1,cd:10000,order:{type:'hold'}});assert.equal(S.devotionAura(s,ally),4.5);h.x=20;duplicate.x=20;step(s,39);assert.ok(S.devotionAura(s,ally)>0);step(s,2);assert.equal(S.devotionAura(s,ally),0);assert.ok(S.restore(s));const publicState=S.publicState(s,0);assert.equal(publicState.units.find(u=>u.id===h.id).devotionAura,4.5);
}
console.log('PASS fixed Devotion armor, strongest-source stacking, source ordinary/hero linger and public state');
{
 const {s,h}=paladinFixture(S,6);learn(s,h,3);h.mana=300;const bodies=[],enemy=S.spawn(s,'ghoul',1,20,20,{damage:10000,cd:10000,order:{type:'hold'}});for(let i=0;i<7;i++){const u=S.spawn(s,'soldier',0,2+i*.8,2,{damage:0,order:{type:'hold'}});bodies.push(u.id);S.fire(s,enemy,u);}step(s,1);assert.equal(s.corpses.length,7);assert.ok(s.corpses.every(c=>c.sourceUnit==='hfoo'));assert.equal(S.resurrectionCorpses(s,h).length,7);assert.equal(cmd(s,h,'spell',{slot:3}),null);const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);assert.equal(s.units.filter(u=>bodies.includes(u.id)&&u.hp>0).length,6);assert.equal(s.corpses.length,1);assert.equal(h.spell[3],240);assert.ok(s.units.filter(u=>bodies.includes(u.id)&&u.hp>0).every(u=>u.hp===u.maxHp&&!S.invulnerable(u)&&u.resurrectionFrame===s.frame));assert.ok(S.restore(s));
 const invalid=S.restore(s);invalid.units.find(u=>u.id===h.id).paladinLastSlot=2;assert.throws(()=>S.restore(invalid),/Paladin/);
}
console.log('PASS source six-unit Resurrection, original corpse identities, consumption, full health and saved cast continuation');
{
 const {s,h}=paladinFixture(S,6);S.setAI(s,0,true);step(s,40);assert.deepEqual(h.skills,[3,1,1,1]);assert.ok(S.restore(s));
 const forged=S.restore(s);forged.units[0].divineShield=999;assert.throws(()=>S.restore(forged),/Divine Shield|Paladin/);
}
console.log('PASS Paladin AI learning and strict saved state rejection');
