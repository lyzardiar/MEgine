// Author: MiYu. Compare owned snapshot copies with immutable retained panel data on the same authored scene.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const {createServer}=await import(new URL('../packages/editor/node_modules/vite/dist/node/index.js',import.meta.url));

const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'packages/editor'),scene=fs.readFileSync(path.join(repo,'samples/frostbound-realms/Assets/Scenes/Main.mscene'),'utf8');
const iterations=Number(process.argv[2]??20);assert.ok(Number.isSafeInteger(iterations)&&iterations>0);
const server=await createServer({root,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
try {
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();store.loadSceneJson(scene);
  const started=performance.now();let world;
  store.setPlayRuntime({retainsWorld:true,sessionId:41,start:async snapshot=>{world={...snapshot,nativeSessionId:41,nativeRevision:0};return world;},step:async snapshot=>{world={...(snapshot??world),nativeSessionId:41,nativeRevision:world.nativeRevision+1};return world;},stop(){},onError(error){throw error;}});
  store.play();await store.waitForPlayRuntime();store.pause();const startupMs=performance.now()-started;
  const copied=store.snapshot(),retained=store.presentationSnapshot();assert.deepEqual(retained,copied);
  const outputSha256=createHash('sha256').update(JSON.stringify(copied)).digest('hex');
  const times={owned:[],presentation:[]};let current;
  for(let i=0;i<iterations+2;i++)for(const name of i%2?['presentation','owned']:['owned','presentation']){
    const before=performance.now();current=name==='owned'?store.snapshot():store.presentationSnapshot();const ms=performance.now()-before;
    assert.equal(current.entities.length,copied.entities.length);if(i>=2)times[name].push(ms);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const first=store.presentationSnapshot(),id=first.entities.find(e=>e.components.Transform)?.entity;assert.ok(id!=null);
  const transform=store.getTransform(id);transform.position[0]+=.125;const edited=store.presentationSnapshot();assert.equal(edited.entities.find(e=>e.entity===id).components.Transform.position[0],transform.position[0]);
  const captureStart=performance.now();store.step(.1);await store.waitForPlayRuntime();const changedCaptureMs=performance.now()-captureStart;
  const next=store.presentationSnapshot();assert.equal(next.entities.filter((e,i)=>e===first.entities[i]).length,copied.entities.length-1);
  console.log(JSON.stringify({author:'MiYu',scope:'Node/Vite real store with fixed authored Main.mscene and a mock retained driver; no React, gameplay scripts, GPU, IPC or native FPS',iterations,warmups:2,entities:copied.entities.length,sourceSceneSha256:createHash('sha256').update(scene).digest('hex'),outputSha256,outputEqual:true,allRetainedRecordsFrozen:first.entities.every(Object.isFrozen),startupMs,changedCaptureMs,reusedAfterOneTransform:next.entities.filter((e,i)=>e===first.entities[i]).length,medianOwnedMs:median(times.owned),medianPresentationMs:median(times.presentation),samplesMs:times}));
  store.stop();
} finally {await server.close();}
