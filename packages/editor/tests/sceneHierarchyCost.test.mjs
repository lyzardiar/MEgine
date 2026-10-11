// Author: MiYu. Unrestricted hierarchy reads avoid scans while ancestor restrictions remain effective.
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
test('edit hierarchy keeps authored activation and permits toggles during Timeline previews',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
  store.loadSceneJson(JSON.stringify({version:1,name:'Preview',world:{entities:[{entity:1,name:'Actor',active:true,components:{}}]}}));
  store.setTimelinePreview({activations:[{entity:1,active:false}],animations:[],camera:null,particles:[]});
  assert.equal(store.presentationSnapshot().entities[0].active,false);
  assert.equal(store.hierarchyPresentation(store.presentationSnapshot().entities)[0].entity.active,true);
  assert.equal(store.setActive(1,false),true);assert.equal(store.entitySnapshot(1).active,false);
  store.setTimelinePreview({activations:[{entity:1,active:true}],animations:[],camera:null,particles:[]});
  assert.equal(store.presentationSnapshot().entities[0].active,true);
  assert.equal(store.hierarchyPresentation(store.presentationSnapshot().entities)[0].entity.active,false);
  assert.equal(store.setActive(1,true),true);store.clearTimelinePreview();assert.equal(store.entitySnapshot(1).active,true);
 }finally{await server.close();}
});
test('scene flags skip entity scans without restrictions and retain inherited restrictions',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
  store.loadSceneJson(JSON.stringify({version:1,name:'Flags',world:{entities:[{entity:1,name:'Parent',components:{}},{entity:2,name:'Child',parent:1,components:{}},{entity:3,name:'Other',components:{}}]}}));
  const entities=store.getVisibleFlat().map(n=>n.entity);let reads=0;
  for(const entity of entities){const id=entity.entity;Object.defineProperty(entity,'entity',{configurable:true,enumerable:true,get(){reads++;return id;}});}
  for(let i=0;i<1000;i++){assert.equal(store.sceneVisible(2),true);assert.equal(store.scenePickable(2),true);}
  assert.equal(reads,0,'unrestricted flags must not perform entity-array searches');
  assert.equal(store.sceneVisible(999),true);assert.equal(store.scenePickable(999),true);
  assert.equal(store.setSceneVisibility(1,false),true);assert.equal(store.setScenePickability(1,false),true);
  const child=store.createEmpty(1);
  assert.equal(store.sceneVisible(child),false);assert.equal(store.scenePickable(child),false);
  assert.equal(store.sceneVisible(3),true);assert.equal(store.scenePickable(3),true);
  store.play();assert.equal(store.sceneVisible(child),false);assert.equal(store.scenePickable(child),false);store.stop();
  store.showAllSceneObjects();store.enableAllScenePicking();reads=0;
  assert.equal(store.sceneVisible(child),true);assert.equal(store.scenePickable(child),true);assert.equal(reads,0);
 }finally{await server.close();}
});
