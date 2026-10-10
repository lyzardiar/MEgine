// Author: MiYu. Retained panel snapshots preserve values, public copy semantics and native revision isolation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const withStore=async fn=>{
  const server=await createServer({root,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try { const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'); await fn(createEditorStore,server); }
  finally { await server.close(); }
};
const driver=()=>{
  let world;
  return {retainsWorld:true,sessionId:41,start:async snapshot=>{world={...snapshot,nativeSessionId:41,nativeRevision:0};return world;},step:async snapshot=>{world={...(snapshot??world),frame:world.frame+1,simulationTime:(world.simulationTime??0)+.1,nativeSessionId:41,nativeRevision:(world.nativeRevision??0)+1};return world;},stop(){},onError(error){throw error;}};
};

test('panels retain immutable records across clocks, Inspector edits, topology and public snapshots', async()=>withStore(async createEditorStore=>{
  const store=createEditorStore();
  store.loadSceneJson(JSON.stringify({version:1,world:{entities:[{entity:1,name:'Root',components:{Custom:{values:[1]}}},{entity:2,parent:1,name:'Child',components:{}}],clearColor:[.1,.2,.3,1]}}));
  const authored=store.snapshot();store.setPlayRuntime(driver());store.play();await store.waitForPlayRuntime();store.pause();
  const first=store.presentationSnapshot(),native=store.playViewportSnapshot().nativeWorldReference;
  assert.deepEqual(first,store.snapshot());assert.equal(first.entities[0],native.entities[0]);
  assert.equal(Object.isFrozen(first.entities[0].components.Custom.values),true);
  assert.throws(()=>first.entities[0].components.Custom.values.push(9),TypeError);
  first.entities.reverse();first.clearColor[0]=.9;
  const again=store.presentationSnapshot();assert.equal(again.entities[0],native.entities[0]);assert.equal(again.clearColor[0],.1);
  const publicCopy=store.snapshot();publicCopy.entities[0].components.Custom.values.push(2);
  assert.deepEqual(store.snapshot().entities[0].components.Custom.values,[1]);
  assert.equal(store.step(.1),true);await store.waitForPlayRuntime();
  const second=store.presentationSnapshot();assert.equal(second.entities[0],again.entities[0]);assert.equal(second.frame,again.frame+1);assert.equal(second.simulationTime,.1);
  const id=second.entities[1].entity;store.setComponent(id,'Text',{text:'Inspector'});
  const edited=store.presentationSnapshot();assert.equal(edited.entities[1].components.Text.text,'Inspector');assert.equal(store.nativePlaySessionId,undefined);
  assert.equal(native.entities[1].components.Text,undefined);assert.equal(store.step(.1),true);await store.waitForPlayRuntime();
  const captured=store.presentationSnapshot();assert.equal(captured.entities[0],again.entities[0]);assert.notEqual(captured.entities[1],again.entities[1]);assert.equal(Object.isFrozen(captured.entities[1].components.Text),true);
  const live=store.playViewportSnapshot().entities;live[0].components.Custom.values[0]=7;
  assert.equal(store.presentationSnapshot().entities[0].components.Custom.values[0],7);assert.equal(native.entities[0].components.Custom.values[0],1);assert.equal(store.nativePlaySessionId,undefined);
  live.reverse();assert.equal(store.presentationSnapshot().entities[0].entity,2);
  live.pop();assert.equal(store.presentationSnapshot().entities.length,1);
  store.step(.1);await store.waitForPlayRuntime();assert.equal(store.presentationSnapshot().entities.length,1);
  store.stop();assert.deepEqual(store.presentationSnapshot().entities,authored.entities);assert.deepEqual(store.presentationSnapshot(),store.snapshot());assert.equal(store.presentationSnapshot().simulationTime,0);assert.equal(Object.isFrozen(store.snapshot().entities[0]),false);
}));

test('presentation snapshots preserve structured values instead of accepting JSON fallback equivalence', async()=>withStore(async(createEditorStore,server)=>{
  const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),sync=createPlayWorldSync();
  const entities=[{entity:1,components:{Custom:{value:undefined,list:[undefined]}}}],color=[0,0,0,1];
  sync.capture(entities,color);assert.equal(sync.matches(entities,color),true);assert.equal(sync.presentationSnapshot(entities,color),undefined);
  const store=createEditorStore();store.setPlayRuntime(driver());store.play();await store.waitForPlayRuntime();store.pause();
  const live=store.playViewportSnapshot().entities[0];live.components.Custom={value:undefined,list:[undefined],date:new Date(0),map:new Map([['key',4]])};
  store.step(.1);await store.waitForPlayRuntime();const snapshot=store.presentationSnapshot();
  const custom=snapshot.entities[0].components.Custom;
  assert.equal(Object.hasOwn(custom,'value'),true);assert.equal(custom.list[0],undefined);assert.equal(custom.date.getTime(),0);assert.equal(custom.map.get('key'),4);
  assert.notEqual(custom,store.playViewportSnapshot().entities[0].components.Custom);
  store.stop();
}));

test('startup, remote replacement and runtime errors display their actual world and isolate prior snapshots', async()=>withStore(async createEditorStore=>{
  const store=createEditorStore();let resolveStart;
  store.setPlayRuntime({...driver(),start:snapshot=>new Promise(resolve=>{resolveStart=()=>resolve({...snapshot,nativeSessionId:41,nativeRevision:0});})});
  store.play();const pending=store.presentationSnapshot();assert.deepEqual(pending,store.snapshot());
  resolveStart();await store.waitForPlayRuntime();const first=store.presentationSnapshot();
  const detached=createEditorStore();detached.loadRemoteSceneJson(store.saveSessionSceneJson(),'pause',41,0);
  assert.deepEqual(detached.presentationSnapshot().entities,first.entities);assert.equal(Object.isFrozen(detached.presentationSnapshot().entities[0]),true);
  detached.loadRemoteSceneJson(JSON.stringify({version:1,world:{entities:[{entity:8,name:'Replacement',components:{Text:{text:'remote'}}}],frame:17,simulationTime:2,clearColor:[.4,.5,.6,1]}}),'pause',42,4);
  assert.equal(detached.presentationSnapshot().frame,17);assert.equal(detached.presentationSnapshot().simulationTime,2);assert.equal(detached.presentationSnapshot().entities[0].entity,8);assert.notEqual(first.entities[0].entity,8);
  store.stop();store.setPlayRuntime({...driver(),step:async()=>{throw new Error('expected failure');},onError(){}});store.play();await store.waitForPlayRuntime();store.pause();assert.equal(store.step(.1),true);await assert.rejects(store.waitForPlayRuntime(),/expected failure/);
  assert.equal(store.mode,'edit');assert.deepEqual(store.presentationSnapshot(),store.snapshot());assert.equal(first.entities.length,pending.entities.length);
}));

test('scene observations and diffs accept frozen presentation records without hiding edits', async()=>withStore(async(createEditorStore,server)=>{
  const {SceneChangeTracker}=await server.ssrLoadModule('/src/agent/eventJournal.ts'),tracker=new SceneChangeTracker(),store=createEditorStore();
  store.loadSceneJson(JSON.stringify({version:1,world:{entities:[{entity:1,name:'Root',components:{}}]}}));
  store.setPlayRuntime(driver());store.play();await store.waitForPlayRuntime();store.pause();
  const first=store.presentationSnapshot();tracker.observe('Scene',first.entities,{clearColor:first.clearColor});
  assert.equal(tracker.observe('Scene',store.presentationSnapshot().entities,{clearColor:first.clearColor}),null);
  const id=first.entities[0].entity;store.setComponent(id,'Custom',{value:4});store.step(.1);await store.waitForPlayRuntime();
  const current=store.presentationSnapshot(),delta=tracker.observe('Scene',current.entities,{clearColor:current.clearColor});assert.deepEqual(delta.changed,[id]);
  const diff=tracker.diff(1,current.entities);assert.equal(diff.entities[0].components.Custom.value,4);diff.entities[0].components.Custom.value=9;
  assert.equal(current.entities[0].components.Custom.value,4);assert.equal(first.entities[0].components.Custom,undefined);store.stop();
}));
