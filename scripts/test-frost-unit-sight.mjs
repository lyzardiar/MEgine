// Author: MiYu. Original mobile-unit vision, complete fog masks, ownership and saved day/night boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {unitSightFixture} from './frost-unit-sight-fixture.mjs';
import {sightMask} from './frost-human-sight-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex');
const profiles={...read('human-army.json').units,...read('human-sanctum.json').units},workers=read('worker-balance.json').units;
for(const name of ['human-army','human-sanctum']){const receipt=read(name+'-sources.json');assert.equal(hash(name+'.json'),receipt.files.find(f=>f.path===name+'.json').sha256);assert.equal(hash('SourceAssets/CombatRewards/Units/UnitBalance.slk'),receipt.sources.find(s=>s.path==='Units/UnitBalance.slk').sha256);}
const workerReceipt=read('worker-balance-sources.json');assert.equal(hash('worker-balance.json'),workerReceipt.profileSha256);assert.equal(hash(workerReceipt.source.localPath),workerReceipt.source.sha256);
const cases=[...Object.entries(profiles).map(([kind,p])=>({kind,faction:0,source:p.sourceUnit,day:1400,night:800,row:p.sourceRows.UnitBalance})),...[0,1,3].map(faction=>{const source=['hpea','opeo',null,'uaco'][faction];return {kind:'worker',faction,source,day:800,night:600,row:workers[source].sourceRow};})];
assert.equal(cases.length,9);
for(const c of cases){
 assert.deepEqual([Number(c.row.sight),Number(c.row.nsight)],[c.day,c.night]);
 for(const hour of [12,22]){const {s,unit}=unitSightFixture(S,{...c,hour});if(c.kind==='worker')assert.equal(unit.workerBalance,c.source);assert.deepEqual(s.visible[0],sightMask((hour===12?c.day:c.night)/200),c.source+' '+hour);assert.deepEqual(S.restore(s).visible[0],s.visible[0]);}
}
console.log('PASS unit sight: authenticated source rows and every day/night fog cell for six Human units and three racial workers');
{
 const {s,unit,enemy}=unitSightFixture(S);s.map.startingHour=0;s.frame=3599;S.visibility(s);const day=[...s.visible[0]];
 assert.ok(S.publicState(s,0).units.some(u=>u.id===enemy.id));assert.equal(S.command(s,0,{type:'attack',ids:[unit.id],target:enemy.id}),null);unit.order={type:'hold'};
 const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(saved,s);assert.deepEqual(s.visible[0],sightMask(4));
 assert.ok(!S.publicState(s,0).units.some(u=>u.id===enemy.id));assert.equal(S.command(s,0,{type:'attack',ids:[unit.id],target:enemy.id}),'Target is not visible');
 day.forEach((v,i)=>{if(v)assert.equal(s.explored[0][i],1);});
 s.frame=1199;S.tick(s);assert.deepEqual(s.visible[0],sightMask(7));assert.ok(S.publicState(s,0).units.some(u=>u.id===enemy.id));
 s.moonUntil=s.frame+2;S.visibility(s);assert.deepEqual(s.visible[0],sightMask(4));S.tick(s);S.tick(s);assert.deepEqual(s.visible[0],sightMask(7));
 console.log('PASS unit sight: saved dusk/dawn, temporary night, explored memory and hidden attack/public-state rejection');
}
for(const faction of [0,1,3]){
 const {s,unit,enemy}=unitSightFixture(S,{kind:'worker',faction});assert.ok(!S.publicState(s,0).units.some(u=>u.id===enemy.id));
 unit.team=1;s.units=[unit];S.visibility(s);assert.deepEqual(s.visible[1],sightMask(4),'ownership preserves source worker vision');
 unit.hp=0;S.visibility(s);assert.deepEqual(s.visible[1],Array(1024).fill(0));
 const legacy=unitSightFixture(S,{kind:'worker',faction,options:{workerBalanceVersion:0}});assert.equal(legacy.unit.workerBalance,undefined);assert.deepEqual(legacy.s.visible[0],sightMask(6));
}
console.log('PASS unit sight: worker ownership/source identity, dead-unit exclusion and legacy worker policy');
