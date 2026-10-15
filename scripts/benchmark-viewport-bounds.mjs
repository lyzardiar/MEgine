// Author: MiYu. Compare equivalent browser selection bounds; this is a CPU microbenchmark, not FPS.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {transformBounds,pointBounds} from '../packages/editor/src/viewportSpatial.ts';
import {quatRotateVec} from '../packages/editor/src/math3d.ts';
const count=5000,frames=60;
const inputs=Array.from({length:count},(_,i)=>({bounds:{min:[-1-i%3,-2,-.5],max:[2,1,3+i%5]},transform:{position:[i%100,Math.floor(i/100),i%7],scale:[i%2?-2:1,.5+i%4,1],rotation:[0,Math.sin(i*.01),0,Math.cos(i*.01)]}}));
function corners(bounds,transform) {
  const points=[];
  for(let corner=0;corner<8;corner++) {
    const local=[0,1,2].map(axis=>((corner&(1<<axis))?bounds.max[axis]:bounds.min[axis])*transform.scale[axis]);
    points.push(quatRotateVec(transform.rotation,local).map((v,axis)=>v+transform.position[axis]));
  }
  return pointBounds(points);
}
for(const {bounds,transform} of inputs) {
  const a=corners(bounds,transform),b=transformBounds(bounds,transform);
  for(const side of ['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(a[side][axis]-b[side][axis])<1e-9);
}
const run=fn=>{const started=performance.now();let checksum=0;for(const {bounds,transform} of inputs){const result=fn(bounds,transform);checksum+=result.min[0]+result.max[2];}return {ms:performance.now()-started,checksum};};
const before=[],after=[];let checksum;
for(let frame=-4;frame<frames;frame++) {
  for(const [name,fn,out] of frame%2?[['after',transformBounds,after],['before',corners,before]]:[['before',corners,before],['after',transformBounds,after]]) {
    const result=run(fn);if(checksum!==undefined)assert.ok(Math.abs(result.checksum-checksum)<1e-6);checksum=result.checksum;if(frame>=0)out.push(result.ms);
  }
}
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:(sorted[29]+sorted[30])/2,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...sorted)};};
console.log(JSON.stringify({scope:'Equivalent transformed AABBs for browser rendering/picking; alternating CPU runs after warmup, not gameplay FPS',entities:count,frames,resultsEqual:true,checksum,before:stats(before),after:stats(after)},null,2));
