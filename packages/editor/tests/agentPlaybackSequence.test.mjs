// Author: MiYu. Ordered native stepping retains input edges and stops safely on invalid or interrupted sequences.
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

test('playback sequences validate before input, await each frame, and refresh only at completion', async () => {
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 let bridge,previous;
 try {
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts');
  ({agentBridge:bridge}=await server.ssrLoadModule('/src/agent/AgentBridge.ts'));
  previous={store:bridge.store,editorBootReady:bridge.editorBootReady,refreshProvider:bridge.refreshProvider,captureViewport:bridge.captureViewport};
  const store=createEditorStore(),frames=[];let active=false,interrupt=false,restart=false,fail=false;
  store.setPlayRuntime({start:async snapshot=>snapshot,stop:()=>{},onError:()=>{},step:async (snapshot,input,dt)=>{
   assert.equal(active,false,'frames must not overlap');active=true;
   await new Promise(resolve=>setTimeout(resolve,1));frames.push({input,dt});active=false;
   if(fail)throw Error('Native frame failed');if(interrupt)store.stop();
   if(restart){store.stop();store.play();await store.waitForPlayRuntime();store.pause();}
   return snapshot;
  }});
  bridge.store=store;bridge.editorBootReady=true;let refreshes=0;
  bridge.connectRefresh(()=>{refreshes++;bridge.observe(false,store.snapshot());});bridge.observe(true);
  const phases=[{input:{keys:['KeyB'],buttons:[0],pointer:[30,40],viewport:[1280,720],pointerDelta:[4,-2]},deltaTime:.01},
   {steps:2,deltaTime:.02},{input:{keys:[],buttons:[],pointerDelta:[3,1]},deltaTime:.03}];
  await assert.rejects(()=>bridge.execute('playback.sequence',{phases}),{code:'READONLY'});
  store.play();await store.waitForPlayRuntime();store.pause();
  for(const invalid of [[],[{} ,{input:{buttons:[3]}}],[{} ,{steps:0}],Array.from({length:121},()=>({})),[{steps:600},{}]]){
   await assert.rejects(()=>bridge.execute('playback.sequence',{phases:invalid}),{code:'INVALID_ARGS'});
   assert.equal(frames.length,0,'invalid phases must not advance an earlier valid phase');
  }
  const before=store.frame;refreshes=0;
  const result=await bridge.execute('playback.sequence',{phases});
  assert.deepEqual(result.data,{mode:'pause',frame:before+4,steps:4,phases:3});assert.equal(refreshes,1);
  assert.deepEqual(frames.map(f=>f.dt),[.01,.02,.02,.03]);
  assert.deepEqual(frames[0].input.pressedKeys,['KeyB']);assert.deepEqual(frames[0].input.pressedButtons,[0]);
  assert.deepEqual(frames[0].input.pointerDelta,[4,-2]);assert.deepEqual(frames[1].input.keys,['KeyB']);
  for(const f of frames.slice(1,3)){assert.deepEqual(f.input.pressedKeys,[]);assert.deepEqual(f.input.releasedKeys,[]);assert.deepEqual(f.input.pointerDelta,[0,0]);}
  assert.deepEqual(frames[3].input.releasedKeys,['KeyB']);assert.deepEqual(frames[3].input.releasedButtons,[0]);
  assert.deepEqual(frames[3].input.pointerDelta,[3,1]);assert.deepEqual(frames[3].input.pointer,[30,40]);
  store.rename(store.snapshot().entities[0].entity,'Changed');
  await assert.rejects(()=>bridge.execute('playback.sequence',{phases:[{}]},{expectedSceneRevision:result.sceneRevision}),{code:'STALE_REVISION'});
  assert.equal(frames.length,4);
  bridge.captureViewport=async ()=>({format:'image/png',data:'capture-fixture'});
  assert.equal((await bridge.execute('playback.sequence',{phases:[{}]},{screenshot:true})).screenshotCaptured,true);
  interrupt=true;const count=frames.length;
  await assert.rejects(()=>bridge.execute('playback.sequence',{phases:[{},{}]}),e=>e.code==='READONLY'&&/changed Play session/.test(e.message));
  assert.equal(frames.length,count+1);interrupt=false;
  store.play();await store.waitForPlayRuntime();store.pause();restart=true;
  await assert.rejects(()=>bridge.execute('playback.sequence',{phases:[{input:{keys:['KeyA']}},{input:{keys:['KeyB']}}]}),e=>e.code==='READONLY'&&/changed Play session/.test(e.message));
  assert.equal(frames.length,count+2);assert.equal(store.mode,'pause');restart=false;fail=true;
  await assert.rejects(()=>bridge.execute('playback.sequence',{phases:[{},{}]}),/Native frame failed/);
  assert.equal(frames.length,count+3);
 } finally {if(bridge&&previous)Object.assign(bridge,previous);await server.close();}
});
