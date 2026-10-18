// Author: MiYu. Source manual repair, mechanical/Ancient targeting, exact costs and saved moving jobs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {workerFixture} from './test-frost-worker-balance.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),rules=require('../samples/frostbound-realms/worker-repair.json'),manifest=require('../samples/frostbound-realms/worker-repair-sources.json');
const sha=b=>createHash('sha256').update(b).digest('hex'),step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),command=(s,w,type,extra={})=>S.command(s,w.team,{type,ids:[w.id],...extra});
for(const r of manifest.sources){const raw=fs.readFileSync(new URL('../samples/frostbound-realms/'+r.localPath,import.meta.url));assert.equal(sha(raw),r.sha256);assert.equal(raw.length,r.bytes);}
for(const r of manifest.outputs){const raw=fs.readFileSync(new URL('../samples/frostbound-realms/'+r.path,import.meta.url));assert.equal(sha(raw),r.sha256);assert.equal(raw.length,r.bytes);}
assert.equal(sha(fs.readFileSync(new URL('../samples/frostbound-realms/worker-repair.json',import.meta.url))),manifest.profileSha256);
assert.equal(rules.classifications.hmtm.mechanical,false);assert.equal(rules.classifications.ebal.mechanical,true);assert.equal(rules.classifications.etol.ancient,true);
export function repairFixture(faction=0,options={}){const {s,worker,hall}=workerFixture(faction,options);Object.assign(s.teams[0],{gold:10000,wood:10000});Object.assign(worker,{x:-2,z:0,order:{type:'hold'}});const target=S.spawn(s,'glaivethrower',0,0,0,{hp:100,order:{type:'hold'}});S.visibility(s);return {s,worker,target,hall};}
for(const [faction,id] of [[0,'Ahrp'],[1,'Arep'],[2,'Aren'],[3,'Arst']]){
 const {s,worker,target}=repairFixture(faction),r=S.workerRepair(s,worker),d=S.unitType(target),gold=s.teams[0].gold,wood=s.teams[0].wood,hp=target.hp;assert.equal(s.workerRepairVersion,1);assert.equal(r.id,id);assert.deepEqual([r.costRatio,r.timeRatio,r.range],[.35,1.5,.5]);
 const cost=S.repairCost(target,r);near(cost.hp,target.maxHp*S.DT/(d.time*1.5));near(cost.gold,d.gold*cost.hp/target.maxHp*.35);assert.equal(command(s,worker,'repair',{target:target.id}),null);step(s,10);assert.ok(target.hp>hp);const copy=S.restore(s);for(let i=0;i<25;i++){S.tick(s);S.tick(copy);assert.deepEqual(s,copy);}step(s,500);near(target.hp,target.maxHp);near(gold-s.teams[0].gold,d.gold*(target.maxHp-hp)/target.maxHp*.35);near(wood-s.teams[0].wood,d.wood*(target.maxHp-hp)/target.maxHp*.35);assert.equal(worker.order,null);assert.ok(S.restore(s));
 const a=repairFixture(faction),tree=S.spawn(a.s,'hall',0,5,0,{baseFaction:2,hp:500});assert.equal(S.repairTarget(a.s,a.worker,tree),faction===2,'only Renew repairs Ancients');if(faction===2){assert.equal(command(a.s,a.worker,'repair',{target:tree.id}),null);step(a.s,30);assert.ok(tree.hp>500);}else assert.ok(command(a.s,a.worker,'repair',{target:tree.id}));
 const organic=S.spawn(a.s,'humanmortar',0,3,0,{hp:100}),friend=S.spawn(a.s,'soldier',0,3,2,{hp:100}),enemy=S.spawn(a.s,'glaivethrower',1,3,3,{hp:100});for(const u of [organic,friend,enemy,a.worker]){const before=S.clone(a.s);assert.ok(command(a.s,a.worker,'repair',{target:u.id}));assert.deepEqual(a.s,before);}
 console.log('PASS source repair '+id+': source hashes/icon/classifications, mechanical target, full cost/time, exact saves and Ancient/organic/ownership masks');
}
{
 const {s,worker,target}=repairFixture(),helper=S.spawn(s,'worker',0,1,0),r=S.workerRepair(s,worker);Object.assign(worker,{x:-1,z:0});const hp=target.hp,cost=S.repairCost(target,r);assert.equal(S.command(s,0,{type:'repair',ids:[worker.id,helper.id],target:target.id}),null);step(s,1);near(target.hp-hp,cost.hp*2);s.teams[0].gold=0;const before=target.hp;step(s,10);near(target.hp,before);s.teams[0].gold=100;worker.stun=1;helper.stun=1;step(s,5);near(target.hp,before);worker.stun=helper.stun=0;target.hp=target.maxHp-.01;const gold=s.teams[0].gold;step(s,2);near(target.hp,target.maxHp);near(gold-s.teams[0].gold,S.unitType(target).gold*.01/target.maxHp*.35);assert.ok(S.restore(s));
}
{
 const {s,worker,target}=repairFixture();command(s,worker,'repair',{target:target.id});step(s,5);command(s,worker,'move',{x:-10,z:0,append:true});const saved=S.restore(s);target.order={type:'move',x:4,z:0};saved.units.find(u=>u.id===target.id).order={type:'move',x:4,z:0};for(let i=0;i<80;i++){S.tick(s);S.tick(saved);assert.deepEqual(s,saved);}assert.ok(target.hp>100);assert.ok(worker.x>0,'worker follows a moving mechanical unit');assert.equal(command(s,worker,'stop'),null);const hp=target.hp;step(s,5);near(target.hp,hp);assert.ok(S.restore(s));
}
{
 const {s,worker,target}=repairFixture();command(s,worker,'repair',{target:target.id});step(s,10);const killer=S.spawn(s,'soldier',1,target.x,target.z+1,{damage:10000,order:{type:'attack',target:target.id}});S.visibility(s);step(s,1);assert.equal(target.hp,0);assert.equal(worker.order,null,'death releases mobile repair jobs synchronously');assert.ok(S.restore(s));
}
{
 const {s,worker,target}=repairFixture(0,{workerRepairVersion:0});assert.equal(S.workerRepair(s,worker),null);assert.ok(command(s,worker,'repair',{target:target.id}));const b=S.spawn(s,'farm',0,0,5,{hp:100});assert.equal(command(s,worker,'repair',{target:b.id}),null);const c=S.repairCost(b);step(s,100);const old=S.clone(s);delete old.workerRepairVersion;assert.equal(S.restore(old).workerRepairVersion,0);near(c.gold,S.unitType(b).gold*c.hp/b.maxHp*.5);
}
{const {s,worker}=repairFixture(2),tree=S.spawn(s,'hall',0,0,4,{baseFaction:2,uprooted:true,hp:500,order:{type:'hold'}});assert.ok(S.repairTarget(s,worker,tree));assert.equal(command(s,worker,'repair',{target:tree.id}),null);step(s,30);assert.ok(tree.hp>500,'Renew follows the uprooted Ancient body geometry');assert.ok(S.restore(s));}
for(const value of [-1,2,null,'1']){assert.throws(()=>S.create('skirmish',{workerRepairVersion:value}),/worker repair/);const {s}=repairFixture();s.workerRepairVersion=value;assert.throws(()=>S.restore(s),/worker repair/);}
for(const mode of ['moba','td','rpg']){assert.equal(S.create(mode).workerRepairVersion,0);assert.throws(()=>S.create(mode,{workerRepairVersion:1}),/worker repair/);}
for(const options of [{workerBalanceVersion:0},{wispHarvestVersion:0}]){assert.equal(S.create('skirmish',options).workerRepairVersion,0);assert.throws(()=>S.create('skirmish',{...options,workerRepairVersion:1}),/worker repair/);}
console.log('PASS repair grouped rates, resource/stun pause, final fractional payment, moving target, Shift/Stop, death cleanup and old-save/version isolation');
