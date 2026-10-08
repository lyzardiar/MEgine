// Author: MiYu. Source Warden skills, bounded missiles, summon ownership and exact saved continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {wardenFixture} from './frost-warden-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function continuation(s,n){const restored=S.restore(s);step(s,n);step(restored,n);assert.deepEqual(restored,s);}
function learned(level=6,skills=[1,1,1,1],factions){const {s,h}=wardenFixture(S,level,factions);h.skills=skills;h.skillPoints=level-skills.reduce((a,b)=>a+b);h.mana=S.maxMana(h);return {s,h};}
function corpse(s,x=2,z=0,team=0){const u=S.spawn(s,'soldier',team,x,z,{damage:0,order:{type:'hold'}}),killer=S.spawn(s,'soldier',1-team,20,20,{damage:100000,order:{type:'hold'}});S.fire(s,killer,u);killer.cd=10000;assert.ok(s.corpses.some(c=>c.id===u.id));return u.id;}
function avatarFixture(){const {s,h}=learned();assert.equal(cmd(s,h,'spell',{slot:3}),null);continuation(s,5);const a=s.units.find(S.vengeanceAvatar);assert.ok(a);assert.ok(S.distance(h,a)>S.wardenRules.units.Ewar.collision+S.wardenRules.units.espv.collision);a.vengeanceAuto=false;return {s,h,a};}
{
 const {s,h}=wardenFixture(S);assert.equal(h.sourceHero,'Ewar');assert.equal(h.maxHp,550);assert.equal(h.damage,32);assert.equal(S.maxMana(h),225);near(S.armorValue(h),4);assert.match(cmd(s,h,'learn',{slot:3}),/level 6/);assert.equal(cmd(s,h,'learn',{slot:0}),null);assert.ok(S.restore(s));
 for(const patch of [{sourceHero:'Emoo'},{maxHp:551},{mana:226},{wardenCast:{slot:0,rank:4,left:.1,x:3,z:0}},{wardenSpellSlot:1}])assert.throws(()=>S.restore({...s,units:[{...h,...patch}]}));
 const old=S.create('skirmish',{factions:[2,0],ai:[false,false]});old.wardenVersion=0;const legacy=S.spawn(old,'hero',0,0,0,{heroClass:3});delete old.wardenVersion;assert.equal(S.restore(old).wardenVersion,0);assert.equal(legacy.sourceHero,undefined);assert.equal(S.create('moba',{heroes:[3,3]}).units.find(u=>u.kind==='hero').sourceHero,undefined);
}
console.log('PASS Warden identity: source AGI stats, learning, strict hero fields and legacy/MOBA isolation');
for(const rank of [1,2,3]){
 const {s,h}=learned(6,[rank,0,0,0]),r=S.wardenRules.abilities.AEbl.levels[rank-1];assert.equal(cmd(s,h,'spell',{slot:0,x:25,z:0}),null);continuation(s,3);assert.equal(h.x,0);continuation(s,1);near(h.x,r.power/100);assert.equal(h.z,0);near(h.spell[0],r.cooldown);assert.ok(h.mana<=S.maxMana(h)-r.cost+1);assert.ok(S.restore(s));
 h.spell[0]=0;h.mana=S.maxMana(h);const start=h.x;assert.equal(cmd(s,h,'spell',{slot:0,x:start+.1,z:0}),null);continuation(s,4);near(h.x,start+2);h.spell[0]=0;const snap=S.clone(s);assert.ok(cmd(s,h,'spell',{slot:0,x:NaN,z:0}));assert.deepEqual(s,snap);
}
console.log('PASS Blink: source rank distances/minimum, delayed atomic payment, invalid targets and exact save continuation');
{
 const {s,h}=learned();for(let x=6;x<=12;x++)for(let z=-4;z<=4;z++)s.map.heights[S.index(x,z)]=2;assert.equal(S.traversable(s.map,0,0,8,0),false);assert.equal(cmd(s,h,'spell',{slot:0,x:8,z:0}),null);continuation(s,4);assert.ok(S.unitHeight(s,h)>3,'Blink crosses the cliff without a ground route');h.spell[0]=0;h.mana=S.maxMana(h);s.map.terrain.fill(1);const snap=S.clone(s);assert.ok(cmd(s,h,'spell',{slot:0,x:20,z:0}));assert.deepEqual(s,snap,'no water landing and no payment');s.map.terrain.fill(0);h.spell[0]=0;assert.equal(cmd(s,h,'spell',{slot:0,x:20,z:0}),null);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.wardenCast,undefined);assert.ok(S.restore(s));
}
console.log('PASS Blink terrain and interruption: real cliff landing, dry/collision checks and immediate Stop cancellation');
for(const rank of [1,2,3]){
 const {s,h}=learned(6,[0,rank,0,0]),r=S.wardenRules.abilities.AEfk.levels[rank-1],targets=Array.from({length:8},(_,i)=>S.spawn(s,'soldier',1,2*Math.cos(i*Math.PI/4),2*Math.sin(i*Math.PI/4),{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}})),fly=S.spawn(s,'dragon',1,0,2,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}}),immune=S.spawn(s,'dryad',1,1,1),building=S.spawn(s,'farm',1,1,-1),ally=S.spawn(s,'soldier',0,-1,-1,{damage:0,order:{type:'hold'}});immune.cd=10000;S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:1}),null);continuation(s,5);assert.equal(s.projectiles.filter(p=>p.wardenSpellSlot===1).length,9);near(s.projectiles.reduce((n,p)=>n+p.damage,0),r.interval);const bad=S.clone(s);bad.projectiles[0].damage=r.power+1;assert.throws(()=>S.restore(bad));continuation(s,15);near([...targets,fly].reduce((n,u)=>n+10000-u.hp,0),r.interval);assert.equal(immune.hp,immune.maxHp);assert.equal(building.hp,building.maxHp);assert.equal(ally.hp,ally.maxHp);
}
console.log('PASS Fan of Knives: all source ranks, aggregate damage cap, real missiles, air targets, immunity/building/ally exclusion and forged saves');
for(const rank of [1,2,3]){
 const {s,h}=learned(6,[0,0,rank,0]),r=S.wardenRules.abilities.AEsh.levels[rank-1],v=S.spawn(s,'dragon',1,2,0,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}});S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:2,target:v.id}),null);continuation(s,5);assert.equal(v.hp,10000);assert.ok(s.projectiles.some(p=>p.art==='warden-shadow'));continuation(s,5);assert.ok(v.shadowStrike);near(v.hp,10000-Number(r.data.E));near(S.shadowStrikeSlow(v),.5);continuation(s,1);assert.ok(S.shadowStrikeSlow(v)>.5&&S.shadowStrikeSlow(v)<.55);const hitFrame=v.shadowStrike.frame;const elapsed=s.frame-hitFrame;continuation(s,30-elapsed-1);near(v.hp,10000-Number(r.data.E));continuation(s,1);near(v.hp,10000-Number(r.data.E)-r.power);continuation(s,121);assert.equal(v.shadowStrike,undefined);near(v.hp,10000-Number(r.data.E)-r.power*5);assert.equal(S.shadowStrikeSlow(v),1);
}
console.log('PASS Shadow Strike: homing air missile, source initial damage, five three-second pulses, slowing decay and saved continuation');
{
 const {s,h}=learned(6,[0,0,1,0],[2,2]),v=S.spawn(s,'soldier',1,2,0,{hp:10000,maxHp:10000,damage:0,cd:10000,order:{type:'hold'}}),d=S.spawn(s,'dryad',1,3,0,{cd:10000,abolishAuto:false,order:{type:'hold'}});s.teams[1].abolishMagic=1;d.mana=150;S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:2,target:v.id}),null);continuation(s,10);assert.ok(v.shadowStrike);assert.equal(S.abolishTarget(s,d,v.id),v);assert.equal(cmd(s,d,'abolish',{target:v.id}),null);continuation(s,3);assert.equal(v.shadowStrike,undefined);near(S.shadowStrikeSlow(v),1);const hp=v.hp;continuation(s,40);near(v.hp,hp);assert.ok(S.restore(s));
}
console.log('PASS Shadow-only friendly dispel: researched Dryad selects the debuff, clears slowing and prevents future poison pulses');
{
 const {s,h,a}=avatarFixture();assert.equal(a.hp,1200);assert.equal(a.mana,400);assert.equal(S.unitType(a).magicImmune,true);assert.equal(a.expires-a.vengeanceBornFrame,1800);const body=corpse(s);S.visibility(s);assert.equal(cmd(s,a,'vengeance',{corpse:body}),null);continuation(s,2);assert.ok(s.corpses.some(c=>c.id===body));continuation(s,1);assert.ok(!s.corpses.some(c=>c.id===body));const spirit=s.units.find(S.vengeanceSpirit);assert.ok(spirit);assert.equal(spirit.hp,500);assert.equal(spirit.expires-spirit.vengeanceBornFrame,500);assert.equal(S.vengeanceCount(s,a),1);assert.equal(S.canAttack(s.units.find(u=>u.kind==='soldier'&&u.team===1),spirit),false);assert.ok(S.restore(s));
 const bad=S.clone(s);bad.units.find(S.vengeanceSpirit).summoner=h.id;assert.throws(()=>S.restore(bad));const killed=S.clone(s),killer=S.spawn(killed,'soldier',1,20,20,{damage:100000});S.fire(killed,killer,killed.units.find(S.vengeanceAvatar));assert.equal(killed.units.find(S.vengeanceAvatar).hp,0);assert.equal(killed.units.find(S.vengeanceSpirit).hp,0);assert.ok(S.restore(killed));continuation(s,spirit.expires-s.frame);assert.equal(spirit.hp,0);assert.ok(S.restore(s));
}
console.log('PASS Vengeance source summons: paid deferred allied corpse consumption, source stats, invulnerable child, strict owner, fifty-second expiration and parent-death cleanup');
{
 const {s,a}=avatarFixture();for(let i=0;i<7;i++)corpse(s,2+(i%3)*.4,-1+Math.floor(i/3)*.4);corpse(s,3,3,1);S.visibility(s);assert.equal(cmd(s,a,'vengeanceAuto',{enabled:true}),null);continuation(s,160);assert.equal(S.vengeanceCount(s,a),6);assert.equal(s.corpses.filter(c=>c.team===0).length,1);assert.ok(s.corpses.some(c=>c.team===1),'enemy corpse remains');assert.ok(cmd(s,a,'vengeance'));const snap=S.clone(s);assert.ok(cmd(s,a,'vengeanceAuto',{enabled:'yes'}));assert.deepEqual(s,snap);const copy=S.clone(s),extra={...copy.units.find(S.vengeanceSpirit),id:++copy.serial};copy.units.push(extra);assert.throws(()=>S.restore(copy));
}
console.log('PASS Vengeance autocast: six-child cap, saved exact continuation, allied corpse eligibility, enemy exclusion and malformed controls');
{
 const {s,h,a}=avatarFixture();h.x=-24;h.z=-24;s.map.startingHour=0;S.visibility(s);assert.equal(S.isNight(s),true);assert.equal(s.visible[0][S.index(10,0)],1);assert.equal(s.visible[0][S.index(12,0)],0);const enemy=S.spawn(s,'soldier',1,1,0,{damage:0,order:{type:'hold'}});S.visibility(s);const hostile=S.publicState(s,1).units.find(u=>u.id===a.id);assert.ok(hostile);assert.equal(hostile.vengeanceAuto,undefined);assert.equal(hostile.vengeanceCd,undefined);assert.equal(S.publicState(s,0).units.find(u=>u.id===a.id).vengeanceAuto,false);h.x=0;h.z=0;assert.equal(cmd(s,h,'spell',{slot:0,x:8,z:0}),null);assert.ok(h.wardenCast);assert.equal(S.publicState(s,1).units.find(u=>u.id===h.id).wardenCast,undefined);assert.ok(S.publicState(s,0).units.find(u=>u.id===h.id).wardenCast);assert.ok(S.restore(s));assert.ok(enemy.hp>0);
}
console.log('PASS Vengeance source night vision and public-state privacy: original sight radius, owned controls and hidden enemy cast/autocast decisions');
{
 const {s,h}=wardenFixture(S,6);S.setAI(s,0,true);step(s,40);assert.deepEqual(h.skills,[1,3,1,1]);const v=S.spawn(s,'soldier',1,2,0,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}});S.spawn(s,'soldier',1,2,2,{hp:10000,maxHp:10000,damage:0,order:{type:'hold'}});h.mana=S.maxMana(h);S.visibility(s);step(s,40);assert.ok(h.wardenCast||s.units.some(S.vengeanceAvatar));assert.ok(S.restore(s));assert.ok(v.hp<=10000);
}
console.log('PASS Warden AI: original ten-level skill order and legal source ultimate decisions');

{
 const {s,a}=avatarFixture();a.cd=0;const spirit=S.spawn(s,'vengeancespirit',0,0,2,{summoner:a.id,summoned:true,vengeanceBornFrame:s.frame,expires:s.frame+500,cd:0,order:{type:'hold'}});const enemy=S.spawn(s,'soldier',1,2,0,{hp:10000,maxHp:10000,damage:0,cd:10000,order:{type:'hold'}});S.visibility(s);step(s,1);assert.ok(a.weaponWindup);assert.ok(spirit.weaponWindup);continuation(s,8);assert.ok(enemy.hp<10000);assert.ok(S.restore(s));
}
console.log('PASS both Vengeance source attack windups, deterministic damage and exact saved continuation');

{
 const {s,a}=avatarFixture();const spirit=S.spawn(s,'vengeancespirit',0,3,0,{summoner:a.id,summoned:true,vengeanceBornFrame:a.expires-1,expires:a.expires-1+500,order:{type:'hold'}});s.frame=a.expires-1;S.tick(s);assert.equal(a.hp,0);assert.equal(spirit.hp,0);assert.ok(S.restore(s));
}
console.log('PASS Avatar lifetime expiration immediately removes its living children and preserves valid saves');

{
 const {s,a}=avatarFixture();S.spawn(s,'soldier',1,a.x+2,a.z,{cd:10000,order:{type:'hold'}});const spirit=S.spawn(s,'vengeancespirit',0,25,0,{summoner:a.id,summoned:true,vengeanceBornFrame:s.frame,expires:s.frame+500,order:{type:'hold'}});S.visibility(s);const view=S.publicState(s,1);assert.ok(!view.units.some(u=>u.id===spirit.id));assert.equal(view.units.find(u=>u.id===a.id).vengeanceSpirits,1);const forged=S.clone(s);forged.units.find(u=>u.id===a.id).vengeanceSpirits=6;assert.throws(()=>S.restore(forged));assert.ok(S.restore(s));
}
console.log('PASS public Avatar orb count includes hidden children without exposing their units or accepting forged save fields');
