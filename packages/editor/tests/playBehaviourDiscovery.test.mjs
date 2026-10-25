// Author: MiYu. Verify immutable discovery reuse, registration and editable lifecycle fallbacks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {Behaviour,RegisterBehaviour,createBehaviourRunner} from '@mengine/behaviour';

const entity=(id,components={FastPathMarker:{value:id}})=>({entity:id,name:`Entity ${id}`,active:true,components});
const frame=(entities,number=0)=>({entities,frame:number,simFrame:number,simulationTime:number/60,clearColor:[0,0,0,1],selected:null});
async function modules(run){
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{await run(await server.ssrLoadModule('/src/playBehaviourDiscovery.ts'),await server.ssrLoadModule('/src/playWorldSync.ts'),server);}finally{await server.close();}
}
function countDiscovery(run){
 const original=Map.prototype.get;let reads=0;
 Map.prototype.get=function(key){if(key==='FastPathMarker')reads++;return original.call(this,key);};
 try{run(()=>reads);}finally{Map.prototype.get=original;}
}

test('certified absent worlds scan once and inspect only changed records in adjacent deltas',async()=>modules(({createPlayBehaviourDiscovery},{retainPlayWorld,retainPlayWorldPatch})=>{
 const discovery=createPlayBehaviourDiscovery();let world=retainPlayWorld(frame(Array.from({length:6},(_,i)=>entity(i+1))));
 countDiscovery(reads=>{
  assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),6);
  assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),6);
  world=retainPlayWorldPatch(world,frame([],1));assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),6);
  world=retainPlayWorldPatch(world,frame([entity(5),entity(5)],2));assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),7);
  const skipped=retainPlayWorldPatch(world,frame([entity(2)],3));world=retainPlayWorldPatch(skipped,frame([entity(3)],4));
  assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),9,'skipped patches inspect all previously unobserved records');
  world=retainPlayWorld(frame([world.entities[2],world.entities[0],entity(9)]));assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),10);
  assert.equal(discovery.hasNoBehaviours(retainPlayWorld(frame([]))),true);
 });
}));

test('late registration invalidates negative records and registry keys survive entry metadata edits',async()=>modules(async({createPlayBehaviourDiscovery},{retainPlayWorld,retainPlayWorldPatch},server)=>{
 const {Behaviour,RegisterBehaviour,getBehaviour,getBehaviourRegistrationToken}=await server.ssrLoadModule('@mengine/behaviour');
 const discovery=createPlayBehaviourDiscovery(),world=retainPlayWorld(frame([entity(1,{LateOwnedProbe:{}}),entity(2)]));
 assert.equal(discovery.hasNoBehaviours(world),true);const token=getBehaviourRegistrationToken();
 class Probe extends Behaviour{}
 RegisterBehaviour('LateOwnedProbe')(Probe);const entry=getBehaviour('LateOwnedProbe');
 assert.notEqual(getBehaviourRegistrationToken(),token);entry.type='RenamedMetadata';
 assert.equal(discovery.hasNoBehaviours(world),false,'actual registry key determines membership');
 const removed=retainPlayWorldPatch(world,frame([entity(1)],1));assert.equal(discovery.hasNoBehaviours(removed),true);
 const restored=retainPlayWorldPatch(removed,frame([entity(1,{LateOwnedProbe:{}})],2));assert.equal(discovery.hasNoBehaviours(restored),false);
 const before=getBehaviourRegistrationToken();RegisterBehaviour('LateOwnedProbe')(Probe);assert.notEqual(getBehaviourRegistrationToken(),before);
}));

test('dense replacements use normal discovery and an unchanged world can regain certification',async()=>modules(({createPlayBehaviourDiscovery},{retainPlayWorld,retainPlayWorldPatch})=>{
 const discovery=createPlayBehaviourDiscovery();let world=retainPlayWorld(frame(Array.from({length:6},(_,i)=>entity(i+1))));
 countDiscovery(reads=>{
  assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),6);
  for(let number=1;number<=3;number++){world=retainPlayWorldPatch(world,frame([1,2,3,4].map(id=>entity(id)),number));assert.equal(discovery.hasNoBehaviours(world),false);assert.equal(reads(),6);}
  world=retainPlayWorldPatch(world,frame([],4));assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),10);
  assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(reads(),10);
 });
}));

test('ordinary frozen inputs, getters, proxies and replaced enumeration cannot certify absence',async()=>modules(({createPlayBehaviourDiscovery},{retainPlayWorld})=>{
 let exposures=0;const discovery=createPlayBehaviourDiscovery(()=>exposures++),world=retainPlayWorld(frame([entity(1)]));assert.equal(discovery.hasNoBehaviours(world),true);
 assert.equal(discovery.hasNoBehaviours(Object.freeze({...world})),false);assert.equal(discovery.hasNoBehaviours(undefined),false);
 assert.equal(discovery.hasNoBehaviours({get entities(){assert.fail('untrusted getter evaluated');}}),false);
 assert.equal(discovery.hasNoBehaviours(new Proxy(world,{get(){assert.fail('untrusted proxy evaluated');}})),false);
 const originalKeys=Object.getOwnPropertyDescriptor(Object,'keys'),originalIterator=Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator);
 try{
  Object.defineProperty(Object,'keys',{configurable:true,get(){assert.fail('enumeration getter evaluated');}});assert.equal(discovery.hasNoBehaviours(world),false);
  Object.defineProperty(Object,'keys',originalKeys);Object.defineProperty(Array.prototype,Symbol.iterator,{...originalIterator,value:function*(){}});
  assert.equal(discovery.hasNoBehaviours(world),false);
 }finally{Object.defineProperty(Object,'keys',originalKeys);Object.defineProperty(Array.prototype,Symbol.iterator,originalIterator);}
 assert.equal(discovery.hasNoBehaviours(world),true);assert.equal(exposures,2,'custom enumeration exposes private inputs before normal discovery can leak aliases');
}));

test('expired weak world references retain complete discovery and registered component detection',async()=>modules(async({createPlayBehaviourDiscovery},{retainPlayWorld,retainPlayWorldPatch},server)=>{
 const {Behaviour,RegisterBehaviour}=await server.ssrLoadModule('@mengine/behaviour');class Probe extends Behaviour{}RegisterBehaviour('WeakOwnedProbe')(Probe);
 const Weak=globalThis.WeakRef;
 try{
  globalThis.WeakRef=class extends Weak{deref(){return undefined;}};
  const discovery=createPlayBehaviourDiscovery();let world=retainPlayWorld(frame([entity(1),entity(2)]));
  assert.equal(discovery.hasNoBehaviours(world),true);world=retainPlayWorldPatch(world,frame([entity(2,{WeakOwnedProbe:{}})],1));assert.equal(discovery.hasNoBehaviours(world),false);
 }finally{globalThis.WeakRef=Weak;}
}));

test('instance presence includes disabled instances until normal removal and unmount reconciliation',()=>{
 class Probe extends Behaviour{}
 RegisterBehaviour('OwnedInstanceProbe')(Probe);const runner=createBehaviourRunner(),item=entity(1,{OwnedInstanceProbe:{}});item.active=false;
 assert.equal(runner.hasInstances,false);runner.mount([item]);assert.equal(runner.hasInstances,true);
 delete item.components.OwnedInstanceProbe;runner.tick([item],.1);assert.equal(runner.hasInstances,false);
 item.components.OwnedInstanceProbe={};runner.tick([item],.1);assert.equal(runner.hasInstances,true);runner.unmount();assert.equal(runner.hasInstances,false);
});

test('native store skips private absent worlds and preserves late scripts, removal, exposure and Step',async()=>modules(async(_,__,server)=>{
 const savedWindow=globalThis.window;globalThis.window={};let store;
 const {mockIPC,clearMocks}=await server.ssrLoadModule('@tauri-apps/api/mocks');
 try{
  const {createNativePlayRuntime}=await server.ssrLoadModule('/src/playRuntime.ts'),{createEditorStore}=await server.ssrLoadModule('/src/store.ts');
  const {Behaviour,RegisterBehaviour,SerializeField}=await server.ssrLoadModule('@mengine/behaviour');
  const events=[];let revision=0,current,next;
  const host=(entities=current)=>({entities,frame:revision,sim_frame:revision,elapsed:revision/60,clear_color:[0,0,0,1]});
  mockIPC((command,args)=>{
   if(command==='start_editor_play'){current=structuredClone(args.snapshot.entities);return {sessionId:41,snapshot:host()};}
   if(command==='step_editor_play'){
    const reset=revision===0||args.snapshot!=null||next!=null;
    if(args.snapshot)current=structuredClone(args.snapshot.entities);if(next){current=next;next=undefined;}
    const baseRevision=revision++;return {baseRevision,revision,reset,...(reset?{entityOrder:current.map(e=>e.entity)}:{}),snapshot:host(reset?current:[])};
   }
   if(command==='stop_editor_play')return;assert.fail(command);
  });
  store=createEditorStore();store.loadSceneJson(JSON.stringify({version:3,world:frame([entity(1,{FastPathMarker:{},StoreLateProbe:{count:0}}),entity(2),entity(3),entity(4)])}));
  store.setPlayRuntime(createNativePlayRuntime(error=>{throw error;}));store.play();await store.waitForPlayRuntime();store.pause();
  countDiscovery(reads=>{store.step(.1);assert.equal(reads(),4);});await store.waitForPlayRuntime();
  store.step(.1);await store.waitForPlayRuntime();
  countDiscovery(reads=>{store.step(.1);assert.equal(reads(),0,'unchanged private record membership is reused');});await store.waitForPlayRuntime();
  store.setComponent(4,'FastPathMarker',{value:4});
  countDiscovery(reads=>{store.step(.1);assert.equal(reads(),4,'an equal edit still exposes its mutable record');});await store.waitForPlayRuntime();
  countDiscovery(reads=>{store.step(.1);assert.equal(reads(),4,'majority-private worlds with retained exposed records remain conservative');});await store.waitForPlayRuntime();
  class Probe extends Behaviour{count=0;onEnable(){events.push('enable');}onUpdate(){events.push('update');this.count++;}onDisable(){events.push('disable');}}
  SerializeField()(Probe.prototype,'count');RegisterBehaviour('StoreLateProbe')(Probe);
  store.step(.1);await store.waitForPlayRuntime();assert.deepEqual(events,['enable','update']);assert.equal(store.entitySnapshot(1).components.StoreLateProbe.count,1);
  next=current.map(e=>entity(e.entity));store.step(.1);await store.waitForPlayRuntime();store.step(.1);await store.waitForPlayRuntime();assert.equal(events.at(-1),'disable');
  const mutable=store.playViewportSnapshot().entities;mutable[0].components.StoreLateProbe={count:8};
  store.step(.1);await store.waitForPlayRuntime();assert.deepEqual(events.slice(-2),['enable','update']);assert.equal(store.entitySnapshot(1).components.StoreLateProbe.count,9);
  delete store.playViewportSnapshot().entities[0].components.StoreLateProbe;store.step(.1);await store.waitForPlayRuntime();assert.equal(events.at(-1),'disable');
  const alias=store.playViewportSnapshot().entities[0];store.step(.1);await store.waitForPlayRuntime();
  Object.defineProperty(alias.components,'StoreLateProbe',{configurable:true,enumerable:false,value:{count:14}});
  const before=events.length;store.step(.1);await store.waitForPlayRuntime();assert.equal(events.length,before);
  // A mutable retained alias must stay conservative even after an equal native publication.
  const live=store.playViewportSnapshot().entities[0];Object.defineProperty(live.components,'StoreLateProbe',{configurable:true,enumerable:true,writable:true,value:{count:20}});store.pause();store.tick(.1);await store.waitForPlayRuntime();
  assert.deepEqual(events.slice(-2),['enable','update']);assert.equal(store.entitySnapshot(1).components.StoreLateProbe.count,21);
  store.stop();await store.waitForPlayRuntime();assert.equal(events.at(-1),'disable');
 }finally{store?.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks();if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}
}));

test('registry reset invalidates existing registration certificates',async()=>modules(async({createPlayBehaviourDiscovery},{retainPlayWorld},server)=>{
 const {Behaviour,RegisterBehaviour,getBehaviourRegistrationToken}=await server.ssrLoadModule('@mengine/behaviour');
 const {clearRegistryForTests}=await server.ssrLoadModule(fileURLToPath(new URL('../../behaviour/dist/registry.js',import.meta.url)));
 class Probe extends Behaviour{}RegisterBehaviour('ResetOwnedProbe')(Probe);
 const discovery=createPlayBehaviourDiscovery(),world=retainPlayWorld(frame([entity(1,{ResetOwnedProbe:{}})])),token=getBehaviourRegistrationToken();
 assert.equal(discovery.hasNoBehaviours(world),false);clearRegistryForTests();assert.notEqual(getBehaviourRegistrationToken(),token);assert.equal(discovery.hasNoBehaviours(world),true);
}));

test('enumeration hooks that restore themselves cannot leave retained mutable aliases private',async()=>modules(async(_,__,server)=>{
 const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),{Behaviour,RegisterBehaviour}=await server.ssrLoadModule('@mengine/behaviour');
 const events=[];class Probe extends Behaviour{onUpdate(){events.push('update');}}
 RegisterBehaviour('EscapedEnumerationProbe')(Probe);const store=createEditorStore();
 const doc={version:3,world:frame([entity(1),entity(2),entity(3)])};store.loadRemoteSceneJson(JSON.stringify(doc),'play',41,0);store.tick(.1);
 const original=Object.keys;let alias;
 try{
  Object.keys=function(value){if(!alias&&Object.hasOwn(value,'FastPathMarker')){alias=value;Object.keys=original;}return original(value);};
  store.tick(.1);
 }finally{Object.keys=original;}
 assert.ok(alias);alias.EscapedEnumerationProbe={};store.tick(.1);
 assert.deepEqual(events,['update']);store.stop();
}));
