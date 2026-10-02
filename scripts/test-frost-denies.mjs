// Author: MiYu. MOBA explicit denies, rewards, target revalidation and persistence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(heroClass=3,range=1,mode='moba'){
  const map=S.defaultMap(mode);map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create(mode,{map});s.units=[];s.nextWave=100000;
  const hero=S.spawn(s,'hero',0,0,0,{heroClass}),creep=S.spawn(s,'creep',0,0,range,{hp:20,damage:0,speed:0}),enemy=S.spawn(s,'hero',1,5,range,{damage:0,speed:0});enemy.order={type:'hold'};S.visibility(s);return {s,hero,creep,enemy};
}
const attack=({s,hero,creep})=>S.command(s,0,{type:'attack',ids:[hero.id],target:creep.id});
{
  const a=arena(),{s,hero,creep}=a;creep.hp=creep.maxHp*.5+.001;assert.ok(attack(a));assert.equal(hero.order,null);
  creep.hp=creep.maxHp*.5;assert.equal(attack(a),null,'exactly half health is deniable');assert.equal(hero.order.target,creep.id);
  assert.ok(S.command(s,0,{type:'attack',ids:[creep.id],target:creep.id}),'self attack is rejected');
  for(const kind of ['hero','soldier','tower']){const ally=S.spawn(s,kind,0,1,0,{hp:1});assert.ok(S.command(s,0,{type:'attack',ids:[hero.id],target:ally.id}),'only lane creeps are deniable');}
  creep.inside=123;assert.ok(attack(a));delete creep.inside;creep.hp=0;assert.ok(attack(a));
}
for(const mode of ['skirmish','td','rpg'])assert.ok(attack(arena(3,1,mode)),mode+' keeps friendly fire disabled');
{
  const a=arena(),{s,hero,creep,enemy}=a,gold=s.teams[0].gold;assert.equal(attack(a),null);S.tick(s);
  assert.equal(creep.hp,0);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].kills,0);assert.equal(hero.xp,0);assert.equal(enemy.xp,17.5);
  assert.equal(s.events.filter(e=>e.type==='deny').length,1);assert.ok(s.corpses.some(c=>c.id===creep.id),'denied units still leave corpses');
  assert.ok(S.publicState(s,1).events.some(e=>e.type==='deny'),'visible opponent receives deny feedback');s.visible[1].fill(0);assert.ok(!S.publicState(s,1).events.some(e=>e.type==='deny'),'deny feedback respects fog');
}
{
  const a=arena(),{s,creep,enemy}=a,second=S.spawn(s,'hero',1,6,1,{damage:0,speed:0}),far=S.spawn(s,'hero',1,25,25,{damage:0,speed:0}),dead=S.spawn(s,'hero',1,5,1,{hp:0});assert.equal(attack(a),null);S.tick(s);
  assert.equal(enemy.xp,8.75);assert.equal(second.xp,8.75);assert.equal(far.xp,0);assert.equal(dead.xp,0);assert.equal(creep.hp,0);
}
{
  const a=arena(),{s,hero,creep}=a;hero.order={type:'hold'};step(s,5);assert.equal(creep.hp,20,'automatic acquisition never attacks allies');
  hero.order={type:'attackMove',x:0,z:2};s.units=s.units.filter(u=>u.team===0);S.tick(s);assert.equal(creep.hp,20,'attack move does not auto-deny');
}
{
  const a=arena(),{s,hero,creep}=a;assert.equal(attack(a),null);creep.hp=creep.maxHp;S.tick(s);assert.equal(creep.hp,creep.maxHp);assert.equal(hero.order,null,'healed target cancels an existing deny order');
}
{
  const a=arena(2,8),{s,hero,creep,enemy}=a,gold=s.teams[0].gold;assert.equal(attack(a),null);S.tick(s);assert.equal(s.projectiles.length,1);assert.equal(creep.hp,20);hero.cd=99;
  const saved=S.clone(s),restored=S.restore(saved);step(s,5);step(restored,5);
  assert.equal(creep.hp,0);assert.equal(s.teams[0].gold,gold);assert.equal(hero.xp,0);assert.equal(enemy.xp,17.5);
  for(const key of ['units','teams','projectiles','events','corpses'])assert.deepEqual(restored[key],s[key],key+' resumes identically during a deny shot');
}
{
  const a=arena(2,8),{s,hero,creep,enemy}=a;assert.equal(attack(a),null);S.tick(s);hero.cd=99;creep.hp=creep.maxHp;step(s,5);
  assert.equal(creep.hp,creep.maxHp);assert.equal(s.projectiles.length,0);assert.equal(enemy.xp,0);assert.ok(!s.events.some(e=>e.type==='deny'),'healing also invalidates an in-flight deny');
}
{
  const a=arena(2,8),{s,hero,creep,enemy}=a;assert.equal(attack(a),null);S.tick(s);hero.hp=0;hero.respawn=0;step(s,5);assert.equal(creep.hp,0);assert.equal(s.teams[0].kills,0);assert.equal(enemy.xp,17.5,'dead shooter retains the correct deny settlement');
}
{
  const a=arena(2,8),{s,creep}=a;const vampire=S.spawn(s,'necromancer',0,0,0,{hp:50,damage:100,summoned:true,expires:10000});a.hero.damage=0;a.hero.order={type:'hold'};assert.equal(S.command(s,0,{type:'attack',ids:[vampire.id],target:creep.id}),null);S.tick(s);vampire.cd=99;step(s,5);assert.equal(vampire.hp,50,'deny attacks do not steal allied life');
}
{
  const a=arena(),{s,hero,creep}=a;creep.team=1;const ally=S.spawn(s,'hero',0,2,1,{damage:0,speed:0}),gold=s.teams[0].gold;S.visibility(s);assert.equal(attack(a),null);S.tick(s);
  assert.equal(s.teams[0].gold,gold+25);assert.equal(s.teams[0].kills,1);assert.equal(hero.xp,17.5);assert.equal(ally.xp,17.5,'normal MOBA kill experience is also shared');assert.ok(!s.events.some(e=>e.type==='deny'));
}
{
  const a=arena(1,1),{s,hero,creep}=a;hero.skills[0]=1;assert.equal(S.command(s,0,{type:'spell',ids:[hero.id],slot:0,x:creep.x,z:creep.z}),null);assert.equal(creep.hp,20,'area spells do not deny allies');
}
for(const kind of ['rifleman','shaman','catapult']){
  const {s,hero,creep}=arena(2,6),unit=S.spawn(s,kind,0,0,0,{damage:10,summoned:true,expires:10000});hero.damage=0;hero.order={type:'hold'};creep.hp=60;const ally=S.spawn(s,'creep',0,1,6,{hp:20,damage:0,speed:0});assert.equal(S.command(s,0,{type:'attack',ids:[unit.id],target:creep.id}),null);S.tick(s);unit.cd=99;step(s,6);
  assert.ok(creep.hp<60,kind+' can damage a deniable creep');assert.equal(creep.slow,0,'deny does not apply slow');assert.equal(ally.hp,20,'deny splash cannot damage nearby allies');if(kind==='rifleman')assert.equal(s.projectileSerial,0,'rifleman deny is immediate');
}
console.log('PASS: MOBA half-health eligibility, invalid allies/self, other modes, melee/ranged denies, shared reduced enemy XP, no gold/kill credit/lifesteal, explicit-only targeting, healing cancellation, fog, corpses and in-flight save/dead-shooter continuation');
