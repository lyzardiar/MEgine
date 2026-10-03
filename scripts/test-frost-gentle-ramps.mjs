// Author: MiYu. Two-tile slope geometry, reverse editing, body clearance and exact persistence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;const T=require('../samples/frostbound-realms/game/terrain.js');
for(const [r,dx,dz] of [[1,1,0],[2,-1,0],[3,0,1],[4,0,-1]]){
  const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(1);map.ramps.fill(0);map.relief.fill(0);map.props=[];map.players.forEach(p=>p.heroClass=0);const x=15,z=15,i=z*32+x,j=(z+dz)*32+x+dx;
  for(let along=1;along<=3;along++)for(let across=-2;across<=2;across++)map.heights[(z+dz*along+dx*across)*32+x+dx*along+dz*across]=2;
  for(let across=-1;across<=1;across++){const cell=(z+dx*across)*32+x+dz*across;map.ramps[cell]=r;S.gradeRamp(map,cell);}
  assert.equal(map.ramps[i],r+4);assert.equal(map.ramps[j],r+4);assert.equal(map.heights[j],1.5);assert.equal(S.tileHeight(map,i,1,1),2.5);assert.equal(S.tileHeight(map,j,1,1),3.5);assert.ok(map.relief.every(v=>v===0),'grading preserves adjacent ground and sculpted relief');
  const copy=S.validateMap(map),save=S.restore(S.create('skirmish',{map,ai:[false,false]}));assert.deepEqual(copy,map);assert.deepEqual(save.map,map);assert.deepEqual(S.publicState(save,0).map,map);
  const key=T.mesh(map,3,3);assert.match(key,/^terrain4h:[0-7]{2}[0-6]{144}[0-9a-f]{98}$/);assert.ok(key.slice(12,156).includes('3'),'native mesh encodes the halfway landing');
  const a=[x*2-31-dx*2,z*2-31-dz*2],b=[x*2-31+dx*4,z*2-31+dz*4];assert.ok(S.groundClear(map,...a,...b,.9));
  for(const [from,to] of [[a,b],[b,a]]){const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];const u=S.spawn(s,'catapult',0,...from);assert.equal(S.command(s,0,{type:'move',ids:[u.id],x:to[0],z:to[1]}),null);for(let k=0;k<100;k++)S.tick(s);assert.ok(Math.hypot(u.x-to[0],u.z-to[1])<.4,'siege traverses the full slope in both directions');}
  map.ramps[i]=r;S.gradeRamp(map,i,false);assert.equal(map.ramps[j],0);assert.equal(map.heights[j],2);S.gradeRamp(map,i);const stable=S.clone(map);map.ramps[i]=r;S.gradeRamp(map,i);assert.deepEqual(map,stable,'repainting a gentle entrance is idempotent');
  assert.ok(!S.flatSite(map,x*2-31,z*2-31,.5),'ramp construction is rejected');
  map.ramps[i]=r;map.terrain[j]=1;const before=S.clone(map);assert.throws(()=>S.gradeRamp(map,i),/dry upper shelf/);assert.deepEqual(map,before,'invalid grading is atomic');
}
const flat=S.defaultMap('td');flat.terrain.fill(0);for(const height of [.25,3.5,NaN])assert.throws(()=>S.validateMap({...flat,heights:Array(1024).fill(height)}));assert.throws(()=>S.validateMap({...flat,heights:Array(1024).fill(2.5),ramps:Array(1024).fill(1)}));assert.ok(S.validateMap({...flat,heights:Array(1024).fill(2.5),ramps:Array(1024).fill(5)}));
const map=S.defaultMap();assert.equal(map.ramps.filter(v=>v>4).length,20);assert.equal(S.highlandMap().ramps.filter(v=>v>4).length,22);for(let i=0;i<1024;i++){assert.equal(map.heights[i],map.heights[1023-i]);const r=map.ramps[i],opposite=r===5?6:r===6?5:r===7?8:r===8?7:0;assert.equal(map.ramps[1023-i],opposite);}
console.log('PASS: four gentle directions, native half-height encoding, eight siege traversals, flat-ground preservation, steep/gentle editing, atomic rejection, save/public state and mirrored defaults');
