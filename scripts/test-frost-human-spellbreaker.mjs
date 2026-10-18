// Author: MiYu. Feedback at actual impact, source mana limits, blocked attacks and durable authority.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spellbreakerFixture} from './frost-human-spellbreaker-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),copy=o=>JSON.parse(JSON.stringify(o)),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
assert.equal(S.PROTOCOL,106);assert.equal(S.create().humanSpellbreakerVersion,2);
{
 const {s,breaker,victim}=spellbreakerFixture(S),control=S.restore(s);control.humanSpellbreakerVersion=0;const a=control.units.find(u=>u.id===breaker.id),b=control.units.find(u=>u.id===victim.id);assert.ok(S.fire(s,breaker,victim));assert.ok(S.fire(control,a,b));assert.equal(victim.mana,100);assert.equal(victim.feedbackFrame,undefined);assert.equal(s.projectiles.length,1);const restored=S.restore(s);step(s,5);step(restored,5);step(control,5);assert.deepEqual(restored,s);assert.equal(victim.feedbackAmount,20);assert.ok(Math.abs(b.mana-victim.mana-20)<1e-7);assert.ok(Math.abs(b.hp-victim.hp-20)<1e-7);const visible=S.publicState(s,0).units.find(u=>u.id===victim.id);assert.equal(visible.feedbackFrame,victim.feedbackFrame);assert.equal(visible.feedbackAmount,20);assert.equal(S.spellbreakerUnit(breaker),true);assert.equal(S.spellbreakerUnit({...breaker,animateDead:1}),false);
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);victim.mana=5;assert.ok(S.fire(s,breaker,victim));for(let i=0;i<5&&!victim.feedbackFrame;i++)S.tick(s);assert.ok(victim.feedbackAmount>=5&&victim.feedbackAmount<5.3);assert.equal(victim.mana,0);assert.ok(S.restore(s));
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);victim.hp=1;S.fire(s,breaker,victim);step(s,5);assert.equal(victim.hp,0);assert.equal(victim.feedbackAmount,20);assert.ok(S.restore(s));
}
for(const immune of ['unit','item']){
 const {s,breaker,victim}=spellbreakerFixture(S);let target=victim;if(immune==='unit')target=S.spawn(s,'humanspellbreaker',1,1,1,{mana:100,cd:99,order:{type:'hold'}});else target.itemMagicImmune=5;const before=target.hp;S.visibility(s);assert.ok(S.fire(s,breaker,target));step(s,5);assert.equal(target.feedbackFrame,undefined);assert.ok(target.mana>=100);assert.ok(target.hp<before);assert.ok(S.restore(s));
}
{
 const {s,breaker}=spellbreakerFixture(S),hero=S.spawn(s,'hero',1,1,1,{mana:100,cd:99,order:{type:'hold'}});S.visibility(s);S.fire(s,breaker,hero);step(s,5);assert.equal(hero.feedbackAmount,4);assert.ok(S.restore(s));
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);S.fire(s,breaker,victim);breaker.hp=0;step(s,5);assert.equal(victim.feedbackAmount,20);assert.ok(S.restore(s));
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);S.fire(s,breaker,victim);victim.x=25;victim.z=25;step(s,5);assert.equal(victim.feedbackFrame,undefined);assert.ok(victim.mana>=100);assert.ok(S.restore(s));
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);victim.banish={left:10,rank:1,source:breaker.id,frame:0};S.fire(s,breaker,victim);step(s,5);assert.equal(victim.feedbackFrame,undefined);assert.ok(victim.mana>=100);
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);assert.equal(S.feedback(s,breaker,{...victim,team:0},breaker),0);assert.equal(S.feedback(s,breaker,{...victim,mana:0},breaker),0);assert.equal(S.feedback(s,breaker,{...victim,kind:'guardtower'},breaker),0);assert.equal(S.feedback(s,breaker,victim,{...breaker,animateDead:1}),0);assert.equal(victim.mana,100);
}
{
 const {s,breaker,victim}=spellbreakerFixture(S),summoned={...victim,summoned:true};assert.equal(S.feedback(s,breaker,summoned,breaker),20);assert.equal(summoned.mana,80);
}
{
 const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.props=[];map.units=[];map.triggers=[];map.doodads=[];const s=S.create('skirmish',{map,factions:[0,2],ai:[false,false]});s.units=[];s.resources=[];const breaker=S.spawn(s,'humanspellbreaker',0,-1,0,{cd:99,order:{type:'hold'}}),hero=S.spawn(s,'hero',1,1,0,{heroClass:0,level:5,skills:[0,0,3,0],skillPoints:2,mana:100,cd:99,order:{type:'hold'}});S.visibility(s);assert.ok(S.demonHunterUnit(hero));S.fire(s,breaker,hero);s.rng=0;let evaded=false;for(let i=0;i<5;i++){S.tick(s);evaded ||= s.events.some(e=>e.type==='evade');}assert.ok(evaded);assert.equal(hero.feedbackFrame,undefined);assert.ok(hero.mana>=100);assert.ok(S.restore(s));
}
{
 const {s,breaker,victim}=spellbreakerFixture(S);S.fire(s,breaker,victim);step(s,5);for(const fn of [x=>x.humanSpellbreakerVersion=3,x=>x.humanSpellbreakerVersion=0,x=>x.units.find(u=>u.id===victim.id).feedbackAmount=21,x=>x.units.find(u=>u.id===victim.id).feedbackAmount=0,x=>x.units.find(u=>u.id===victim.id).feedbackFrame=x.frame+1,x=>delete x.units.find(u=>u.id===victim.id).feedbackAmount]){const bad=copy(s);fn(bad);assert.throws(()=>S.restore(bad),/Spell (Breaker|Steal)|Control Magic/);}const legacy=spellbreakerFixture(S).s;delete legacy.humanSpellbreakerVersion;delete legacy.humanControlMagicVersion;for(const u of legacy.units){delete u.spellStealAuto;delete u.spellStealCd;delete u.controlMagicCd;}assert.equal(S.restore(legacy).humanSpellbreakerVersion,0);for(const mode of ['td','moba','rpg'])assert.equal(S.create(mode).humanSpellbreakerVersion,0);assert.throws(()=>S.create('skirmish',{humanSanctumVersion:0,humanSpellbreakerVersion:1}),/Spell (Breaker|Steal)|Control Magic/);
}
console.log('PASS Feedback: actual missile impact and midflight restore, 20/4/remaining mana, lethal hits, magic immunity, dead launcher, hidden target, ethereal/friendly/structure/animated exclusions and strict versioned saves; original armor parity unverified');
