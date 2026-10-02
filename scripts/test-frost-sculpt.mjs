// Author: MiYu. Editable continuous terrain, geometry payloads, exact persistence and consumer heights.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;const T=require('../samples/frostbound-realms/game/terrain.js');
function field(){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.ramps.fill(0);map.relief.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);return map;}
{
 const map=field(),i=16*33+16;S.sculptRelief(map,0,0,'raise',4,.5);assert.equal(map.relief[i],.5);assert.equal(S.elevation(map,0,0),.5);assert.equal(S.reliefHeight(map,1,0),.375);assert.equal(S.reliefHeight(map,2,0),.25);assert.equal(S.reliefHeight(map,4,0),0);
 assert.equal(S.traversable(map,-3,0,3,0),true);assert.equal(S.flatSite(map,0,0,1),false);S.sculptRelief(map,0,0,'lower',4,.25);assert.equal(map.relief[i],.25);assert.equal(S.flatSite(map,0,0,1),true);
 const before=[...map.relief];S.sculptRelief(map,0,0,'smooth',4);assert.ok(map.relief[i]<before[i]);S.sculptRelief(map,0,0,'flatten',6,.25,0);assert.equal(map.relief[i],0);
 for(let n=0;n<10;n++)S.sculptRelief(map,0,0,'lower',4,.5);assert.equal(map.relief[i],-1);assert.ok(map.relief.every(v=>v>=-1&&v<=1&&Number.isInteger(v*16)));
 const s=S.create('skirmish',{map});s.units=[];const u=S.spawn(s,'worker',0,0,0);assert.equal(S.unitHeight(s,u),-1);const flyer=S.spawn(s,'dragon',0,0,0);assert.equal(S.unitHeight(s,flyer),3);S.visibility(s);const restored=S.restore(s);assert.deepEqual(restored,s);assert.deepEqual(S.publicState(s,0).map.relief,map.relief);
}
{
 const map=field();map.relief[16*33+16]=.5;const owned=S.validateMap(map);owned.relief[16*33+16]=0;assert.equal(map.relief[16*33+16],.5);
 for(const relief of [null,[0],Array(1089),Array(1089).fill(NaN),Array(1089).fill(.1),Array(1089).fill(1.0625)])assert.throws(()=>S.validateMap({...map,relief}),/relief/);
 const old=S.clone(map);delete old.relief;assert.deepEqual(S.validateMap(old).relief,Array(1089).fill(0));
 for(const args of [[NaN,0,'raise'],[0,0,'invalid'],[31,0,'raise'],[0,0,'raise',3],[0,0,'raise',4,.1],[0,0,'flatten',4,.25,2]])assert.throws(()=>S.sculptRelief(map,...args),/sculpt/);
}
{
 const map=field();map.terrain[S.index(-1,-1)]=1;S.sculptRelief(map,0,0,'raise',6,.5);assert.equal(map.relief[16*33+16],0,'shared water corner stays level');S.sculptRelief(map,-30,-30,'raise',6,.5);assert.ok(map.relief.slice(0,33).every(v=>v===0));assert.ok(map.relief.filter((_,i)=>i%33===0).every(v=>v===0));
}
{
 const map=field();for(let z=0;z<=32;z++)for(let x=0;x<=32;x++)map.relief[z*33+x]=(x*2-32)/32;
 assert.ok(Math.abs(S.elevation(map,8,0)-.25)<1e-7);assert.ok(Math.abs(S.elevation(map,-8,0)+.25)<1e-7);assert.equal(S.reliefHeight(map,32,32),1);assert.ok(S.elevation(map,32,32)>.99);const key=T.mesh(map,3,3);assert.match(key,/^terrain4h:[0-7]{2}[0-6]{144}[0-9a-f]{98}$/);
 const relief=Array.from({length:49},(_,i)=>(parseInt(key.slice(156+i*2,158+i*2),16)-128)/16);assert.equal(relief[0],-.3125);assert.equal(relief[48],.0625);
 const right=T.mesh(map,4,3);for(let z=0;z<7;z++)for(let x=0;x<3;x++)assert.equal(key.slice(156+(z*7+x+4)*2,158+(z*7+x+4)*2),right.slice(156+(z*7+x)*2,158+(z*7+x)*2),'height halo overlaps exactly');
}
{
 const map=field(),i=16*33+16;map.relief.fill(-1);map.relief[i]=.25;map.relief[i+1]=1;map.relief[i+33]=1;map.relief[i+34]=.25;
 const s=S.create('skirmish',{map}),a={kind:'archer',x:-4,z:-4},b={kind:'archer',x:6,z:6};assert.equal(S.reliefHeight(map,1,1),.625);assert.equal(S.attackClear(s,a,b),false,'diagonal interior mound blocks a ray with clear endpoints');assert.equal(S.attackClear(s,b,a),false);
 s.map.relief.fill(0);assert.equal(S.attackClear(s,a,b),true);
}
{
 const map=S.defaultMap();assert.ok(map.relief.some(v=>v!==0));assert.ok(map.relief.every(v=>!Object.is(v,-0)));for(let z=0;z<=32;z++)for(let x=0;x<=32;x++)assert.equal(map.relief[z*33+x],map.relief[(32-z)*33+32-x],"default hills preserve rotational symmetry");for(const spawn of map.spawns)assert.ok(S.flatSite(map,...spawn,3));for(let z=0;z<32;z++)for(let x=0;x<32;x++)if(map.terrain[z*32+x]===1)for(const dz of [0,1])for(const dx of [0,1])assert.equal(map.relief[(z+dz)*33+x+dx],0,'default water is planar');
}
console.log('PASS: sculpt raise/lower/smooth/plateau, quantization/bounds, shoreline/borders, legacy/save/privacy payload, signed unit heights, encoded halos and interior terrain occlusion');
