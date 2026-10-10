// Author: MiYu. Compare complete routes and terrain work for AI construction probes sharing one map.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import Module from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),filename=repo+'samples/frostbound-realms/game/simulation.js',baseline=process.argv[2]??'46a296b',iterations=Number(process.argv[3]??8),probes=24;
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const before=execFileSync('git',['show',baseline+':samples/frostbound-realms/game/simulation.js'],{cwd:repo,encoding:'utf8',maxBuffer:8*1024*1024}),after=fs.readFileSync(filename,'utf8');
function load(source){
  const metrics={tileCalls:0,tileBuilds:0,planeCalls:0,planeBuilds:0,groundChecks:0,meshInvalidations:0,regionBuilds:0,routeSearches:0},m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(repo+'samples/frostbound-realms/game');
  const plane=source.includes('function groundPlane(map,cx,cz,trusted=false){')?'function groundPlane(map,cx,cz,trusted=false){':'function groundPlane(map,cx,cz){';
  for(const [token,field] of [['function groundTile(map,cx,cz,trusted=false){','tileCalls'],['const h=heights.slice(16,20),','tileBuilds'],[plane,'planeCalls'],['const height=map.heights?.[cz*32+cx]||0;','planeBuilds'],['function groundClear(map,ax,az,bx,bz,radius=0,regions){','groundChecks'],['groundMeshes.delete(s.map);','meshInvalidations'],['groundGraphs.set(map,{key,regions});','regionBuilds'],['function routeSearch(s,u,goal=-1){','routeSearches']]){
    assert.equal(source.split(token).length,2,'instrumentation anchor '+field);
    source=source.replace(token,token.startsWith('function ')?token+'__metrics.'+field+'++;':token==='groundMeshes.delete(s.map);'?'(__metrics.'+field+'++,groundMeshes.delete(s.map));':'__metrics.'+field+'++;'+token);
  }
  m.terrainMetrics=metrics;m._compile('const __metrics=module.terrainMetrics;'+source,filename);return {S:m.exports,metrics};
}
function fixture(S,name){
  const map=name==='highland'?S.highlandMap():S.defaultMap();map.units=[];map.props=[];map.doodads=[];map.triggers=[];
  if(name==='sealed-cliffs')map.ramps.fill(0);
  const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];
  return {s,u:S.spawn(s,'worker',0,-23,23)};
}
function run(source,name){
  // Metrics are local to each compiled module and absent from shipped gameplay.
  const {S,metrics}=load(source),{s,u}=fixture(S,name),routes=[],start=performance.now();
  for(let i=0;i<probes;i++){
    const x=-9+(i%6)*2,z=9-Math.floor(i/6)*2,probe={...s,serial:s.serial+i+1,units:[...s.units,{id:s.serial+i+1,kind:'farm',team:0,x,z,hp:1,built:.01,queue:[]}]};
    routes.push(S.path(probe,u,x,z));
  }
  return {ms:performance.now()-start,routes,counters:metrics};
}
const results={};
for(const name of ['default','highland','sealed-cliffs']){
  const times={before:[],after:[]};let reference,counters;
  for(let i=0;i<iterations+2;i++)for(const variant of i%2?['after','before']:['before','after']){
    const result=run(variant==='before'?before:after,name);reference??=result.routes;assert.deepEqual(result.routes,reference,name+' complete route output');
    if(i>=2)times[variant].push(result.ms);counters??={};counters[variant]=result.counters;
  }
  const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];results[name]={completeRoutesEqual:true,probes,mediansMs:{before:median(times.before),after:median(times.after)},counters,samplesMs:times};
}
console.log(JSON.stringify({author:'MiYu',baseline,iterations,warmups:2,scope:'Node CPU only; alternating fresh simulation modules, 24 AI-style hypothetical building states share a map; exact paths compared. Excludes native QuickJS, rendering and IPC.',results}));
