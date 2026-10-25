// Author: MiYu. Native sparse observations preserve revisions, mutable fallback and JSON hook ordering.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {SceneChangeTracker} from '../src/agent/eventJournal.ts';
import {retainPlayWorld,retainPlayWorldPatch} from '../src/playWorldSync.ts';

const entity=(id,value=id)=>({entity:id,name:`Entity ${id}`,components:{Custom:{values:[value]}}});
const frame=(entities,number=0)=>({entities,frame:number,simFrame:number,simulationTime:number/60,clearColor:[0,0,0,1],selected:null});

test('sparse observations match full revisions and diffs across clocks, topology and state changes',()=>{
 const fast=new SceneChangeTracker(3),full=new SceneChangeTracker(3);let world=retainPlayWorld(frame(Array.from({length:8},(_,i)=>entity(i+1)))),name='Main';
 const compare=(state={clearColor:world.clearColor},hint=world,entities=world.entities)=>{
  assert.deepEqual(fast.observe(name,entities,state,hint),full.observe(name,entities,state));
  for(let revision=0;revision<=full.revision;revision++)assert.deepEqual(fast.diff(revision,entities,state),full.diff(revision,entities,state));
  assert.equal(fast.revision,full.revision);
 };
 compare();world=retainPlayWorldPatch(world,frame([],1));compare();
 world=retainPlayWorldPatch(world,frame([entity(7,20),entity(2,9),entity(2,10)],2));compare();
 world=retainPlayWorldPatch(world,frame([entity(7,20)],3));compare();compare({clearColor:[.2,0,0,1]});
 const skipped=retainPlayWorldPatch(world,frame([entity(1,30)],4));world=retainPlayWorldPatch(skipped,frame([entity(8,40)],5));compare();
 world=retainPlayWorld(frame([world.entities[7],world.entities[0],entity(9)]));compare();
 world=retainPlayWorldPatch(world,frame([entity(8,1),entity(1,2),entity(9,3)],6));compare();
 name='Other';compare();world=retainPlayWorldPatch(world,frame([entity(9,40)],7));compare();
 world=retainPlayWorld(frame([]));compare();world=retainPlayWorld(frame([entity(1,99)]));compare();
 fast.reset();full.reset();compare();
});

test('unchanged certified arrays avoid map comparisons and adjacent updates inspect only changed IDs',()=>{
 const tracker=new SceneChangeTracker();let world=retainPlayWorld(frame(Array.from({length:6},(_,i)=>entity(i+1))));tracker.observe('Main',world.entities,{},world);
 const original=Map.prototype.get;let reads=0;
 Map.prototype.get=function(key){if(typeof key==='number')reads++;return original.call(this,key);};
 try{
  assert.equal(tracker.observe('Main',world.entities,{},world),null);assert.equal(reads,0);
  world=retainPlayWorldPatch(world,frame([],1));assert.equal(tracker.observe('Main',world.entities,{},world),null);assert.equal(reads,0);
  world=retainPlayWorldPatch(world,frame([entity(2,9),entity(5,20)],2));reads=0;assert.deepEqual(tracker.observe('Main',world.entities,{},world).changed,[2,5]);assert.equal(reads,2);
  const copy=[...world.entities];assert.equal(tracker.observe('Main',copy,{},world),null);assert.equal(reads,8,'copied pointer lists cannot use a world certificate');
 }finally{Map.prototype.get=original;}
});

test('forged worlds and ordinary mutable records cannot hide getters, serialization or ID errors',()=>{
 const tracker=new SceneChangeTracker(),world=retainPlayWorld(frame([entity(1)]));tracker.observe('Main',world.entities,{},world);
 let value=0;const ordinary=[{entity:1,get name(){return `Name ${value}`;},components:{Custom:{values:[1]}}}];
 const hint=Object.freeze({...world,entities:ordinary});assert.deepEqual(tracker.observe('Main',ordinary,{},hint).changed,[1]);value++;
 assert.deepEqual(tracker.observe('Main',ordinary,{},hint).changed,[1]);ordinary[0].components.Custom.values.push(2);assert.deepEqual(tracker.observe('Main',ordinary,{},hint).changed,[1]);
 assert.throws(()=>tracker.observe('Main',[...world.entities,...world.entities],{},world),/duplicate entity id/);
 assert.throws(()=>tracker.observe('Main',retainPlayWorld(frame([entity(1),entity(1)])).entities),/duplicate entity id/);
 assert.deepEqual(tracker.observe('Main',world.entities,{},world).changed,[1]);assert.equal(tracker.observe('Main',world.entities,{},world),null);
});

test('scene-state getters installing JSON hooks invalidate sparse ownership for the next observation',()=>{
 const tracker=new SceneChangeTracker(),world=retainPlayWorld(frame([entity(1)]));tracker.observe('Main',world.entities,{},world);
 const original=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
 const restore=()=>{if(original)Object.defineProperty(Object.prototype,'toJSON',original);else delete Object.prototype.toJSON;};
 try{
  const state={get value(){Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(){return this===world.entities[0]?{entity:1,name:'Hook'}:this;}});return 1;}};
  const delta=tracker.observe('Main',world.entities,state,world);assert.equal(delta.sceneStateChanged,true);assert.deepEqual(delta.changed,[]);
  assert.deepEqual(tracker.observe('Main',world.entities,{value:1},world).changed,[1]);restore();
  assert.deepEqual(tracker.observe('Main',world.entities,{value:1},world).changed,[1]);assert.equal(tracker.observe('Main',world.entities,{value:1},world),null);
 }finally{restore();}
});

test('a failed scene-state serialization leaves the prior map available for sparse retry',()=>{
 const tracker=new SceneChangeTracker();let world=retainPlayWorld(frame([entity(1),entity(2),entity(3),entity(4)]));tracker.observe('Main',world.entities,{},world);
 world=retainPlayWorldPatch(world,frame([entity(2,99)],1));assert.throws(()=>tracker.observe('Main',world.entities,{get value(){throw Error('state unavailable');}},world),/state unavailable/);
 assert.equal(tracker.revision,1);assert.deepEqual(tracker.observe('Main',world.entities,{},world).changed,[2]);assert.equal(tracker.revision,2);
});

test('expired weak worlds fall back to complete observations without retaining stale baselines',()=>{
 const Weak=globalThis.WeakRef;
 try{
  globalThis.WeakRef=class extends Weak{deref(){return undefined;}};
  const fast=new SceneChangeTracker(),full=new SceneChangeTracker();let world=retainPlayWorld(frame([entity(1),entity(2),entity(3)]));
  for(let n=0;n<4;n++){if(n)world=retainPlayWorldPatch(world,frame([entity(2,n)],n));assert.deepEqual(fast.observe('Main',world.entities,{},world),full.observe('Main',world.entities));}
 }finally{globalThis.WeakRef=Weak;}
});

test('reentrant state getters cannot replace unchanged native signatures with a nested world',()=>{
 const fast=new SceneChangeTracker(),full=new SceneChangeTracker();let world=retainPlayWorld(frame([entity(1),entity(2),entity(3),entity(4)]));
 fast.observe('Main',world.entities,{},world);full.observe('Main',world.entities);
 world=retainPlayWorldPatch(world,frame([entity(2,99)],1));
 const state=tracker=>({get value(){tracker.reset();tracker.observe('Nested',[entity(99)]);return 1;}});
 assert.deepEqual(fast.observe('Main',world.entities,state(fast),world),full.observe('Main',world.entities,state(full)));
 assert.equal(fast.observe('Main',world.entities,{value:1}),null);assert.equal(full.observe('Main',world.entities,{value:1}),null);
});

test('the actual bridge consumes certified store observations and falls back after direct edits',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});let bridge,previous;
 try{
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),{isRetainedPlayWorld}=await server.ssrLoadModule('/src/playWorldSync.ts');
  ({agentBridge:bridge}=await server.ssrLoadModule('/src/agent/AgentBridge.ts'));previous={store:bridge.store,observedState:bridge.observedState,editorBootReady:bridge.editorBootReady};
  const store=createEditorStore(),doc={version:3,world:frame([entity(1),entity(2),entity(3)])};store.loadRemoteSceneJson(JSON.stringify(doc),'pause',41,0);
  const owned=store.sceneObservationSnapshot();assert.equal(isRetainedPlayWorld(owned),true);assert.ok(Object.isFrozen(owned.entities));
  bridge.store=store;bridge.editorBootReady=true;bridge.sceneChanges.reset();bridge.observedState=null;bridge.observe(true);const revision=bridge.sceneChanges.revision;
  bridge.observe(true);assert.equal(bridge.sceneChanges.revision,revision);
  store.setComponent(2,'Custom',{values:[99]});assert.equal(isRetainedPlayWorld(store.sceneObservationSnapshot()),false);bridge.observe(true);
  assert.deepEqual(bridge.getSceneDiff(revision).changed,[2]);assert.deepEqual(bridge.getSceneDiff(revision).entities[0].components.Custom.values,[99]);
  const mutable=store.playViewportSnapshot().entities;mutable[0].components.Custom.values.push(9);bridge.observe(true);assert.equal(bridge.sceneChanges.revision,revision+2);
  store.stop();assert.equal(isRetainedPlayWorld(store.sceneObservationSnapshot()),false);bridge.observe(true);
 }finally{if(bridge&&previous)Object.assign(bridge,previous);await server.close();}
});
