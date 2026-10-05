// Author: MiYu. Racial main-base construction, repair, combat and versioned saves.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function arena(faction=0){const map=S.defaultMap();for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.props=[];map.units=[];map.triggers=[];const s=S.create('skirmish',{map,factions:[faction,0],ai:[false,false]});s.units=[];s.teams[0].gold=10000;s.teams[0].wood=10000;S.spawn(s,'hall',0,-24,24);S.spawn(s,'hall',1,24,-24);S.visibility(s);return s;}
function foundation(f){const s=arena(f),w=S.spawn(s,'worker',0,-3.5,0);assert.equal(S.command(s,0,{type:'build',ids:[w.id],kind:'hall',x:0,z:0}),null);return {s,w,b:s.units.at(-1)};}
const costs=[[385,205,180,1500],[385,185,150,1500],[340,185,120,1300],[255,0,100,1500]];
for(let f=0;f<4;f++){
 const poor=arena(f),builder=S.spawn(poor,'worker',0,-3.5,0);poor.teams[0].gold=costs[f][0]-1;const unpaid=S.clone(poor);assert.match(S.command(poor,0,{type:'build',ids:[builder.id],kind:'hall',x:0,z:0}),/Not enough resources/);assert.deepEqual(poor,unpaid);
 const {s,w,b}=foundation(f),[gold,wood,time,hp]=costs[f];assert.deepEqual([10000-s.teams[0].gold,10000-s.teams[0].wood,b.maxHp],[gold,wood,hp]);assert.equal(b.baseFaction,f);assert.equal(b.baseRules,1);step(s,10);const restored=S.restore(s);step(s,time/S.DT-11);step(restored,time/S.DT-11);assert.ok(b.built<1,'full build duration '+f);S.tick(s);S.tick(restored);assert.equal(b.built,1);near(b.hp,b.maxHp);assert.deepEqual(s.units,restored.units);assert.deepEqual(s.teams,restored.teams);assert.equal(s.units.some(u=>u.id===w.id),f!==2,'consumed wisp');assert.equal(w.inside,undefined);
 const canceled=foundation(f);step(canceled.s,10);const money=canceled.s.teams[0].gold,lumber=canceled.s.teams[0].wood;assert.equal(S.command(canceled.s,0,{type:'cancelBuild',ids:[canceled.b.id]}),null);assert.equal(canceled.s.teams[0].gold,money+Math.floor(gold*.75));assert.equal(canceled.s.teams[0].wood,lumber+Math.floor(wood*.75));assert.ok(canceled.w.hp>0&&!canceled.w.inside);assert.doesNotThrow(()=>S.restore(canceled.s));
 const repair=arena(f),base=S.spawn(repair,'hall',0,0,0,{hp:hp-100}),worker=S.spawn(repair,'worker',0,-3.5,0);const rc=S.repairCost(base);near(rc.hp,hp*S.DT/(time*1.5));assert.equal(S.command(repair,0,{type:'repair',ids:[worker.id],target:base.id}),null);step(repair,Math.ceil(100/rc.hp)+2);near(base.hp,hp);near(10000-repair.teams[0].gold,gold*100/hp*.5);near(10000-repair.teams[0].wood,wood*100/hp*.5);
}
{
 const {s,w,b}=foundation(0);step(s,20);assert.equal(S.command(s,0,{type:'stop',ids:[w.id]}),null);const progress=b.built;step(s,50);assert.equal(b.built,progress);assert.equal(S.command(s,0,{type:'construct',ids:[w.id],target:b.id}),null);const helper=S.spawn(s,'worker',0,3.5,0);assert.equal(S.command(s,0,{type:'construct',ids:[helper.id],target:b.id}),null);const money=s.teams[0].gold,lumber=s.teams[0].wood;step(s,20);near(b.built-progress,20*S.DT/180*1.6*.99);near(money-s.teams[0].gold,385*20*S.DT/180*.6);near(lumber-s.teams[0].wood,205*20*S.DT/180*.6);assert.doesNotThrow(()=>S.restore(s));
}
for(let f=0;f<4;f++)for(let tier=1;tier<=3;tier++){
 const s=arena(f),b=S.spawn(s,'hall',0,0,0,{upgradeTier:tier}),v=S.spawn(s,'soldier',1,0,f===2?4:7,{damage:0,order:{type:'hold'}}),d=S.unitType(b);S.visibility(s);assert.equal(b.armorValue,f===2?2:5);const expected=S.weaponDamage(b,v,b.damage);S.tick(s);
 if(f<2||f===3&&tier===1){assert.equal(b.damage,0);assert.equal(v.hp,v.maxHp);assert.equal(s.projectiles.length,0);assert.ok(!S.canAttack(b,v));}
 else if(f===2){assert.equal(b.damage,[45.5,54.5,67][tier-1]);assert.equal(d.cooldown,2.5);assert.equal(S.projectileSpeed(b),0);near(v.maxHp-v.hp,expected);assert.equal(s.projectiles.length,0);const air=S.spawn(s,'dragon',1,0,3,{damage:0});assert.ok(!S.canAttack(b,air));v.x=0;v.z=6;b.cd=0;const before=v.hp;S.tick(s);assert.equal(v.hp,before,'tree cannot reach distant ground target');}
 else {assert.equal(b.damage,tier===2?11.5:14);assert.equal(d.cooldown,1);assert.equal(s.projectiles[0].art,'frost');assert.equal(s.projectiles[0].baseFaction,3);assert.equal(v.hp,v.maxHp);b.cd=99;const saved=S.restore(s);step(s,5);step(saved,5);near(v.maxHp-v.hp,expected);assert.ok(v.cold>4);assert.deepEqual(s.units,saved.units);const air=S.spawn(s,'dragon',1,0,6,{damage:0,order:{type:'hold'}});b.cd=0;b.order={type:'attack',target:air.id};S.visibility(s);step(s,6);assert.ok(air.hp<air.maxHp&&air.cold>4);}
 assert.doesNotThrow(()=>S.restore(s));
}
{
 const s=arena(2),b=S.spawn(s,'hall',0,0,0),v=S.spawn(s,'soldier',1,0,7,{order:{type:'attack',target:b.id}});S.visibility(s);step(s,40);assert.ok(b.hp<b.maxHp&&v.hp<v.maxHp,'rooted tree reaches approaching melee unit');
}
{
 const s=arena(2),tree=S.spawn(s,'hall',0,0,0),v=S.spawn(s,'soldier',1,0,4,{damage:0});s.map.terrain[S.index(0,2)]=1;assert.ok(!S.attackClear(s,tree,v),'footprint reach remains melee over water');const h=S.spawn(s,'hero',0,0,0,{heroClass:2,inventory:[23]}),air=S.spawn(s,'dragon',1,0,4);assert.ok(S.attackClear(s,h,air),'orb-enabled air attack preserves ranged terrain semantics');
}
for(const destroyed of [false,true]){
 const s=arena(3),b=S.spawn(s,'hall',0,0,0,{upgradeTier:2}),v=S.spawn(s,'soldier',1,0,7,{damage:0,order:{type:'hold'}});S.visibility(s);S.tick(s);const p=S.clone(s.projectiles[0]),hp=v.hp;if(destroyed){b.hp=0;s.units=s.units.filter(u=>u.id!==b.id);}else {b.baseFaction=0;b.upgradeTier=3;b.damage=0;}const copy=S.restore(s);step(s,5);step(copy,5);near(hp-v.hp,S.weaponDamage(p,v,p.damage));assert.ok(v.cold>4,'launch snapshot retains frost');assert.deepEqual(s.units,copy.units);
}
{
 const {s,w,b}=foundation(0);delete s.baseRulesVersion;for(const u of s.units)if(u.kind==='hall'){delete u.baseRules;delete u.baseFaction;delete u.armorValue;u.damage=20;u.maxHp=2200;u.hp=u.built<1?220:2200;}b.construction.paidGold=350;b.construction.paidWood=150;const legacy=S.restore(s),old=legacy.units.find(u=>u.id===b.id);assert.equal(old.baseRules,0);assert.equal(S.unitType(old),S.types.hall);const copy=S.restore(legacy);step(legacy,150);step(copy,150);assert.equal(old.built,1);assert.deepEqual(legacy.units,copy.units);assert.equal(S.unitType(old).time,15);const fresh=S.spawn(legacy,'hall',0,10,10);assert.equal(fresh.baseRules,1);assert.equal(fresh.maxHp,1500);
 const migrant=arena(3),source=S.spawn(migrant,'hall',0,0,0,{baseRules:0}),target=S.spawn(migrant,'soldier',1,0,7,{damage:0,order:{type:'hold'}});S.visibility(migrant);S.tick(migrant);delete migrant.baseRulesVersion;for(const u of migrant.units)if(u.kind==='hall'){delete u.baseRules;delete u.baseFaction;}for(const p of migrant.projectiles){delete p.baseRules;delete p.baseFaction;delete p.upgradeTier;}source.cd=99;const restored=S.restore(migrant);step(restored,5);assert.ok(restored.units.find(u=>u.id===target.id).hp<target.hp);assert.ok(!restored.units.find(u=>u.id===target.id).cold,'legacy shot retains generic attack');
}
for(const edit of [s=>s.baseRulesVersion=2,s=>s.units[0].baseRules=2,s=>s.units[0].baseFaction=4,s=>delete s.units[0].baseFaction,s=>s.units[0].upgradeTier=0,s=>s.units[0].armorValue=NaN]){const bad=arena();edit(bad);assert.throws(()=>S.restore(bad));}
{
 const s=arena(3),b=S.spawn(s,'hall',0,0,0,{upgradeTier:2}),v=S.spawn(s,'soldier',1,0,7,{damage:0});S.visibility(s);S.tick(s);for(const edit of [p=>p.baseFaction=-1,p=>p.upgradeTier=1,p=>p.baseRules=5,p=>{delete p.baseRules;}]){const bad=S.clone(s);edit(bad.projectiles[0]);assert.throws(()=>S.restore(bad));}
}
console.log('PASS main-base rules: four racial costs/full construction times, occupants/cancellation/repair, worker pause/paid assistance, rooted tree melee/armor, passive Human/Orc/Necropolis, ground-air frost and launch snapshots, deterministic saves and legacy construction/projectiles');
