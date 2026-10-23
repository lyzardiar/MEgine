// Author: MiYu. Native UI handlers own publication; Agent observation must not overwrite detached edits.
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

test('UI commands observe main changes and preserve detached edits and undo without a redundant refresh',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 let bridge,previous;
 try{
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts');({agentBridge:bridge}=await server.ssrLoadModule('/src/agent/AgentBridge.ts'));
  previous={store:bridge.store,editorBootReady:bridge.editorBootReady,refreshProvider:bridge.refreshProvider,interactWindow:bridge.interactWindow,captureWindow:bridge.captureWindow};
  const main=createEditorStore(),detached=createEditorStore(),entity=main.snapshot().entities[0];detached.loadSceneJson(main.saveSessionSceneJson('Map'));
  bridge.store=main;bridge.editorBootReady=true;bridge.observe(true);const initialRevision=bridge.sceneChanges.revision;
  let publications=0,captures=0;
  bridge.connectRefresh(()=>{publications++;detached.loadRemoteSceneJson(main.saveSessionSceneJson('Map'),'edit');});
  bridge.interactWindow=async(action,selector,windowLabel)=>{assert.equal(selector,'#name');if(windowLabel==='panel-inspector')detached.rename(entity.entity,'Detached edit');else main.rename(entity.entity,'Main edit');return {windowLabel,action};};
  const args={windowLabel:'panel-inspector',selector:'#name',expectedSnapshotRevision:'ui-v16-42-0123456789abcdef'};
  await bridge.execute('window.ui_set_value',{...args,value:'Detached edit'});
  assert.equal(publications,0);assert.equal(detached.entitySnapshot(entity.entity).name,'Detached edit');assert.equal(detached.canUndo,true);
  detached.undo();assert.equal(detached.entitySnapshot(entity.entity).name,entity.name);
  const result=await bridge.execute('window.ui_click',{...args,windowLabel:'main'});
  assert.ok(result.sceneRevision>initialRevision);assert.equal(publications,0);
  await assert.rejects(()=>bridge.execute('window.ui_click',args,{expectedSceneRevision:initialRevision}),{code:'STALE_REVISION'});
  bridge.captureWindow=async windowLabel=>{assert.equal(windowLabel,'panel-inspector');captures++;return {format:'image/png',data:'fixture'};};
  const captured=await bridge.execute('window.ui_press_key',{...args,key:'Enter'},{screenshot:true});
  assert.equal(captured.screenshotCaptured,true);assert.equal(captures,1);assert.equal(publications,0);assert.equal(detached.entitySnapshot(entity.entity).name,'Detached edit');assert.equal(detached.canUndo,true);
 }finally{if(bridge&&previous)Object.assign(bridge,previous);await server.close();}
});
