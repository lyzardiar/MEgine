// Author: MiYu. Compare Play equality checks over the same real-store mutable scene and retained baselines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'packages/editor'),iterations=Number(process.argv[2]??20),baseline=process.argv[3]??'802f49b';
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const original=execFileSync('git',['show',`${baseline}:packages/editor/src/playWorldSync.ts`],{cwd:repo,encoding:'utf8'}),oldPath=path.join(repo,'tmp',`play-comparison-before-${process.pid}.ts`);
fs.writeFileSync(oldPath,original);let server;
try {
  server=await createServer({root,appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
  const {createPlayWorldSync:createBefore}=await server.ssrLoadModule('/@fs/'+oldPath.replaceAll('\\','/')),{createPlayWorldSync:createAfter}=await server.ssrLoadModule('/src/playWorldSync.ts');
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore(),source=fs.readFileSync(path.join(repo,'samples/frostbound-realms/Assets/Scenes/Main.mscene'),'utf8');
  store.loadSceneJson(source);store.setPlayRuntime({retainsWorld:true,sessionId:41,start:async s=>s,step:async s=>s,stop(){},onError(e){throw e;}});store.play();await store.waitForPlayRuntime();store.pause();
  const live=store.playViewportSnapshot(),entities=live.entities,color=live.clearColor,syncs={before:createBefore(),after:createAfter()},coldCapture={},coldMatches={};
  for(const name of ['before','after']){let start=performance.now();syncs[name].capture(entities,color);coldCapture[name]=performance.now()-start;start=performance.now();assert.equal(syncs[name].matches(entities,color),true);coldMatches[name]=performance.now()-start;}
  assert.deepEqual(syncs.after.viewportSnapshot(),syncs.before.viewportSnapshot());
  const times={matches:{before:[],after:[]},presentation:{before:[],after:[]},capture:{before:[],after:[]}};
  for(let i=0;i<iterations+2;i++)for(const operation of ['matches','presentation','capture'])for(const name of i%2?['after','before']:['before','after']){
    const sync=syncs[name],start=performance.now(),result=operation==='matches'?sync.matches(entities,color):operation==='presentation'?sync.presentationSnapshot(entities,color):sync.capture(entities,color),ms=performance.now()-start;
    if(operation==='matches')assert.equal(result,true);if(operation==='presentation')assert.equal(result.entities.length,entities.length);if(i>=2)times[operation][name].push(ms);
  }
  const first={before:syncs.before.viewportSnapshot(),after:syncs.after.viewportSnapshot()},entity=entities.find(e=>e.components.Transform);assert.ok(entity);entity.components.Transform.position[0]+=.125;
  const changedCapture={};for(const name of ['before','after']){assert.equal(syncs[name].matches(entities,color),false);assert.equal(syncs[name].presentationSnapshot(entities,color),undefined);const start=performance.now();syncs[name].capture(entities,color);changedCapture[name]=performance.now()-start;assert.equal(syncs[name].matches(entities,color),true);}
  const last={before:syncs.before.viewportSnapshot(),after:syncs.after.viewportSnapshot()};assert.deepEqual(last.after,last.before);
  const reuse={};for(const name of ['before','after']){reuse[name]=last[name].entities.filter((e,i)=>e===first[name].entities[i]).length;assert.equal(reuse[name],entities.length-1);}
  const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)],medians={};for(const op of Object.keys(times))medians[op]={before:median(times[op].before),after:median(times[op].after)};
  console.log(JSON.stringify({author:'MiYu',scope:'Two Play sync implementations compare the identical 90k real-store mutable world with independent JSON-owned baselines. Alternating Node/Vite CPU measurements exclude React, scripts, GPU, IPC and native FPS.',baseline,baselineSourceSha256:createHash('sha256').update(original).digest('hex'),sourceSceneSha256:createHash('sha256').update(source).digest('hex'),entities:entities.length,iterations,warmups:2,coldCaptureMs:coldCapture,coldMatchesMs:coldMatches,changedCaptureMs:changedCapture,mediansMs:medians,reusedAfterOneTransform:reuse,directEditDetected:true,outputEqual:true,outputSha256:createHash('sha256').update(JSON.stringify(last.after)).digest('hex'),samplesMs:times}));store.stop();
} finally {await server?.close();fs.rmSync(oldPath,{force:true});}
