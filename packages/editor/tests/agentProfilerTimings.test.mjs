// Author: MiYu. Opt-in frame timings stay bounded and independent of retained profiler data.
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {TOOLS} from '../../agent/mcp/server.mjs';

test('profiler timing query is opt-in, bounded, validated and excludes heavyweight fields',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 let profiler;
 try{
  profiler=await server.ssrLoadModule('/src/editorProfiler.ts');
  const {agentBridge}=await server.ssrLoadModule('/src/agent/AgentBridge.ts');
  profiler.clearEditorProfilerSamples();
  for(let i=1;i<=250;i++)profiler.recordOwnedNativeViewportProfile('game',{schemaVersion:1,totalMs:7,commandMs:10,transportMs:14,frontendPrepareMs:0,frontendCompleteMs:1,renderSize:[850,478],worldRevision:i,callTree:{name:'private tree',children:[]},resources:[{path:'private asset'}],memory:[],sharedTransport:{requestId:String(i),requestElapsedMs:13,publicationReadyToEventMs:0,copyMs:0.1}},i*20);
  const plain=await agentBridge.query('profiler.get_samples',{limit:2});assert.equal(plain.nativeTimings,undefined);plain.nativeLatest.callTree.name='edited response';
  const detailed=await agentBridge.query('profiler.get_samples',{limit:2,includeNativeTimings:true});
  assert.equal(detailed.nativeLatest.callTree.name,'private tree');assert.equal(detailed.nativeProfileCount,240);assert.equal(detailed.nativeTimings.length,2);
  assert.deepEqual(detailed.nativeTimings.map(p=>p.worldRevision),[249,250]);
  const last=detailed.nativeTimings.at(-1);assert.equal(last.sharedTransport.publicationReadyToEventMs,0);
  assert.equal(last.frontendPrepareMs,0);assert.equal(last.frontendCompleteMs,1);
  for(const key of ['callTree','resources','memory','counts'])assert.equal(key in last,false);
  last.sharedTransport.copyMs=99;last.renderSize[0]=1;
  const fresh=(await agentBridge.query('profiler.get_samples',{limit:1,includeNativeTimings:true})).nativeTimings[0];
  assert.equal(fresh.sharedTransport.copyMs,0.1);assert.deepEqual(fresh.renderSize,[850,478]);
  assert.equal((await agentBridge.query('profiler.get_samples',{limit:480,includeNativeTimings:true})).nativeTimings.length,240);
  assert.deepEqual((await agentBridge.query('profiler.get_samples',{source:'scene',includeNativeTimings:true})).nativeTimings,[]);
  await assert.rejects(()=>agentBridge.query('profiler.get_samples',{includeNativeTimings:'true'}),{code:'INVALID_ARGS'});
  await assert.rejects(()=>agentBridge.query('profiler.get_samples',{includeNativeTimings:true,limit:481}),{code:'INVALID_ARGS'});
  assert.equal(TOOLS.find(tool=>tool.name==='get_profiler_samples').inputSchema.properties.includeNativeTimings.type,'boolean');
 }finally{profiler?.clearEditorProfilerSamples();await server.close();}
});
