// Author: MiYu. Compare the server's actual Node module with a completed native VM matrix at the same source revision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const directory=process.argv[2];assert.ok(directory,'Usage: node scripts/verify-frost-server-runtime.mjs <native-matrix-directory>');
const hash=value=>createHash('sha256').update(value).digest('hex'),read=file=>JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')),matrix=read('report.json'),root=new URL('../samples/frostbound-realms/',import.meta.url),generated=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),simulation=fs.readFileSync(new URL('game/simulation.js',root),'utf8');
assert.equal(matrix.completed,true);assert.equal(matrix.generatedSha256,hash(generated),'native evidence matches generated client');assert.ok(generated.includes(simulation.replace(/\r\n/g,'\n')),'generated client embeds current server simulation');
const Frost=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function compare(a,b,at='$',stats={nonIdenticalNumbers:0,maxAbsoluteError:0}){if(typeof a==='number'&&typeof b==='number'){assert.ok(Number.isFinite(a)&&Number.isFinite(b),at);const delta=Math.abs(a-b);if(delta)stats.nonIdenticalNumbers++;stats.maxAbsoluteError=Math.max(stats.maxAbsoluteError,delta);if(Number.isInteger(a)||Number.isInteger(b))assert.equal(a,b,at);else assert.ok(delta<=1e-8,`${at}: ${a} != ${b}`);}else if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.equal(Array.isArray(a),Array.isArray(b),at);assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),at);for(const key of Object.keys(a))compare(a[key],b[key],at+'.'+key,stats);}else assert.equal(a,b,at);return stats;}
const cases=[];
for(const row of matrix.cases){
 const source=fs.readFileSync(path.join(directory,row.name+'.js'),'utf8'),marker='var benchmarkState,benchmarkStats;',offset=source.indexOf(marker);assert.equal(hash(source),row.sourceSha256);assert.ok(offset>0&&source.indexOf(marker,offset+1)<0);
 const context=vm.createContext({Frost});vm.runInContext(source.slice(offset),context);context.benchmarkReset();for(let i=0;i<row.warmup;i++)context.benchmarkStep();context.benchmarkReset();for(let i=0;i<row.samples;i++)context.benchmarkStep();const state=JSON.parse(context.benchmarkResult());
 for(const runtime of ['quickjs','v8']){const native=JSON.parse(read(`${row.name}-0-${runtime}.json`).state);cases.push({name:row.name,runtime,...compare(state,native)});}
}
console.log(JSON.stringify({passed:true,node:process.version,nodeV8:process.versions.v8,generatedSha256:matrix.generatedSha256,cases,scope:'Actual server simulation module versus generated rules in native QuickJS and V8 for each matrix workload. Complete final-state comparison, exact integer/structure checks and unchanged 1e-8 float bound. This is not a two-machine network test or engine-bridge acceptance.'}));
