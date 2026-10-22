// Author: MiYu. Source-selected Cloud weapon slots and projectile-independent attack restrictions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mortarFixture} from './frost-human-mortar-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
export function checkCloudWeapons(S){const rules=S.cloudWeaponRules;
for(let faction=0;faction<4;faction++){
 const {s,hall}=mortarFixture(S,[faction,0]);
 for(let tier=1;tier<=3;tier++){hall.upgradeTier=tier;assert.deepEqual(S.cloudWeaponProfile(hall),rules.units[rules.hallSources[faction][tier-1]][1]);assert.equal(S.cloudWeaponRestricted(hall),faction===3&&tier>1);}
}
console.log('PASS Cloud weapons: all twelve faction main-building source profiles');
{
 const {s}=mortarFixture(S),ground=S.spawn(s,'soldier',1,3,0),building=S.spawn(s,'guardtower',1,4,0);
 for(const kind of ['guardtower','arcanetower','cannontower','spirittower','nerubiantower']){const u=S.spawn(s,kind,0,0,0);assert.equal(S.cloudWeaponRestricted(u,ground),true,kind);assert.equal(S.cloudWeaponRestricted(u,building),true,kind);if(kind==='cannontower'){assert.strictEqual(S.cloudWeaponProfile(u,ground),rules.units.hctw[1]);assert.strictEqual(S.cloudWeaponProfile(u,building),rules.units.hctw[2]);}}
 const rifle=S.spawn(s,'humanrifleman',0,0,0);assert.equal(S.cloudWeaponProfile(rifle,ground).weaponType,'instant');assert.equal(S.projectileSpeed(rifle,ground),0);assert.equal(S.cloudWeaponRestricted(rifle,ground),true);
 const machine=S.spawn(s,'humanflyingmachine',0,0,0),air=S.spawn(s,'emberdrake',1,3,3);assert.strictEqual(S.cloudWeaponProfile(machine,air),rules.units.hgyr[1]);assert.strictEqual(S.cloudWeaponProfile(machine,ground),rules.units.hgyr[2]);
}
console.log('PASS Cloud weapons: source towers, Cannon Tower target-dependent slots and zero-speed instant weapon');
{
 const {s}=mortarFixture(S,[2,0]),target=S.spawn(s,'soldier',1,1,0,{cd:999,order:{type:'hold'}}),u=S.spawn(s,'tower',0,0,0,{cd:0});
 assert.strictEqual(S.cloudWeaponProfile(u,target),rules.units.etrp[2]);u.aviaryClouded=1;assert.equal(S.canAttack(u,target),false);assert.equal(S.fire(s,u,target),false);
 delete u.aviaryClouded;assert.equal(S.command(s,0,{type:'uproot',ids:[u.id]}),null);for(let i=0;i<25;i++)S.tick(s);assert.equal(u.uprooted,true);assert.strictEqual(S.cloudWeaponProfile(u,target),rules.units.etrp[1]);assert.equal(S.cloudWeaponRestricted(u,target),false);
 for(const kind of ['barracks','shop','ancientlore','ancientwind']){const a=S.spawn(s,kind,0,-8,8);assert.equal(S.cloudWeaponRestricted(a,target),false);}
}
console.log('PASS Cloud weapons: Ancient Protector rooted missile and uprooted melee source slots');
{
 const {s}=mortarFixture(S),u=S.spawn(s,'guardtower',0,0,0),target=S.spawn(s,'soldier',1,3,0,{cd:999,order:{type:'hold'}}),profile=rules.units.hgtw[1],original={...profile};
 S.visibility(s);u.aviaryClouded=1;assert.ok(S.projectileSpeed(u,target)>0);
 try{
  Object.assign(profile,{weaponType:'normal',weaponCode:1});assert.equal(S.canAttack(u,target),true);assert.equal(S.fire(s,u,target),true);
  Object.assign(profile,{weaponType:'instant',weaponCode:4});assert.equal(S.canAttack(u,target),false);assert.equal(S.fire(s,u,target),false);
  for(const targetMask of [1,64,128,256]){profile.targetMask=targetMask;assert.equal(S.canAttack(u,target),true);}
  profile.targetMask=64|128;assert.equal(S.canAttack(u,target),false);
 }finally{Object.assign(profile,original);}
}
console.log('PASS Cloud weapons: attack and fire gates follow weapon type and exact target masks independently of missile speed');

}
checkCloudWeapons(S);
