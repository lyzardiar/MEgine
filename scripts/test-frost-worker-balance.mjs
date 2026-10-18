// Author: MiYu. Original worker balance, full paid training, legacy saves and deterministic continuation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),rules=require('../samples/frostbound-realms/worker-balance.json'),manifest=require('../samples/frostbound-realms/worker-balance-sources.json');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
assert.equal(sha(fs.readFileSync(new URL('../samples/frostbound-realms/'+manifest.source.localPath,import.meta.url))),manifest.source.sha256);
assert.equal(sha(fs.readFileSync(new URL('../samples/frostbound-realms/worker-balance.json',import.meta.url))),manifest.profileSha256);
export function workerFixture(faction=0,options={}){
 const map=S.defaultMap();map.units=[];map.props=[];map.triggers=[];map.doodads=[];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);
 const s=S.create('skirmish',{map,factions:[faction,0],ai:[false,false],...options});s.units=[];
 const hall=S.spawn(s,'hall',0,-20,20);S.spawn(s,'hall',1,20,-20);const worker=S.spawn(s,'worker',0,-12,12);S.visibility(s);return {s,hall,worker};
}
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},command=(s,u,type,extra={})=>S.command(s,0,{type,ids:[u.id],...extra});
for(const [faction,source] of [[0,'hpea'],[1,'opeo'],[3,'uaco']]){
 const r=rules.units[source],{s,hall,worker}=workerFixture(faction),d=S.unitType(worker);
 assert.equal(worker.workerBalance,source);for(const key of ['hp','speed','armorValue'])assert.equal(worker[key],r[key]);assert.equal(worker.maxHp,r.hp);assert.equal(d.armor,r.armor);assert.equal(worker.mana,0);assert.equal(S.maxMana(worker),0);
 const gold=s.teams[0].gold;assert.equal(command(s,hall,'train',{kind:'worker'}),null);assert.equal(s.teams[0].gold,gold-75);assert.equal(hall.queue[0].left,15);assert.equal(command(s,hall,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,gold);
 command(s,hall,'train',{kind:'worker'});step(s,75);const continued=S.restore(s);step(s,74);step(continued,74);assert.equal(hall.queue.length,1);assert.deepEqual(s,continued);step(s,1);step(continued,1);assert.deepEqual(s,continued);assert.equal(hall.queue.length,0);
 const trained=s.units.find(u=>u.kind==='worker'&&u.id!==worker.id);assert.ok(trained);assert.equal(trained.maxHp,r.hp);assert.equal(trained.speed,r.speed);assert.equal(trained.workerBalance,source);assert.equal(trained.mana,0);assert.equal(S.population(s,0).used,2);assert.ok(S.restore(s));
 worker.hp=100;step(s,10);assert.ok(Math.abs(worker.hp-(faction===3?100:100.25))<1e-7);if(faction===3){worker.x=hall.x+4;worker.z=hall.z;step(s,10);assert.ok(Math.abs(worker.hp-102)<1e-7);}
 worker.hp=worker.maxHp-.01;step(s,1);assert.equal(worker.hp,worker.maxHp);worker.hp=0;step(s,1);assert.equal(worker.hp,0);
 for(const field of ['maxHp','speed','armorValue','mana']){const bad=S.clone(s);bad.units.find(u=>u.id===trained.id)[field]+=1;assert.throws(()=>S.restore(bad),/worker balance/);}
 const missing=S.clone(s);delete missing.units.find(u=>u.id===trained.id).workerBalance;assert.throws(()=>S.restore(missing),/worker balance/);
 const wrong=S.clone(s);wrong.units.find(u=>u.id===trained.id).workerBalance='ewsp';assert.throws(()=>S.restore(wrong),/worker balance/);
 const publicState=S.publicState(s,0);assert.equal(publicState.workerBalanceVersion,1);assert.equal(publicState.units.find(u=>u.id===trained.id).workerBalance,source);
 console.log('PASS worker balance '+source+': source attributes, paid 150-tick training, cancellation, exact saved continuation, regeneration and invalid saves');
}
for(const faction of [0,1,3]){
 const {s,hall,worker}=workerFixture(faction,{workerBalanceVersion:0});assert.equal(worker.workerBalance,undefined);assert.equal(worker.maxHp,100*(faction===1?1.12:1));const legacy=S.clone(s);delete legacy.workerBalanceVersion;assert.equal(S.restore(legacy).workerBalanceVersion,0);command(s,hall,'train',{kind:'worker'});assert.equal(hall.queue[0].left,4);assert.ok(S.restore(s));
}
assert.equal(S.create('skirmish',{factions:[2,0]}).units.find(u=>u.kind==='worker').maxHp,120);
for(const mode of ['moba','td','rpg'])assert.equal(S.create(mode).workerBalanceVersion,0);
for(const value of [-1,2,'1',null]){assert.throws(()=>S.create('skirmish',{workerBalanceVersion:value}),/worker balance/);const bad=workerFixture().s;bad.workerBalanceVersion=value;assert.throws(()=>S.restore(bad),/worker balance/);}
assert.throws(()=>S.create('moba',{workerBalanceVersion:1}),/worker balance/);
console.log('PASS worker balance legacy and mode isolation; Wisp rules preserved');
