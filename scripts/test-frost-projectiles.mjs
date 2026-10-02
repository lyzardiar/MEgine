// Author: MiYu. Authoritative projectile travel, impact, saves and fog privacy.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function arena(kind='archer',distance=8){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map});s.units=[];const u=S.spawn(s,kind,0,0,0),v=S.spawn(s,'neutral',1,0,distance,{speed:0,damage:0});u.order={type:'attack',target:v.id};S.visibility(s);return {s,u,v};}
function launch(kind='archer',distance=8){const a=arena(kind,distance);S.tick(a.s);assert.equal(a.v.hp,a.v.maxHp,'release does not apply damage');assert.equal(a.s.projectiles.length,1);a.u.cd=99;return a;}
{
 const {s,u,v}=launch(),hp=v.hp;assert.equal(s.events.filter(e=>e.type==='launch').length,1);assert.ok(!s.events.some(e=>e.type==='damage'||e.type==='impact'));step(s,3);assert.equal(v.hp,hp);assert.equal(s.projectiles.length,1);S.tick(s);assert.equal(v.hp,hp-S.weaponDamage(u,v,u.damage));assert.equal(s.projectiles.length,0);assert.equal(s.events.filter(e=>e.type==='impact').length,1);step(s,10);assert.equal(v.hp,hp-S.weaponDamage(u,v,u.damage),'one impact only');
}
{
 const {s,u,v}=launch();v.x=4;step(s,2);assert.ok(s.projectiles[0].x>0,'homing follows a moving target');step(s,6);assert.equal(v.hp,v.maxHp-S.weaponDamage(u,v,u.damage));
}
{
 const {s,u,v}=launch();u.hp=0;v.hp=1;const gold=s.teams[0].gold;step(s,5);assert.equal(v.hp,0);assert.equal(s.teams[0].gold,gold+25);assert.equal(s.teams[0].kills,1,'projectile retains kill credit after the shooter dies');assert.ok(!s.units.some(x=>x.id===u.id));
}
for(const disappear of [v=>v.hp=0,v=>v.inside=999]){const {s,v}=launch();disappear(v);S.tick(s);assert.equal(s.projectiles.length,0);assert.ok(!s.events.some(e=>e.type==='impact'),'lost target cannot be hit');}
{
 const {s,u,v}=launch('necromancer',6);u.hp=u.maxHp/2;const hp=u.hp;step(s,5);assert.ok(u.hp>hp,'lifesteal applies at impact');const dead=launch('necromancer',6);dead.u.hp=0;step(dead.s,5);assert.equal(dead.u.hp,0,'in-flight lifesteal cannot resurrect its source');
}
{
 const {s,u,v}=launch('catapult',10),near=S.spawn(s,'soldier',1,1,10,{speed:0,damage:0}),ally=S.spawn(s,'soldier',0,1,10,{speed:0,damage:0});v.x=5;step(s,10);assert.equal(v.hp,v.maxHp,'artillery lands at the original ground point');assert.equal(near.hp,near.maxHp-S.weaponDamage(u,near,u.damage*.6));assert.equal(ally.hp,ally.maxHp);assert.equal(s.projectiles.length,0);
}
{
 const {s,u,v}=launch('catapult',10);v.hp=0;const near=S.spawn(s,'soldier',1,1,10,{speed:0,damage:0});step(s,10);assert.ok(near.hp<near.maxHp,'artillery still explodes when its original target dies');
}
for(const kind of ['soldier','rifleman']){const {s,u,v}=arena(kind,1);S.tick(s);assert.equal(s.projectiles.length,0);assert.ok(v.hp<v.maxHp,kind+' remains immediate');if(kind==='rifleman'){const e=s.events.find(e=>e.type==='hit');assert.equal(e.art,'musket');assert.equal(e.fromX,u.x);assert.equal(e.fromZ,u.z);s.visible[1].fill(1);assert.ok(S.publicState(s,1).events.some(e=>e.art==='musket'));s.visible[1][S.index(u.x,u.z)]=0;assert.ok(!S.publicState(s,1).events.some(e=>e.art==='musket'),'hidden shooter cannot leak muzzle events');}}
{
 const {s,u,v}=launch();v.shield=100;v.shieldLeft=10;step(s,4);assert.equal(v.hp,v.maxHp);assert.equal(v.shield,100-S.weaponDamage(u,v,u.damage),'shield at impact absorbs the shot');
}
{
 const {s}=launch();S.tick(s);const saved=S.clone(s),restored=S.restore(saved);assert.deepEqual(restored.projectiles,s.projectiles);step(s,12);step(restored,12);for(const key of ['units','teams','projectiles','projectileSerial','events'])assert.deepEqual(restored[key],s[key],key+' resumes identically');
 for(const patch of [{age:-1},{age:7},{damage:-1},{y:NaN},{id:0},{target:0},{source:0},{art:'fake'},{kind:'rifleman'},{born:saved.frame+1},{travel:1000}]){const invalid=S.clone(saved);Object.assign(invalid.projectiles[0],patch);assert.throws(()=>S.restore(invalid),/projectile/);}
 const duplicate=S.clone(saved);duplicate.projectiles.push(S.clone(duplicate.projectiles[0]));assert.throws(()=>S.restore(duplicate),/projectile/);
 for(const projectiles of [null,{},Array(S.PROJECTILE_LIMIT+1).fill(saved.projectiles[0])])assert.throws(()=>S.restore({...saved,projectiles}),/projectile/);
 const legacy=S.clone(s);delete legacy.projectiles;delete legacy.projectileSerial;assert.deepEqual(S.restore(legacy).projectiles,[]);assert.equal(S.restore(legacy).projectileSerial,0);
}
{
 const {s}=launch(),p=s.projectiles[0];s.visible[0].fill(0);assert.deepEqual(S.publicState(s,0).projectiles,[]);s.visible[0][S.index(p.x,p.z)]=1;const seen=S.publicState(s,0);assert.equal(seen.projectiles.length,1);assert.deepEqual(Object.keys(seen.projectiles[0]).sort(),['art','id','team','vx','vy','vz','x','y','z']);assert.equal(seen.projectileSerial,undefined);assert.ok(!seen.events.some(e=>e.type==='launch'),'hidden target coordinates are not exposed by launch events');
 s.visible[0].fill(0);s.visible[0][S.index(p.toX,p.toZ)]=1;assert.ok(!S.publicState(s,0).events.some(e=>e.type==='launch'),'hidden shooter coordinates are not exposed');
}
{
 const {s,u}=launch(),shot=S.clone(s.projectiles[0]);s.projectiles=Array.from({length:S.PROJECTILE_LIMIT},(_,i)=>({...shot,id:i+1}));s.projectileSerial=S.PROJECTILE_LIMIT;u.cd=0;S.tick(s);assert.equal(u.cd,0);assert.equal(s.projectileSerial,S.PROJECTILE_LIMIT);assert.ok(!s.events.some(e=>e.type==='launch'),'capacity postpones release without consuming the attack');
}
{
 const {s,v}=launch();for(let i=0;i<62;i++){v.x=i%2?-30:30;v.z=0;S.tick(s);}assert.equal(s.projectiles.length,0,'unreachable homing targets expire within six seconds');
}
console.log('PASS: delayed single impact, homing, posthumous credit/lifesteal, lost targets, artillery/splash, shields, immediate melee/rifle, exact save continuation, legacy/malformed saves, fog redaction, capacity and lifetime');
