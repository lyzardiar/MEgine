// Author: MiYu. Ziggurat branches preserve supply, damage, ownership and persistent upgrade state.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
export function zigguratFixture(){const map=S.defaultMap();map.props=[];for(const field of ['terrain','heights','ramps','relief'])map[field].fill(0);map.players.forEach(p=>p.ai=false);const s=S.create('skirmish',{map,factions:[3,0],ai:[false,false]});s.units=s.units.filter(u=>u.kind==='hall');s.units.forEach(u=>u.damage=0);s.teams[0].gold=1000;s.teams[0].wood=500;return s;}
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const [kind,gold,wood,time,damage] of [['spirittower',145,40,35,29.5],['nerubiantower',100,20,30,9.5]]){
 const s=zigguratFixture(),u=S.spawn(s,'farm',0,0,0),id=u.id,cap=S.population(s,0).cap;u.hp=u.maxHp*.4;
 assert.equal(S.command(s,0,{type:'zigguratUpgrade',ids:[id],kind}),null);assert.equal(s.teams[0].gold,1000-gold);assert.equal(s.teams[0].wood,500-wood);
 assert.equal(S.population(s,0).cap,cap);assert.ok(S.command(s,0,{type:'zigguratUpgrade',ids:[id],kind}));assert.equal(s.teams[0].gold,1000-gold);
 step(s,time*10-1);assert.equal(u.kind,'farm');near(u.zigguratUpgrade.left,.1);const saved=S.restore(S.clone(s));assert.deepEqual(saved.units.find(v=>v.id===id).zigguratUpgrade,u.zigguratUpgrade);
 S.tick(s);S.tick(saved);const restored=saved.units.find(v=>v.id===id);for(const v of [u,restored]){assert.equal(v.kind,kind);assert.equal(v.id,id);assert.equal(v.maxHp,550);near(v.hp,220);assert.equal(v.damage,damage);assert.equal(v.zigguratUpgrade,undefined);}assert.equal(S.population(s,0).cap,cap);assert.ok(S.command(s,0,{type:'towerUpgrade',ids:[id]}));
 const originalGold=saved.teams[0].gold;assert.ok(S.command(saved,0,{type:'cancelZigguratUpgrade',ids:[id]}));assert.equal(saved.teams[0].gold,originalGold);
 const repair=S.repairCost(u);near(repair.gold/repair.hp,(S.types.farm.gold+gold)/550*.5);near(repair.wood/repair.hp,(S.types.farm.wood+wood)/550*.5);
}
for(const kind of ['spirittower','nerubiantower']){const s=zigguratFixture(),u=S.spawn(s,'farm',0,0,0),r=S.zigguratUpgrades[kind];assert.equal(S.command(s,0,{type:'zigguratUpgrade',ids:[u.id],kind}),null);assert.equal(S.command(s,0,{type:'cancelZigguratUpgrade',ids:[u.id]}),null);assert.equal(s.teams[0].gold,1000-r.gold+Math.floor(r.gold*.75));assert.equal(s.teams[0].wood,500-r.wood+Math.floor(r.wood*.75));assert.equal(u.kind,'farm');assert.equal(S.population(s,0).cap,20);}
for(const mutate of [s=>s.mode='td',s=>s.mode='moba',s=>s.teams[0].faction=0,s=>s.teams[0].gold=0,s=>s.teams[0].wood=0]){const s=zigguratFixture(),u=S.spawn(s,'farm',0,0,0);mutate(s);const before=[s.teams[0].gold,s.teams[0].wood];assert.ok(S.command(s,0,{type:'zigguratUpgrade',ids:[u.id],kind:'spirittower'}));assert.equal(u.zigguratUpgrade,undefined);assert.deepEqual([s.teams[0].gold,s.teams[0].wood],before);}
const invalid=zigguratFixture(),building=S.spawn(invalid,'farm',0,0,0),foreign=S.spawn(invalid,'farm',1,8,0);
for(const kind of ['bad','constructor','__proto__',null,[],{}])assert.ok(S.command(invalid,0,{type:'zigguratUpgrade',ids:[building.id],kind}));
assert.ok(S.command(invalid,0,{type:'zigguratUpgrade',ids:[foreign.id],kind:'nerubiantower'}));building.built=.5;assert.ok(S.command(invalid,0,{type:'zigguratUpgrade',ids:[building.id],kind:'nerubiantower'}));building.built=1;
const worker=S.spawn(invalid,'worker',0,-8,0);assert.match(S.command(invalid,0,{type:'build',ids:[worker.id],kind:'tower',x:-8,z:4}),/Upgrade a Ziggurat/);
assert.equal(S.command(invalid,0,{type:'zigguratUpgrade',ids:[building.id],kind:'nerubiantower'}),null);invalid.visible.forEach(v=>v.fill(1));assert.ok(S.publicState(invalid,0).units.find(u=>u.id===building.id).zigguratUpgrade);assert.equal(S.publicState(invalid,1).units.find(u=>u.id===building.id).zigguratUpgrade,undefined);
for(const mutate of [u=>u.zigguratUpgrade.kind='bad',u=>u.zigguratUpgrade.left=NaN,u=>u.zigguratUpgrade.left=31,u=>u.zigguratUpgrade.left=0,u=>u.kind='spirittower',u=>u.hp=0,u=>u.built=.5,u=>u.team=1]){const copy=S.clone(invalid);mutate(copy.units.find(u=>u.id===building.id));assert.throws(()=>S.restore(copy));}
for(const kind of ['spirittower','nerubiantower'])for(const targetKind of ['soldier','dragon']){
 const s=zigguratFixture(),u=S.spawn(s,kind,0,0,0),target=S.spawn(s,targetKind,1,6,0,{order:{type:'hold'},damage:0});assert.ok(S.canAttack(u,target));
 S.visibility(s);S.tick(s);assert.ok(s.projectiles.length);assert.equal(s.projectiles[0].art,kind==='spirittower'?'shadow':'frost');assert.equal(target.hp,target.maxHp);step(s,5);assert.ok(target.hp<target.maxHp);near(target.maxHp-target.hp,S.weaponDamage(u,target,u.damage));
 if(kind==='nerubiantower'){assert.ok(target.cold>4);near(S.moveRate(target),.5);near(S.attackRate(target),.75);const saved=S.restore(S.clone(s));near(saved.units.find(v=>v.id===target.id).cold,target.cold);s.units=s.units.filter(v=>v.id!==u.id);s.projectiles=[];step(s,51);near(target.cold,0);near(S.moveRate(target),1);near(S.attackRate(target),1);}else assert.ok(!target.cold);
}
const moving=zigguratFixture(),a=S.spawn(moving,'soldier',0,-10,0),b=S.spawn(moving,'soldier',0,-10,8,{cold:5});for(const u of [a,b])assert.equal(S.command(moving,0,{type:'move',ids:[u.id],x:10,z:u.z}),null);S.tick(moving);near(b.x+10,(a.x+10)*.5);
const attacking=zigguratFixture(),normal=S.spawn(attacking,'soldier',0,-10,0,{cd:1,order:{type:'hold'}}),chilled=S.spawn(attacking,'soldier',0,-10,8,{cd:1,cold:5,order:{type:'hold'}});S.tick(attacking);near(normal.cd,.9);near(chilled.cd,.925);
const malformed=S.clone(attacking);malformed.units.find(u=>u.id===chilled.id).cold=6;assert.throws(()=>S.restore(malformed),/caster effect/);
const purge=zigguratFixture(),shaman=S.spawn(purge,'shaman',0,-4,10),hero=S.spawn(purge,'hero',0,0,10,{cold:5});S.visibility(purge);assert.equal(S.command(purge,0,{type:'casterSpell',ids:[shaman.id],spell:'purge',target:hero.id}),null);assert.equal(hero.cold,0);
const dying=zigguratFixture(),zig=S.spawn(dying,'farm',0,0,0,{hp:1}),enemy=S.spawn(dying,'soldier',1,1,0,{damage:1000});assert.equal(S.command(dying,0,{type:'zigguratUpgrade',ids:[zig.id],kind:'nerubiantower'}),null);S.visibility(dying);step(dying,5);assert.equal(zig.hp,0);assert.equal(zig.zigguratUpgrade,undefined);
const respawn=S.create('moba',{ai:[false,false]}),fallen=respawn.units.find(u=>u.kind==='hero'&&u.team===0);fallen.hp=0;fallen.respawn=.1;fallen.cold=5;S.tick(respawn);assert.equal(fallen.hp,fallen.maxHp);assert.equal(fallen.cold,0);
const ai=zigguratFixture();ai.teams[0].ai=true;ai.frame=399;const defenses=[S.spawn(ai,'farm',0,-10,10),S.spawn(ai,'farm',0,-4,10)];S.tick(ai);assert.deepEqual(defenses.map(u=>u.zigguratUpgrade?.kind),['nerubiantower','spirittower']);
console.log('PASS Ziggurat: two timed branches, costs/refunds, supply and IDs, HP fraction, invalid commands/saves, private progress, actual projectile damage/anti-air, cold movement/cooldown/expiry and save roundtrip');
