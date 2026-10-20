// Author: MiYu. Guard Tower release-range buffer, fixed windup target and saved continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
for(const order of [null,{type:'attack'}]){
 const {s,tower,target}=guardTowerFixture(S);tower.order=order?{...order,...(order.type==='attack'?{target:target.id}:{})}:null;
 S.tick(s);assert.equal(tower.weaponWindup.target,target.id);target.x=8.5;S.visibility(s);assert.ok(target.x>S.guardTowerRules.weapon.range+(S.types.cryptfiend.radius||.3));
 const closer=S.spawn(s,'cryptfiend',1,4,1,{cd:99,cryptWebAuto:false,order:{type:'hold'}});S.visibility(s);
 const saved=S.restore(s);for(let i=0;i<3;i++){S.tick(s);S.tick(saved);assert.deepEqual(s,saved);}
 assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].target,target.id);assert.equal(s.projectiles[0].born,4);assert.notEqual(s.projectiles[0].target,closer.id);
 console.log('PASS Guard range '+(order?.type||'automatic')+': target outside normal range retained through saved windup; closer target cannot steal release');
}
{
 const edge=S.guardTowerRules.weapon.range+S.guardTowerRules.weapon.rangeBuffer+.72+S.cryptUnitRules.units.cryptfiend.collision;
 for(const [x,shots] of [[edge-.001,1],[edge+.001,0]]){
  const {s,tower,target}=guardTowerFixture(S);tower.order={type:'attack',target:target.id};S.tick(s);target.x=x;S.visibility(s);step(s,3);
  assert.equal(s.projectileSerial,shots);assert.equal(tower.weaponWindup,undefined);assert.ok(S.restore(s));
 }
 const {s,tower,target}=guardTowerFixture(S);tower.order={type:'attack',target:target.id};S.tick(s);target.x=edge+2;S.visibility(s);S.tick(s);assert.ok(tower.weaponWindup);target.x=8.5;S.visibility(s);step(s,2);assert.equal(s.projectileSerial,1);
 console.log('PASS Guard range boundary and release-time check: escape beyond buffer cancels; return before release retains shot');
}
{
 for(const order of [null,{type:'attack'}]){
  const {s,tower,target}=guardTowerFixture(S);target.x=8.5;tower.order=order?{...order,...(order.type==='attack'?{target:target.id}:{})}:null;S.visibility(s);step(s,20);assert.equal(s.projectileSerial,0);assert.equal(tower.weaponWindup,undefined);
 }
 for(const cancel of ['stop','dead','hidden']){
  const {s,tower,target}=guardTowerFixture(S);S.tick(s);target.x=8.5;
  if(cancel==='stop')assert.equal(S.command(s,0,{type:'stop',ids:[tower.id]}),null);
  else if(cancel==='dead')target.hp=0;
  else target.x=28;
  S.visibility(s);step(s,3);assert.equal(s.projectileSerial,0);
 }
 {const {s,tower,target}=guardTowerFixture(S);S.tick(s);target.x=8.5;const replacement=S.spawn(s,'cryptfiend',1,5,1,{cd:99,cryptWebAuto:false,order:{type:'hold'}});S.visibility(s);assert.equal(S.command(s,0,{type:'attack',ids:[tower.id],target:replacement.id}),null);assert.equal(tower.weaponWindup,undefined);replacement.hp=0;step(s,3);assert.equal(s.projectileSerial,0);}
 const {s,tower,target}=guardTowerFixture(S);delete tower.guardTowerRules;tower.weaponWindup={target:target.id,left:.3};target.x=8.5;tower.order={type:'attack',target:target.id};S.visibility(s);step(s,3);assert.equal(s.projectileSerial,0);
 console.log('PASS Guard buffer cannot acquire/start attacks; stop, invalid targets and unmarked legacy towers retain cancellation');
}
