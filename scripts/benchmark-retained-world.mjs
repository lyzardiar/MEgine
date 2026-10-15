// Author: MiYu. Compare equivalent JSON-owned worlds; alternating CPU measurements are not gameplay FPS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {retainPlayWorld} from '../packages/editor/src/playWorldSync.ts';
import {normalizeEntity} from '../packages/editor/src/entityRecord.ts';
const report=process.argv[2],world=report?JSON.parse(fs.readFileSync(report,'utf8')).endWorld:{entities:Array.from({length:5000},(_,i)=>({entity:i+1,name:`Node ${i}`,components:{Transform:{position:[i,0,0],rotation:[0,0,0,1],scale:[1,1,1]},MeshRenderer:{source:`Assets/Model${i%20}.glb`},MaterialPropertyBlock:{colors:[[1,.5,0,1],[.1,.2,.3,1]],custom:{enabled:true,values:[1,2,3,4]}}}})),clearColor:[0,0,0,1],frame:0,simFrame:0,selected:null};
const oldRecords=new WeakSet(),oldWorlds=new WeakSet();
function oldFreeze(value) {
  if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))oldFreeze(child);Object.freeze(value);oldRecords.add(value);}return value;
}
function before(world) {
  const entities=world.entities.map(entity=>oldRecords.has(entity)?entity:oldFreeze(JSON.parse(JSON.stringify(normalizeEntity(entity)))));
  const clearColor=oldFreeze(JSON.parse(JSON.stringify(world.clearColor))),{entities:inputEntities,clearColor:inputColor,...metadata}=world;
  const owned=Object.freeze({...oldFreeze(JSON.parse(JSON.stringify(metadata))),entities:Object.freeze(entities),clearColor});oldWorlds.add(owned);return owned;
}
assert.deepEqual(retainPlayWorld(world),before(world));
const samples={before:[],after:[]};let checksum=0;
for(let i=-4;i<30;i++)for(const [name,fn] of i%2?[['after',retainPlayWorld],['before',before]]:[['before',before],['after',retainPlayWorld]]){
  const start=performance.now(),result=fn(world),elapsed=performance.now()-start;checksum+=result.entities.length+result.frame;if(i>=0)samples[name].push(elapsed);
}
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:(sorted[14]+sorted[15])/2,p95Ms:sorted[28],maxMs:sorted.at(-1)}};
console.log(JSON.stringify({scope:'JSON normalization, copy and deep freezing; equivalent normalized values, not FPS',fixture:report??'generated transform/material records',entities:world.entities.length,iterations:30,resultsEqual:true,checksum,before:stats(samples.before),after:stats(samples.after)},null,2));
