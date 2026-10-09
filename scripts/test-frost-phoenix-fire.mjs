// Author: MiYu. Source Phoenix Fire travel, impact, recovery and saved ownership.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bloodMageFixture} from './frost-blood-mage-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
function fixture(){const {s,h}=bloodMageFixture(S,6);h.skills=[0,0,0,1];h.skillPoints=5;h.mana=S.maxMana(h);assert.equal(S.command(s,0,{type:'spell',ids:[h.id],slot:3}),null);step(s,6);const p=s.units.find(S.phoenixUnit);assert.ok(p);p.cd=10000;const v=S.spawn(s,'ghoul',1,4,0,{damage:0,hp:2000,maxHp:2000,cd:10000,order:{type:'hold'}});S.visibility(s);return {s,h,p,v};}
{
 const {s,p,v}=fixture();step(s,1);const shot=s.projectiles.find(p=>p.phoenixFireProjectile);assert.ok(shot);assert.equal(shot.art,'phoenix-fire');assert.equal(shot.damage,20);assert.equal(Math.hypot(shot.vx,shot.vy,shot.vz),9);assert.equal(v.hp,2000);assert.equal(v.phoenixFire,undefined);assert.equal(shot.phoenixSummoner,p.summoner);assert.ok(S.restore(s));
 const copy=S.restore(s);step(s,6);step(copy,6);assert.deepEqual(copy,s);assert.equal(v.hp,1980);assert.ok(v.phoenixFire);assert.equal(v.phoenixFire.source,p.id);assert.ok(v.phoenixFire.left>9.7);const untilDot=10-Math.round(v.phoenixFire.pulse*10);step(s,untilDot-1);assert.equal(v.hp,1980);step(s,1);assert.equal(v.hp,1978,'DOT starts one full second after missile impact');
 const view=S.publicState(s,1);for(const k of ['source','phoenixSummoner','phoenixFireProjectile'])assert.ok(view.projectiles.every(p=>p[k]===undefined));
}
{
 const {s,v}=fixture();step(s,1);v.x=6;v.z=3;const copy=S.restore(s);step(s,12);step(copy,12);assert.deepEqual(copy,s);assert.ok(v.phoenixFire);assert.equal(s.projectiles.filter(p=>p.phoenixFireProjectile).length,0,'pending target reservation prevents duplicate flight');
}
{
 const {s,p,v}=fixture();step(s,1);p.hp=1;step(s,1);assert.equal(p.kind,'phoenixegg');const copy=S.restore(s);step(s,8);step(copy,8);assert.deepEqual(copy,s);assert.ok(v.phoenixFire,'already launched fire survives egg transition');
}
{
 const {s,p,v}=fixture();step(s,1);p.hp=1;step(s,1);assert.equal(p.kind,'phoenixegg');const attacker=S.spawn(s,'ghoul',1,p.x,p.z,{damage:100000,cd:10000,order:{type:'hold'}});S.fire(s,attacker,p);assert.equal(p.hp,0);step(s,1);assert.ok(!s.units.some(u=>u.id===p.id));assert.ok(s.projectiles.some(p=>p.phoenixFireProjectile));const copy=S.restore(s);step(s,6);step(copy,6);assert.deepEqual(copy,s);assert.equal(v.hp,1980);assert.ok(v.phoenixFire,'already launched fire survives destruction and removal of the source egg');
}
{
 const {s,v}=fixture();for(let i=0;i<20&&v.hp===2000;i++)step(s,1);const impact=s.events.find(e=>e.type==='impact'&&e.art==='phoenix-fire');assert.ok(impact);assert.deepEqual([impact.x,impact.y,impact.z],[v.x,S.unitHeight(s,v)+1.6,v.z]);assert.equal(impact.velocity.length,3);assert.ok(impact.velocity.every(Number.isFinite));assert.deepEqual(S.publicState(s,0).events.find(e=>e.art==='phoenix-fire'),impact);for(const k of ['source','phoenixSummoner','target'])assert.equal(impact[k],undefined);s.visible[0].fill(0);assert.ok(!S.publicState(s,0).events.some(e=>e.art==='phoenix-fire'),'hidden impact remains private');
}
for(const invalid of ['dead','immune','phase','hidden']){
 const {s,v}=fixture();if(invalid==='dead')v.hp=0;if(invalid==='immune')v.divineShield=10;if(invalid==='phase')v.phaseLeft=1;if(invalid==='hidden'){v.x=27;v.z=27;}S.visibility(s);step(s,1);assert.equal(s.projectiles.filter(p=>p.phoenixFireProjectile).length,0,invalid);
}
{
 const {s,v}=fixture();step(s,1);v.divineShield=10;step(s,8);assert.equal(v.hp,2000);assert.equal(v.phoenixFire,undefined);assert.equal(s.projectiles.filter(p=>p.phoenixFireProjectile).length,0);
}
{
 const {s,v}=fixture();step(s,1);for(const patch of [{phoenixFireProjectile:false},{phoenixSummoner:v.id},{damage:21},{splashDamage:20},{orb:'fire'},{kind:'phoenixegg'},{segmentTravel:1},{fromX:33}]){const bad=S.clone(s);Object.assign(bad.projectiles.find(p=>p.phoenixFireProjectile),patch);assert.throws(()=>S.restore(bad),/Phoenix Fire|projectile/);}
}
console.log('PASS source 900-speed homing Phoenix Fire, delayed impact and DOT, exact in-flight saves, target reservation, egg transition, immunity/lost targets, provenance and privacy');
