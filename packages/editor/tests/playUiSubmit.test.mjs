// Author: MiYu. Submissions retain frame ownership through pending native steps and lifecycle resets.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
test('native UI submit queue captures values once and clears on Stop/restart',async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'}),savedWindow=globalThis.window;globalThis.window={};let runtime,clearMocks;
  try{
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),{createNativePlayRuntime}=await server.ssrLoadModule('/src/playRuntime.ts'),mocks=await server.ssrLoadModule('@tauri-apps/api/mocks');clearMocks=mocks.clearMocks;
    const store=createEditorStore(),records=[{entity:1,name:'Chat',components:{InputField:{text:'',interactable:true}}},{entity:2,name:'Disabled',components:{InputField:{interactable:false}}},{entity:3,name:'Hidden',active:false,components:{InputField:{}}}];
    store.loadSceneJson(JSON.stringify({version:1,name:'Input',world:{entities:records}}));store.queuePlayUiSubmit(1,'Edit ignored');let release,revision=0,requests=[];
    mocks.mockIPC((cmd,args)=>{
      if(cmd==='start_editor_play'){revision=0;return {sessionId:107,snapshot:{entities:args.snapshot.entities,frame:0,sim_frame:0,clear_color:[0,0,0,1]}};}
      if(cmd==='step_editor_play'){requests.push(args.input);return new Promise(resolve=>{release=()=>resolve({snapshot:{entities:[],frame:revision+1,sim_frame:revision+1,clear_color:[0,0,0,1]},reset:false,baseRevision:revision,revision:++revision});});}
    });
    runtime=createNativePlayRuntime(error=>{throw error;});store.setPlayRuntime(runtime);store.play();await store.waitForPlayRuntime();store.pause();
    store.queuePlayUiSubmit(1,'中文 😀');store.queuePlayUiSubmit(2,'Disabled');store.queuePlayUiSubmit(3,'Hidden');store.queuePlayUiSubmit(999,'Missing');store.step(.1);
    assert.deepEqual(requests[0].uiSubmits,[{entity:1,component:'InputField',value:'中文 😀'}]);
    store.queuePlayUiSubmit(1,'next');assert.equal(requests[0].uiSubmits.length,1);release();await store.waitForPlayRuntime();store.step(.1);
    assert.deepEqual(requests[1].uiSubmits,[{entity:1,component:'InputField',value:'next'}]);release();await store.waitForPlayRuntime();store.step(.1);assert.deepEqual(requests[2].uiSubmits,[]);release();await store.waitForPlayRuntime();
    store.queuePlayUiSubmit(1,'Stop discards');store.stop();store.play();await store.waitForPlayRuntime();store.pause();store.step(.1);assert.equal(requests.at(-1).uiSubmits?.length??0,0);release();await store.waitForPlayRuntime();store.stop();
  }finally{runtime?.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks?.();globalThis.window=savedWindow;await server.close();}
});
