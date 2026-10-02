// Author: MiYu. Hero learning, distinct effects, status expiry, migration and map validation.
import assert from 'node:assert/strict';
import {battleFixture} from './frost-battle-fixture.mjs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(heroClass,slot){const s=battleFixture(S,'skirmish',{heroes:[heroClass,0],ai:[false,false]},['hero','barracks','farm','guard','harvest']),h=s.units.find(u=>u.kind==='hero'&&u.team===0);s.units=[h];s.map.terrain.fill(0);s.map.heights.fill(0);s.map.ramps.fill(0);h.x=0;h.z=0;h.level=6;h.skillPoints=6;S.visibility(s);assert.equal(S.command(s,0,{type:'learn',ids:[h.id],slot}),null);return {s,h,cast:(x=4,z=0)=>S.command(s,0,{type:'spell',ids:[h.id],slot,x,z})};}
const placedMap=S.defaultMap();placedMap.players.forEach(p=>p.ai=false);placedMap.units=[{kind:'soldier',team:0,x:-10,z:10}];const placed=battleFixture(S,'skirmish',{map:placedMap},['hero','barracks','farm','guard','harvest']),placedUnit=placed.units.at(-1);S.command(placed,0,{type:'move',ids:[placedUnit.id],x:-4,z:15});step(placed,100);assert.ok(placedUnit.x>-8&&placedUnit.z>14,'authored player units hold their commanded destination');
const heroMap=S.defaultMap();heroMap.units=[{kind:'hero',team:0,x:0,z:0,heroClass:2}];assert.equal(battleFixture(S,'skirmish',{map:heroMap},['hero','barracks','farm','guard','harvest']).units.at(-1).heroClass,2);assert.throws(()=>S.validateMap({...heroMap,units:[{kind:'hero',team:0,x:0,z:0,heroClass:99}]}));
assert.equal(new Set(S.heroes.map(h=>h.art)).size,4);assert.equal(S.heroes.flatMap(h=>h.spells).length,16);
for(let heroClass=0;heroClass<4;heroClass++){
  const {s,h,cast}=arena(heroClass,0);assert.equal(h.castYaw,undefined);assert.equal(cast(3,4),null);assert.equal(h.castYaw,Math.atan2(3,4));assert.equal(S.restore(s).units[0].castYaw,h.castYaw);s.visible[1].fill(1);assert.equal(S.publicState(s,1).units.find(u=>u.id===h.id).castYaw,h.castYaw);assert.ok(cast(-4,0));assert.equal(h.castYaw,Math.atan2(3,4),'failed cast preserves active cast direction');
  for(const invalid of [NaN,Infinity,-Infinity,Math.PI+.01,'0',null])assert.throws(()=>S.restore({...s,units:[{...h,castYaw:invalid}]}),/cast direction/);
  const old=S.clone(s);delete old.units[0].castYaw;assert.equal(S.restore(old).units[0].castYaw,undefined,'older saves have no forced cast direction');h.spell[0]=0;assert.equal(cast(0,0),null);assert.equal(h.castYaw,undefined,'self-targeting does not reuse an old aim');
}
assert.throws(()=>S.create('moba',{heroes:['constructor',0]}));assert.throws(()=>S.validateMap({...S.defaultMap(),players:[{faction:0,ai:false,heroClass:99},{faction:1,ai:true}]}));
for(let heroClass=0;heroClass<4;heroClass++){
  const s=S.create('moba',{heroes:[heroClass,0],ai:[false,false]}),h=s.units.find(u=>u.kind==='hero'&&u.team===0),def=S.heroes[heroClass];
  assert.equal(h.maxHp,def.hp);assert.equal(h.damage,def.damage);assert.equal(S.unitType(h).range,def.range);assert.equal(h.skillPoints,1);
  assert.match(S.command(s,0,{type:'spell',ids:[h.id],slot:0,x:h.x,z:h.z}),/Learn/);assert.ok(S.command(s,1,{type:'learn',ids:[h.id],slot:0}));assert.match(S.command(s,0,{type:'learn',ids:[h.id],slot:3}),/level 6/);
  assert.equal(S.command(s,0,{type:'learn',ids:[h.id],slot:0}),null);assert.equal(h.skillPoints,0);assert.ok(S.command(s,0,{type:'learn',ids:[h.id],slot:0}));
  const restored=S.restore(s).units.find(u=>u.id===h.id);assert.equal(restored.heroClass,heroClass);assert.deepEqual(restored.skills,[1,0,0,0]);
  assert.throws(()=>S.restore({...s,units:s.units.map(u=>u.id===h.id?{...u,skills:[99,0,0,0]}:u)}));assert.throws(()=>S.restore({...s,units:s.units.map(u=>u.id===h.id?{...u,skills:[0,0,0,1],skillPoints:0}:u)}));assert.throws(()=>S.restore({...s,units:s.units.map(u=>u.id===h.id?{...u,level:2,skills:[2,0,0,0],skillPoints:0}:u)}));
}
{
  const {s,h,cast}=arena(0,0),target=S.spawn(s,'soldier',1,4,0),hp=target.hp;assert.equal(cast(),null);assert.ok(target.hp<hp);assert.equal(target.slow,3);assert.ok(cast());
  const old=S.clone(s);for(const u of old.units)if(u.kind==='hero'){delete u.heroClass;delete u.skills;delete u.skillPoints;}const migrated=S.restore(old).units[0];assert.equal(migrated.heroClass,0);assert.equal(migrated.skillPoints,5);
}
for(const heroClass of [0,3]){const {s,h,cast}=arena(heroClass,1),ally=S.spawn(s,'soldier',0,4,0);ally.hp=20;assert.equal(cast(),null);assert.ok(ally.hp>200);assert.equal(h.hp,h.maxHp);}
{
  const {s,h,cast}=arena(0,2);s.map.terrain[S.index(4,0)]=1;assert.ok(cast());assert.equal(h.mana,150);s.map.terrain[S.index(4,0)]=0;assert.equal(cast(),null);assert.equal(h.x,4);
}
for(const [heroClass,slot] of [[0,3],[1,2],[2,3]]){
  const {s,cast}=arena(heroClass,slot),target=S.spawn(s,'hall',1,4,0);assert.equal(cast(),null);const hp=target.hp;assert.equal(s.events.filter(e=>e.type==='spell').length,0);S.tick(s);assert.equal(s.events.filter(e=>e.type==='spell').length,1);assert.ok(target.hp<hp);const restored=S.restore(s);assert.equal(restored.zones.length,1);step(restored,60);assert.equal(restored.zones.length,0);assert.ok(restored.units.find(u=>u.id===target.id).hp<hp-100);
  const hidden=S.publicState(s,1);s.visible[1].fill(0);assert.equal(S.publicState(s,1).zones.length,0);assert.ok(hidden);
}
{
  const {s,h,cast}=arena(1,1),ally=S.spawn(s,'soldier',0,4,0),enemy=S.spawn(s,'archer',1,5,0);assert.equal(cast(),null);const hp=ally.hp;S.visibility(s);S.command(s,1,{type:'attack',ids:[enemy.id],target:ally.id});step(s,2);assert.equal(ally.hp,hp);assert.ok(ally.shield>0&&ally.shield<150);s.units=s.units.filter(u=>u.id!==enemy.id);step(s,65);assert.equal(ally.shield,0);
}
{
  const {s,h,cast}=arena(1,3),used=S.population(s,0).used;assert.equal(cast(),null);const summon=s.units.find(u=>u.summoned);assert.ok(summon&&S.types[summon.kind].flying);assert.equal(S.population(s,0).used,used);step(s,251);assert.ok(!s.units.some(u=>u.summoned));
}
{
  const {s,cast}=arena(2,0),front=S.spawn(s,'soldier',1,4,0),behind=S.spawn(s,'soldier',1,-4,0);const hp=behind.hp;assert.equal(cast(),null);assert.ok(front.hp<front.maxHp);assert.equal(behind.hp,hp);
}
{
  const {s,cast}=arena(2,1),target=S.spawn(s,'soldier',1,4,0);assert.equal(cast(),null);assert.ok(target.root>0);S.command(s,1,{type:'move',ids:[target.id],x:12,z:0});const x=target.x;step(s,10);assert.equal(target.x,x);step(s,25);assert.ok(target.x>x);
}
{
  const {s,h,cast}=arena(2,2);assert.equal(cast(),null);assert.equal(h.haste,5);step(s,51);assert.equal(h.haste,0);
}
{
  const {s,h,cast}=arena(3,0),target=S.spawn(s,'soldier',1,4,0);assert.equal(cast(),null);assert.equal(target.stun,1.5);assert.ok(!S.canAttack(h,{kind:'dragon'}));
}
{
  const {s,h,cast}=arena(3,2);assert.equal(cast(),null);assert.equal(h.shield,250);assert.equal(h.shieldLeft,7);
}
{
  const {s,h,cast}=arena(3,3);assert.equal(cast(),null);assert.equal(h.avatar,12);const target=S.spawn(s,'soldier',1,2,0),hp=target.hp,own=h.hp;S.visibility(s);S.tick(s);assert.ok(Math.abs(hp-target.hp-h.damage*1.6)<1e-8);assert.ok(Math.abs(own-h.hp-target.damage*.6)<1e-8);h.hp=0;h.respawn=.1;s.mode='moba';step(s,1);assert.equal(h.avatar,0);
}
console.log('PASS: four heroes / 16 skills, learning gates, status effects, timed areas/summons, targeting, hero saves and legacy migration');
