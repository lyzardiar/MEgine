// Author: MiYu. Arcane Tower original upgrade, Feedback projectile and Reveal persistence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcaneFixture} from './frost-arcane-tower-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const command=(s,u,type,extra={})=>S.command(s,0,{type,ids:[u.id],...extra});
{
 const {s,tower,mill}=arcaneFixture(S,{upgrade:true});s.units=s.units.filter(u=>u.id!==mill.id);tower.hp=150;
 s.teams[0].gold=69;assert.match(command(s,tower,'arcaneTower'),/resources/);s.teams[0].gold=10000;
 assert.equal(command(s,tower,'arcaneTower'),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9930,9950]);assert.deepEqual(tower.guardTowerUpgrade,{left:50,source:true,kind:'arcanetower'});
 assert.match(command(s,tower,'cannonTower'),/idle/);assert.equal(command(s,tower,'cancelGuardTowerUpgrade'),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9982,9987]);
 assert.equal(command(s,tower,'arcaneTower'),null);const bad=S.clone(s);bad.units.find(u=>u.id===tower.id).guardTowerUpgrade.left=51;assert.throws(()=>S.restore(bad),/Invalid saved/);const saved=S.restore(s);step(s,499);step(saved,499);assert.deepEqual(s,saved);assert.equal(tower.kind,'scouttower');step(s,1);
 assert.deepEqual([tower.kind,tower.maxHp,tower.hp,tower.damage,tower.mana,tower.arcaneRevealCd],['arcanetower',500,250,9,0,0]);assert.ok(S.restore(s));
 console.log('PASS Arcane 70/50 upgrade without building prerequisite, cancellation, full duration and saved health ratio');
}
{
 const {s,tower}=arcaneFixture(S);assert.match(command(s,tower,'towerUpgrade'),/completed tower/);const mill=s.units.find(u=>u.kind==='lumbermill');assert.equal(command(s,mill,'masonryResearch'),null);mill.queue[0].left=.1;step(s,1);assert.deepEqual([tower.maxHp,tower.armorValue],[550,6]);tower.hp=400;assert.ok(S.repairTarget(s,S.spawn(s,'worker',0,-2,0),tower));s.teams[0].humanSanctum.Rhse=1;S.refreshMagicSentry(s);assert.ok(S.magicSentry(s,tower));assert.ok(S.restore(s));
 console.log('PASS Arcane masonry, repair and Magic Sentry');
}
for(const [kind,burn] of [['humanpriest',24],['hero',12],['humanfootman',0]]){
 const {s,tower,target}=arcaneFixture(S,{targetKind:kind});tower.cd=999;target.mana=kind==='humanfootman'?0:100;const before=target.mana,hp=target.hp;
 S.fire(s,tower,target);assert.equal(target.mana,before,'Feedback occurs at impact');const p=S.clone(s.projectiles[0]);assert.equal(p.art,'arcane-tower');near(p.y,S.unitHeight(s,tower)+2.45);assert.ok(p.damage>=8&&p.damage<=10);
 const copy=S.restore(s);step(s,8);step(copy,8);assert.deepEqual(s,copy);assert.ok(Math.abs(target.hp-(hp-S.weaponDamage(p,target,p.damage+burn,s)))<2,'source regeneration after impact');assert.equal(target.feedbackAmount||0,burn);assert.ok(S.restore(s));
}
console.log('PASS Arcane original projectile, delayed 24/12 mana burn and weapon-scaled Feedback against ordinary, hero and mana-less targets');
{
 const {s,tower,target}=arcaneFixture(S);target.mana=3;near(S.feedback(s,tower,target,tower),S.weaponDamage(tower,target,3,s));assert.equal(target.mana,0);target.mana=100;target.itemMagicImmune=5;assert.equal(S.feedback(s,tower,target,tower),0);assert.equal(target.mana,100);delete target.itemMagicImmune;target.team=0;assert.equal(S.feedback(s,tower,target,tower),0);
 const f=arcaneFixture(S,{targetKind:'skeletonwarrior'});f.target.cd=999;f.target.summoned=true;f.target.expires=f.s.frame+600;f.tower.cd=999;S.fire(f.s,f.tower,f.target);const p=S.clone(f.s.projectiles[0]);assert.ok(p.damage>=28&&p.damage<=30);const hp=f.target.hp;f.tower.hp=0;const copy=S.restore(f.s);step(f.s,8);step(copy,8);assert.deepEqual(f.s,copy);near(f.target.hp,hp-S.weaponDamage(p,f.target,p.damage,f.s));
 console.log('PASS Feedback mana cap, immunity, ally exclusion and launch-time summon bonus after tower death');
}
{
 const {s,tower,target}=arcaneFixture(S);target.x=20;target.z=0;target.invisibility={left:20,fade:0};S.visibility(s);assert.equal(S.isVisible(s,0,target),false);
 assert.match(command(s,tower,'arcaneReveal',{x:20,z:0}),/Magic Sentry/);s.teams[0].humanSanctum.Rhse=1;S.refreshMagicSentry(s);
 assert.equal(command(s,tower,'arcaneReveal',{x:20,z:0}),null);assert.equal(tower.arcaneRevealCd,180);assert.equal(S.isVisible(s,0,target),true);assert.equal(S.detected(s,0,target),true);
 assert.equal(S.publicState(s,1).arcaneReveals.length,0);assert.equal(S.publicState(s,1).units.find(u=>u.id===tower.id)?.arcaneRevealCd,undefined);assert.match(command(s,tower,'arcaneReveal',{x:0,z:0}),/ready/);
 // Invisibility representation is owned by its source spell; use the visibility assertions above, then remove the fixture-only value before persistence.
 delete target.invisibility;tower.hp=0;S.refreshMagicSentry(s);const copy=S.restore(s);step(s,149);step(copy,149);assert.deepEqual(s,copy);assert.equal(s.arcaneReveals.length,1);step(s,1);assert.equal(s.arcaneReveals.length,0);assert.equal(S.detected(s,0,target),false);
 console.log('PASS Reveal research, immediate remote fog/detection, cooldown, owner-only network area, saved persistence after tower death and 15s expiry');
}
{
 const {s,tower}=arcaneFixture(S);s.teams[0].humanSanctum.Rhse=1;S.refreshMagicSentry(s);command(s,tower,'arcaneReveal',{x:20,z:0});
 for(const mutate of [a=>a.arcaneReveals[0].expires++,a=>a.arcaneReveals[0].x=31,a=>a.arcaneReveals.push({...a.arcaneReveals[0]}),a=>a.units.find(u=>u.id===tower.id).arcaneRevealCd=181,a=>a.units.find(u=>u.id===tower.id).mana=1,a=>a.units.find(u=>u.id===tower.id).damage=10]){const bad=S.clone(s);mutate(bad);assert.throws(()=>S.restore(bad),/Invalid saved/);}
 const old=S.create('skirmish');delete old.arcaneReveals;assert.deepEqual(S.restore(old).arcaneReveals,[]);
 console.log('PASS Arcane strict save boundaries and legacy save migration');
}
