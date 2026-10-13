// Author: MiYu. Owned native deltas preserve full-update values, isolation and entity-order validation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const entity=(id,value=id)=>({entity:id,name:`Entity ${id}`,components:{Custom:{values:[value]}}});
const world=(entities,frame=0,color=[0,0,0,1])=>({entities,frame,simFrame:frame,simulationTime:frame/10,selected:entities[0]?.entity??null,clearColor:color});
const withModules=async run=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {await run(await server.ssrLoadModule('/src/playWorldSync.ts'),server);} finally {await server.close();}
};

test('owned patches freeze new data, share unchanged records and preserve old frames and colors',async()=>withModules(({retainPlayWorld,retainPlayWorldPatch,createPlayWorldSync})=>{
  const first=retainPlayWorld(world([entity(1),entity(4294967297)])),input=world([entity(4294967297,8)],1),next=retainPlayWorldPatch(first,input);
  assert.notEqual(next.entities,first.entities);assert.equal(next.entities[0],first.entities[0]);assert.notEqual(next.entities[1],first.entities[1]);assert.equal(next.clearColor,first.clearColor);
  input.entities[0].components.Custom.values[0]=99;input.clearColor[0]=.9;
  assert.deepEqual(next.entities[1].components.Custom.values,[8]);assert.deepEqual(first.entities[1].components.Custom.values,[4294967297]);
  assert.ok(Object.isFrozen(next));assert.ok(Object.isFrozen(next.entities));assert.throws(()=>next.entities[1].components.Custom.values.push(3),TypeError);
  const metadata=retainPlayWorldPatch(next,{...world([],2,[.5,0,0,1]),selected:1,nativeSessionId:71,nativeRevision:2});
  assert.equal(metadata.entities[1],next.entities[1]);assert.equal(metadata.frame,2);assert.equal(metadata.simulationTime,.2);assert.equal(metadata.nativeRevision,2);assert.equal(metadata.nativeSessionId,71);assert.deepEqual(metadata.clearColor,[.5,0,0,1]);assert.deepEqual(next.clearColor,[0,0,0,1]);
  const sync=createPlayWorldSync();sync.captureRetained(metadata);assert.deepEqual(sync.viewportSnapshot().entities,metadata.entities);
}));

test('owned patch validation rejects impersonation, duplicate baselines and missing IDs without corrupting later updates',async()=>withModules(({retainPlayWorld,retainPlayWorldPatch,retainedPlayWorldChanges})=>{
  const first=retainPlayWorld(world([entity(1),entity(2)]));
  for(const impostor of [{...first},Object.freeze({...first}),Object.freeze(world([entity(1)]))])assert.throws(()=>retainPlayWorldPatch(impostor,world([])),/owned world/);
  assert.throws(()=>retainPlayWorldPatch(first,world([entity(9)])),/entity order/);
  const valid=retainPlayWorldPatch(first,world([entity(2,7),entity(2,8)]));assert.deepEqual(valid.entities[1].components.Custom.values,[8]);assert.deepEqual(first.entities[1].components.Custom.values,[2]);
  assert.deepEqual(retainedPlayWorldChanges(first,valid),[1]);assert.ok(Object.isFrozen(retainedPlayWorldChanges(first,valid)));
  assert.equal(retainedPlayWorldChanges({...first},valid),undefined);assert.equal(retainedPlayWorldChanges(first,{...valid}),undefined);
  const next=retainPlayWorldPatch(valid,world([]));assert.deepEqual(retainedPlayWorldChanges(valid,next),[]);assert.equal(retainedPlayWorldChanges(first,next),undefined);
  assert.equal(retainedPlayWorldChanges(valid,retainPlayWorld(world([entity(2),entity(1)]))),undefined);
  assert.throws(()=>retainPlayWorldPatch(retainPlayWorld(world([entity(1),entity(1)])),world([])),/entity order/);
  assert.deepEqual(retainPlayWorldPatch(retainPlayWorld(world([])),world([],2)).entities,[]);
}));

test('native publications match full updates across sparse frames, reorder, removal, reset and failed revisions',async()=>withModules(async({retainPlayWorld},server)=>{
  const savedWindow=globalThis.window;globalThis.window={};
  const {mockIPC,clearMocks}=await server.ssrLoadModule('@tauri-apps/api/mocks');
  const {createNativePlayRuntime,emptyPlayInput,applyPlayWorldUpdate,retainedNativePlayWorld}=await server.ssrLoadModule('/src/playRuntime.ts');
  const {toWorldSnapshotView}=await server.ssrLoadModule('/src/transport/editorTransport.ts');
  const host=(entities,frame)=>({entities,frame,sim_frame:frame,elapsed:frame/10,clear_color:[.1,0,0,1]});
  let update;const initial=host([entity(1),entity(2),entity(4294967297)],0);mockIPC(cmd=>cmd==='start_editor_play'?{sessionId:71,snapshot:initial}:update);
  const runtime=createNativePlayRuntime(error=>{throw error;});
  try {
    let previous=await runtime.start({}),revision=0;
    for(let step=0;step<60;step++){
      const reset=step===30,order=step===10?[4294967297,2,1]:step===20?[2,1]:reset?[1,2,4294967297]:undefined;
      const changed=reset?[entity(1,30),entity(2,30),entity(4294967297,30)]:step%3===0?[]:[entity(2,step)];
      update={snapshot:host(changed,revision+1),baseRevision:revision,revision:revision+1,reset,...order?{entityOrder:order}:{}};
      const expected=retainPlayWorld({...applyPlayWorldUpdate(previous,revision,update),nativeSessionId:71,nativeRevision:update.revision},previous);
      const next=await runtime.step(undefined,emptyPlayInput(),.1);assert.deepEqual(next,expected);assert.equal(retainedNativePlayWorld(next),next);
      assert.equal(previous.nativeRevision,revision);previous=next;revision++;
    }
    update={snapshot:host([],61),baseRevision:revision-1,revision:revision+1,reset:false};await assert.rejects(runtime.step(undefined,emptyPlayInput(),.1),/revision mismatch/);
    update={snapshot:host([entity(999)],61),baseRevision:revision,revision:revision+1,reset:false};await assert.rejects(runtime.step(undefined,emptyPlayInput(),.1),/entity order/);
    update={snapshot:host([entity(2,100)],61),baseRevision:revision,revision:revision+1,reset:false};const recovered=await runtime.step(undefined,emptyPlayInput(),.1);assert.equal(recovered.nativeRevision,61);assert.deepEqual(recovered.entities.find(e=>e.entity===2).components.Custom.values,[100]);
  } finally {runtime.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks();globalThis.window=savedWindow;}
}));
