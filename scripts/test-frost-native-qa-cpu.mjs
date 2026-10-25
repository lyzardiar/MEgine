// Author: MiYu. Verify native QA CPU target isolation, sampled self time and debugger cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {selectNativeQaMainTarget,summarizeNativeQaCpuProfile,startNativeQaCpuProfile,reserveNativeQaDebuggerPort} from './frost-native-qa-cpu.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'tmp/docs-artifacts/editor-performance-risk');fs.mkdirSync(out,{recursive:true});
const profile={startTime:1000,endTime:7000,nodes:[{id:1,callFrame:{functionName:'(idle)',url:'',lineNumber:-1,columnNumber:-1}},{id:2,callFrame:{functionName:'render',url:'http://tauri.localhost/assets/App.js',lineNumber:1,columnNumber:2}}],samples:[1,2,2],timeDeltas:[1000,2000,3000]};
const target={id:'main',type:'page',url:'http://tauri.localhost/',webSocketDebuggerUrl:'ws://127.0.0.1:9123/devtools/page/main'};
function fixture(){const root=fs.mkdtempSync(path.join(out,'qa-cpu-test-'));fs.mkdirSync(path.join(root,'discovery'));fs.writeFileSync(path.join(root,'qa-owner.json'),JSON.stringify({pid:process.pid,root}));fs.writeFileSync(path.join(root,'discovery/agent-bridge.json'),JSON.stringify({background:true,pid:123}));return root;}
async function withDebugger(run,{badCommand,stopProfile=profile}={}){
  const previous={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket},calls=[],sockets=[];
  globalThis.fetch=async url=>{assert.equal(url,'http://127.0.0.1:9123/json/list');return new Response(JSON.stringify([{...target,url:target.url+'?detachedPanel=game'},target]));};
  globalThis.WebSocket=class extends EventTarget{
    constructor(url){super();assert.equal(url,target.webSocketDebuggerUrl);sockets.push(this);queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
    send(text){const message=JSON.parse(text);calls.push(message);queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:message.id,...message.method===badCommand?{error:{message:'fixture rejection'}}:{result:message.method==='Profiler.stop'?{profile:stopProfile}:{}}})})));}
    close(){this.closed=true;this.dispatchEvent(new Event('close'));}
  };
  try{await run(calls,sockets);}finally{Object.assign(globalThis,previous);}
}

test('CPU summaries preserve sample weights and reject truncated or unknown samples',()=>{
  const summary=summarizeNativeQaCpuProfile(profile);assert.equal(summary.durationMs,6);assert.equal(summary.sampledMs,6);assert.equal(summary.idleMs,1);assert.equal(summary.samples,3);assert.equal(summary.topSelf[0].functionName,'render');assert.equal(summary.topSelf[0].selfMs,5);
  for(const input of [null,{...profile,endTime:0},{...profile,timeDeltas:[1]},{...profile,samples:[1,2,99]},{...profile,timeDeltas:[1,-1,2]},{...profile,nodes:[profile.nodes[0],profile.nodes[0]]}])assert.throws(()=>summarizeNativeQaCpuProfile(input),/Invalid QA CPU/);
});

test('debugger target selection isolates the main Tauri page and rejects ambiguous or external sockets',()=>{
  assert.equal(selectNativeQaMainTarget([{...target,url:'https://example.com'},target,{...target,url:target.url+'?detachedPanel=scene'}],9123),target);
  for(const targets of [[],[target,target],[{...target,webSocketDebuggerUrl:'ws://example.com:9123/page'}],[{...target,webSocketDebuggerUrl:'ws://127.0.0.1:9124/page'}]])assert.throws(()=>selectNativeQaMainTarget(targets,9123));
  assert.throws(()=>selectNativeQaMainTarget([target],0),/Invalid QA debugger/);
});

test('QA CPU profiling starts and stops once, saves the original profile and closes the debugger',async()=>withDebugger(async(calls,sockets)=>{
  const root=fixture(),capture=await startNativeQaCpuProfile(root,9123),first=capture.stop();assert.equal(capture.stop(),first);const result=await first;
  assert.deepEqual(calls.map(call=>call.method),['Profiler.enable','Profiler.setSamplingInterval','Profiler.start','Profiler.stop']);assert.equal(calls[1].params.interval,1000);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.profilePath,'utf8')),profile);assert.equal(result.editorPid,123);assert.equal(result.targetId,'main');assert.equal(result.samples,3);assert.equal(sockets[0].closed,true);
}));

test('debugger startup failure and malformed profiles close the owned connection',async()=>{
  await withDebugger(async(calls,sockets)=>{await assert.rejects(startNativeQaCpuProfile(fixture(),9123),/fixture rejection/);assert.equal(sockets[0].closed,true);assert.equal(calls.length,2);},{badCommand:'Profiler.setSamplingInterval'});
  await withDebugger(async(calls,sockets)=>{const capture=await startNativeQaCpuProfile(fixture(),9123);await assert.rejects(capture.stop(),/Invalid QA CPU/);assert.equal(sockets[0].closed,true);},{stopProfile:{}});
});

test('ownership is checked before contacting any debugger; a free loopback port is available',async()=>{
  const root=fixture(),file=path.join(root,'qa-owner.json');fs.writeFileSync(file,JSON.stringify({pid:0,root}));
  await assert.rejects(startNativeQaCpuProfile(root,9123),/ownership mismatch/);await assert.rejects(startNativeQaCpuProfile(root,-1),/Invalid QA debugger port/);
  const port=await reserveNativeQaDebuggerPort();assert.ok(Number.isInteger(port)&&port>0&&port<=65535);
});
