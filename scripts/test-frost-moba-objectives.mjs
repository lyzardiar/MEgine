// Author: MiYu. Objective progression, persistent destruction, reinforcement and fog-safe public state.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const game=()=>S.create('moba',{ai:[false,false]}),step=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);};
const objective=(s,team,role,lane=-1,tier=0)=>s.units.find(u=>u.team===team&&u.mobaObjective?.role===role&&u.mobaObjective.lane===lane&&u.mobaObjective.tier===tier);
function kill(s,u){const hero=s.units.find(v=>v.kind==='hero'&&v.team===1-u.team);hero.damage=100000;hero.x=u.x+.2;hero.z=u.z;S.fire(s,hero,u);step(s);assert.equal(u.hp,0,'real attack settles unprotected objective');}
function lane(s,team,n){for(let tier=1;tier<=3;tier++)kill(s,objective(s,team,'tower',n,tier));}
{
  const s=game();const buildings=s.units.filter(u=>u.mobaObjective);for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++)assert.ok(S.distance(buildings[i],buildings[j])>=S.types[buildings[i].kind].radius+S.types[buildings[j].kind].radius,'objective footprints do not overlap');assert.equal(s.mobaObjectives.length,36);for(const team of [0,1]){
    assert.equal(s.units.filter(u=>u.team===team&&u.mobaObjective&&!u.mobaProtected).length,3);
    for(let n=0;n<3;n++){const a=objective(s,0,'tower',n,1),b=objective(s,1,'tower',2-n,1);assert.equal(a.x,-b.x);assert.equal(a.z,-b.z);}
  }
  const ancient=objective(s,1,'ancient'),t2=objective(s,1,'tower',1,2),t3=objective(s,1,'tower',1,3),melee=objective(s,1,'melee',1),ranged=objective(s,1,'ranged',1),hero=s.units.find(u=>u.team===0&&u.kind==='hero');hero.damage=100000;
  for(const u of [ancient,t2,t3,melee,ranged]){const hp=u.hp;S.fire(s,hero,u);assert.equal(u.hp,hp);assert.equal(S.canAttack(hero,u),false);}
  kill(s,objective(s,1,'tower',1,1));assert.equal(t2.mobaProtected,false);assert.equal(t3.mobaProtected,true);
  kill(s,t2);assert.equal(t3.mobaProtected,false);kill(s,t3);assert.equal(melee.mobaProtected,false);assert.equal(ranged.mobaProtected,false);assert.equal(ancient.mobaProtected,true);
  const t4=s.units.filter(u=>u.team===1&&u.mobaObjective?.tier===4);assert.ok(t4.every(u=>!u.mobaProtected));kill(s,t4[0]);assert.equal(ancient.mobaProtected,true);kill(s,t4[1]);assert.equal(ancient.mobaProtected,false);
  const extraHall=S.spawn(s,'hall',1,0,-20);kill(s,extraHall);assert.equal(s.winner,null,'only the registered ancient decides the match');kill(s,ancient);assert.equal(s.winner,0);assert.ok(S.restore(s));
}
{
  const s=game();s.nextWave=1;step(s);const existing=s.units.filter(u=>u.team===0&&u.lane===1&&S.types[u.kind].laneCreep).map(u=>({id:u.id,maxHp:u.maxHp,damage:u.damage}));
  lane(s,1,1);kill(s,objective(s,1,'melee',1));step(s);
  assert.ok(!s.units.some(u=>u.team===1&&u.mobaObjective?.role==='melee'&&u.mobaObjective.lane===1),'dead barracks removed from unit list');
  const before=s.serial;s.nextWave=s.frame+1;step(s);const born=s.units.filter(u=>u.id>before&&S.types[u.kind].laneCreep);assert.equal(born.length,24);
  for(const u of born){const rank=u.team===0&&u.lane===1&&u.kind==='creep'?1:0;assert.equal(u.mobaReinforcement,rank);assert.equal(u.maxHp,S.types[u.kind].hp*(rank?1.5:1));}
  for(const old of existing){const u=s.units.find(u=>u.id===old.id);assert.equal(u.maxHp,old.maxHp);assert.equal(u.damage,old.damage);}
  for(const n of [0,2])lane(s,1,n);for(const u of s.units.filter(u=>u.team===1&&['melee','ranged'].includes(u.mobaObjective?.role)&&u.hp>0))kill(s,u);
  const serial=s.serial;s.nextWave=s.frame+1;step(s);assert.equal(s.units.filter(u=>u.id>serial&&u.team===0&&u.mobaReinforcement===2).length,12);
  const restored=S.restore(s);for(let i=0;i<120;i++){step(s);step(restored);assert.deepEqual(restored.units,s.units);assert.deepEqual(restored.mobaObjectives,s.mobaObjectives);assert.deepEqual(restored.projectiles,s.projectiles);}
  for(const team of [0,1]){const view=S.publicState(s,team);assert.deepEqual(view.mobaObjectives,s.mobaObjectives);assert.ok(view.units.length<s.units.length);for(const u of view.units.filter(u=>u.mobaObjective))assert.equal(u.mobaProtected,s.units.find(v=>v.id===u.id).mobaProtected);}
}
{
  const s=game(),reject=edit=>{const bad=structuredClone(s);edit(bad);assert.throws(()=>S.restore(bad),/MOBA/);};
  reject(v=>v.mobaObjectives[1].id=v.mobaObjectives[0].id);reject(v=>v.mobaObjectives.pop());reject(v=>v.mobaObjectives[0].team=3);reject(v=>v.mobaObjectives[0].alive=false);reject(v=>v.units.find(u=>u.mobaProtected).mobaProtected=false);reject(v=>v.units=v.units.filter(u=>u.id!==v.mobaObjectives[0].id));reject(v=>v.mobaObjectivesVersion=0);reject(v=>v.mobaObjectivesVersion=2);
  const old=S.create('moba',{mobaObjectivesVersion:0,ai:[false,false]});delete old.mobaObjectivesVersion;const restored=S.restore(old);assert.equal(restored.mobaObjectivesVersion,0);assert.equal(restored.units.filter(u=>u.kind==='tower').length,12);assert.ok(!restored.units.some(u=>u.mobaProtected));
}
globalThis.Frost=S;globalThis.FrostArt=createRequire(import.meta.url)('../samples/frostbound-realms/model-catalog.json');const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
{const s=game();for(const u of s.units.filter(u=>u.mobaObjective)){const m=V.model(s,u);assert.ok(m.asset);assert.equal(m.key,S.mobaObjectives.model(u));assert.ok(m.scale>0);assert.equal(V.name(s,u),S.mobaObjectives.label(u));}}
assert.ok(V.projectile('arrow'));
console.log('PASS MOBA 36 objectives, protected real damage, lane/T4/ancient progression, future-only lane and mega buffs, fog-safe manifest, 120 restore ticks, invalid-save rejection, legacy layout and objective models');
