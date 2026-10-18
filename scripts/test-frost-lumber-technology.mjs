// Author: MiYu. Original two-rank Rhlh payment, shared queues, capacity, saves and ownership.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {lumberFixture} from './test-frost-worker-lumber.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),rules=S.lumberTechnology,manifest=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/lumber-technology-sources.json',import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},command=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra});
for(const r of manifest.files){const raw=fs.readFileSync(new URL('../samples/frostbound-realms/'+r.path,import.meta.url));assert.equal(raw.length,r.bytes);assert.equal(sha(raw),r.sha256);}assert.equal(sha(fs.readFileSync(new URL('./import-frost-lumber-technology.py',import.meta.url))),manifest.generatorSha256);
export function lumberTechnologyFixture(options={}){const {s,worker,hall,tree}=lumberFixture(0,options),mill=S.spawn(s,'lumbermill',0,-7,7);S.visibility(s);return {s,worker,hall,tree,mill};}
assert.deepEqual(rules.levels.map(r=>[r.gold,r.wood,r.time,r.bonus,r.requires]),[[100,0,60,10,['hkee']],[200,0,75,20,['hcas']]]);
{
 const {s,worker,hall,mill}=lumberTechnologyFixture(),other=S.spawn(s,'lumbermill',0,-15,8);assert.equal(s.lumberTechnologyVersion,1);assert.equal(S.lumberRank(s,0),0);assert.equal(S.lumberResearchOption(s,mill).enabled,false);assert.ok(command(s,mill,'lumberResearch'));hall.upgradeTier=2;S.updateTechnology(s);
 for(const rank of [1,2]){
  const r=rules.levels[rank-1];if(rank===2){assert.equal(S.lumberResearchOption(s,mill).enabled,false);hall.upgradeTier=3;S.updateTechnology(s);}const gold=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(command(s,mill,'lumberResearch'),null);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood);assert.deepEqual(mill.queue[0],{research:'Rhlh',rank,left:r.time});assert.ok(command(s,other,'lumberResearch'));
  step(s,13);assert.equal(command(s,mill,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,gold);assert.equal(S.lumberRank(s,0),rank-1);assert.equal(command(s,mill,'lumberResearch'),null);step(s,17);const saved=S.restore(s);for(let i=0;i<r.time*10-18;i++){S.tick(s);S.tick(saved);assert.deepEqual(s,saved);}assert.equal(S.lumberRank(s,0),rank-1);S.tick(s);S.tick(saved);assert.deepEqual(s,saved);assert.equal(S.lumberRank(s,0),rank);assert.equal(mill.queue.length,0);assert.equal(S.lumberHarvester(s,worker).capacity,10+r.bonus);assert.equal(S.lumberHarvester(s,worker).damage,1);
  const trained=S.spawn(s,'worker',0,-2,2);assert.equal(S.lumberHarvester(s,trained).capacity,10+r.bonus);
 }
 assert.equal(S.lumberResearchOption(s,mill),null);assert.ok(command(s,mill,'lumberResearch'));assert.equal(S.lumberHarvester(s,S.spawn(s,'worker',1,10,10)).capacity,10);assert.ok(S.restore(s));
 const pub=S.publicState(s,1);assert.equal(pub.teams[0].lumberResearch,undefined);
 console.log('PASS Rhlh: source hashes, Keep/Castle, 100/200 payment, 60/75s exact completion, refund, duplicate prevention, both ranks, existing/new/foreign workers and saved continuation');
}
for(const rank of [0,1,2]){
 const {s,worker,hall,tree}=lumberTechnologyFixture();s.teams[0].lumberResearch=rank;hall.hp=0;command(s,worker,'gather',{resource:0});step(s,6);assert.equal(worker.cargo,1);assert.equal(tree.hp,49);assert.equal(tree.amount,599);const capacity=10+rank*10;step(s,capacity*11);assert.equal(worker.cargo,capacity);assert.equal(worker.order.type,'returnResources');assert.equal(tree.hp,50-capacity);assert.ok(S.restore(s));
}
{
 const {s,worker,hall,mill}=lumberTechnologyFixture();hall.upgradeTier=2;S.updateTechnology(s);worker.cargo=10;worker.cargoKind='tree';worker.order={type:'returnResources',resource:0};command(s,mill,'lumberResearch');mill.queue[0].left=.1;step(s,1);assert.equal(worker.order.type,'returnResources');assert.equal(S.lumberHarvester(s,worker).capacity,20);assert.equal(worker.cargo,10);assert.ok(S.restore(s));
 const a=lumberTechnologyFixture();a.hall.upgradeTier=2;S.updateTechnology(a.s);command(a.s,a.mill,'lumberResearch');a.mill.hp=0;step(a.s,1);assert.equal(S.lumberRank(a.s,0),0);
 const d=lumberTechnologyFixture();d.hall.upgradeTier=2;S.spawn(d.s,'hall',0,-15,-10);S.updateTechnology(d.s);command(d.s,d.mill,'lumberResearch');d.hall.hp=0;S.visibility(d.s);const continued=S.restore(d.s);for(let i=0;i<10;i++){S.tick(d.s);S.tick(continued);assert.deepEqual(d.s,continued);}assert.ok(d.mill.queue[0].left<60);assert.equal(S.lumberRank(d.s,0),0);
 const b=lumberTechnologyFixture();b.hall.upgradeTier=2;S.updateTechnology(b.s);command(b.s,b.mill,'lumberResearch');for(const mutate of [s=>s.teams[0].lumberResearch=3,s=>{s.teams[1].faction=1;s.teams[1].lumberResearch=1;},s=>s.lumberTechnologyVersion=0,s=>s.units.find(u=>u.id===b.mill.id).queue[0].rank=2,s=>s.units.find(u=>u.id===b.mill.id).queue[0].left=61]){const raw=S.clone(b.s);mutate(raw);assert.throws(()=>S.restore(raw),/lumber/);}
}
for(const options of [{lumberTechnologyVersion:0},{lumberHarvestVersion:0},{workerBalanceVersion:0},{economyVersion:0},{humanArmyVersion:0}]){const {s,mill}=lumberTechnologyFixture(options);assert.equal(s.lumberTechnologyVersion,0);assert.equal(S.lumberResearchOption(s,mill),null);assert.ok(command(s,mill,'lumberResearch'));const raw=S.clone(s);delete raw.lumberTechnologyVersion;for(const t of raw.teams)delete t.lumberResearch;assert.equal(S.restore(raw).lumberTechnologyVersion,0);}
for(const value of [-1,2,null,'1'])assert.throws(()=>S.create('skirmish',{lumberTechnologyVersion:value}),/lumber technology/);
console.log('PASS Rhlh: capacity 10/20/30, unchanged strike damage/interval, in-flight cargo, destruction, private rank, malformed saves and legacy dependency isolation');
