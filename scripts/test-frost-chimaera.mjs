// Author: MiYu. Source production, dual weapon snapshots, splash bands and save compatibility.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chimaeraFixture} from './frost-chimaera-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},cmd=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra}),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
{
 const {s,roost,tree,wind}=chimaeraFixture(S);assert.equal(S.chimaeraBuildingRequirement(s,0),true);tree.upgradeTier=2;assert.equal(S.chimaeraBuildingRequirement(s,0),false);tree.upgradeTier=3;wind.built=.9;assert.equal(S.chimaeraBuildingRequirement(s,0),false);wind.built=1;
 assert.deepEqual(S.trainable(s,roost),['chimaera']);assert.equal(cmd(s,roost,'uproot')!==null,true);assert.equal(cmd(s,roost,'train',{kind:'chimaera'}),null);assert.equal(roost.queue[0].left,60);assert.equal(s.teams[0].gold,9670);assert.equal(s.teams[0].wood,9930);step(s,300);const saved=S.restore(s);step(s,300);step(saved,300);assert.deepEqual(s,saved);assert.equal(s.units.filter(S.chimaeraUnit).length,2);assert.equal(S.population(s,0).used,15);
 assert.equal(cmd(s,roost,'train',{kind:'chimaera'}),null);assert.equal(cmd(s,roost,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,9670);
}
console.log('PASS Chimaera production: Eternity/Wind gates, stationary Roost, 330/70/5/60 source training, saved continuation and full cancellation refund');
{
 const {s,roost,chimaera}=chimaeraFixture(S);assert.equal(cmd(s,roost,'chimaeraResearch',{upgrade:'Recb'}),null);assert.equal(s.teams[0].gold,9875);assert.equal(s.teams[0].wood,9775);assert.ok(cmd(s,roost,'chimaeraResearch',{upgrade:'Recb'}));step(s,200);const saved=S.restore(s);step(s,200);step(saved,200);assert.deepEqual(s,saved);assert.equal(s.teams[0].corrosiveBreath,1);assert.equal(chimaera.corrosiveBreath,1);assert.equal(S.corrosiveOption(s,roost),null);assert.equal(S.spawn(s,'chimaera',0,12,5).corrosiveBreath,1);assert.equal(S.publicState(s,1).teams[0].corrosiveBreath,undefined);
}
console.log('PASS Corrosive Breath: 125/225/40 source research, duplicate rejection, shared queue, completion on existing/new units and private enemy technology');
{
 const {s,chimaera}=chimaeraFixture(S),target=S.spawn(s,'soldier',1,5.4,4,{hp:2000,maxHp:2000,damage:0,armorValue:0,order:{type:'hold'}});S.visibility(s);assert.equal(S.canAttack(chimaera,{kind:'dragon'}),false);assert.equal(S.unitType(chimaera,target).attack,'magic');assert.equal(cmd(s,chimaera,'attack',{target:target.id}),null);step(s,1);assert.equal(chimaera.weaponWindup.left,.5);assert.equal(chimaera.weaponWindup.weaponSlot,2);step(s,5);assert.equal(s.projectiles[0].weaponSlot,2);assert.equal(s.projectiles[0].art,'chimaera-lightning');assert.equal(S.projectileSpeed(s.projectiles[0]),15);close(chimaera.cd,2);assert.equal(chimaera.x,1);const saved=S.restore(s);step(s,6);step(saved,6);assert.deepEqual(s,saved);assert.ok(target.hp<2000);assert.ok(S.restore(s));
}
console.log('PASS source lightning: horizontal 450 range, 0.5s front swing, shared 2.5s cycle, 1500 speed, zero arc and saved slot-2 flight');
{
 const {s,chimaera,roost}=chimaeraFixture(S),target=S.spawn(s,'tower',1,8.8,4,{hp:5000,maxHp:5000,damage:0,armorValue:0});s.teams[0].corrosiveBreath=1;chimaera.corrosiveBreath=1;S.visibility(s);assert.equal(S.unitType(chimaera,target).attack,'siege');assert.equal(S.attackRange(chimaera,target),8.5);assert.equal(cmd(s,chimaera,'attack',{target:target.id}),null);step(s,8);const shot=s.projectiles[0];assert.equal(shot.weaponSlot,1);assert.equal(shot.art,'chimaera-acid');assert.equal(S.projectileSpeed(shot),12);assert.ok(shot.damage>=45&&shot.damage<=55);const saved=S.restore(s);step(s,12);step(saved,12);assert.deepEqual(s,saved);assert.ok(target.hp<5000);assert.equal(S.types.chimaera.leavesCorpse,false);assert.equal(S.types.chimaera.flightHeight,2.8);assert.ok(S.restore(s));
}
console.log('PASS source acid: researched structure slot, 850 range, 0.7s front swing, 1200 speed, siege damage and saved flight');
{
 const {s,chimaera}=chimaeraFixture(S);chimaera.order={type:'move',x:1,z:4};const main=S.spawn(s,'soldier',1,5,4,{hp:2000,maxHp:2000,damage:0,armorValue:0,order:{type:'hold'}}),others=[.4,1,1.8,2.1].map(d=>S.spawn(s,'soldier',1,5+d,4,{hp:2000,maxHp:2000,damage:0,armorValue:0,order:{type:'hold'}})),building=S.spawn(s,'tower',1,5,4.2,{hp:2000,maxHp:2000,damage:0,armorValue:0}),immune=S.spawn(s,'dryad',1,5,4.3,{damage:0,order:{type:'hold'}}),air=S.spawn(s,'dragon',1,5,4.2,{damage:0,order:{type:'hold'}});S.fire(s,chimaera,main);const value=s.projectiles[0].damage;s.teams[0].corrosiveBreath=1;chimaera.corrosiveBreath=1;const saved=S.restore(s);step(s,8);step(saved,8);assert.deepEqual(s,saved);close(2000-main.hp,value*.75);for(let i=0;i<3;i++)close(2000-others[i].hp,value*[1,.5,.1][i]*.75);close(others[3].hp,2000);close(building.hp,2000);close(immune.hp,immune.maxHp);close(air.hp,air.maxHp);
}
console.log('PASS lightning splash: 50/125/200 bands, ground-only victims, structure/air/magic-immune exclusions and immutable in-flight weapon after research');
{
 const {s,chimaera}=chimaeraFixture(S);s.teams[0].nightResearch.Resw=3;s.teams[0].nightResearch.Rerh=2;S.updateNightUnit(s,chimaera);assert.equal(chimaera.damage,102);assert.equal(chimaera.armorValue,6);const target={kind:'tower'};chimaera.corrosiveBreath=1;for(const slot of [1,2]){const shot={...chimaera,weaponSlot:slot},rolls=Array.from({length:60},()=>S.nightWeaponRoll(s,shot));assert.ok(rolls.every(v=>v>=(slot===1?48:70)&&v<=(slot===1?88:134)));}assert.equal(S.attackRange(chimaera,target),8.5);chimaera.corrosiveBreath=0;assert.ok(S.restore(s));s.frame=2400;chimaera.hp=900;step(s,10);close(chimaera.hp,900.5);assert.equal(chimaera.mana,0);
}
console.log('PASS Chimaera upgrades: 17-sided primary dice, slot-specific Strength of the Wild, Reinforced Hides, night regeneration and zero mana');
{
 const {s,roost,chimaera}=chimaeraFixture(S);for(const mutate of [s=>s.chimaeraVersion=2,s=>delete s.chimaeraVersion,s=>s.teams[0].corrosiveBreath=2,s=>s.units.find(S.chimaeraUnit).corrosiveBreath=1,s=>s.units.find(S.chimaeraUnit).mana=1,s=>s.units.find(S.chimaeraUnit).damage=0,s=>s.units.find(u=>u.id===roost.id).queue=[{research:'Recb',rank:1,left:41}],s=>s.units.find(u=>u.id===roost.id).queue=[{kind:'chimaera',left:61}],s=>s.units.find(u=>u.kind==='ancientwind').queue=[{kind:'chimaera',left:1}],s=>s.units.find(u=>u.kind==='hero').corrosiveBreath=0]){const raw=S.clone(s);mutate(raw);assert.throws(()=>S.restore(raw));}
 const legacy=S.clone(s);legacy.units=legacy.units.filter(u=>!S.chimaeraUnit(u)&&u.kind!=='chimaeraroost');delete legacy.chimaeraVersion;delete legacy.teams[0].corrosiveBreath;delete legacy.teams[1].corrosiveBreath;assert.equal(S.restore(legacy).chimaeraVersion,0);
 const t=S.spawn(s,'tower',1,4,4,{damage:0});S.fire(s,chimaera,t);for(const mutate of [p=>p.weaponSlot=3,p=>p.weaponSlot=1,p=>delete p.corrosiveBreath,p=>p.art='chimaera-acid']){const raw=S.clone(s);mutate(raw.projectiles[0]);assert.throws(()=>S.restore(raw));}
}
console.log('PASS strict Chimaera saves: legacy version, research identities, invalid fields, producers, source timers and historical projectile slots');
{
 const {s,roost,chimaera}=chimaeraFixture(S),worker=S.spawn(s,'worker',0,8,12);assert.equal(cmd(s,worker,'build',{kind:'chimaeraroost',x:8,z:11}),null);const b=s.units.find(u=>u.kind==='chimaeraroost'&&u.id!==roost.id);assert.equal(s.teams[0].gold,9860);assert.equal(s.teams[0].wood,9810);step(s,100);assert.equal(worker.consumed,true);assert.ok(S.restore(s));step(s,800);assert.equal(b.built,1);assert.ok(!s.units.some(u=>u.id===worker.id));assert.equal(b.maxHp,1200);assert.equal(b.armorValue,5);assert.ok(S.restore(s));
 const target=S.spawn(s,'tower',1,5,4,{damage:0});assert.equal(cmd(s,chimaera,'attack',{target:target.id}),null);step(s,1);s.teams[0].corrosiveBreath=1;chimaera.corrosiveBreath=1;const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(s,saved);assert.equal(s.projectiles[0].weaponSlot,2);
 const soldier=S.spawn(s,'soldier',1,5,4,{damage:0});const raw=S.clone(s),u=raw.units.find(S.chimaeraUnit);u.weaponWindup={target:soldier.id,left:.1,weaponSlot:1};assert.throws(()=>S.restore(raw));
}
console.log('PASS source Roost construction: 140/190/80 payment, Wisp consumption, source stats, saved growth and locked slot-2 front swing across research completion');
