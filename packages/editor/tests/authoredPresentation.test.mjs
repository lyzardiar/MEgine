// Author: MiYu. Ordinary panel refreshes reuse snapshots; previews retain authored values.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

test('App avoids duplicate world copies while animation and Timeline preserve authoring',async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
    store.loadSceneJson(JSON.stringify({version:1,name:'Preview',world:{entities:[{entity:1,name:'Actor',active:true,components:{Transform:{position:[0,0,0]}}}]}}));
    const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
    const block=app.slice(app.indexOf('  const scenePreviewActive ='),app.indexOf('  const authoredInspectorEntities ='));
    assert.ok(block.includes('useMemo'));
    let copies=0;const authored=store.authoredEntities;store.authoredEntities=()=>{copies++;return authored();};
    const read=()=>{const snap=store.presentationSnapshot();return {snap,entities:vm.runInNewContext(`(()=>{${block}return authoredEntities;})()`,{store,snap,useMemo:fn=>fn()})};};
    let result=read();assert.equal(result.entities,result.snap.entities);assert.equal(copies,0);
    store.setAnimationPreview(1,[{target:'.',component:'Transform',property:'position.x',value:7}]);
    result=read();assert.equal(result.snap.entities[0].components.Transform.position[0],7);assert.equal(result.entities[0].components.Transform.position[0],0);assert.equal(copies,1);
    store.setTimelinePreview({activations:[{entity:1,active:false}],animations:[],camera:null,particles:[]});
    result=read();assert.equal(result.snap.entities[0].active,false);assert.equal(result.entities[0].active,true);assert.equal(copies,2);
    store.clearTimelinePreview();result=read();assert.equal(result.entities,result.snap.entities);assert.equal(copies,2);
    store.play();store.setTag(1,'Runtime');result=read();assert.equal(result.entities,result.snap.entities);assert.equal(result.entities[0].tag,'Runtime');assert.equal(copies,2);store.stop();
  }finally{await server.close();}
});
