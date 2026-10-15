// Author: MiYu. Preserve live-reference edits and JSON fallback semantics in retained Play worlds.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('editable owned JSON copies preserve special keys and remain isolated from retained frames', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { retainPlayWorld, cloneRetainedPlayRecord, isRetainedPlayRecord } = await server.ssrLoadModule('/src/playWorldSync.ts');
    const components = JSON.parse('{"Custom":{"__proto__":{"value":1},"constructor":{"prototype":[null,true,"text",[2,3]]},"poison":{"value":4},"empty":[],"toJSON":"data"}}');
    const owned = retainPlayWorld({ entities: [{ entity: 4294967297, components }], clearColor: [0, 0, 0, 1], frame: 0, simFrame: 0, selected: null }).entities[0];
    const expected = structuredClone(owned), originalKeys = Object.keys, originalMap = Array.prototype.map, originalSpecies = Object.getOwnPropertyDescriptor(Array, Symbol.species);
    let copy;
    try {
      Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, get() { throw new Error('inherited serialization hook'); } });
      Object.defineProperty(Object.prototype, 'poison', { configurable: true, set() { throw new Error('inherited setter'); } });
      Object.keys = () => { throw new Error('replaced enumeration'); };
      Array.prototype.map = () => { throw new Error('replaced array mapping'); };
      Object.defineProperty(Array, Symbol.species, { configurable: true, get() { throw new Error('inherited array species'); } });
      copy = cloneRetainedPlayRecord(owned);
    } finally { Object.keys = originalKeys; Array.prototype.map = originalMap; Object.defineProperty(Array, Symbol.species, originalSpecies); delete Object.prototype.toJSON; delete Object.prototype.poison; }
    assert.deepEqual(copy, expected); assert.equal(Object.getPrototypeOf(copy.components.Custom), Object.prototype);
    assert.equal(Object.hasOwn(copy.components.Custom, '__proto__'), true); assert.equal(isRetainedPlayRecord(copy), false);
    copy.components.Custom.__proto__.value = 9; copy.components.Custom.constructor.prototype[3].push(4); copy.components.Custom.empty.push('editable');
    assert.equal(owned.components.Custom.__proto__.value, 1); assert.deepEqual(owned.components.Custom.constructor.prototype[3], [2, 3]); assert.deepEqual(owned.components.Custom.empty, []);
    assert.throws(() => cloneRetainedPlayRecord({ value: new Date() }), /owned JSON record/);
  } finally { await server.close(); }
});

test('owned private worlds skip record scans until exposure, ordinary capture or reset', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldSync,retainPlayWorld}=await server.ssrLoadModule('/src/playWorldSync.ts');
    const world=retainPlayWorld({entities:Array.from({length:10000},(_,i)=>({entity:i+1,name:'Node '+i,components:{Transform:{position:[0,0,0]}}})),clearColor:[0,0,0,1],frame:0,simFrame:0});
    const entities=structuredClone(world.entities),color=[...world.clearColor];let privateWorld=true,recordChecks=0,worldChecks=0;
    const sync=createPlayWorldSync({owns:value=>privateWorld&&value===entities,unchanged:()=>{recordChecks++;return false;},comparisonIndices:(value,retained)=>{worldChecks++;return privateWorld&&value===entities&&retained===world.entities?[]:undefined;},expose:()=>{privateWorld=false;}});
    sync.captureRetained(world);
    for(let i=0;i<8;i++){assert.ok(sync.presentationMatches(entities,color));assert.ok(sync.matches(entities,color));}
    assert.equal(recordChecks,0);assert.equal(worldChecks,16);
    color[0]=.5;assert.equal(sync.presentationMatches(entities,color),false);color[0]=0;
    privateWorld=false;entities[9000].components.Transform.position[0]=7;assert.equal(sync.presentationMatches(entities,color),false);assert.equal(world.entities[9000].components.Transform.position[0],0);
    entities[9000].components.Transform.position[0]=0;privateWorld=true;sync.capture(entities,color);
    const checks=worldChecks;assert.ok(sync.presentationMatches(entities,color));assert.equal(worldChecks,checks);assert.equal(recordChecks,10000);
    sync.reset();assert.equal(sync.presentationMatches(entities,color),false);
  } finally {await server.close();}
});

test('private comparison retains prototype and serialization hook checks', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  const toJson=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try {
    const {createPlayWorldSync,retainPlayWorld}=await server.ssrLoadModule('/src/playWorldSync.ts'),world=retainPlayWorld({entities:[{entity:1,components:{}}],clearColor:[0,0,0,1],frame:0,simFrame:0}),entities=structuredClone(world.entities);let privateWorld=true,worldChecks=0;
    const sync=createPlayWorldSync({owns:value=>privateWorld&&value===entities,unchanged:()=>true,comparisonIndices:()=>{worldChecks++;return [];},expose:()=>{privateWorld=false;}});
    sync.captureRetained(world);assert.ok(sync.presentationMatches(entities,world.clearColor));assert.equal(worldChecks,1);
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){return this;}});
    assert.equal(sync.presentationMatches(entities,world.clearColor),false);assert.equal(privateWorld,false);assert.equal(worldChecks,1);
  } finally {if(toJson)Object.defineProperty(Object.prototype,'toJSON',toJson);else delete Object.prototype.toJSON;await server.close();}
});

test('mixed private worlds compare exposed records and detect new exposure during a getter', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldSync,retainPlayWorld}=await server.ssrLoadModule('/src/playWorldSync.ts'),world=retainPlayWorld({entities:Array.from({length:10000},(_,i)=>({entity:i+1,name:'Node '+i,components:{Transform:{position:[0,0,0]}}})),clearColor:[0,0,0,1],frame:0,simFrame:0});
    const entities=structuredClone(world.entities),indices=[3,9998],exposed=new Set(indices.map(i=>entities[i])),mapping=new WeakMap(world.entities.map((e,i)=>[e,entities[i]]));let verified=true,recordChecks=0;
    const sync=createPlayWorldSync({owns:value=>value===entities,unchanged:(value,saved)=>{recordChecks++;return !exposed.has(value)&&mapping.get(saved)===value;},comparisonIndices:(value,retained)=>verified&&value===entities&&retained===world.entities?indices:undefined,expose:()=>{verified=false;}});
    sync.captureRetained(world);for(let i=0;i<8;i++)assert.ok(sync.presentationMatches(entities,world.clearColor));assert.equal(recordChecks,16);
    entities[9998].name='Changed';assert.equal(sync.presentationMatches(entities,world.clearColor),false);entities[9998].name=world.entities[9998].name;
    let reads=0;Object.defineProperty(entities[3].components.Transform.position,0,{configurable:true,get(){reads++;verified=false;exposed.add(entities[8000]);entities[8000].name='New editable alias';return 0;}});
    assert.equal(sync.presentationMatches(entities,world.clearColor),false);assert.equal(reads,1);assert.equal(world.entities[8000].name,'Node 8000');
  } finally {await server.close();}
});

test('mixed private comparison falls back for remaining records when a getter installs serialization hooks', async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'}),toJson=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  try {
    const {createPlayWorldSync,retainPlayWorld}=await server.ssrLoadModule('/src/playWorldSync.ts'),world=retainPlayWorld({entities:[{entity:1,components:{Custom:{value:1}}},{entity:2,components:{}}],clearColor:[0,0,0,1],frame:0,simFrame:0}),entities=structuredClone(world.entities),indices=[0];let reads=0,recordChecks=0,exposures=0;
    const sync=createPlayWorldSync({owns:value=>value===entities,unchanged:value=>{recordChecks++;return value===entities[1];},comparisonIndices:()=>indices,expose:()=>{exposures++;}});
    sync.captureRetained(world);Object.defineProperty(entities[0].components.Custom,'value',{get(){reads++;Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){return this;}});return 1;}});
    assert.equal(sync.presentationMatches(entities,world.clearColor),false);assert.equal(reads,1);assert.equal(recordChecks,1);assert.equal(exposures,1);
  } finally {if(toJson)Object.defineProperty(Object.prototype,'toJSON',toJson);else delete Object.prototype.toJSON;await server.close();}
});

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


test('structured presentation verification tracks deep edits and never substitutes serialized equality', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createPlayWorldSync } = await server.ssrLoadModule('/src/playWorldSync.ts'), sync = createPlayWorldSync(), color = [0, 0, 0, 1];
    const entities = [{ entity: 1, parent: null, components: { Transform: { position: [1, 2, 3] } } }];
    assert.equal(sync.presentationMatches(entities, color), false); sync.capture(entities, color);
    assert.equal(sync.presentationMatches(entities, color), true);
    const displayed = sync.presentationSnapshot(entities, color);
    entities[0].components.Transform.position[0] = 7;
    assert.equal(sync.presentationMatches(entities, color), false); assert.equal(displayed.entities[0].components.Transform.position[0], 1);
    entities[0].components.Transform.position[0] = 1; assert.equal(sync.presentationMatches(entities, color), true);
    entities[0].parent = 9; assert.equal(sync.presentationMatches(entities, color), false);
    entities[0].parent = null; color[0] = .5; assert.equal(sync.presentationMatches(entities, color), false); color[0] = 0;
    const custom = [{ entity: 1, components: { Custom: { toJSON() { return { value: 2 }; } } } }];
    sync.capture(custom, color); assert.equal(sync.matches(custom, color), true);
    assert.equal(sync.presentationMatches(custom, color), false); assert.equal(sync.presentationSnapshot(custom, color), undefined);
    sync.reset(); assert.equal(sync.presentationMatches(entities, color), false);
  } finally { await server.close(); }
});


test('retained root certification keeps every nested value frozen without certifying independent component records', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { retainPlayWorld, cloneRetainedPlayRecord, isRetainedPlayRecord, createPlayWorldSync } = await server.ssrLoadModule('/src/playWorldSync.ts');
    const nested = JSON.parse('{"__proto__":{"value":7},"constructor":{"prototype":[1,{"deep":[true,null,"x"]}]},"toJSON":"data"}');
    const input = { entities: [{ entity: 1, components: { Custom: nested, Serialized: { toJSON() { return { values: [, undefined, Infinity], omitted: undefined }; } } } }], clearColor: [0, 0, 0, 1], frame: 0, simFrame: 0, selected: null, extra: { list: [1, { value: 2 }] } };
    const retained = retainPlayWorld(input), entity = retained.entities[0];
    const frozenTree = value => { if (value !== null && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozenTree(child); } };
    frozenTree(retained);
    assert.equal(isRetainedPlayRecord(entity), true);
    for (const child of [entity.components, entity.components.Custom, entity.components.Custom.constructor.prototype]) {
      assert.equal(isRetainedPlayRecord(child), false);
      assert.throws(() => cloneRetainedPlayRecord(child), /owned JSON record/);
    }
    assert.equal(isRetainedPlayRecord(Object.freeze({ ...entity })), false);
    assert.deepEqual(entity.components.Serialized, { values: [null, null, null] });
    assert.ok(Object.hasOwn(entity.components.Custom, '__proto__'));
    nested.__proto__.value = 99; input.extra.list[1].value = 8; input.clearColor[0] = .5;
    assert.equal(entity.components.Custom.__proto__.value, 7); assert.equal(retained.extra.list[1].value, 2); assert.equal(retained.clearColor[0], 0);
    const editable = cloneRetainedPlayRecord(entity); editable.components.Custom.constructor.prototype[1].deep.push('changed');
    assert.deepEqual(entity.components.Custom.constructor.prototype[1].deep, [true, null, 'x']);
    const sync = createPlayWorldSync(); sync.capture([editable], retained.clearColor);
    const first = sync.viewportSnapshot(); frozenTree(first.entities[0]); assert.ok(isRetainedPlayRecord(first.entities[0]));
    editable.components.Custom.__proto__.value = 10; sync.capture([editable], retained.clearColor);
    const second = sync.viewportSnapshot(); frozenTree(second.entities[0]); assert.ok(isRetainedPlayRecord(second.entities[0]));
    assert.equal(first.entities[0].components.Custom.__proto__.value, 7); assert.equal(second.entities[0].components.Custom.__proto__.value, 10);
  } finally { await server.close(); }
});
