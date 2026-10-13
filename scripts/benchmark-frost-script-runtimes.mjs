// Author: MiYu. Native VM comparison using the generated game's unchanged rule code and complete final-state validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const [runnerArg,outputArg,warmupArg='300',samplesArg='600',repeatsArg='3']=process.argv.slice(2);
assert.ok(runnerArg&&outputArg,'Usage: node scripts/benchmark-frost-script-runtimes.mjs <native-runner> <output-directory> [warmup=300] [samples=600] [repeats=3]');
const runner=path.resolve(runnerArg),output=path.resolve(outputArg),warmup=Number(warmupArg),samples=Number(samplesArg),repeats=Number(repeatsArg);
for(const n of [warmup,samples,repeats])assert.ok(Number.isSafeInteger(n)&&n>0,'Counts must be positive integers');
assert.ok(fs.existsSync(runner),'Build tools/script-runtime-benchmark from the engine repository first');
fs.mkdirSync(output,{recursive:true});
const generated=fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Scripts/Main.js',import.meta.url),'utf8'),marker='var FrostTerrain=',boundary=generated.indexOf(marker);
assert.ok(boundary>0&&generated.indexOf(marker,boundary+1)<0,'Unique generated rule boundary');
const rules=generated.slice(0,boundary),hash=data=>createHash('sha256').update(data).digest('hex'),median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const report={author:'MiYu',passed:false,scope:'Native CPU rule execution only. No engine bridge, client presentation, GPU rendering, browser, IPC or per-call deadline. V8 is embedded directly, not run through Node.',warmup,samples,repeats,generatedSha256:hash(generated),rulesSha256:hash(rules),runnerSha256:hash(fs.readFileSync(runner)),cases:[]},write=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');

function workload(name){return `
var benchmarkState,benchmarkStats;
function benchmarkReset(){
  const mode=${JSON.stringify(name==='battle'?'skirmish':name==='opening'?'skirmish':name)};
  benchmarkState=Frost.create(mode,{ai:[${name==='battle'?'false,false':'true,true'}]});
  if(${JSON.stringify(name)}==='battle'){
    for(let team=0;team<2;team++){
      const ids=[];
      for(let i=0;i<48;i++){
        const u=Frost.spawn(benchmarkState,i%3?'soldier':'archer',team,(team?1:-1)*(10+i%4),-9+Math.floor(i/4)*1.5);
        if(!u)throw Error('Battle fixture exceeds unit capacity');ids.push(u.id);
      }
      for(let i=0;i<ids.length;i+=40){const error=Frost.command(benchmarkState,team,{type:'attackMove',ids:ids.slice(i,i+40),x:0,z:0});if(error)throw Error(error);}
    }
  }
  benchmarkStats={steps:0,initialUnits:benchmarkState.units.length,peakUnits:benchmarkState.units.length,unitSteps:0,projectileSteps:0};
}
function benchmarkStep(){
  Frost.tick(benchmarkState);benchmarkStats.steps++;benchmarkStats.peakUnits=Math.max(benchmarkStats.peakUnits,benchmarkState.units.length);benchmarkStats.unitSteps+=benchmarkState.units.length;benchmarkStats.projectileSteps+=benchmarkState.projectiles.length;
}
function benchmarkResult(){return JSON.stringify({stats:benchmarkStats,state:benchmarkState});}
`;}

function compare(actual,expected,at='$',stats={numbers:0,maxAbsoluteError:0,nonIdenticalNumbers:0}){
 if(typeof actual==='number'&&typeof expected==='number'){
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected),at+' must be finite');const error=Math.abs(actual-expected);stats.numbers++;stats.maxAbsoluteError=Math.max(stats.maxAbsoluteError,error);if(error)stats.nonIdenticalNumbers++;
  if(Number.isInteger(actual)||Number.isInteger(expected))assert.equal(actual,expected,at);else assert.ok(error<=1e-8,at+': '+actual+' != '+expected);
 }else if(actual!==null&&typeof actual==='object'&&expected!==null&&typeof expected==='object'){
  assert.equal(Array.isArray(actual),Array.isArray(expected),at);assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),at+' keys');for(const key of Object.keys(expected))compare(actual[key],expected[key],at+'.'+key,stats);
 }else assert.equal(actual,expected,at);
 return stats;
}

try{
 for(const name of ['opening','battle','td','moba']){
  const caseWarmup=name==='battle'?Math.min(warmup,10):warmup,caseSamples=name==='battle'?Math.min(samples,30):samples;
  const script=path.join(output,name+'.js');fs.writeFileSync(script,rules+workload(name));const row={name,warmup:caseWarmup,samples:caseSamples,sourceSha256:hash(fs.readFileSync(script)),runs:[]};report.cases.push(row);let reference;const runtimeReferences=new Map();
  for(let repeat=0;repeat<repeats;repeat++)for(const runtime of repeat%2?['v8','quickjs']:['quickjs','v8']){
   const destination=path.join(output,`${name}-${repeat}-${runtime}.json`);report.pending={name,repeat,runtime};write();console.log('START',name,repeat,runtime);
   const log=destination+'.log',fd=fs.openSync(log,'w');let result;try{result=spawnSync(runner,[runtime,script,String(caseWarmup),String(caseSamples),destination],{stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}assert.ifError(result.error);assert.equal(result.status,0,fs.readFileSync(log,'utf8'));
   const data=JSON.parse(fs.readFileSync(destination,'utf8')),state=JSON.parse(data.state);assert.equal(data.stepMs.length,caseSamples);assert.equal(state.stats.steps,caseSamples);assert.equal(state.state.frame,caseSamples,'Scenario must keep simulating throughout measurement');
   reference??=state;if(!runtimeReferences.has(runtime))runtimeReferences.set(runtime,state);compare(state,runtimeReferences.get(runtime));
   let equality;try{equality={passed:true,...compare(state,reference)};}catch(error){equality={passed:false,firstDifference:error.message};}
   const times=[...data.stepMs].sort((a,b)=>a-b),run={runtime,repeat,version:data.version??data.binding,loadMs:data.loadMs,initialResetMs:data.initialResetMs,warmupMs:data.warmupMs,resetMs:data.resetMs,totalMs:data.stepMs.reduce((a,b)=>a+b,0),medianStepMs:median(times),p95StepMs:times[Math.min(times.length-1,Math.ceil(times.length*.95)-1)],stateSha256:hash(data.state),equality,stats:state.stats};
   run.averageStepMs=run.totalMs/caseSamples;row.runs.push(run);console.log(equality.passed?'MATCH':'MISMATCH',name,runtime,run.averageStepMs.toFixed(3)+' ms/step',JSON.stringify(equality));delete report.pending;write();
  }
  row.medianAverageStepMs=Object.fromEntries(['quickjs','v8'].map(runtime=>[runtime,median(row.runs.filter(r=>r.runtime===runtime).map(r=>r.averageStepMs))]));row.quickjsToV8Ratio=row.medianAverageStepMs.quickjs/row.medianAverageStepMs.v8;write();
 }
 report.completed=true;report.statesEquivalent=report.cases.every(row=>row.runs.every(run=>run.equality.passed));report.passed=report.statesEquivalent;
}catch(error){report.error=error.stack;throw error;}finally{write();}
console.log(JSON.stringify({completed:report.completed,statesEquivalent:report.statesEquivalent,report:path.join(output,'report.json'),cases:report.cases.map(({name,medianAverageStepMs,quickjsToV8Ratio})=>({name,medianAverageStepMs,quickjsToV8Ratio}))},null,2));
