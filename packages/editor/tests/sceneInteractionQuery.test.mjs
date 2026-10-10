// Author: MiYu. Batched Scene inheritance, immutable snapshots and large-hierarchy query cost.
import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let server, createQuery, createStore, commands;
before(async () => {
  server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  ({createSceneInteractionQuery:createQuery} = await server.ssrLoadModule('/src/sceneInteractionQuery.ts'));
  ({createEditorStore:createStore} = await server.ssrLoadModule('/src/store.ts'));
  ({WRITE_COMMANDS:commands} = await server.ssrLoadModule('/src/agent/commands.ts'));
});
after(async () => { await server?.close(); });
const scene = entities => JSON.stringify({version:1,name:'Interaction',world:{entities}});
test('empty flags do not inspect entities; visibility and picking inherit independently', () => {
  const empty = createQuery(new Proxy([], {get(){throw Error('Unrestricted entity read');}}),new Set(),new Set());
  assert.equal(empty.sceneVisible(999),true); assert.equal(empty.scenePickable(999),true);
  const entities = [{entity:1},{entity:2,parent:1},{entity:3,parent:2},{entity:4}];
  const q = createQuery(entities,new Set([1]),new Set([2]));
  for (const id of [1,2,3,4,999]) { assert.equal(q.sceneVisible(id),![1,2,3].includes(id)); assert.equal(q.scenePickable(id),![2,3].includes(id)); }
  const native = createQuery([{entity:4295020005},{entity:4295020006,parent:4295020005}],new Set([4295020005]),new Set([4295020005]));
  assert.equal(native.sceneVisible(4295020006),false); assert.equal(native.scenePickable(4295020006),false);
});
test('cycles, missing parents and 60000-deep chains resolve without recursion or order dependence', () => {
  const entities = [{entity:1,parent:2},{entity:2,parent:1},{entity:3,parent:999},{entity:4,parent:5},{entity:5,parent:4}];
  for (const ids of [[1,2],[2,1]]) {
    const q = createQuery(entities,new Set([2,999]),new Set([999]));
    for (const id of ids) assert.equal(q.sceneVisible(id),false);
    assert.equal(q.sceneVisible(3),false); assert.equal(q.scenePickable(3),false);
    assert.equal(q.sceneVisible(4),true); assert.equal(q.sceneVisible(5),true);
    assert.equal(q.scenePickable(1),true); assert.equal(q.sceneVisible(1000),true);
  }
  const chain = Array.from({length:60000},(_,i)=>({entity:i+1,parent:i||null}));
  const q = createQuery(chain,new Set([1]),new Set([30000]));
  assert.equal(q.sceneVisible(60000),false); assert.equal(q.scenePickable(60000),false); assert.equal(q.scenePickable(1),true);
});
test('query copies parent numbers and restriction sets for the duration of the batch', () => {
  const entities = [{entity:1},{entity:2,parent:1}], hidden = new Set([1]), unpickable = new Set([1]);
  const old = createQuery(entities,hidden,unpickable);
  entities[1].parent = null; hidden.clear(); unpickable.clear();
  assert.equal(old.sceneVisible(2),false); assert.equal(old.scenePickable(2),false);
  const next = createQuery(entities,hidden,unpickable);
  assert.equal(next.sceneVisible(2),true); assert.equal(next.scenePickable(2),true);
});
test('fresh store batches follow creation, reparent, undo, clearing, reload and remote state', () => {
  const store = createStore(); store.loadSceneJson(scene([{entity:1,name:'Hidden',components:{}},{entity:2,name:'Other',components:{}}]));
  const fingerprint = store.sceneContentFingerprint(), undo = store.undoLabel;
  store.setSceneInteractionState([1],[1]); const old = store.sceneInteractionQuery();
  assert.equal(store.sceneContentFingerprint(),fingerprint); assert.equal(store.undoLabel,undo);
  const child = store.createEmpty(1); assert.equal(old.sceneVisible(child),true);
  const q = store.sceneInteractionQuery(); assert.equal(q.sceneVisible(child),false); assert.equal(q.scenePickable(child),false);
  assert.equal(store.setParent([2],1),true); assert.equal(store.sceneInteractionQuery().sceneVisible(2),false);
  assert.equal(store.undo(),true); assert.equal(store.sceneInteractionQuery().sceneVisible(2),true);
  store.showAllSceneObjects(); store.enableAllScenePicking(); assert.equal(store.sceneInteractionQuery().sceneVisible(child),true);
  assert.equal(q.sceneVisible(child),false); assert.equal(q.scenePickable(child),false);
  store.loadSceneJson(scene([{entity:1,components:{}},{entity:2,parent:1,components:{}}]));
  assert.equal(store.sceneInteractionQuery().sceneVisible(2),true);
  store.loadRemoteSceneJson(scene([{entity:1,components:{}},{entity:2,parent:1,components:{}}]),'edit');
  store.setSceneInteractionState([1],[2]); assert.equal(store.sceneInteractionQuery().sceneVisible(2),false); assert.equal(store.sceneInteractionQuery().scenePickable(1),true);
});
test('Play runtime new children and reparenting use current batches without modifying authored flags', async () => {
  const store = createStore(); store.loadSceneJson(scene([{entity:1,components:{}},{entity:2,components:{}}])); store.setSceneInteractionState([1],[1]);
  const authored = store.authoredEntities(), old = store.sceneInteractionQuery();
  const runtime = {start:async snap=>({...snap,entities:[...snap.entities,{entity:20,parent:1,components:{}}]}),step:async snap=>({...snap,entities:snap.entities.map(e=>e.entity===2?{...e,parent:1}:e),frame:1}),stop(){}};
  store.setPlayRuntime(runtime); store.play(); await store.waitForPlayRuntime(); store.pause();
  let q = store.sceneInteractionQuery(); assert.equal(q.sceneVisible(20),false); assert.equal(q.scenePickable(20),false); assert.equal(old.sceneVisible(20),true);
  store.step(.1); await store.waitForPlayRuntime(); q = store.sceneInteractionQuery(); assert.equal(q.sceneVisible(2),false); assert.equal(q.scenePickable(2),false);
  store.stop(); assert.deepEqual(store.authoredEntities(),authored); assert.equal(store.sceneInteractionQuery().sceneVisible(2),true); assert.equal(store.sceneInteractionQuery().sceneVisible(20),true);
});
test('52709 entities with nonempty flags require only one entity index pass per query batch', () => {
  let idReads = 0, parentReads = 0;
  const count = 52709, entities = Array.from({length:count},(_,i)=>({get entity(){idReads++;return i+1;},get parent(){parentReads++;return i?i:null;}}));
  const q = createQuery(entities,new Set([1]),new Set([count/2|0]));
  const indexed = idReads;
  assert.ok(indexed <= count*3); assert.equal(parentReads,count);
  for (let id=count;id>0;id--) { assert.equal(q.sceneVisible(id),false); assert.equal(q.scenePickable(id),id<(count/2|0)); }
  assert.equal(idReads,indexed); assert.equal(parentReads,count,'batch queries must not rescan entity parents');
});
test('Scene bridge commands validate requests, preserve authored data and expose inherited state', () => {
  const store = createStore(); store.loadSceneJson(scene([{entity:1,components:{}},{entity:2,parent:1,components:{}}]));
  const ctx = {store}, fingerprint = store.sceneContentFingerprint(), undo = store.undoLabel;
  assert.deepEqual(commands['view.set_scene_visibility'](ctx,{id:1,visible:false}).data,{entity:1,visible:false});
  assert.deepEqual(commands['view.set_scene_pickability'](ctx,{id:1,pickable:false}).data,{entity:1,pickable:false});
  assert.equal(store.sceneInteractionQuery().sceneVisible(2),false); assert.equal(store.sceneInteractionQuery().scenePickable(2),false);
  assert.equal(store.sceneContentFingerprint(),fingerprint); assert.equal(store.undoLabel,undo);
  for(const [command,key] of [['view.set_scene_visibility','visible'],['view.set_scene_pickability','pickable']]) {
    for(const args of [{id:999,[key]:false},{id:1,[key]:'false'},{[key]:false}])assert.throws(()=>commands[command](ctx,args));
  }
  commands['view.set_scene_visibility'](ctx,{id:2,visible:true}); commands['view.set_scene_pickability'](ctx,{id:2,pickable:true});
  assert.deepEqual(store.sceneHiddenIds,[]); assert.deepEqual(store.sceneUnpickableIds,[]);
  store.play(); assert.throws(()=>commands['view.set_scene_visibility'](ctx,{id:1,visible:false})); assert.throws(()=>commands['view.set_scene_pickability'](ctx,{id:1,pickable:false})); store.stop();
});
test('Hierarchy renders inherited controls from a batch without scalar row queries', async () => {
  const {Hierarchy} = await server.ssrLoadModule('/src/panels/Hierarchy.tsx');
  const store = createStore(); store.loadSceneJson(scene([{entity:1,name:'Parent',components:{}},{entity:2,name:'Child',parent:1,components:{}}])); store.setSceneInteractionState([1],[1]);
  store.expand(1);
  store.sceneVisible = store.scenePickable = () => {throw Error('Scalar query in hierarchy row');};
  const noop = () => {}, markup = renderToStaticMarkup(createElement(Hierarchy,{store,nodes:store.getVisibleFlat(),selectedIds:[],filter:'',pendingRenameId:null,onFilter:noop,onPendingRenameConsumed:noop,onRefresh:noop,onLog:noop,onFrame:noop}));
  assert.match(markup,/Show Child in Scene View/); assert.match(markup,/Enable Scene picking for Child/);
  assert.equal((markup.match(/scene-hidden scene-unpickable/g)||[]).length,2);
});
