// Author: MiYu. Source Rhac queues, paid clocks, building health policy, upgrades and saved continuation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),rules=S.humanMasonry,receipt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/human-masonry-sources.json',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
export const masonryStep=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const step=masonryStep,order=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra});
export function masonryFixture(options={}){const map=S.defaultMap();map.units=[];map.props=[];map.triggers=[];map.doodads=[];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);const s=S.create('skirmish',{map,factions:[0,0],ai:[false,false],...options});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});const hall=S.spawn(s,'hall',0,-12,0),mill=S.spawn(s,'lumbermill',0,-6,6),vault=S.spawn(s,'shop',0,0,0),worker=S.spawn(s,'worker',0,5,5,{order:{type:'hold'}});S.spawn(s,'hall',1,22,-22);S.visibility(s);return {s,hall,mill,vault,worker};}
for(const r of [...receipt.files,...receipt.sources.map(r=>({...r,path:r.localPath}))]){const b=fs.readFileSync(new URL('../samples/frostbound-realms/'+r.path,import.meta.url));assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);}assert.equal(sha(fs.readFileSync(new URL('./import-frost-human-masonry.py',import.meta.url))),receipt.generatorSha256);
assert.deepEqual(rules.levels.map(r=>[r.gold,r.wood,r.time,r.requires]),[[100,25,60,[]],[125,50,75,['hkee']],[150,75,90,['hcas']]]);assert.equal(rules.slot,1);
assert.equal(S.create().humanMasonryVersion,1);
{
 const {s,mill}=masonryFixture(),buildings=Object.entries(rules.bindings).map(([kind,id])=>({u:S.spawn(s,kind,0,10,10),r:rules.units[id]}));
 for(const {u,r} of buildings){assert.equal(u.maxHp,r.hp);assert.equal(u.armorValue,r.armorValue);assert.equal(S.unitType(u).armor,r.armor);assert.equal(S.buildingType(s,u.kind,0).gold,r.gold);assert.equal(S.buildingType(s,u.kind,0).wood,r.wood);assert.equal(S.buildingType(s,u.kind,0).time,r.time);}
 assert.equal(order(s,mill,'masonryResearch'),null);mill.queue[0].left=.1;step(s,1);for(const {u,r} of buildings){assert.equal(u.maxHp,r.hp+Math.floor(r.hp*.1+.5));assert.equal(u.armorValue,r.armorValue+r.armorPerRank);}assert.ok(S.restore(s));console.log('PASS Rhac: default new games and all implemented building bindings use source cost/time/HP/armor and research bonuses');
}
{
 const {s,hall,mill,vault}=masonryFixture(),other=S.spawn(s,'lumbermill',0,-14,9),enemy=S.spawn(s,'shop',1,12,12);vault.hp=243;assert.equal(s.humanMasonryVersion,1);assert.equal(vault.maxHp,485);assert.equal(S.unitType(vault).armor,'fortified');assert.equal(S.masonryResearchOption(s,mill).enabled,true);
 let hp=243,max=485;
 for(const rank of [1,2,3]){
  const r=rules.levels[rank-1];if(rank>1){assert.equal(S.masonryResearchOption(s,mill).enabled,false);assert.equal(order(s,hall,'tech'),null);step(s,S.mainBase(s,hall,rank).time*10);assert.equal(hall.upgradeTier,rank);}
  const gold=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(order(s,mill,'masonryResearch'),null);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood-r.wood);assert.ok(order(s,other,'masonryResearch'));assert.deepEqual(mill.queue[0],{research:'Rhac',rank,left:r.time});step(s,11);assert.equal(order(s,mill,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].wood,wood);
  assert.equal(order(s,mill,'masonryResearch'),null);step(s,17);const saved=S.restore(s);for(let i=0;i<r.time*10-18;i++){S.tick(s);S.tick(saved);}assert.deepEqual(s,saved);assert.equal(S.masonryRank(s,0),rank-1);S.tick(s);S.tick(saved);assert.deepEqual(s,saved);assert.equal(S.masonryRank(s,0),rank);max+=49;hp=Math.max(1,Math.floor(Math.fround(Math.fround(max*Math.fround(hp/(max-49)))+.5)));assert.equal(vault.maxHp,max);assert.equal(vault.hp,hp);assert.equal(S.armorValue(vault,s),5+rank);assert.equal(enemy.maxHp,485);assert.equal(enemy.masonryRank,0);
 }
 assert.equal(vault.maxHp,632);assert.equal(S.masonryResearchOption(s,mill),null);assert.ok(order(s,mill,'masonryResearch'));assert.equal(S.publicState(s,1).teams[0].masonryResearch,undefined);
 const fresh=S.spawn(s,'shop',0,8,-3);assert.equal(fresh.maxHp,631);assert.equal(fresh.hp,631);assert.equal(fresh.armorValue,8);assert.ok(S.restore(s));
 console.log('PASS Rhac: original hashes, three paid full clocks, tier prerequisites, refunds, duplicate blocking, retained life ratio/rounding, new/foreign buildings and frame-identical saves');
}
{
 const {s,mill,hall,worker}=masonryFixture();const scout=S.spawn(s,'scouttower',0,8,8);assert.equal(S.unitType(scout).armor,'light');assert.equal(scout.armorValue,0);assert.equal(S.buildingType(s,'farm',0).wood,20);assert.equal(S.buildingType(s,'altar',0).time,60);assert.equal(S.buildingType(s,'scouttower',0).time,25);assert.deepEqual(S.guardTowerUpgrade(s),{gold:70,wood:50,time:50});
 const gold=s.teams[0].gold,wood=s.teams[0].wood;scout.hp=150;assert.equal(order(s,scout,'guardTower'),null);assert.equal(s.teams[0].gold,gold-70);assert.equal(s.teams[0].wood,wood-50);assert.equal(order(s,scout,'cancelGuardTowerUpgrade'),null);assert.equal(s.teams[0].gold,gold-18);assert.equal(s.teams[0].wood,wood-13);assert.equal(order(s,scout,'guardTower'),null);
 assert.equal(order(s,mill,'masonryResearch'),null);mill.queue[0].left=.1;step(s,1);assert.equal(scout.maxHp,330);assert.equal(scout.hp,165);assert.equal(scout.armorValue,1);const resumed=S.restore(s);step(s,499);step(resumed,499);assert.deepEqual(s,resumed);assert.equal(scout.kind,'guardtower');assert.equal(scout.maxHp,550);assert.equal(scout.hp,275);assert.equal(scout.armorValue,6);assert.equal(S.unitType(scout).armor,'heavy');assert.ok(S.repairTarget(s,worker,scout));
 assert.equal(order(s,hall,'tech'),null);const oldMax=hall.maxHp,oldHp=hall.hp;step(s,S.mainBase(s,hall,2).time*10);assert.equal(hall.maxHp,rules.units.hkee.hp+Math.floor(rules.units.hkee.hp*.1+.5));assert.equal(hall.hp,oldHp+hall.maxHp-oldMax);assert.equal(hall.armorValue,6);assert.equal(S.unitType(hall).gold,rules.units.hkee.gold);assert.ok(S.restore(s));
 mill.hp=0;assert.ok(order(s,mill,'masonryResearch'));console.log('PASS Rhac: source building costs/armor, paid Scout-to-Guard 70/50/50s, 75% refund, concurrent masonry, damage ratio, repair and Keep transformation');
}
{
 const {s,mill,worker}=masonryFixture();assert.equal(order(s,worker,'build',{kind:'farm',x:10,z:5}),null);const farm=s.units.find(u=>u.kind==='farm');assert.ok(farm&&farm.built<1);assert.equal(order(s,mill,'masonryResearch'),null);mill.queue[0].left=.1;step(s,1);assert.equal(farm.maxHp,550);assert.equal(farm.masonryRank,1);assert.ok(S.restore(s));step(s,360);assert.equal(farm.built,1);assert.equal(farm.hp,550);
 const raw=S.clone(masonryFixture({humanMasonryVersion:0}).s);delete raw.humanMasonryVersion;for(const t of raw.teams)delete t.masonryResearch;for(const u of raw.units)for(const k of ['humanMasonrySource','masonryRank','masonryBonus'])delete u[k];assert.equal(S.restore(raw).humanMasonryVersion,0);
 for(const mutate of [s=>s.humanMasonryVersion=2,s=>s.teams[0].masonryResearch=4,s=>s.units.find(u=>u.id===mill.id).masonryBonus=-1,s=>{const u=s.units.find(u=>u.id===mill.id);delete u.humanMasonrySource;delete u.masonryRank;delete u.masonryBonus;},s=>s.units.find(u=>u.id===mill.id).masonryBonus=100]){const bad=S.clone(s);mutate(bad);assert.throws(()=>S.restore(bad),/Invalid saved/);}
 const a=masonryFixture();assert.equal(order(a.s,a.mill,'masonryResearch'),null);for(const mutate of [s=>s.units.find(u=>u.id===a.mill.id).queue[0].rank=3,s=>s.units.find(u=>u.id===a.mill.id).queue[0].left=61]){const bad=S.clone(a.s);mutate(bad);assert.throws(()=>S.restore(bad),/Invalid saved/);}
 for(const options of [{humanMasonryVersion:0},{humanArmyVersion:0}]){const a=masonryFixture(options);assert.equal(a.s.humanMasonryVersion,0);assert.equal(S.masonryResearchOption(a.s,a.mill),null);assert.ok(S.restore(a.s));}
 console.log('PASS Rhac: unfinished construction, legacy saves, malformed rank/queue/building rejection and feature isolation');
}
{
 const {s,hall,mill}=masonryFixture();assert.equal(order(s,hall,'tech'),null);step(s,S.mainBase(s,hall,2).time*10);assert.equal(order(s,mill,'lumberResearch'),null);assert.equal(order(s,mill,'masonryResearch'),null);step(s,30);assert.equal(mill.queue[1].left,60);assert.ok(S.restore(s));assert.equal(order(s,mill,'cancelTrain',{index:0}),null);assert.equal(mill.queue[0].research,'Rhac');step(s,600);assert.equal(S.masonryRank(s,0),1);assert.equal(S.masonryRank(s,1),0);
 assert.equal(order(s,mill,'masonryResearch'),null);S.spawn(s,'hall',0,-20,-10);hall.hp=0;S.visibility(s);const continued=S.restore(s);step(s,750);step(continued,750);assert.deepEqual(s,continued);assert.equal(S.masonryRank(s,0),2);
 for(const value of [-1,2,null,'1'])assert.throws(()=>S.create('skirmish',{humanMasonryVersion:value}),/masonry/);
 console.log('PASS Rhac: real shared Rhlh queue, waiting clocks, indexed refunds, prerequisite destruction and saved paid continuation');
}
