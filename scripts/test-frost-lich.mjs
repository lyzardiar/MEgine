// Author: MiYu. Authoritative source Lich spells, buffs, channel lifecycle and strict saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {lichFixture} from './frost-lich-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),L=require('../samples/frostbound-realms/game/lich.js');
const hold={cd:10000,order:{type:'hold'}},step=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,h,type,extra={})=>S.command(s,h.team,{type,ids:[h.id],...extra}),learn=(s,h,slot,rank=1)=>{for(let i=0;i<rank;i++)assert.equal(cmd(s,h,'learn',{slot}),null);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,h}=lichFixture(S);assert.equal(h.sourceHero,'Ulic');assert.equal(h.maxHp,475);assert.equal(h.mana,100);assert.equal(S.maxMana(h),300);assert.equal(S.projectileSpeed(h),9);near(S.unitHeight(s,h),.3);assert.ok(S.restore(s));
 assert.throws(()=>S.create('skirmish',{lichVersion:2}),/Lich/);const bad=S.clone(s);bad.units[0].intelligence++;assert.throws(()=>S.restore(bad),/Lich/);bad.units[0].intelligence--;bad.lichVersion=0;assert.throws(()=>S.restore(bad),/Lich/);
 const old=S.create('skirmish',{map:s.map,factions:[3,0],lichVersion:0});S.spawn(old,'hero',0,0,0,{heroClass:1});delete old.lichVersion;assert.equal(S.restore(old).lichVersion,0);
}
console.log('PASS Lich source recruitment, stats, hover, missile speed, version gate and forged identity rejection');
for(const rank of [1,2,3]){
 const {s,h}=lichFixture(S,5);learn(s,h,0,rank);h.mana=S.maxMana(h);const target=S.spawn(s,'soldier',1,4,0,hold),adjacent=S.spawn(s,'soldier',1,5,1,hold),ally=S.spawn(s,'ghoul',0,5,-1,hold),far=S.spawn(s,'soldier',1,8,0,hold),hero=S.spawn(s,'hero',1,4,-1,{...hold,heroClass:0});S.visibility(s);const hp=[target,adjacent,ally,far,hero].map(v=>v.hp);
 assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);const saved=S.restore(s);step(s,3);assert.equal(target.hp,hp[0]);step(s);step(saved,4);assert.deepEqual(saved,s);near(target.hp,hp[0]-100-50*rank);near(adjacent.hp,hp[1]-50*rank);assert.equal(s.events.find(e=>e.type==='damage'&&e.x===hero.x&&e.z===hero.z).amount,50*rank*.7);assert.equal(ally.hp,hp[2]);assert.equal(far.hp,hp[3]);near(target.lichFrost.left,2+2*rank);near(hero.lichFrost.left,1+rank);near(S.moveRate(target),.5);near(S.attackRate(target),.75);assert.ok(S.restore(s));
 const pub=S.publicState(s,1),p=pub.units.find(v=>v.id===target.id);assert.equal(p.lichFrost,undefined);near(p.lichFrostLeft,target.lichFrost.left);assert.equal(pub.units.find(v=>v.id===h.id).lichCast,undefined);
}
console.log('PASS ranked Nova primary/area/hero damage, alliance, cast point, frost duration, movement/attack and private sources');
{
 const {s,h}=lichFixture(S,5);learn(s,h,1,3);h.mana=S.maxMana(h);const ally=S.spawn(s,'ghoul',0,2,0,hold),melee=S.spawn(s,'soldier',1,3,0,hold),ranged=S.spawn(s,'rifleman',1,5,0,hold);S.visibility(s);const base=S.armorValue(ally,s);assert.equal(cmd(s,h,'spell',{slot:1,target:ally.id}),null);step(s,4);near(S.armorValue(ally,s),base+7);near(ally.frostArmor.left,45);const hp=ally.hp,expected=S.weaponDamage(melee,ally,melee.damage,s);S.fire(s,melee,ally);near(ally.hp,hp-expected);assert.equal(melee.lichFrost.origin,'armor');near(melee.lichFrost.left,5);S.fire(s,ranged,ally);assert.equal(ranged.lichFrost,undefined);assert.ok(S.restore(s));
 const pub=S.publicState(s,1).units.find(v=>v.id===ally.id);assert.equal(pub.frostArmor,undefined);near(S.armorValue(pub),S.armorValue(ally,s));
 const bad=S.clone(s);bad.units.find(v=>v.id===ally.id).frostArmor.bonus++;assert.throws(()=>S.restore(bad),/Lich buff/);step(s,450);assert.equal(ally.frostArmor,undefined);assert.equal(melee.lichFrost,undefined);near(S.armorValue(ally,s),base);
}
console.log('PASS Armor mitigation, source bonus, melee-only chill, separate clocks, public projection and expiry');
{
 const {s,h}=lichFixture(S,3);learn(s,h,1);h.mana=S.maxMana(h);const ally=S.spawn(s,'ghoul',0,2,0,{...hold,hp:100}),enemy=S.spawn(s,'soldier',1,3,0,hold);S.visibility(s);assert.equal(cmd(s,h,'frostArmorAuto',{enabled:true}),null);step(s,14);assert.ok(ally.frostArmor);assert.equal(ally.frostArmor.bonus,3);assert.equal(cmd(s,h,'frostArmorAuto',{enabled:false}),null);assert.ok(S.restore(s));
 const enemyDryad=S.spawn(s,'dryad',1,4,0,{...hold,mana:200});s.teams[1].abolishMagic=1;S.visibility(s);assert.equal(S.abolishTarget(s,enemyDryad,ally.id),ally);assert.equal(S.command(s,1,{type:'abolish',ids:[enemyDryad.id],target:ally.id}),null);step(s,10);assert.equal(ally.frostArmor,undefined);
}
console.log('PASS Frost Armor autocast and enemy Dryad dispel eligibility/removal');
for(const rank of [1,2,3]){
 const {s,h}=lichFixture(S,5);learn(s,h,2,rank);h.mana=30;const sacrifice=S.spawn(s,'ghoul',0,2,0,{...hold,hp:100,shield:200,shieldLeft:20}),enemy=S.spawn(s,'ghoul',1,3,0,hold);S.visibility(s);assert.match(cmd(s,h,'spell',{slot:2,target:enemy.id}),/valid/);assert.equal(cmd(s,h,'spell',{slot:2,target:sacrifice.id}),null);const mana=h.mana,gold=s.teams[0].gold,kills=s.teams[0].kills;step(s,4);assert.ok(sacrifice.hp<=0);near(h.mana,mana+4*S.DT*L.manaRegen(h)-25+100*[.33,.66,1][rank-1]);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].kills,kills);assert.equal(h.spell[2],15);assert.ok(S.restore(s));
}
console.log('PASS Ritual payment, ranked current-life mana conversion, shields, eligibility and no sacrifice rewards');
{
 const {s,h}=lichFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);const enemy=S.spawn(s,'soldier',1,4,0,hold),ally=S.spawn(s,'ghoul',0,5,0,hold),building=S.spawn(s,'hall',1,5,1),immune=S.spawn(s,'dryad',1,3,1,hold);s.resources.push({kind:'tree',x:4,z:1,amount:100,hp:50});S.visibility(s);const hp=[enemy,ally,building,immune].map(v=>v.hp);assert.equal(cmd(s,h,'spell',{slot:3,x:4,z:0}),null);step(s,4);assert.equal(h.deathDecay.left,35);const saved=S.restore(s);step(s,10);step(saved,10);assert.deepEqual(saved,s);for(const [i,v] of [enemy,ally,building,immune].entries())near(v.hp,hp[i]-v.maxHp*.04);assert.equal(s.resources.at(-1).amount,0);near(h.deathDecay.left,34);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.deathDecay,undefined);const after=enemy.hp;step(s,10);assert.equal(enemy.hp,after);
}
console.log('PASS Decay allied/enemy/building/magic-immune percent damage, tree felling, saved channel and accepted stop interruption');
{
 const {s,h}=lichFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3,x:4,z:0}),null);assert.match(cmd(s,h,'move',{x:100,z:0}),/map|point|outside|destination/i);assert.ok(h.lichCast);assert.equal(cmd(s,h,'hold'),null);assert.equal(h.lichCast,undefined);h.mana=S.maxMana(h);assert.equal(cmd(s,h,'spell',{slot:3,x:4,z:0}),null);step(s,4);const bad=S.clone(s);bad.units[0].deathDecay.left--;assert.throws(()=>S.restore(bad),/Decay/);h.stun=1;step(s);assert.equal(h.deathDecay,undefined);assert.ok(S.restore(s));
}
console.log('PASS rejected-order retention, accepted-order and stun interruption, channel clock forgery');
for(const type of [null,'attack','attackMove','move']){
 const {s,h}=lichFixture(S,3);learn(s,h,1);h.mana=S.maxMana(h);const ally=S.spawn(s,'ghoul',0,2,0,{...hold,hp:100}),enemy=S.spawn(s,'soldier',1,3,0,hold);S.visibility(s);if(type)assert.equal(cmd(s,h,type,type==='attack'?{target:enemy.id}:{x:6,z:0}),null);else h.order=null;assert.equal(cmd(s,h,'frostArmorAuto',{enabled:true}),null);s.frame=9;step(s);assert.equal(h.lichCast.auto,true);const route=S.clone({order:h.order,path:h.path,waypoints:h.waypoints,dest:h.dest}),saved=S.restore(s);assert.equal(cmd(s,h,'frostArmorAuto',{enabled:false}),null);assert.ok(S.restore(s));step(s,4);step(saved,4);assert.ok(ally.frostArmor);assert.ok(saved.units.find(v=>v.id===ally.id).frostArmor);assert.deepEqual(S.clone({order:h.order,path:h.path,waypoints:h.waypoints,dest:h.dest}),route);if(type==='move'){const x=h.x;step(s,5);assert.notEqual(h.x,x);}assert.ok(S.restore(s));
}
console.log('PASS idle/attack/attack-move/move autocast, pending save, toggle-off and route continuation');
{
 const {s,h}=lichFixture(S,3);learn(s,h,1);h.mana=S.maxMana(h);h.order=null;const ally=S.spawn(s,'ghoul',0,2,0,{...hold,hp:100});S.spawn(s,'soldier',1,3,0,hold);S.visibility(s);cmd(s,h,'frostArmorAuto',{enabled:true});s.frame=9;step(s);assert.ok(h.lichCast);assert.equal(cmd(s,h,'stop'),null);assert.equal(h.lichCast,undefined);step(s,4);assert.equal(ally.frostArmor,undefined);assert.ok(S.restore(s));
}
console.log('PASS Stop interrupts an idle automatic Armor cast even when the order remains null');
{
 const {s,h}=lichFixture(S,6);s.teams[1].faction=1;learn(s,h,0);h.mana=S.maxMana(h);const target=S.spawn(s,'soldier',1,4,0,hold),hidden=S.spawn(s,'hero',1,4,1,{...hold,heroClass:0,level:6,skillPoints:6});learn(s,hidden,0);hidden.mana=S.maxMana(hidden);S.visibility(s);assert.equal(cmd(s,hidden,'spell',{slot:0}),null);step(s,9);assert.equal(S.isHidden(s,hidden),true);assert.equal(S.isVisible(s,0,hidden),false);assert.match(cmd(s,h,'spell',{slot:0,target:hidden.id}),/valid/);const hp=hidden.hp;assert.equal(cmd(s,h,'spell',{slot:0,target:target.id}),null);step(s,4);assert.equal(s.events.find(e=>e.type==='damage'&&e.x===hidden.x&&e.z===hidden.z).amount,35);assert.ok(hidden.hp<hp);assert.ok(hidden.lichFrost);assert.ok(S.restore(s));
}
console.log('PASS hidden enemies receive Nova area damage but cannot be chosen as the primary target');
{
 const {s,h}=lichFixture(S,6);learn(s,h,0);h.mana=S.maxMana(h);const mountain=S.spawn(s,'hero',1,4,0,{...hold,heroClass:1,level:6,skillPoints:6});learn(s,mountain,3);mountain.mana=S.maxMana(mountain);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:0,target:mountain.id}),null);step(s,4);assert.ok(mountain.lichFrost);assert.equal(cmd(s,mountain,'spell',{slot:3}),null);step(s,4);assert.equal(S.magicImmune(mountain),true);assert.equal(mountain.lichFrost,undefined);near(S.moveRate(mountain),1);assert.ok(S.restore(s));
 const {s:t,h:l}=lichFixture(S,6);t.teams[1].faction=1;learn(t,l,0);l.mana=S.maxMana(l);const tauren=S.spawn(t,'hero',1,4,0,{...hold,heroClass:2,level:6,skillPoints:6});learn(t,tauren,3);S.visibility(t);assert.equal(cmd(t,l,'spell',{slot:0,target:tauren.id}),null);step(t,4);assert.ok(tauren.lichFrost);tauren.hp=1;S.fire(t,l,tauren);step(t,10);assert.ok(tauren.reincarnation);assert.equal(tauren.lichFrost,undefined);const saved=S.restore(t);step(t,70);step(saved,70);assert.deepEqual(saved,t);assert.ok(tauren.hp>0);
}
console.log('PASS Avatar frost cleansing and chilled Tauren reincarnation save/replay');
{
 const {s,h}=lichFixture(S,6);learn(s,h,3);h.mana=S.maxMana(h);h.x=1.9;S.spawn(s,'soldier',1,14.8,0,hold);S.visibility(s);assert.equal(cmd(s,h,'spell',{slot:3,x:11.9,z:0}),null);step(s,5);const enemy=S.publicState(s,1);assert.equal(enemy.units.some(v=>v.id===h.id),false);assert.equal(enemy.deathDecays.length,1);assert.deepEqual(Object.keys(enemy.deathDecays[0]).sort(),['frame','left','x','z']);assert.equal(enemy.deathDecays[0].x,11.9);assert.equal(enemy.deathDecays[0].source,undefined);assert.throws(()=>S.restore({...S.clone(s),deathDecays:enemy.deathDecays}),/Lich public areas/);s.visible[1].fill(0);assert.equal(S.publicState(s,1).deathDecays.length,0);
}
console.log('PASS visible Decay areas project without hidden caster identity and disappear outside vision');
