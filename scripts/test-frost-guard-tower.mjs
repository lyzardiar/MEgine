// Author: MiYu. Original tower damage, attack phases, arc, upgrade, saved missiles and legacy isolation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,tower,target}=guardTowerFixture(S),w=S.guardTowerRules.weapon;
 assert.equal(S.PROTOCOL,115);assert.equal(tower.damage,25);assert.equal(S.guardTowerUnit(tower),true);assert.deepEqual([w.bonus,w.dice,w.sides,w.range,w.cooldown,w.damagePoint,w.backswing,w.missileSpeed,w.missileArc],[22,1,5,7,.9,.3,.3,18,.15]);
 s.teams[0].upgrade=3;
 const values=new Set();for(let i=0;i<100;i++){s.projectiles=[];assert.equal(S.fire(s,tower,target),true);const p=s.projectiles[0];values.add(p.damage);assert.ok(p.damage>=23&&p.damage<=27);assert.equal(p.art,'guard-tower');assert.equal(p.guardTowerRules,1);near(p.y,S.unitHeight(s,tower)+1.45);near(p.toY,S.unitHeight(s,target)+S.unitType(target).impactHeight);assert.ok(S.restore(s));}
 assert.deepEqual([...values].sort((a,b)=>a-b),[23,24,25,26,27]);
 console.log('PASS Guard Tower source dice, immunity to generic weapon research, missile art/speed and source launch/target offsets');
}
{
 const {s,tower,target}=guardTowerFixture(S);S.tick(s);assert.ok(tower.weaponWindup);near(tower.weaponWindup.left,.3);assert.equal(s.projectiles.length,0);assert.ok(S.restore(s));
 step(s,2);assert.equal(s.projectiles.length,0);S.tick(s);assert.equal(s.projectiles.length,1);const p=s.projectiles[0],damage=p.damage,hit=target.hp;
 const copy=S.restore(s);S.tick(s);S.tick(copy);assert.deepEqual(s,copy);assert.ok(p.y>p.baseY);const t=p.segmentTravel/p.flightDistance;near(p.y-p.baseY,4*t*(1-t)*p.flightDistance*.15);
 for(let i=0;i<12&&s.projectiles.some(v=>v.id===p.id);i++){S.tick(s);S.tick(copy);assert.deepEqual(s,copy);}
 near(hit-target.hp,S.weaponDamage(p,target,damage,s));assert.ok(S.restore(s));
 const launches=s.projectileSerial;while(s.projectileSerial===launches)S.tick(s);assert.equal(s.frame-p.born,9);
 console.log('PASS Guard Tower .3s windup, .9s attack cycle, saved source arc and actual pierce impact');
}
{
 const {s,tower,target}=guardTowerFixture(S,{upgrade:true});target.cd=999;assert.equal(S.command(s,0,{type:'guardTower',ids:[tower.id]}),null);step(s,499);assert.equal(tower.kind,'scouttower');assert.equal(tower.guardTowerRules,undefined);assert.equal(s.projectiles.length,0);S.tick(s);assert.equal(tower.kind,'guardtower');assert.equal(tower.guardTowerRules,1);assert.equal(tower.damage,25);assert.ok(S.restore(s));step(s,3);assert.equal(s.projectiles[0].art,'guard-tower');
 const legacy=S.clone(s);for(const u of legacy.units)delete u.guardTowerRules;legacy.projectiles=[];delete legacy.units.find(u=>u.id===tower.id).weaponWindup;assert.ok(S.restore(legacy));
 console.log('PASS real Scout upgrade activates original tower weapon; unmarked existing saved towers retain legacy rules');
}
{
 for(const targetKind of ['cryptfiend','gargoyle']){
  const {s,tower,target}=guardTowerFixture(S,{targetKind});assert.equal(S.canAttack(tower,target),true);assert.equal(S.command(s,0,{type:'attack',ids:[tower.id],target:target.id}),null);step(s,4);assert.equal(s.projectiles[0].guardTowerRules,1);
  const bad=S.clone(s);bad.projectiles[0].guardTowerRules=2;assert.throws(()=>S.restore(bad),/Guard Tower/);
  const noMarker=S.clone(s);delete noMarker.projectiles[0].guardTowerRules;assert.throws(()=>S.restore(noMarker),/source projectile|projectile/);
  const wrongUnit=S.clone(s);wrongUnit.units.find(u=>u.id===target.id).guardTowerRules=1;assert.throws(()=>S.restore(wrongUnit),/Guard Tower/);
  tower.hp=1;const killer=S.spawn(s,'humanfootman',1,.5,0,{cd:99});assert.equal(S.fire(s,killer,tower),true);assert.equal(tower.hp,0);S.visibility(s);const saved=S.restore(s),id=s.projectiles[0].id;for(let i=0;i<10&&s.projectiles.some(p=>p.id===id);i++){S.tick(s);S.tick(saved);assert.deepEqual(s,saved);}
 }
 const td=S.create('td');assert.ok(td.units.every(u=>!S.guardTowerUnit(u)));const {s,tower,target}=guardTowerFixture(S);target.x=8;step(s,20);assert.equal(s.projectiles.length,0);
 console.log('PASS ground/air attacks, saved missile ownership after tower death, malformed markers rejected and TD/range isolation');
}
