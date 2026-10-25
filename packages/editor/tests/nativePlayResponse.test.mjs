// Author: MiYu. Owned binary Play decoding preserves JSON semantics and mutable response compatibility.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {parseRetainedNativePlayResponse,retainPlayWorld,isRetainedPlayWorld,isRetainedPlayRecord} from '../src/playWorldSync.ts';
import {toWorldSnapshotView} from '../src/worldSnapshotView.ts';
import {retainPlayStepTiming,playStepTimingStages} from '../src/playStepTiming.ts';

const encode=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)).buffer;
const entity=(id,value=id)=>({entity:id,name:`Entity ${id}`,sibling_index:id,components:{Custom:{values:[value]}}});
const host=(entities,frame=0)=>({entities,frame,sim_frame:frame,elapsed:frame/60,clear_color:[0,0,0,1],selected:null});

test('binary JSON snapshots match copying publication and share only privately decoded frozen subtrees',()=>{
 const input={sessionId:41,snapshot:host([{...entity(4294967297),tag:'  Tag  ',layer:3,components:JSON.parse('{"Custom":{"__proto__":{"value":7},"constructor":{"prototype":[1,{"text":"中文"}]},"toJSON":"data"}}') }])};
 const bytes=encode(input),decoded=parseRetainedNativePlayResponse(bytes),expected=retainPlayWorld(toWorldSnapshotView(input.snapshot));
 assert.deepEqual(decoded.world,expected);assert.equal(decoded.response.sessionId,41);assert.equal(isRetainedPlayWorld(decoded.world),true);
 const record=decoded.world.entities[0];assert.equal(isRetainedPlayRecord(record),true);assert.equal(isRetainedPlayRecord(record.components),false);
 assert.equal(record.components,decoded.response.snapshot.entities[0].components,'only the private parser tree may be frozen in place');
 const frozen=value=>{if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const key of Object.keys(value))frozen(value[key]);}};frozen(decoded.world);
 new Uint8Array(bytes).fill(0);input.snapshot.entities[0].components.Custom.__proto__.value=90;
 assert.equal(record.components.Custom.__proto__.value,7);assert.equal(record.tag,'Tag');assert.ok(Object.hasOwn(record.components.Custom,'__proto__'));
});

test('overflow numbers and negative zero retain JSON round-trip semantics',()=>{
 const text='{"snapshot":{"entities":[{"entity":1,"components":{"Custom":{"values":[-0,1e400,-1e400,0.5]}}}],"frame":1,"sim_frame":1,"elapsed":-0,"clear_color":[-0,0,0,1]}}';
 const expected=retainPlayWorld(toWorldSnapshotView(JSON.parse(text).snapshot)),actual=parseRetainedNativePlayResponse(encode(text)).world;
 assert.deepEqual(actual,expected);assert.equal(Object.is(actual.entities[0].components.Custom.values[0],-0),false);assert.deepEqual(actual.entities[0].components.Custom.values,[0,null,null,.5]);
});

test('invalid bytes and malformed snapshots cannot create a retained publication',()=>{
 for(const bytes of [new ArrayBuffer(0),new Uint8Array([0xc0]).buffer,encode('[]'),encode({snapshot:null}),encode({snapshot:host([null])}),encode({snapshot:host([{entity:1}])})])assert.throws(()=>parseRetainedNativePlayResponse(bytes));
 const mutable={snapshot:host([entity(1)])};assert.throws(()=>parseRetainedNativePlayResponse(mutable));assert.equal(Object.isFrozen(mutable.snapshot.entities[0].components),false);
});

test('prototype JSON hooks preserve per-record serialization and force copying',()=>{
 const input={snapshot:host([entity(1),entity(2)])},bytes=encode(input),original=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
 try{
  Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(key){return this.components?{...this,name:'Hook '+key}:this;}});
  const expected=retainPlayWorld(toWorldSnapshotView(JSON.parse(new TextDecoder().decode(bytes)).snapshot)),decoded=parseRetainedNativePlayResponse(bytes);
  assert.deepEqual(decoded.world,expected);assert.equal(decoded.world.entities[0].name,'Hook ');assert.notEqual(decoded.world.entities[0].components,decoded.response.snapshot.entities[0].components);
 }finally{if(original)Object.defineProperty(Object.prototype,'toJSON',original);else delete Object.prototype.toJSON;}
});

test('overridden mapping and normalization keep external aliases out of retained records',()=>{
 const bytes=encode({snapshot:host([entity(1)])}),map=Array.prototype.map,trim=String.prototype.trim;
 try{
  Array.prototype.map=function(...args){return map.apply(this,args);};
  const mapped=parseRetainedNativePlayResponse(bytes);assert.notEqual(mapped.world.entities[0].components,mapped.response.snapshot.entities[0].components);
  mapped.response.snapshot.entities[0].components.Custom.values.push(20);assert.deepEqual(mapped.world.entities[0].components.Custom.values,[1]);
  Array.prototype.map=map;String.prototype.trim=function(){return trim.call(this).toUpperCase();};
  const input=JSON.parse(new TextDecoder().decode(bytes));input.snapshot.entities[0].tag=' tag ';
  const normalized=parseRetainedNativePlayResponse(encode(input));assert.equal(normalized.world.entities[0].tag,'TAG');assert.notEqual(normalized.world.entities[0].components,normalized.response.snapshot.entities[0].components);
 }finally{Array.prototype.map=map;String.prototype.trim=trim;}
});

test('real native driver accepts binary startup, reset, sparse, topology and legacy object responses',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'}),savedWindow=globalThis.window;globalThis.window={};let runtime,clearMocks;
 try{
  const mocks=await server.ssrLoadModule('@tauri-apps/api/mocks');clearMocks=mocks.clearMocks;
  const {createNativePlayRuntime,emptyPlayInput,retainedNativePlayWorld}=await server.ssrLoadModule('/src/playRuntime.ts');
  const first=host([entity(1),entity(2)]),stops=[];let step=0;
  mocks.mockIPC((command,args)=>{
   if(command==='start_editor_play'){assert.equal(args.raw,true);return encode({sessionId:41,snapshot:first});}
   if(command==='stop_editor_play'){stops.push(args.sessionId);return;}
   assert.equal(command,'step_editor_play');assert.equal(args.raw,true);const revision=++step;
   const update={baseRevision:revision-1,revision,reset:revision===1,snapshot:host(revision===1?[entity(1,10),entity(2)]:revision===2?[entity(2,20)]:[],revision),...(revision===1?{entityOrder:[1,2]}:revision===3?{entityOrder:[2,1]}:{}),timing:{workerMs:1},quitRequested:revision===4};
   return revision===2?update:encode(update);
  });
  runtime=createNativePlayRuntime(error=>{throw error;});let world=await runtime.start({entities:[],frame:0,simFrame:0,clearColor:[0,0,0,1],selected:null});assert.ok(retainedNativePlayWorld(world));
  first.entities[0].components.Custom.values.push(99);assert.deepEqual(world.entities[0].components.Custom.values,[1]);
  world=await runtime.step(undefined,emptyPlayInput(),1/60);assert.equal(world.entities[0].components.Custom.values[0],10);assert.equal(runtime.stepTiming.responseTransport,'binary-json');const before=world.entities[0];
  world=await runtime.step(undefined,emptyPlayInput(),1/60);assert.equal(world.entities[0],before);assert.equal(world.entities[1].components.Custom.values[0],20);assert.equal(runtime.stepTiming.responseTransport,'json');
  world=await runtime.step(undefined,emptyPlayInput(),1/60);assert.deepEqual(world.entities.map(e=>e.entity),[2,1]);assert.ok(retainedNativePlayWorld(world));
  await runtime.step(undefined,emptyPlayInput(),1/60);assert.equal(runtime.quitRequested,true);runtime.stop();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(stops,[41]);
 }finally{runtime?.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks?.();if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;await server.close();}
});

test('transport provenance is copied once and timing stages locate binary decoding in the apply scope',()=>{
 const timing={sessionId:41,revision:1,invokeMs:5,applyMs:2,native:{commandMs:3,workerMs:2,simulationMs:1,workerQueueMs:0}};let reads=0;
 Object.defineProperty(timing,'responseTransport',{configurable:true,get(){reads++;return 'binary-json';}});
 const owned=retainPlayStepTiming(timing,41,1);assert.equal(reads,1);assert.equal(owned.responseTransport,'binary-json');assert.ok(Object.isFrozen(owned));
 const stages=playStepTimingStages(owned);assert.equal(stages[5].name,'IPC encode and delivery');assert.equal(stages[6].name,'Decode, apply and retain delta');assert.equal(stages[6].ms,2);
 assert.equal(retainPlayStepTiming({...timing,responseTransport:'future'},41,1).responseTransport,undefined);
 assert.equal(retainPlayStepTiming({...timing,responseTransport:undefined},41,1).responseTransport,undefined);
 assert.equal(playStepTimingStages({...timing,responseTransport:'json'})[5].name,'IPC encode, delivery and decode');
});
