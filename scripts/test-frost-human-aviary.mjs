// Author: MiYu. Verify source Human Aviary production, upgrades, weapons and authoritative saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cloudTargetsFixture} from './frost-cloud-targets-fixture.mjs';
import {mortarFixture} from './frost-human-mortar-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),copy=o=>JSON.parse(JSON.stringify(o)),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},order=(s,u,type,rest={})=>S.command(s,u.team,{type,ids:[u.id],...rest}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){const f=mortarFixture(S);f.aviary=S.spawn(f.s,'gryphonaviary',0,-3,3);f.shop=S.spawn(f.s,'shop',0,-8,3);S.spawn(f.s,'lumbermill',0,-14,3);f.hall.upgradeTier=3;S.updateTechnology(f.s);return f;}
const flyer=(s,kind='humangryphon',x=0,z=0)=>S.spawn(s,kind,0,x,z,{order:{type:'hold'},cd:999});
assert.equal(S.PROTOCOL,121);assert.equal(S.create().humanAviaryVersion,1);assert.throws(()=>S.create('skirmish',{humanAviaryVersion:2}),/Aviary/);for(const mode of ['moba','rpg','td'])assert.equal(S.create(mode).humanAviaryVersion,0);
{
 const {s,hall,aviary,shop}=fixture();assert.deepEqual(S.trainable(s,aviary),['humangryphon','humandragonhawk']);hall.upgradeTier=2;assert.match(order(s,aviary,'train',{kind:'humangryphon'}),/Castle/);shop.hp=0;assert.match(order(s,aviary,'train',{kind:'humandragonhawk'}),/Vault/);shop.hp=485;hall.upgradeTier=3;
 assert.equal(order(s,aviary,'train',{kind:'humandragonhawk'}),null);assert.equal(order(s,aviary,'train',{kind:'humangryphon'}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9520,9900]);step(s,279);assert.equal(s.units.filter(S.aviaryUnit).length,0);const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(saved,s);const hawk=s.units.find(u=>u.kind==='humandragonhawk');assert.deepEqual([hawk.maxHp,hawk.damage,hawk.speed,hawk.mana,S.maxMana(hawk)],[575,19,3.5,150.075,300]);step(s,449);assert.equal(s.units.filter(S.aviaryUnit).length,1);S.tick(s);const gryphon=s.units.find(u=>u.kind==='humangryphon');assert.deepEqual([gryphon.maxHp,gryphon.damage,gryphon.speed,gryphon.mana],[825,50,3.2,0]);assert.equal(S.unitType(gryphon).flightHeight,2.4);
 assert.equal(order(s,aviary,'train',{kind:'humangryphon'}),null);assert.equal(order(s,aviary,'cancelTrain',{index:0}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9520,9900]);gryphon.hp=800;hawk.hp=550;hawk.mana=100;step(s,10);near(gryphon.hp,800.25);near(hawk.hp,550.25);near(hawk.mana,100.75);assert.ok(S.restore(s));
 for(const change of [r=>r.units.find(S.aviaryUnit).damage++,r=>r.humanAviaryVersion=0,r=>delete r.teams[0].humanAviary,r=>r.teams[0].humanAviary.Rhhb=2]){const raw=copy(s);change(raw);assert.throws(()=>S.restore(raw));}
 const legacy=mortarFixture(S).s;delete legacy.humanAviaryVersion;for(const t of legacy.teams)delete t.humanAviary;assert.equal(S.restore(legacy).humanAviaryVersion,0);
}
console.log('PASS Human Aviary: Castle/Vault training gates, original 28/45-second queue, exact payment/refund, flight/mana/regeneration and strict saves');
{
 const {s,hall,aviary}=fixture(),other=S.spawn(s,'gryphonaviary',0,8,6),u=flyer(s);hall.upgradeTier=2;assert.ok(order(s,aviary,'aviaryResearch',{upgrade:'Rhhb'}));hall.upgradeTier=3;assert.ok(order(s,aviary,'aviaryResearch',{upgrade:'__proto__'}));assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhhb'}),null);assert.ok(order(s,other,'aviaryResearch',{upgrade:'Rhhb'}));assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[9875,9775]);assert.equal(order(s,aviary,'cancelTrain',{index:0}),null);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],[10000,10000]);
 assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhhb'}),null);assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhcd'}),null);assert.equal(order(s,aviary,'train',{kind:'humangryphon'}),null);assert.equal(aviary.queue.length,3);step(s,449);const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(saved,s);assert.equal(u.stormHammers,1);assert.equal(S.unitType(u).spillDistance,2);step(s,350);assert.deepEqual(s.teams[0].humanAviary,{Rhhb:1,Rhcd:1});step(s,450);assert.ok(s.units.filter(S.aviaryUnit).every(v=>v.stormHammers===1));assert.equal(S.publicState(s,1).teams[0].humanAviary,undefined);
 const invalid=copy(s);invalid.teams[0].humanAviary.extra=0;assert.throws(()=>S.restore(invalid));
}
console.log('PASS Human Aviary research: shared three-slot queue, original costs/clocks, duplicate/refund rules, existing/future units and enemy privacy');
{
 const {s,smith}=fixture(),barracks=S.spawn(s,'barracks',0,-15,12),a=flyer(s),b=flyer(s,'humandragonhawk',3,0);assert.equal(order(s,barracks,'humanResearch',{upgrade:'Rhan'}),null);step(s,Math.round(barracks.queue[0].left/S.DT)-1);a.hp=412.5;b.hp=287.5;S.tick(s);assert.deepEqual([a.maxHp,b.maxHp],[975,725]);near(a.hp,488.025);near(b.hp,363.025);for(const key of ['Rhme','Rhla'])for(let rank=1;rank<=3;rank++){assert.equal(order(s,smith,'humanEquipmentResearch',{upgrade:key}),null);step(s,Math.round(smith.queue[0].left/S.DT));}assert.deepEqual([a.damage,a.armorValue,b.damage,b.armorValue],[68,6,25,7]);assert.deepEqual(a.humanEquipmentLevels,{Rhla:3,Rhme:3});assert.ok(S.restore(s));
}
console.log('PASS Human Aviary equipment: Animal War Training ratio rounding, source leather armor and per-weapon dice upgrades');
{
 const {s}=fixture(),a=flyer(s);a.cd=0;const ground=S.spawn(s,'humanrifleman',1,3,0,{order:{type:'hold'},cd:999});S.visibility(s);assert.equal(order(s,a,'attack',{target:ground.id}),null);step(s,8);assert.equal(s.projectiles.length,0);step(s,1);const p=s.projectiles.find(p=>p.source===a.id);assert.ok(p);assert.equal(p.weaponSlot,1);assert.ok(p.damage>=45&&p.damage<=55);assert.equal(p.art,'gryphon');const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(saved,s);const to=p.toX;ground.x+=2;S.tick(s);if(s.projectiles.includes(p))assert.equal(p.toX,to);step(s,8);assert.ok(ground.hp<535);assert.equal(a.aviaryAttackSlot,1);
 const air=S.spawn(s,'emberdrake',1,3,1,{order:{type:'hold'},cd:999});a.cd=0;assert.equal(order(s,a,'attack',{target:air.id}),null);step(s,9);assert.equal(a.aviaryAttackSlot,2);const shot=s.projectiles.find(p=>p.target===air.id);assert.ok(shot);assert.deepEqual([S.unitType(shot).missileSpeed,S.unitType(shot).missileArc,S.unitType(shot).missileHoming],[11,.15,false]);assert.equal(S.unitType(a,air).cooldown,2.4);const forged=copy(s);forged.projectiles.find(p=>p.target===air.id).weaponSlot='2';assert.throws(()=>S.restore(forged));
}
console.log('PASS Gryphon dual weapons: source windup/cooldown, dice, singleton nonhoming missile fields, moving primary damage and in-flight save authority');

{
 const {s}=fixture(),a=flyer(s,'humandragonhawk'),v=S.spawn(s,'emberdrake',1,3,0,{order:{type:'hold'},cd:999});a.cd=0;S.visibility(s);assert.equal(order(s,a,'attack',{target:v.id}),null);S.tick(s);assert.ok(a.weaponWindup);const saved=S.restore(s);for(let i=0;i<20;i++){S.tick(s);S.tick(saved);assert.deepEqual(saved,s);}assert.ok(v.hp<v.maxHp);
}
console.log('PASS Dragonhawk: attack windup save/reload and deterministic original homing projectile');
{
 const {s}=fixture(),a=flyer(s),v=S.spawn(s,'humanrifleman',1,3,0,{order:{type:'hold'},cd:999});S.visibility(s);assert.equal(order(s,v,'move',{x:12,z:0}),null);S.tick(s);assert.ok(v.aviaryMotion.x>0);assert.equal(S.fire(s,a,v),true);const p=s.projectiles.at(-1);assert.ok(p.toX>v.x);assert.equal(S.publicState(s,1).units.find(u=>u.id===v.id).aviaryMotion,undefined);const saved=S.restore(s);step(s,5);step(saved,5);assert.deepEqual(saved,s);const raw=copy(s);raw.units.find(u=>u.id===v.id).aviaryMotion.frame=s.frame+1;assert.throws(()=>S.restore(raw));
}
console.log('PASS Gryphon lead: real movement velocity, fixed predicted landing, private/validated motion and deterministic in-flight restore');

{
 const {s,aviary}=fixture();assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhhb'}),null);step(s,450);const a=flyer(s),v=S.spawn(s,'humanrifleman',1,3,0,{order:{type:'hold'},cd:999}),extra=S.spawn(s,'humanrifleman',1,5.2,0,{order:{type:'hold'},cd:999});S.visibility(s);S.fire(s,a,v);const p=s.projectiles.at(-1);assert.ok(p.aviaryLine);const endpoint=p.aviaryLine.x;assert.ok(endpoint>5);while(p.aviaryLine.phase===0&&s.projectiles.includes(p))S.tick(s);assert.ok(v.hp<v.maxHp);const hp=extra.hp;S.tick(s);assert.equal(extra.hp,hp);const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(saved,s);assert.ok(extra.hp<hp);assert.equal(p.toX,endpoint);assert.ok(S.restore(s));const raw=copy(s);if(raw.projectiles.length){raw.projectiles[0].aviaryLine.contacts=[-1];assert.throws(()=>S.restore(raw));}
}
console.log('PASS Storm Hammers: primary full hit, cached extension, delayed 0.2-second contact, spill damage and continuation restore');

{
 const {s,aviary}=fixture(),u=flyer(s,'humandragonhawk');assert.equal(S.aviarySpellOption(s,u,'Aclf').available,false);assert.ok(order(s,u,'aviarySpell',{spell:'Aclf',x:3,z:0}));assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhcd'}),null);step(s,350);u.mana=300;assert.equal(order(s,u,'aviarySpell',{spell:'Aclf',x:3,z:0}),null);S.tick(s);assert.ok(u.aviaryCast);let restored=S.restore(s);step(s,3);step(restored,3);assert.deepEqual(restored,s);assert.equal(u.mana,200);assert.equal(u.aviaryCooldowns.Aclf,20);assert.equal(u.aviaryChannel.left,30);assert.ok(S.publicState(s,0).aviaryClouds.length);restored=S.restore(s);step(s,10);step(restored,10);assert.deepEqual(restored,s);assert.equal(order(s,u,'stop'),null);assert.equal(u.aviaryChannel,undefined);assert.ok(u.aviaryCooldowns.Aclf>0);
 const v=S.spawn(s,'emberdrake',1,3,0,{order:{type:'hold'},cd:999});S.visibility(s);u.mana=150;assert.equal(order(s,u,'aviarySpell',{spell:'Amls',target:v.id}),null);step(s,4);near(u.mana,75.3);assert.ok(v.aviaryShackle);assert.equal(S.canAttack(v,u),false);assert.ok(order(s,v,'move',{x:6,z:0}));restored=S.restore(s);step(s,3);step(restored,3);assert.deepEqual(restored,s);const publicEnemy=S.publicState(s,1),visible=publicEnemy.units.find(v=>v.id===u.id);assert.equal(visible.aviaryChannel.target,undefined);assert.equal(visible.aviaryCooldowns,undefined);assert.ok(publicEnemy.units.find(x=>x.id===v.id).aviaryShackleLeft>0);assert.equal(order(s,u,'stop'),null);assert.equal(v.aviaryShackle,undefined);assert.ok(S.restore(s));
}
console.log('PASS Dragonhawk channel authority: research gate, castpoint, exact costs/cooldowns, paired disabling, stop cleanup, fog privacy and deterministic saves');

{
 const {s,aviary}=fixture();assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhhb'}),null);step(s,450);const a=flyer(s),primary=S.spawn(s,'humanrifleman',1,3,0,{order:{type:'hold'},cd:999}),ally=S.spawn(s,'humanrifleman',0,5.2,0,{order:{type:'hold'},cd:999}),enemy=S.spawn(s,'humanrifleman',1,5.2,.1,{order:{type:'hold'},cd:999});S.visibility(s);S.fire(s,a,primary);const p=s.projectiles.at(-1),raw=p.damage;while(p.aviaryLine.phase===0)S.tick(s);step(s,2);near(p.damage,raw*.64);near(enemy.maxHp-enemy.hp,S.weaponDamage(p,enemy,raw*.64,s));assert.equal(ally.hp,ally.maxHp);const invalid=copy(s);delete invalid.aviarySpatialSerial;assert.throws(()=>S.restore(invalid));const repeated=copy(s),cells=repeated.units.filter(u=>u.aviarySpatial?.length);cells[1].aviarySpatial[0][2]=cells[0].aviarySpatial[0][2];assert.throws(()=>S.restore(repeated));
}
console.log('PASS Storm Hammers spatial order: persistent source-sized grid, reverse contact notifications, rejected ally consumes attenuation, forged ordering rejected');

{
 const {s}=fixture(),u=flyer(s,'humandragonhawk'),v=S.spawn(s,'emberdrake',1,3,0,{order:{type:'hold'},cd:999});S.visibility(s);const hp=v.hp;assert.equal(order(s,u,'aviarySpell',{spell:'Amls',target:v.id}),null);step(s,4);assert.ok(u.aviaryChannel);near(v.hp,hp);S.tick(s);near(hp-v.hp,30);step(s,9);near(hp-v.hp,30);const saved=S.restore(s);S.tick(s);S.tick(saved);near(hp-v.hp,60);assert.deepEqual(saved,s);v.hp=1;step(s,9);assert.equal(v.hp,1);S.tick(s);assert.equal(v.hp,0);assert.equal(u.aviaryChannel,undefined);assert.equal(v.aviaryShackle,undefined);assert.ok(S.restore(s));
}
console.log('PASS Aerial Shackles native cadence: .01s first event quantized to next step, 30 damage per 1-second pulse, no damage between pulses, saved boundary and lethal cleanup');
{
 const {s}=fixture(),u=flyer(s,'humandragonhawk'),v=S.spawn(s,'emberdrake',1,3,0,{order:{type:'hold'},cd:999});S.visibility(s);assert.equal(order(s,u,'aviarySpell',{spell:'Amls',target:v.id}),null);step(s,4);let pulses=0;for(let i=1;i<=400;i++){v.hp=v.maxHp;const hp=v.hp;S.tick(s);const damage=hp-v.hp;assert.equal(damage,i%10===1?30:0);if(damage)pulses++;if(i===207){const restored=S.restore(s);step(s,3);step(restored,3);assert.deepEqual(restored,s);i+=3;}}assert.equal(pulses,40);assert.equal(u.aviaryChannel,undefined);assert.equal(v.aviaryShackle,undefined);assert.ok(S.restore(s));
}
console.log('PASS Aerial Shackles full duration: exactly 40 source pulses over 40 seconds, no expiry pulse and deterministic mid-gap reload');

{
 const {s,aviary}=fixture();assert.equal(order(s,aviary,'aviaryResearch',{upgrade:'Rhcd'}),null);step(s,350);const a=flyer(s,'humandragonhawk',0,0),b=flyer(s,'humandragonhawk',0,1),tower=S.spawn(s,'guardtower',1,4,0,{cd:999}),ally=S.spawn(s,'guardtower',0,4,1,{cd:999}),soldier=S.spawn(s,'humanrifleman',1,4,-1,{order:{type:'hold'},cd:999});S.visibility(s);assert.equal(order(s,a,'aviarySpell',{spell:'Aclf',x:4,z:0}),null);assert.equal(order(s,b,'aviarySpell',{spell:'Aclf',x:4,z:0}),null);step(s,4);assert.equal(tower.aviaryClouded,true);assert.equal(ally.aviaryClouded,true);assert.equal(soldier.aviaryClouded,undefined);assert.equal(S.canAttack(tower,a),false);assert.equal(S.fire(s,tower,a),false);const saved=S.restore(s);step(s,3);step(saved,3);assert.deepEqual(saved,s);assert.equal(order(s,a,'stop'),null);assert.equal(tower.aviaryClouded,true);assert.equal(order(s,b,'stop'),null);assert.equal(tower.aviaryClouded,undefined);assert.equal(S.canAttack(tower,a),true);const raw=copy(s);raw.units.find(u=>u.id===tower.id).aviaryClouded=true;assert.throws(()=>S.restore(raw));
}
console.log('PASS Cloud: source ranged restriction/structure targets, mobile-unit exclusion, overlapping sources, immediate interruption cleanup and strict save');

{
 const {s,caster,ward,tower,ally}=cloudTargetsFixture(S);assert.equal(order(s,caster,'aviarySpell',{spell:'Aclf',x:3,z:0}),null);step(s,4);assert.equal(tower.aviaryClouded,true);assert.equal(ally.aviaryClouded,true);assert.equal(ward.aviaryClouded,undefined);assert.equal(S.canAttack(ward,caster),true);assert.equal(S.canAttack(tower,caster),false);
 const saved=S.restore(s),raw=copy(s);raw.units.find(u=>u.id===ward.id).aviaryClouded=true;assert.throws(()=>S.restore(raw),/Cloud/);step(s,3);step(saved,3);assert.deepEqual(saved,s);
 ward.cd=0;ward.order={type:'attack',target:caster.id};const hp=caster.hp;step(s,12);assert.ok(caster.hp<hp);assert.equal(tower.aviaryClouded,true);assert.equal(ward.aviaryClouded,undefined);for(const team of [0,1])assert.equal(S.publicState(s,team).units.find(u=>u.id===ward.id).aviaryClouded,undefined);assert.ok(S.restore(s));
}
console.log('PASS Cloud target categories: both-side buildings silenced, Serpent Ward keeps firing, reload preserves exclusions and forged ward restriction rejected');
