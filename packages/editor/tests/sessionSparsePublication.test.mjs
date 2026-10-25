// Author: MiYu. Sparse session publication preserves complete wire messages and immutable ownership checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

const entity=(id,value=id)=>({entity:id,name:`Entity ${id}`,components:{Custom:{values:[value]}}});
const frame=(entities,number=0)=>({entities,frame:number,simFrame:number,simulationTime:number/60,clearColor:[0,0,0,1],selected:null});
async function modules(run){
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{await run(await server.ssrLoadModule('/src/sessionSceneSerialization.ts'),await server.ssrLoadModule('/src/playWorldSync.ts'),server);}finally{await server.close();}
}

test('sparse publications match full comparisons across clock, patches, skipped versions and topology',async()=>modules(({createSessionScenePublisher,createSessionSceneReceiver},{retainPlayWorld,retainPlayWorldPatch})=>{
 const fast=createSessionScenePublisher(),full=createSessionScenePublisher(),receiver=createSessionSceneReceiver();let serial=0;
 const publish=(world,{scope='map:41',delta=true,hint=world}={})=>{
  const document={version:3,name:'地图',world:{entities:world.entities,clearColor:world.clearColor,frame:world.frame},settings:{nested:[1,{text:'中文'}]}};
  const id=String(++serial),actual=fast.publish(document,id,scope,delta,hint),expected=full.publish(document,id,scope,delta);
  assert.deepEqual(actual,expected);const decoded=receiver.readDocument(actual,id);assert.deepEqual(JSON.parse(JSON.stringify(decoded)),document);
  assert.ok(Object.isFrozen(decoded));assert.ok(Object.isFrozen(decoded.world.entities));return actual;
 };
 let world=retainPlayWorld(frame(Array.from({length:8},(_,index)=>entity(index+1))));publish(world);
 const initial=world;world=retainPlayWorldPatch(world,frame([],1));assert.deepEqual(publish(world).sceneDelta.changed,[]);
 world=retainPlayWorldPatch(world,frame([entity(7,1),entity(2,9),entity(6,1),entity(2,99)],2));assert.deepEqual(publish(world).sceneDelta.changed.map(v=>v[0]),[1,5,6]);
 world=retainPlayWorldPatch(world,frame([entity(2,7),entity(2,8)],2));assert.deepEqual(publish(world).sceneDelta.changed.map(v=>v[0]),[1]);
 const skipped=retainPlayWorldPatch(world,frame([entity(1,20)],3));world=retainPlayWorldPatch(skipped,frame([entity(3,30)],4));assert.deepEqual(publish(world).sceneDelta.changed.map(v=>v[0]),[0,2]);
 world=retainPlayWorld(frame([entity(3),entity(1),entity(4)]),world);publish(world);
 world=retainPlayWorldPatch(world,frame([entity(3,40),entity(1,50),entity(4,60)],5));assert.equal(publish(world).sceneDelta.changed.length,3);
 world=retainPlayWorldPatch(world,frame([entity(1,99)],5));publish(world,{delta:false});publish(world,{scope:'other:42'});
 publish(world,{hint:{...world}});publish({...world,entities:world.entities.slice()},{hint:world});
 const mutable=JSON.parse(JSON.stringify(world));publish(mutable,{hint:world});mutable.entities[0].components.Custom.values.push(71);publish(mutable,{hint:world});
 fast.reset();full.reset();assert.equal(publish(world).sceneDelta.base,null);
 publish(retainPlayWorld(frame([])));assert.equal(initial.entities[1].components.Custom.values[0],2);
}));

test('only the exact captured owned world can supply publication indices after mutable verification',async()=>modules((_,{retainPlayWorld,createPlayWorldSync,isRetainedPlayWorld})=>{
 const world=retainPlayWorld(frame([entity(1),entity(2)])),sync=createPlayWorldSync(),editable=JSON.parse(JSON.stringify(world.entities)),color=[...world.clearColor];
 sync.captureRetained(world);assert.equal(sync.retainedPresentation(world,editable,color),world);
 assert.equal(isRetainedPlayWorld({...world}),false);assert.equal(sync.retainedPresentation({...world},editable,color),undefined);
 assert.equal(sync.retainedPresentation(retainPlayWorld(frame([entity(1),entity(2)])),editable,color),undefined);
 editable[0].components.Custom.values.push(9);assert.equal(sync.retainedPresentation(world,editable,color),undefined);editable[0].components.Custom.values.pop();
 assert.equal(sync.retainedPresentation(world,editable,color),world);color[0]=1;assert.equal(sync.retainedPresentation(world,editable,color),undefined);color[0]=0;
 editable.reverse();assert.equal(sync.retainedPresentation(world,editable,color),undefined);editable.reverse();
 editable[0].name='modified';sync.capture(editable,color);assert.equal(sync.retainedPresentation(world,editable,color),undefined);assert.equal(sync.presentationSnapshot(editable,color).entities[0].name,'modified');
 sync.reset();assert.equal(sync.retainedPresentation(world,editable,color),undefined);
}));

test('expired weak ownership certificates preserve complete comparison and checkpoint recovery',async()=>modules(({createSessionScenePublisher},{retainPlayWorld,retainPlayWorldPatch})=>{
 const Weak=globalThis.WeakRef,fast=createSessionScenePublisher(),full=createSessionScenePublisher();
 try{
  globalThis.WeakRef=class extends Weak{deref(){return undefined;}};
  let world=retainPlayWorld(frame([entity(1),entity(2)]));
  for(let revision=0;revision<4;revision++){
   if(revision)world=retainPlayWorldPatch(world,frame(revision%2?[entity(2,revision)]:[],revision));
   const document={version:3,world:{entities:world.entities,frame:revision}},id=String(revision);
   assert.deepEqual(fast.publish(document,id,'same',true,world),full.publish(document,id,'same',true));
  }
 }finally{globalThis.WeakRef=Weak;}
}));

test('store publishes native sparse revisions and switches to full serialization for exposed edits',async()=>modules(async({createSessionSceneReceiver},_,server)=>{
 const savedWindow=globalThis.window;globalThis.window={};let source;
 const {mockIPC,clearMocks}=await server.ssrLoadModule('@tauri-apps/api/mocks');
 try{
  const {createNativePlayRuntime}=await server.ssrLoadModule('/src/playRuntime.ts'),{createEditorStore}=await server.ssrLoadModule('/src/store.ts');
  source=createEditorStore();const target=createEditorStore(),receiver=createSessionSceneReceiver();let revision=0,authored;
  source.loadSceneJson(JSON.stringify({version:3,name:'Map',world:{entities:[entity(1),entity(2)]}}));
  const host=(entities)=>({entities,frame:revision,sim_frame:revision,elapsed:revision/60,clear_color:[0,0,0,1]});
  mockIPC((command,args)=>{
   if(command==='start_editor_play'){authored=args.snapshot.entities;return {sessionId:41,snapshot:host(authored)};}
   if(command==='step_editor_play'){const baseRevision=revision++;return {baseRevision,revision,reset:revision===1,...(revision===1?{entityOrder:authored.map(e=>e.entity)}:{}),snapshot:host(revision===1?authored:revision%2?[{...authored[1],components:{Custom:{values:[revision]}}}]:[])};}
   if(command==='stop_editor_play')return;
   assert.fail(command);
  });
  source.setPlayRuntime(createNativePlayRuntime(error=>{throw error;}));source.play();await source.waitForPlayRuntime();source.pause();
  let serial=0;
  const publish=()=>{const id=String(++serial),message=source.publishSessionScene(id,true,'Map');target.loadRemoteSceneJson(receiver.readDocument(message,id),source.mode,source.playSessionId,source.nativePlayRevision);assert.deepEqual(JSON.parse(target.saveSessionSceneJson('Map')),JSON.parse(source.saveSessionSceneJson('Map')));return message;};
  assert.equal(publish().sceneDelta.base,null);
  for(let n=0;n<6;n++){source.step(1/60);await source.waitForPlayRuntime();const message=publish();assert.ok(message.sceneDelta);if(revision%2===0)assert.equal(message.sceneDelta.changed.length,0);}
  const mutable=source.playViewportSnapshot().entities;mutable[0].components.Custom.values.push(17);assert.equal(typeof publish().sceneJson,'string');
  source.stop();assert.equal(typeof publish().sceneJson,'string');
 }finally{source?.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks();if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;}
}));
