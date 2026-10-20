// Author: MiYu. Source building vision, fog boundaries, saved daylight and target privacy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {humanSightFixture,sightMask} from './frost-human-sight-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),rules=S.humanMasonry;
const receipt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/human-masonry-sources.json',import.meta.url)));
for(const r of [...receipt.sources.map(r=>({...r,path:r.localPath})),...receipt.files.filter(r=>r.path==='human-masonry.json')]){
 const raw=fs.readFileSync(new URL('../samples/frostbound-realms/'+r.path,import.meta.url));assert.equal(raw.length,r.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),r.sha256);
}
const cases=[...Object.entries(rules.bindings).map(([kind,source])=>({kind,source})),...rules.hallSources.map((source,i)=>({kind:'hall',source,tier:i+1}))];
for(const {kind,source,tier} of cases){
 const expected=source==='hgtw'?[1600,800]:source==='hwtw'?[1600,1000]:source==='hvlt'?[1000,750]:[900,600];
 assert.deepEqual(['sight','nsight'].map(k=>Number(rules.units[source].sourceBalance[k])),expected);
 for(const [i,hour] of [12,22].entries()){
  const {s}=humanSightFixture(S,{kind,hour,tier});S.visibility(s);
  assert.deepEqual(s.visible[0],sightMask(expected[i]/200),source+' '+hour);
  assert.deepEqual(S.restore(s).visible[0],s.visible[0]);
 }
}
console.log('PASS Human sight: signed source inputs, 13 source IDs, 14 building/tier cases and all 1024 day/night fog cells');
{
 const {s,building,enemy}=humanSightFixture(S);s.map.startingHour=0;s.frame=3599;S.visibility(s);const day=[...s.visible[0]];
 assert.ok(S.publicState(s,0).units.some(u=>u.id===enemy.id));assert.equal(S.command(s,0,{type:'attack',ids:[building.id],target:enemy.id}),null);
 const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(saved,s);assert.deepEqual(s.visible[0],sightMask(4));
 assert.ok(!S.publicState(s,0).units.some(u=>u.id===enemy.id));assert.equal(S.command(s,0,{type:'attack',ids:[building.id],target:enemy.id}),'Target is not visible');
 day.forEach((v,i)=>{if(v)assert.equal(s.explored[0][i],1);});
 s.frame=1199;S.tick(s);assert.deepEqual(s.visible[0],sightMask(8));assert.ok(S.publicState(s,0).units.some(u=>u.id===enemy.id));
 s.moonUntil=s.frame+2;S.visibility(s);assert.deepEqual(s.visible[0],sightMask(4));S.tick(s);S.tick(s);assert.deepEqual(s.visible[0],sightMask(8));
 console.log('PASS Human sight: saved dusk, dawn, temporary night expiry, explored memory and hidden attack/snapshot rejection');
}
{
 const {s,building,enemy}=humanSightFixture(S,{kind:'scouttower',hour:22});S.spawn(s,'lumbermill',0,-24,-24);S.visibility(s);
 assert.equal(S.command(s,0,{type:'guardTower',ids:[building.id]}),null);
 // The last upgrade tick changes source profile and must immediately remove excess night vision.
 building.guardTowerUpgrade.left=.1;const saved=S.restore(s);S.tick(s);S.tick(saved);assert.deepEqual(s,saved);assert.equal(building.kind,'guardtower');
 assert.equal(s.visible[0][16*32+21],0);assert.ok(!S.publicState(s,0).units.some(u=>u.id===enemy.id));
 console.log('PASS Human sight: Scout-to-Guard upgrade and saved continuation reduce night sight from 1000 to 800');
}
for(const options of [{humanMasonryVersion:0},{humanArmyVersion:0},{factions:[1,1]}]){
 for(const hour of [12,22]){const {s,building}=humanSightFixture(S,{kind:'tower',hour,options});assert.equal(building.humanMasonrySource,undefined);assert.deepEqual(s.visible[0],sightMask(hour===12?7:5));}
}
console.log('PASS Human sight: legacy saves, disabled Human army and other factions retain their existing vision');
