// Author: MiYu. Compare scene observation over identical retained records against the specified Git baseline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'packages/editor'),iterations=Number(process.argv[2]??30),base=process.argv[3]??'f690b65';
assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const oldPath=path.join(repo,'tmp',`scene-observation-before-${process.pid}.ts`),oldSource=execFileSync('git',['show',`${base}:packages/editor/src/agent/eventJournal.ts`],{cwd:repo,encoding:'utf8'});
fs.writeFileSync(oldPath,oldSource);const server=await createServer({root,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
try {
  const {SceneChangeTracker:Before}=await import(pathToFileURL(oldPath).href),{SceneChangeTracker:After}=await server.ssrLoadModule('/src/agent/eventJournal.ts');
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),{createPlayWorldSync,isRetainedPlayRecord}=await server.ssrLoadModule('/src/playWorldSync.ts');
  const source=fs.readFileSync(path.join(repo,'samples/frostbound-realms/Assets/Scenes/Main.mscene'),'utf8'),store=createEditorStore();store.loadSceneJson(source);
  store.setPlayRuntime({retainsWorld:true,sessionId:41,start:async snapshot=>snapshot,step:async snapshot=>snapshot,stop(){},onError(error){throw error;}});store.play();await store.waitForPlayRuntime();store.pause();
  const snapshot=store.presentationSnapshot(),entities=snapshot.entities;assert.equal(entities.every(isRetainedPlayRecord),true);
  const before=new Before(),after=new After(),times={before:[],after:[]},cold={};
  for(const [name,tracker]of [['before',before],['after',after]]){const start=performance.now();tracker.observe('Scene',entities,{clearColor:snapshot.clearColor});cold[name]=performance.now()-start;}
  const small=createPlayWorldSync(),outputs=[];let current;
  for(let i=0;i<iterations+2;i++){
    const record=structuredClone(entities[0]);record.name=`Observation ${i}`;small.capture([record],snapshot.clearColor);
    current=entities.slice();current[0]=small.viewportSnapshot().entities[0];assert.equal(isRetainedPlayRecord(current[0]),true);
    const deltas={};for(const name of i%2?['after','before']:['before','after']){
      const tracker=name==='before'?before:after,start=performance.now();deltas[name]=tracker.observe('Scene',current,{clearColor:snapshot.clearColor});const ms=performance.now()-start;if(i>=2)times[name].push(ms);
    }
    assert.deepEqual(deltas.after,deltas.before);assert.deepEqual(deltas.after.changed,[entities[0].entity]);outputs.push(deltas.after);
  }
  const beforeDiff=before.diff(1,current,{clearColor:snapshot.clearColor}),afterDiff=after.diff(1,current,{clearColor:snapshot.clearColor});assert.deepEqual(afterDiff,beforeDiff);
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  console.log(JSON.stringify({author:'MiYu',scope:'Real store authored scene converted to immutable Play records; identical one-record changes and two trackers in Node/Vite, excluding React, scripts, GPU, IPC and native FPS',baseline:base,baselineSourceSha256:createHash('sha256').update(oldSource).digest('hex'),sourceSceneSha256:createHash('sha256').update(source).digest('hex'),entities:entities.length,iterations,warmups:2,allRetained:true,coldObserveMs:cold,medianBeforeMs:median(times.before),medianAfterMs:median(times.after),deltasAndDiffEqual:true,outputSha256:createHash('sha256').update(JSON.stringify({outputs,diff:afterDiff})).digest('hex'),samplesMs:times}));store.stop();
} finally {await server.close();fs.unlinkSync(oldPath);}
