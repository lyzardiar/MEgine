// Author: MiYu. Preserve live-reference edits and JSON fallback semantics in retained Play worlds.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('Play equality reads changing object and array getters once per structured comparison', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),color=[0,0,0,1];
    for(const array of [false,true]){
      const sync=createPlayWorldSync(),value=array?[1]:{field:{value:1}},entities=[{entity:1,components:{Custom:value}}];sync.capture(entities,color);sync.presentationSnapshot(entities,color);
      let reads=0;Object.defineProperty(value,array?'0':'field',{enumerable:true,configurable:true,get(){return ++reads===1?(array?2:{value:2}):(array?1:{value:1});}});
      assert.equal(sync.presentationSnapshot(entities,color),undefined);assert.equal(reads,1);
    }
  } finally {await server.close();}
});

test('Play comparison preserves schema order, null prototypes, capture identity and reset', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),sync=createPlayWorldSync(),custom=Object.assign(Object.create(null),{a:1,b:2}),entities=[{entity:1,components:{Custom:custom}}],color=[0,0,0,1];
    sync.capture(entities,color);const first=sync.presentationSnapshot(entities,color);assert.ok(first);assert.ok(sync.presentationSnapshot(entities,color));
    delete custom.a;custom.a=1;assert.equal(sync.presentationSnapshot(entities,color),undefined);assert.equal(sync.matches(entities,color),false);
    sync.capture(entities,color);const second=sync.presentationSnapshot(entities,color);assert.notEqual(second.entities[0],first.entities[0]);assert.deepEqual(Object.keys(second.entities[0].components.Custom),['b','a']);assert.deepEqual(Object.keys(first.entities[0].components.Custom),['a','b']);
    custom.next={nested:[3]};assert.equal(sync.matches(entities,color),false);sync.capture(entities,color);assert.ok(sync.presentationSnapshot(entities,color));custom.next.nested[0]=4;assert.equal(sync.presentationSnapshot(entities,color),undefined);sync.capture(entities,color);assert.ok(sync.presentationSnapshot(entities,color));
    sync.reset();assert.equal(sync.presentationSnapshot(entities,color),undefined);entities[0]={entity:1,components:{Custom:{replacement:7}}};sync.capture(entities,color);assert.equal(sync.presentationSnapshot(entities,color).entities[0].components.Custom.replacement,7);assert.equal(first.entities[0].components.Custom.next,undefined);
  } finally {await server.close();}
});

test('Play comparison follows Object.keys replacement within a Proxy ownKeys call', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'}),keys=Object.keys;
  try {
    const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),sync=createPlayWorldSync(),custom={value:1,other:2},entities=[{entity:1,components:{Custom:custom}}],color=[0,0,0,1];
    sync.capture(entities,color);const first=sync.presentationSnapshot(entities,color);let savedReads=0;
    const replacement=function(object){assert.equal(this,Object);if(Object.isFrozen(object)&&'value' in object&&'other' in object){savedReads++;return ['value'];}return keys(object);};
    Object.keys=replacement;assert.equal(sync.presentationSnapshot(entities,color),undefined);assert.equal(savedReads,1);Object.keys=keys;assert.equal(sync.presentationSnapshot(entities,color).entities[0],first.entities[0]);
    savedReads=0;let install=true;entities[0].components.Custom=new Proxy(custom,{ownKeys(target){if(install)Object.keys=replacement;return Reflect.ownKeys(target);}});
    assert.equal(sync.presentationSnapshot(entities,color),undefined);assert.equal(savedReads,1);install=false;Object.keys=keys;assert.equal(sync.presentationSnapshot(entities,color).entities[0],first.entities[0]);
  } finally {Object.keys=keys;await server.close();}
});

test('Play comparison preserves Object.keys accessor reads before field comparison', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'}),descriptor=Object.getOwnPropertyDescriptor(Object,'keys'),keys=Object.keys;
  try {
    const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),sync=createPlayWorldSync(),custom={value:1,other:2},entities=[{entity:1,components:{Custom:custom}}],color=[0,0,0,1];
    sync.capture(entities,color);assert.ok(sync.presentationSnapshot(entities,color));let reads=0,mutate=false;
    Object.defineProperty(Object,'keys',{configurable:true,get(){if(++reads===6&&mutate)custom.other=7;return keys;}});
    assert.ok(sync.presentationSnapshot(entities,color));assert.equal(reads,6);reads=0;mutate=true;
    assert.equal(sync.presentationSnapshot(entities,color),undefined);assert.equal(reads,6);
  } finally {Object.defineProperty(Object,'keys',descriptor);await server.close();}
});

test('viewport snapshots retain prior entity, hierarchy and UI values across captures and resets', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts'),sync=createPlayWorldSync();
    const entities=[{entity:1,components:{Button:{label:'first'}}},{entity:2,parent:1,components:{}}],color=[0,0,0,1];
    sync.capture(entities,color);const first=sync.viewportSnapshot();
    entities[0].components.Button.label='second';entities[1].parent=null;color[0]=.5;sync.capture(entities,color);
    const second=sync.viewportSnapshot();
    assert.equal(first.entities[0].components.Button.label,'first');assert.equal(first.entities[1].parent,1);assert.equal(first.clearColor[0],0);
    assert.equal(second.entities[0].components.Button.label,'second');assert.equal(second.entities[1].parent,null);assert.equal(second.clearColor[0],.5);
    entities.push({entity:3,components:{}});sync.capture(entities,color);sync.reset();
    assert.equal(second.entities.length,2);assert.equal(first.entities.length,2);assert.equal(sync.viewportSnapshot(),undefined);
  } finally {await server.close();}
});

test('store publishes native session and revision with their world and validates detached pairs', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
    let sessionId=41,revision=0,world;
    store.setPlayRuntime({retainsWorld:true,get sessionId(){return sessionId;},start:async snapshot=>{world={...snapshot,nativeSessionId:41,nativeRevision:0};return world;},step:async snapshot=>{world={...(snapshot??world),nativeSessionId:sessionId,nativeRevision:++revision};return world;},stop(){},onError(error){throw error;}});
    store.play();await store.waitForPlayRuntime();store.pause();
    const first=store.playViewportSnapshot().nativeWorldReference;assert.equal(first.sessionId,41);assert.equal(first.revision,0);
    sessionId=42;assert.equal(store.playViewportSnapshot().nativeWorldReference,undefined);assert.equal(store.nativePlayRevision,undefined);
    sessionId=41;store.step(.1);await store.waitForPlayRuntime();assert.equal(store.playViewportSnapshot().nativeWorldReference.revision,1);assert.equal(first.revision,0);
    const detached=createEditorStore();detached.loadRemoteSceneJson(store.saveSessionSceneJson(),'pause',41,1);
    assert.equal(detached.playViewportSnapshot().nativeWorldReference.sessionId,41);assert.equal(detached.nativePlayRevision,1);
    detached.loadRemoteSceneJson(store.saveSessionSceneJson(),'pause',41);
    assert.equal(detached.playViewportSnapshot().nativeWorldReference,undefined);assert.equal(detached.nativePlaySessionId,undefined);
    const entity=store.playViewportSnapshot().entities[0];entity.name='local edit';assert.equal(store.playViewportSnapshot().nativeWorldReference,undefined);
    store.stop();assert.equal(store.nativePlayRevision,undefined);
  } finally {await server.close();}
});

test('pending native steps keep the committed simulation clock paired with their viewport revision', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();let world,release;
    store.loadSceneJson(JSON.stringify({version:1,name:'Committed clock',world:{entities:[{entity:1,name:'Root',components:{}}]}}));
    store.setPlayRuntime({retainsWorld:true,sessionId:7,start:async snapshot=>{world={...snapshot,nativeSessionId:7,nativeRevision:0,simulationTime:0};return world;},step:async()=>new Promise(resolve=>{release=()=>resolve({...world,nativeSessionId:7,nativeRevision:1,simulationTime:.25});}),stop(){},onError(error){throw error;}});
    store.play();await store.waitForPlayRuntime();store.pause();store.step(.25);
    const pending=store.playViewportSnapshot().nativeWorldReference;
    assert.equal(pending.revision,0);assert.equal(pending.simulationTime,0);
    assert.equal(JSON.parse(store.saveSessionSceneJson()).world.simulationTime,0);
    release();await store.waitForPlayRuntime();
    assert.equal(store.playViewportSnapshot().nativeWorldReference.revision,1);assert.equal(store.playViewportSnapshot().nativeWorldReference.simulationTime,.25);
    store.stop();
  } finally {await server.close();}
});

test('Play synchronization preserves JSON semantics and owns its baseline', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldSync}=await server.ssrLoadModule('/src/playWorldSync.ts');
    const sync=createPlayWorldSync(),color=[0,0,0,1],entities=[{entity:1,components:{Custom:{a:1,b:2,list:[3,4]}}}],serialize=()=>JSON.stringify([entities,color]);
    let baseline;const capture=()=>{baseline=serialize();sync.capture(entities,color);},check=()=>assert.equal(sync.matches(entities,color),serialize()===baseline);
    assert.equal(sync.matches(entities,color),false);capture();check();
    entities[0].components.Custom.list[0]=8;check();entities[0].components.Custom.list[0]=3;check();
    color[0]=.5;check();capture();color[0]=0;check();capture();
    delete entities[0].components.Custom.a;entities[0].components.Custom.a=1;check();capture();check();
    entities[0].components.Custom.omitted=undefined;check();capture();check();
    entities[0].components.Custom.list=[,undefined,NaN,Infinity];check();capture();check();
    entities[0].components.Custom.list=[null,null,null,null];check();capture();
    entities[0].components.Custom.toJSON=function(key){return {key,a:this.a};};check();capture();check();
    entities[0].components.Custom.a=7;check();capture();delete entities[0].components.Custom.toJSON;check();capture();
    entities.toJSON=()=>[{replacement:'first'}];check();capture();check();entities.toJSON=()=>null;check();capture();check();delete entities.toJSON;check();capture();
    color.toJSON=()=>[1,1,1,1];check();capture();delete color.toJSON;check();capture();
    const shared={value:4};entities[0].components.Custom={left:shared,right:shared};check();capture();check();shared.value=6;check();capture();check();
    shared.loop=shared;assert.throws(()=>sync.matches(entities,color),TypeError);assert.throws(()=>sync.capture(entities,color),TypeError);delete shared.loop;check();
    entities.push({entity:2,components:{}});check();capture();check();entities.reverse();check();capture();check();entities.splice(0,1);check();capture();check();
    sync.reset();assert.equal(sync.matches(entities,color),false);
  } finally {await server.close();}
});

test('retained Play uploads deep Transform, hierarchy, color and external component alias edits', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
    store.loadSceneJson(JSON.stringify({version:1,name:'Reference edits',world:{entities:[{entity:1,name:'Root',components:{Transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},Custom:{values:[1]}}}]}}));
    const incoming=[];let world;store.setPlayRuntime({retainsWorld:true,sessionId:41,start:async snapshot=>{world=snapshot;return snapshot;},step:async snapshot=>{incoming.push(snapshot);if(snapshot)world=snapshot;return world;},stop(){},onError(error){throw error;}});
    store.play();await store.waitForPlayRuntime();store.pause();
    const step=async()=>{assert.equal(store.step(.1),true);await store.waitForPlayRuntime();};
    const verify=async mutate=>{mutate();assert.equal(store.nativePlaySessionId,undefined);await step();assert.ok(incoming.at(-1));assert.equal(store.nativePlaySessionId,41);await step();assert.equal(incoming.at(-1),undefined);};
    await verify(()=>{store.getTransform(1).position[0]=5;});
    await verify(()=>{store.getVisibleFlat()[0].entity.components.Custom.values.push(2);});
    await verify(()=>{store.snapshot().clearColor[0]=.8;});
    await verify(()=>{delete store.playViewportSnapshot().entities[0].components.Custom;});
    const external={values:[10]};await verify(()=>{store.setComponent(1,'Custom',external);external.values.push(11);});
    const sameValue={values:[10,11]};store.setComponent(1,'Custom',sameValue);assert.equal(store.nativePlaySessionId,41);await verify(()=>sameValue.values.push(12));
    const transform=store.getTransform(1);transform.position[0]=9;transform.position[0]=5;assert.equal(store.nativePlaySessionId,41);await step();assert.equal(incoming.at(-1),undefined);
    store.stop();assert.equal(store.nativePlaySessionId,undefined);
  } finally {await server.close();}
});
