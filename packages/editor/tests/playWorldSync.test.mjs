// Author: MiYu. Preserve live-reference edits and JSON fallback semantics in retained Play worlds.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

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
