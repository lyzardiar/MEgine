// Author: MiYu. Exercise opt-in transport measurements with the real serial queue and idempotency cache.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
const require=createRequire(new URL('../package.json',import.meta.url)),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');

test('timed RPCs preserve results, isolate FIFO waiting, and do not retain diagnostics in replayed commands',async()=>{
 let now=1000,executeCount=0,release;
 const responses=[],listeners=new Map(),gate=new Promise(resolve=>{release=resolve;});
 const context=vm.createContext({console,AbortController,performance:{now:()=>now},Date:class extends Date{static now(){return now;}},crypto:globalThis.crypto});
 context.testInvoke=async(name,args)=>{
  if(name==='agent_bridge_set_transport_ready')return {accepted:true,queuedRequests:[]};
  if(name==='agent_bridge_respond')responses.push(JSON.parse(args.payload));
 };
 context.testListen=async(name,fn)=>{listeners.set(name,fn);return ()=>listeners.delete(name);};
 context.testBridge={query:async()=>{now+=17;return {value:42};},execute:async(name)=>{executeCount++;if(name==='first')await gate;now+=5;return {ok:true,data:{command:name},sceneRevision:3,eventSequence:4};}};
 const built=await build({entryPoints:[fileURLToPath(new URL('../src/agent/transport.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'transport-host',setup(b){
  b.onResolve({filter:/^(?:@tauri-apps\/api\/(?:core|event)|\.\/AgentBridge)$/},args=>({path:args.path,namespace:'host'}));
  b.onLoad({filter:/.*/,namespace:'host'},args=>({contents:args.path.endsWith('/core')?'export const invoke=globalThis.testInvoke;':args.path.endsWith('/event')?'export const listen=globalThis.testListen;':'export const agentBridge=globalThis.testBridge;'}));
 }}]});
 context.module={exports:{}};context.exports=context.module.exports;vm.runInContext(built.outputFiles[0].text,context);
 const unlisten=await context.module.exports.attachBridgeTransport();
 const send=(id,method,params)=>listeners.get('agent-bridge:request')({payload:{clientId:'client',receivedAtMs:970,message:JSON.stringify({jsonrpc:'2.0',id,method,params})}});
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 send(1,'query',{query:'entity.get',traceTiming:true});await flush();
 assert.equal(responses[0].result.data.value,42);
 assert.deepEqual(responses[0].result.bridgeTiming,{nativeReceivedAtMs:970,frontendReceivedAtMs:1000,operationMs:17,handlerMs:17,responseReadyAtMs:1017});
 send(2,'query',{query:'entity.get'});await flush();assert.equal(responses[1].result.bridgeTiming,undefined);
 send(3,'execute',{command:'first',requestId:'first',traceTiming:true});await flush();
 now+=100;send(4,'execute',{command:'second',requestId:'second',traceTiming:true});await flush();
 assert.equal(executeCount,1);now+=40;release();await flush();
 const first=responses.find(r=>r.id===3),second=responses.find(r=>r.id===4);
 assert.equal(first.result.bridgeTiming.operationMs,145);
 assert.equal(second.result.bridgeTiming.queueMs,45);
 assert.equal(second.result.bridgeTiming.operationMs,5);assert.equal(executeCount,2);
 send(5,'execute',{command:'second',requestId:'second'});await flush();
 const replay=responses.find(r=>r.id===5);assert.equal(replay.result.idempotency.replayed,true);assert.equal(replay.result.bridgeTiming,undefined);assert.equal(executeCount,2);
 unlisten();
});
