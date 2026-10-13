// Author: MiYu. Compare every sampled surface against the original ordered barycentric search.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const file=new URL('../samples/frostbound-realms/game/simulation.js',import.meta.url),require=createRequire(file),old=execFileSync('git',['show','949fc98:samples/frostbound-realms/game/simulation.js'],{encoding:'utf8',maxBuffer:8*1024*1024});
function load(source){const module={exports:{}};vm.runInNewContext(source,{module,require});return module.exports;}
const before=load(old),after=load(fs.readFileSync(file,'utf8'));let count=0,segments=0,seed=0x714928;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),plain=value=>JSON.parse(JSON.stringify(value));
function compare(map,x,z,trusted=true){assert.deepEqual(plain(after.groundSample(map,x,z,trusted)),plain(before.groundSample(map,x,z,trusted)),`surface ${count} at ${x},${z}`);count++;}
for(const mode of ['skirmish','td','moba']){
 const map=before.defaultMap(mode);before.prepareGround(map);after.prepareGround(map);
 for(let z=0;z<32;z++)for(let x=0;x<32;x++)for(const [dx,dz] of [[.5,.5],[0,0],[1,1],[random(),random()]])compare(map,(x+dx)*2-32,(z+dz)*2-32);
 for(const [cx,cz] of [[0,0],[31,31],[15,15],[16,16],[4,4],[6,6],[24,24]])for(const [a,b,c] of before.groundTile(map,cx,cz,true).triangles){
  for(const [u,v] of [[1,0],[0,1],[0,0],[.5,.5],[.5,0],[0,.5],[1/3,1/3],[-1e-7,.5],[-1.0001e-7,.5],[1+1e-7,0]]){const x=a[0]*u+b[0]*v+c[0]*(1-u-v),z=a[2]*u+b[2]*v+c[2]*(1-u-v);for(const offset of [0,-1e-8,1e-8])compare(map,x+offset,z-offset);}
 }
 map.heights.fill(0);map.ramps.fill(0);map.relief.fill(0);for(let z=10;z<22;z++)for(let x=10;x<22;x++){map.heights[z*32+x]=(x+z)%3;map.ramps[z*32+x]=(x*z)%5;map.relief[z*33+x]=Math.round((random()*2-1)*16)/16;}
 before.prepareGround(map);after.prepareGround(map);for(let i=0;i<2048;i++)compare(map,random()*28-14,random()*28-14);
 map.relief[16*33+16]+=.0625;for(const x of [-.1,0,.1])for(const z of [-.1,0,.1])compare(map,x,z,false);
 const left=before.prepareGround(map),right=after.prepareGround(map),segment=(ax,az,bx,bz,r)=>{assert.equal(after.groundClear(map,ax,az,bx,bz,r,right),before.groundClear(map,ax,az,bx,bz,r,left),`segment ${segments} at ${[ax,az,bx,bz,r]}`);segments++;};
 for(let i=0;i<1024;i++){const ax=random()*64-32,az=random()*64-32,bx=i%2?random()*64-32:ax+(random()-.5),bz=i%2?random()*64-32:az+(random()-.5);segment(ax,az,bx,bz,[0,.5,.7,.9][i%4]);}
 for(let edge=-32;edge<=32;edge+=2)for(const offset of [-1e-12,0,1e-12])for(const radius of [0,.5]){segment(edge+offset,-30,edge+offset,30,radius);segment(-30,edge+offset,30,edge+offset,radius);segment(edge+offset,edge+offset,edge-offset,edge-offset,radius);segment(edge+offset,edge+offset,edge+.01,edge-.01,radius);}
}
console.log(JSON.stringify({passed:true,exactSurfaceComparisons:count,exactSegmentComparisons:segments,scope:'Default RTS/TD/MOBA terrain, complete tile grid, triangle vertices/edges/interiors and barycentric tolerance boundaries, crossed cliff/ramp layouts, relief edits, untrusted same-frame queries and swept segments at grid crossings.'}));
