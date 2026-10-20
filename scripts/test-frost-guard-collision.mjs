// Author: MiYu. Original body radii, planar Guard Tower range and acquisition/release boundaries.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const profiles=[['cryptfiend',.32,[0,3]],['gargoyle',.08,[0,3]],['humanfootman',.31,[0,0]],['humanpriest',.16,[0,0]],['hall',1.76,[0,0]],['guardtower',.72,[0,0]]];
assert.equal(Number(S.humanMasonry.units.hgtw.sourceBalance.collision),72);
for(const [targetKind,radius,factions] of profiles){
 for(const manual of [false,true])for(const [offset,shots] of [[-.001,1],[0,1],[.001,0]]){
  const {s,tower,target}=guardTowerFixture(S,{targetKind,factions});target.x=7+.72+radius+offset;target.z=0;target.order=null;
  if(manual)tower.order={type:'attack',target:target.id};S.visibility(s);step(s,4);assert.equal(s.projectileSerial,shots,`${targetKind} manual=${manual} offset=${offset}`);
 }
}
console.log('PASS Guard collision: ground, flying, small caster, Footman, main base and tower body radii at automatic/manual range boundaries');
{
 for(const [targetKind,radius,factions] of profiles)for(const [offset,shots] of [[-.001,1],[.001,0]]){
  const {s,tower,target}=guardTowerFixture(S,{targetKind,factions});target.order=null;tower.order={type:'attack',target:target.id};S.tick(s);assert.ok(tower.weaponWindup);target.x=7+2.5+.72+radius+offset;S.visibility(s);
  const saved=S.restore(s);for(let i=0;i<3;i++){S.tick(s);S.tick(saved);assert.deepEqual(s,saved);}assert.equal(s.projectileSerial,shots,`${targetKind} release offset=${offset}`);
 }
 console.log('PASS Guard collision: buffered release uses both bodies for all six profiles and resumes frame-identically');
}
{
 const {s,tower,target}=guardTowerFixture(S,{targetKind:'gargoyle'});target.x=7.79;S.visibility(s);assert.ok(S.unitHeight(s,target)>S.unitHeight(s,tower));step(s,4);assert.equal(s.projectileSerial,1);
 const legacy=guardTowerFixture(S,{targetKind:'gargoyle'});delete legacy.tower.guardTowerRules;legacy.target.x=7.79;legacy.tower.order={type:'attack',target:legacy.target.id};S.visibility(legacy.s);step(legacy.s,4);assert.equal(legacy.s.projectileSerial,0);
 for(const [offset,shots] of [[.000001,1],[.00002,0]]){const f=guardTowerFixture(S);f.target.x=8.04+offset;S.visibility(f.s);step(f.s,4);assert.equal(f.s.projectileSerial,shots);}
 console.log('PASS Guard collision: air height does not shorten source range, squared-distance tolerance and unmarked legacy isolation');
}
