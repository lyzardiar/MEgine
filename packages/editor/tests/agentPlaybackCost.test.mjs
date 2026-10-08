// Author: MiYu. Queued input retains edges and revision guards without copying the scene.
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

test('bridge input avoids scene refresh while preserving edges, guards and requested captures', async () => {
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 let bridge,previous;
 try {
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts');
  ({agentBridge:bridge}=await server.ssrLoadModule('/src/agent/AgentBridge.ts'));
  previous={store:bridge.store,editorBootReady:bridge.editorBootReady,refreshProvider:bridge.refreshProvider,captureViewport:bridge.captureViewport};
  const store=createEditorStore(),inputs=[];
  store.setPlayRuntime({start:async snapshot=>snapshot,stop:()=>{},onError:error=>{throw error;},step:async (snapshot,input)=>{inputs.push(input);return snapshot;}});
  store.play();await store.waitForPlayRuntime();store.pause();
  bridge.store=store;bridge.editorBootReady=true;
  let refreshes=0,snapshots=0,captures=0;
  bridge.connectRefresh(()=>{refreshes++;bridge.observe(false,store.snapshot());});bridge.observe(true);
  const snapshot=store.snapshot;store.snapshot=()=>{snapshots++;return snapshot();};
  const revision=bridge.sceneChanges.revision,sequence=bridge.events.currentSequence;
  const first=await bridge.execute('playback.input',{keys:['KeyB'],buttons:[0],pointerDelta:[4,-2]});
  await bridge.execute('playback.input',{pointerDelta:[3,1]});
  const release=await bridge.execute('playback.input',{keys:[],buttons:[]});
  assert.deepEqual(first.data,{mode:'pause',queued:true});assert.equal(first.sceneRevision,revision);assert.equal(release.eventSequence,sequence);
  assert.equal(refreshes,0);assert.equal(snapshots,0);assert.equal(inputs.length,0);
  const stepped=await bridge.execute('playback.step',{steps:2});
  assert.equal(stepped.data.frame,store.frame);assert.equal(stepped.data.frame,snapshot().frame);
  assert.equal(snapshots,2,'only the final refresh and observation copy the scene, never the frame accessor');
  assert.deepEqual(inputs[0].pressedKeys,['KeyB']);assert.deepEqual(inputs[0].releasedKeys,['KeyB']);
  assert.deepEqual(inputs[0].pressedButtons,[0]);assert.deepEqual(inputs[0].releasedButtons,[0]);assert.deepEqual(inputs[0].pointerDelta,[7,-1]);
  assert.deepEqual(inputs[1].pressedKeys,[]);assert.deepEqual(inputs[1].releasedKeys,[]);assert.deepEqual(inputs[1].pointerDelta,[0,0]);
  store.rename(store.snapshot().entities[0].entity,'Changed after observation');snapshots=0;
  await assert.rejects(()=>bridge.execute('playback.input',{keys:['KeyF']},{expectedSceneRevision:revision}),{code:'STALE_REVISION'});
  assert.equal(snapshots,1,'an explicit optimistic guard must check live scene changes');
  const current=bridge.sceneChanges.revision;
  const guarded=await bridge.execute('playback.input',{keys:['KeyD']},{expectedSceneRevision:current});
  assert.equal(guarded.sceneRevision,current);
  bridge.captureViewport=async target=>{assert.equal(target,'scene');captures++;return {format:'image/png',data:'capture-fixture'};};
  refreshes=0;snapshots=0;
  const captured=await bridge.execute('playback.input',{keys:[]},{screenshot:true});
  assert.equal(captured.screenshotCaptured,true);assert.equal(captured.screenshotRequested,true);assert.equal(captures,1);assert.equal(refreshes,1);assert.equal(snapshots,2);
  bridge.captureViewport=async ()=>{throw new Error('Capture unavailable');};
  const unavailable=await bridge.execute('playback.input',{keys:[]},{screenshot:true});
  assert.equal(unavailable.ok,true);assert.equal(unavailable.screenshotCaptured,false);assert.equal(unavailable.screenshotError,'Capture unavailable');
  store.stop();await assert.rejects(()=>bridge.execute('playback.input',{keys:[]}),{code:'READONLY'});
 } finally {
  if(bridge&&previous)Object.assign(bridge,previous);
  await server.close();
 }
});
