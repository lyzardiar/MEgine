// Author: MiYu. Symmetric lane waves, shared ownership and realistic creep presentation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},creeps=s=>s.units.filter(u=>S.types[u.kind].laneCreep);
function game(){return S.create('moba',{ai:[false,false],factions:[0,3]});}
for(const wave of [1,7]){
  const s=game();s.wave=wave-1;s.nextWave=1;S.tick(s);assert.equal(s.wave,wave);assert.equal(s.nextWave,301);
  const roster=creeps(s);assert.equal(roster.length,wave===7?30:24);
  for(let team=0;team<2;team++)for(let lane=0;lane<3;lane++)assert.deepEqual(roster.filter(u=>u.team===team&&u.lane===lane).map(u=>u.kind),['creep','creep','creep','rangedcreep',...(wave===7?['siegecreep']:[])]);
  for(const u of roster){assert.equal(u.maxHp,S.types[u.kind].hp);assert.equal(u.damage,S.types[u.kind].damage);assert.equal(u.speed,S.types[u.kind].speed);assert.ok(!S.solid(s,u.x,u.z));for(const v of roster)if(u.id!==v.id)assert.ok(S.distance(u,v)>1.25,'distinct spawn positions');}
  const before=roster.map(u=>[u.id,u.x,u.z]);const restored=S.restore(s);step(s,15);step(restored,15);assert.deepEqual(restored.units,s.units);assert.ok(before.every(([id,x,z])=>{const u=s.units.find(u=>u.id===id);return Math.hypot(u.x-x,u.z-z)>1;}),'all six lanes advance');
}
{
  const s=game();while(s.units.length<S.LIMIT-23)S.spawn(s,'creep',0,0,0);s.nextWave=1;const serial=s.serial;S.tick(s);assert.equal(s.wave,0);assert.equal(s.serial,serial);s.units.pop();S.tick(s);assert.equal(s.wave,1);assert.equal(s.serial,serial+24,'freeing space releases a complete balanced wave');
}
{
  const s=game();s.map.terrain.fill(1);s.nextWave=1;const serial=s.serial;S.tick(s);assert.equal(s.wave,0);assert.equal(s.serial,serial,'blocked entrances do not partially mutate the wave');
}
{
  const s=game();s.nextWave=1;S.tick(s);const hero=s.units.find(u=>u.team===0&&u.kind==='hero'),creep=creeps(s)[0],hall=s.units.find(u=>u.team===0&&u.kind==='hall');
  for(const type of ['move','attackMove','patrol','hold','stop','rally','train','tech','towerUpgrade']){const before=JSON.stringify(s);assert.match(S.command(s,0,{type,ids:[creep.id,hall.id],x:0,z:0,kind:'worker'}),/hero or summoned/);assert.equal(JSON.stringify(s),before);}
  assert.equal(S.command(s,0,{type:'hold',ids:[creep.id,hero.id]}),null);assert.equal(hero.order.type,'hold');assert.equal(creep.order,null);assert.deepEqual(S.trainable(s,hall),[]);
  const summon=S.spawn(s,'dragon',0,-16,18,{summoned:true,expires:10000});assert.equal(S.command(s,0,{type:'hold',ids:[summon.id]}),null);assert.ok(!S.canControl(s,1,summon));
  hall.rally={x:0,z:0};assert.deepEqual(S.restore(s).units.find(u=>u.id===hall.id).rally,hall.rally,'legacy rally saves remain readable');
  creep.order={type:'attackMove',x:0,z:0};step(s,1);assert.equal(creep.order.type,'attackMove','map-scripted orders are preserved');
}
for(const kind of ['rangedcreep','siegecreep']){
  const s=game();s.units=[];s.nextWave=10000;const hero=S.spawn(s,'hero',0,-4,0,{heroClass:2,damage:1000}),target=S.spawn(s,kind,0,0,0,{hp:20,damage:0,speed:0});S.visibility(s);assert.equal(S.command(s,0,{type:'attack',ids:[hero.id],target:target.id}),null);S.tick(s);const restored=S.restore(s);step(s,5);step(restored,5);assert.equal(target.hp,0);assert.equal(s.teams[0].kills,0);assert.deepEqual(restored.units,s.units);assert.equal(s.corpses.some(c=>c.id===target.id),kind==='rangedcreep');
  assert.equal(S.projectileArt({kind}),kind==='siegecreep'?'stone':'arrow');
  const battle=game();battle.units=[];battle.nextWave=10000;S.spawn(battle,kind,0,-4,0);const enemy=S.spawn(battle,'hero',1,2,0,{damage:0,speed:0,order:{type:'hold'}});S.visibility(battle);S.tick(battle);assert.equal(battle.projectiles.length,1);assert.equal(battle.projectiles[0].art,kind==='siegecreep'?'stone':'arrow');const flight=S.restore(battle);step(battle,8);step(flight,8);assert.ok(enemy.hp<enemy.maxHp);assert.deepEqual(flight.units,battle.units,'new lane projectiles resume identically');
}
for(const faction of [1,2,3]){
  const s=S.create('moba',{ai:[true,true],factions:[faction,0]});s.nextWave=10000;const u=S.spawn(s,'creep',0,-10,20);u.hp=50;u.order={type:'hold'};step(s,40);assert.equal(u.hp,50,'faction AI regeneration is disabled in MOBA');assert.equal(u.speed,S.types.creep.speed);
}
globalThis.Frost=S;globalThis.FrostArt=require('../samples/frostbound-realms/model-catalog.json');const V=require('../samples/frostbound-realms/game/visuals.js');
for(const [kind,key] of [['creep','RealFootman'],['rangedcreep','RealArcher'],['siegecreep','RealCatapult']])assert.equal(V.model(game(),{kind,team:0}).key,key);
{
  const s=game();let peak=s.units.length;for(let i=0;i<2200&&s.winner===null;i++){S.tick(s);peak=Math.max(peak,s.units.length);}assert.equal(s.wave,8);assert.ok(s.teams.every(t=>t.kills>0));assert.ok(s.units.some(u=>u.kind==='siegecreep'));assert.ok(peak<=S.LIMIT);
}
console.log('PASS: six complete balanced lanes, periodic siege, safe spawn spacing/movement, atomic capacity/blocked entrances, MOBA control ownership, legacy rally saves, summons, ranged/siege denies and realistic models');
