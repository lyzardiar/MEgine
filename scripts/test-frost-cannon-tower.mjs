// Author: MiYu. Original Cannon upgrade, dual weapons, splash exclusions and saved flight.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cannonTowerFixture,cannonBoundaryFixture} from './frost-cannon-tower-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),command=(s,u,type)=>S.command(s,0,{type,ids:[u.id]});
{
 const {s,tower,workshop,mill}=cannonTowerFixture(S,{upgrade:true});workshop.built=.5;
 assert.match(command(s,tower,'cannonTower'),/Workshop/);assert.equal(s.teams[0].gold,10000);workshop.built=1;
 s.teams[0].gold=169;assert.match(command(s,tower,'cannonTower'),/resources/);s.teams[0].gold=10000;
 assert.equal(command(s,tower,'cannonTower'),null);assert.deepEqual(tower.guardTowerUpgrade,{left:75,source:true,kind:'cannontower'});assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9830,9900]);
 assert.match(command(s,tower,'guardTower'),/idle/);assert.equal(command(s,tower,'cancelGuardTowerUpgrade'),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9957,9975]);
 tower.hp=150;assert.equal(command(s,mill,'masonryResearch'),null);mill.queue[0].left=.1;step(s,1);assert.equal(command(s,tower,'cannonTower'),null);
 const copy=S.restore(s);step(s,749);step(copy,749);assert.deepEqual(s,copy);assert.equal(tower.kind,'scouttower');assert.equal(s.projectileSerial,0);step(s,1);
 assert.deepEqual([tower.kind,tower.maxHp,tower.hp,tower.armorValue,tower.mana,tower.damage],['cannontower',660,330,6,0,100.5]);assert.equal(S.unitType(tower).armor,'fortified');assert.ok(S.restore(s));
 const worker=S.spawn(s,'worker',0,-2,0);assert.ok(S.repairTarget(s,worker,tower));s.teams[0].humanSanctum.Rhse=1;assert.ok(S.magicSentry(s,tower));
 console.log('PASS Cannon upgrade prerequisite, price, cancellation, 75s duration, masonry health ratio, repair and Magic Sentry');
}
{
 const {s,tower,target}=cannonTowerFixture(S),w=S.cannonTowerRules.weapons[0],values=new Set();s.teams[0].upgrade=3;
 for(let i=0;i<200;i++){s.projectiles=[];S.fire(s,tower,target);const p=s.projectiles[0];values.add(p.damage);assert.ok(p.damage>=90&&p.damage<=111);assert.equal(p.weaponSlot,1);assert.equal(p.art,'cannon-tower');near(p.y,S.unitHeight(s,tower)+1.6);near(p.toY,S.unitHeight(s,target));assert.ok(S.restore(s));}
 assert.equal(values.size,22);assert.equal(S.canAttack(tower,S.spawn(s,'gargoyle',1,7,0)),false);
 s.projectiles=[];step(s,3);assert.equal(s.projectiles.length,0);step(s,1);const p=s.projectiles[0];assert.equal(p.born,4);assert.equal(p.weaponSlot,1);const saved=S.restore(s);step(s,1);step(saved,1);assert.deepEqual(s,saved);const progress=p.segmentTravel/p.flightDistance;near(p.y-p.baseY,4*progress*(1-progress)*p.flightDistance*w.missileArc);
 target.x=12;S.visibility(s);const hp=target.hp;step(s,12);assert.equal(target.hp,hp,'artillery lands at its captured point');
 console.log('PASS Cannon source dice, no air targeting, windup, saved parabola and ballistic ground shot');
}
{
 const {s,tower,target}=cannonTowerFixture(S,{targetKind:'farm'}),nearby=S.spawn(s,'cryptfiend',1,6,.4,{cd:999,cryptWebAuto:false}),hp=nearby.hp;
 S.fire(s,tower,target);const p=s.projectiles[0];assert.equal(p.weaponSlot,2);const before=target.hp;target.x=7;S.visibility(s);tower.cd=999;step(s,15);assert.ok(target.hp<before);assert.equal(nearby.hp,hp,'building weapon has no splash');assert.ok(S.restore(s));
 console.log('PASS Cannon second weapon tracks structures and damages only the target');
}
{
 for(const [offset,factor] of [[.81,1],[.83,.5],[1.31,.5],[1.33,.1],[1.56,.1],[1.58,0]]){
  const {s,tower,target}=cannonTowerFixture(S),ally=S.spawn(s,'cryptfiend',0,6,offset,{cd:999,cryptWebAuto:false}),before=ally.hp;
  assert.equal(S.command(s,0,{type:'attackGround',ids:[tower.id],x:6,z:0}),null);step(s,4);const p=S.clone(s.projectiles[0]);tower.cd=999;step(s,12);near(before-ally.hp,S.weaponDamage(p,ally,p.damage*factor,s));assert.ok(S.restore(s));
 }
 const {s,tower,target}=cannonTowerFixture(S);target.x=20;S.visibility(s);const before=tower.hp;assert.equal(S.command(s,0,{type:'attackGround',ids:[tower.id],x:0,z:0}),null);step(s,20);assert.equal(tower.hp,before,'notself');
 s.resources=[{kind:'tree',x:2,z:0,amount:200,hp:50}];S.visibility(s);assert.equal(S.command(s,0,{type:'attackTree',ids:[tower.id],resource:0}),null);tower.cd=0;step(s,15);assert.equal(s.resources[0].amount,0);
 console.log('PASS Cannon collision-aware splash bands, friendly fire, notself, ground targeting and tree destruction');
}
{
 const {s,tower,target}=cannonTowerFixture(S);S.fire(s,tower,target);
 for(const mutate of [a=>a.projectiles[0].weaponSlot=3,a=>delete a.projectiles[0].weaponSlot,a=>a.projectiles[0].segmentTravel=-1,a=>a.units.find(u=>u.id===tower.id).damage=101,a=>a.units.find(u=>u.id===tower.id).mana=1]){const bad=S.clone(s);mutate(bad);assert.throws(()=>S.restore(bad),/Invalid saved/);}
 tower.hp=0;const copy=S.restore(s);step(s,15);step(copy,15);assert.deepEqual(s,copy);assert.ok(target.hp<target.maxHp);
 const f=cannonTowerFixture(S,{upgrade:true});command(f.s,f.tower,'cannonTower');const publicEnemy=S.publicState(f.s,1);assert.equal(publicEnemy.units.find(u=>u.id===f.tower.id)?.guardTowerUpgrade,undefined);
 for(const mutate of [a=>a.units.find(u=>u.id===f.tower.id).guardTowerUpgrade.kind='hall',a=>a.units.find(u=>u.id===f.tower.id).guardTowerUpgrade.left=76]){const bad=S.clone(f.s);mutate(bad);assert.throws(()=>S.restore(bad),/Invalid saved/);}
 console.log('PASS Cannon strict saves, dead-launcher flight and enemy upgrade privacy');
}

for(const [x,shots] of [[8.71,1],[8.73,0]]){
 const {s,tower,target}=cannonTowerFixture(S);target.x=20;S.visibility(s);assert.equal(S.command(s,0,{type:'attackGround',ids:[tower.id],x,z:0}),null);step(s,4);assert.equal(s.projectileSerial,shots);assert.ok(S.restore(s));
}
console.log('PASS Cannon ground-command range includes the source tower collision radius');
for(const kind of ['cryptfiend','cannontower','tree'])for(const radius of [50,100,125])for(const delta of [-.002,0,.00025,.002])for(const diagonal of delta===0?[false]:[false,true]){
 const {s,victim,expected}=cannonBoundaryFixture(S,{kind,radius,delta,diagonal}),hp=victim.hp,copy=S.restore(s);step(s,15);step(copy,15);assert.deepEqual(s,copy);near(hp-victim.hp,expected);
}
console.log('PASS Cannon original inner tolerance and strict outer cutoff: 63 unit/building/tree boundaries with saved flight replay');
