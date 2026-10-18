// Author: MiYu. Spell Steal authority, remaining durations, unit-only buffs and durable cast validation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spellstealFixture} from './frost-human-spellsteal-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),copy=v=>JSON.parse(JSON.stringify(v)),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},order=(s,u,target)=>S.command(s,u.team,{type:'spellSteal',ids:[u.id],target:target.id});
assert.equal(S.PROTOCOL,98);assert.equal(S.create().humanSpellbreakerVersion,2);
{
 const {s,breaker,donor,recipient}=spellstealFixture(S);s.teams[1].humanSanctum.Rhpt=2;s.units=s.units.filter(u=>u!==donor);const priest=S.spawn(s,'humanpriest',1,1,0,{mana:200,sanctumAuto:false,innerFireAuto:false,cd:99,order:{type:'hold'}});S.visibility(s);assert.equal(S.command(s,1,{type:'priestSpell',ids:[priest.id],spell:'Ainf',target:priest.id}),null);step(s,12);assert.ok(priest.innerFire);breaker.mana=200;const remaining=priest.innerFire.left,mana=breaker.mana;assert.equal(order(s,breaker,priest),null);step(s,1);assert.ok(breaker.spellStealCast);assert.ok(Math.abs(breaker.mana-(mana+.08))<1e-7);const restored=S.restore(s);step(s,3);step(restored,3);assert.deepEqual(restored,s);assert.equal(priest.innerFire,undefined);assert.ok(recipient.innerFire.left<=remaining);assert.equal(recipient.innerFire.source,priest.id);assert.equal(recipient.innerFire.team,0);assert.equal(recipient.innerFire.stolen.source,breaker.id);assert.equal(breaker.spellStealCd,3);assert.ok(Math.abs(breaker.mana-(mana+.32-75))<1e-7);assert.ok(S.restore(s));step(s,40);assert.ok(S.restore(s));assert.equal(S.publicState(s,1).units.find(u=>u.id===breaker.id).spellStealAuto,undefined);
}
for(const key of ['bloodlust','roar','rejuvenation','invisibility','lightningShield','frenzy']){
 const {s,breaker,donor,recipient}=spellstealFixture(S);donor[key]=key==='invisibility'?{left:120,source:donor.id,team:1,frame:s.frame}:10;if(key==='invisibility'){donor.invisibilityFrame=s.frame;S.spawn(s,'guardtower',0,0,0);s.teams[0].humanSanctum.Rhse=1;S.refreshMagicSentry(s);}if(key==='lightningShield')donor.lightningSource={id:donor.id,kind:'shaman',team:1,x:0,z:0};if(key==='frenzy')donor.frenzySource={id:donor.id,kind:'necromancer',team:1,x:0,z:0};S.visibility(s);assert.equal(order(s,breaker,donor),null,key);step(s,4);assert.ok(recipient[key]?.left>0||recipient[key]>0,key);assert.ok(!(donor[key]?.left>0||donor[key]>0),key);if(key==='lightningShield')assert.equal(recipient.lightningSource.team,0);if(key==='frenzy')assert.equal(recipient.frenzySource.team,0);assert.ok(S.restore(s),key);
}
for(const key of ['sanctumSlow','cripple','purgeLeft','faerieFire','polymorph','cyclone']){
 const {s,breaker,donor:enemy,recipient:friend}=spellstealFixture(S);friend[key]=['sanctumSlow','polymorph'].includes(key)?{left:key==='sanctumSlow'?60:60,source:enemy.id,team:1,frame:0,...(key==='polymorph'?{form:'nshf'}:{})}:5;if(key==='polymorph')friend.polymorph.form=S.sanctumRules.abilities.Aply.forms.ground;if(key==='faerieFire')friend.faerieTeam=1;if(key==='purgeLeft')friend.root=.2;if(key==='cyclone'){friend.order=null;friend.path=[];friend.waypoints=[];}S.visibility(s);assert.equal(order(s,breaker,friend),null,key);step(s,4);assert.ok(enemy[key]?.left>0||enemy[key]>0,key);assert.ok(!(friend[key]?.left>0||friend[key]>0),key);if(key==='faerieFire')assert.equal(enemy.faerieTeam,0);assert.ok(S.restore(s),key);
}
{
 const {s,breaker,donor,recipient}=spellstealFixture(S);donor.bloodlust=10;assert.equal(order(s,breaker,donor),null);step(s,1);assert.equal(S.command(s,0,{type:'stop',ids:[breaker.id]}),null);step(s,5);assert.equal(recipient.bloodlust,undefined);assert.equal(breaker.spellStealCd,0);assert.equal(breaker.spellStealCast,undefined);assert.equal(breaker.mana,250);assert.ok(S.restore(s));
}
for(const change of [f=>f.recipient.x=20,f=>f.recipient.hp=0,f=>f.recipient.bloodlust=10,f=>f.breaker.mana=74,f=>{f.donor.x=25;f.donor.z=25;},f=>f.donor.bloodlust=0]){
 const f=spellstealFixture(S);f.donor.bloodlust=10;f.breaker.bloodlust=10;change(f);S.visibility(f.s);assert.ok(order(f.s,f.breaker,f.donor));assert.equal(f.breaker.spellStealCast,undefined);assert.equal(f.breaker.spellStealCd,0);
}
{
 const f=spellstealFixture(S);f.donor.bloodlust=10;f.breaker.bloodlust=10;assert.equal(order(f.s,f.breaker,f.donor),null);step(f.s,1);f.recipient.x=20;step(f.s,3);assert.equal(f.breaker.spellStealCd,0);assert.equal(f.breaker.mana,250);assert.ok(f.donor.bloodlust>0);assert.ok(S.restore(f.s));
}
for(const key of ['frenzy','cyclone']){
 const f=spellstealFixture(S);const donor=key==='cyclone'?f.recipient:f.donor;donor[key]=5;if(key==='frenzy')donor.frenzySource={id:f.donor.id,kind:'necromancer',team:1,x:0,z:0};else donor.order=null;f.breaker.spellStealAuto=true;step(f.s,8);assert.equal(f.breaker.spellStealCast,undefined);assert.equal(f.breaker.spellStealCd,0);assert.equal(order(f.s,f.breaker,donor),null);step(f.s,4);assert.equal(f.breaker.spellStealCd,3);assert.ok(S.restore(f.s));
}
{
 const f=spellstealFixture(S);f.donor.bloodlust=10;assert.equal(S.command(f.s,0,{type:'spellStealAuto',ids:[f.breaker.id],enabled:true}),null);step(f.s,4);assert.ok(f.recipient.bloodlust>0);assert.equal(f.breaker.spellStealCd,3);const enemy=S.publicState(f.s,1).units.find(u=>u.id===f.breaker.id);assert.equal(enemy.spellStealAuto,undefined);assert.equal(enemy.spellStealCd,undefined);assert.equal(enemy.spellStealCast,undefined);assert.ok(Number.isFinite(enemy.spellStealCastPhase));assert.throws(()=>S.restore({...f.s,units:S.publicState(f.s,0).units}),/saved/);
}
{
 const {s,breaker,donor}=spellstealFixture(S);donor.frostArmor={left:10};donor.itemRegen={left:10};donor.speedScroll=10;donor.slowPoison={left:10};assert.equal(S.spellStealPlan(s,breaker,donor.id),null);assert.ok(order(s,breaker,donor));assert.ok(S.command(s,1,{type:'spellSteal',ids:[breaker.id],target:donor.id}));
}
{
 const f=spellstealFixture(S);f.donor.bloodlust=10;order(f.s,f.breaker,f.donor);step(f.s,1);for(const mutate of [u=>u.spellStealCast.left=.29,u=>u.spellStealCast.frame=3,u=>u.spellStealCast.extra=1,u=>u.spellStealCast.target=0,u=>u.spellStealCd=4,u=>u.spellStealAuto=1,u=>u.spellStealBackswing=.7,u=>u.spellStealCastPhase=0]){const bad=copy(f.s);mutate(bad.units.find(u=>u.id===f.breaker.id));assert.throws(()=>S.restore(bad),/Spell Steal/);}const legacy=S.create('skirmish',{humanSpellbreakerVersion:1}),unit=S.spawn(legacy,'humanspellbreaker',0,0,0);assert.equal(unit.spellStealAuto,undefined);assert.equal(S.spellStealOption(legacy,unit),null);assert.ok(S.restore(legacy));assert.equal(S.spellStealCaster(f.s,{...f.breaker,animateDead:1}),false);
}
{
 const f=spellstealFixture(S);f.recipient.polymorph={left:60,source:f.donor.id,team:1,frame:0,form:S.sanctumRules.abilities.Aply.forms.ground};f.s.units=f.s.units.filter(u=>u!==f.donor);const creep=S.spawn(f.s,'neutral',-1,1,0,{level:99,cd:99,order:{type:'hold'}});S.visibility(f.s);assert.equal(S.spellStealPlan(f.s,f.breaker,f.recipient.id),null);creep.level=5;assert.equal(order(f.s,f.breaker,f.recipient),null);step(f.s,4);assert.ok(creep.polymorph);assert.ok(S.restore(f.s));
}
{
 const f=spellstealFixture(S);f.recipient.sanctumSlow={left:60,source:f.donor.id,team:1,frame:0};f.s.units=f.s.units.filter(u=>u!==f.donor);const hero=S.spawn(f.s,'hero',1,1,0,{mana:100,cd:99,order:{type:'hold'}});S.visibility(f.s);assert.equal(order(f.s,f.breaker,f.recipient),null);step(f.s,4);assert.equal(hero.sanctumSlow.left,S.sanctumRules.abilities.Aslo.heroDuration);assert.ok(S.restore(f.s));const bad=copy(f.s);bad.units.find(u=>u.id===hero.id).sanctumSlow.stolen.left=61;assert.throws(()=>S.restore(bad),/Slow/);step(f.s,Math.ceil(S.sanctumRules.abilities.Aslo.heroDuration/S.DT));assert.equal(hero.sanctumSlow,undefined);assert.ok(S.restore(f.s));
}
{
 const f=spellstealFixture(S);f.donor.bloodlust=10;f.recipient.x=20;S.visibility(f.s);assert.ok(S.magicImmune(f.breaker));assert.equal(S.spellStealPlan(f.s,f.breaker,f.donor.id).receiver.id,f.breaker.id);assert.equal(order(f.s,f.breaker,f.donor),null);step(f.s,4);assert.ok(f.breaker.bloodlust>9);assert.ok(S.restore(f.s));
}
{
 const f=spellstealFixture(S);f.recipient.sanctumSlow={left:60,source:f.donor.id,team:1,frame:0};order(f.s,f.breaker,f.recipient);step(f.s,4);f.donor.x=25;f.donor.z=25;S.visibility(f.s);const observed=S.publicState(f.s,1).units.find(u=>u.id===f.donor.id);assert.ok(observed.sanctumSlow);assert.equal(observed.spellStealEffect,undefined);assert.ok(S.restore(f.s));
}
{
 const f=spellstealFixture(S);f.s.teams[1].shamanism=1;const shaman=S.spawn(f.s,'shaman',1,2,0,{mana:200,bloodlustAuto:false,cd:99,order:{type:'hold'}});S.visibility(f.s);assert.equal(S.command(f.s,1,{type:'casterSpell',ids:[shaman.id],spell:'lightningShield',target:f.donor.id}),null);assert.equal(f.donor.lightningSource.id,shaman.id);assert.equal(order(f.s,f.breaker,f.donor),null);step(f.s,4);assert.equal(f.recipient.lightningSource.id,shaman.id);assert.equal(f.recipient.lightningSource.team,0);f.donor.hp=1;const kills=f.s.teams[0].kills,gold=f.s.teams[0].gold;step(f.s,1);assert.equal(f.donor.hp,0);assert.equal(f.s.teams[0].kills,kills+1);assert.equal(f.s.teams[0].gold,gold,'player kills do not award melee bounty');assert.ok(S.restore(f.s));
}
console.log('PASS Spell Steal: actual Priest Inner Fire, 13 unit-cast buffs, positive/negative teams and source attribution, remaining duration, manual-only exceptions, autocast, interruption/no-recipient/mana/fog gates, strict cast clocks, legacy version 1 and private enemy state');
