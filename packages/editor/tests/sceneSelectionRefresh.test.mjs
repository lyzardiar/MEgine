// Author: MiYu. Exercise Scene selection refresh with the real store and the App/AgentBridge handlers.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';
import { combineMarqueeSelection } from '../src/marqueeSelection.ts';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../src/agent/AgentBridge.ts', import.meta.url), 'utf8');
const syntax = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = (node, predicate) => { if (predicate(node)) return node; return ts.forEachChild(node, child => find(child, predicate)); };
const refreshNode = find(syntax, node => ts.isVariableDeclaration(node) && node.name.getText(syntax) === 'refreshSelection');
assert.ok(refreshNode?.initializer);
const callback = name => find(syntax, node => ts.isJsxAttribute(node) && node.name.getText(syntax) === name).initializer.expression.getText(syntax);
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const makeHandlers = vm.runInNewContext(compile(`env => { const {store,props,setSnap,setSelected,setSelectedIds,agentBridge,broadcastScene,refresh,combineMarqueeSelection}=env; const refreshSelection=${refreshNode.initializer.getText(syntax)}; return {refreshSelection,onPick:${callback('onPick')},onMarqueeSelect:${callback('onMarqueeSelect')}};`));
const bridgeSyntax = ts.createSourceFile('AgentBridge.ts', bridge, ts.ScriptTarget.Latest, true);
const observer = find(bridgeSyntax, node => ts.isMethodDeclaration(node) && node.name.getText(bridgeSyntax) === 'observeSelection');
const comparator = find(bridgeSyntax, node => ts.isFunctionDeclaration(node) && node.name?.text === 'sameNumberArray');
const observerClass = vm.runInNewContext(compile(`${comparator.getText(bridgeSyntax)}; (class { ${observer.getText(bridgeSyntax)} })`));
const withStore = async fn => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    store.loadSceneJson(JSON.stringify({version:1,world:{entities:[{entity:1,name:'First',components:{Transform:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},Custom:{values:[1,2]}}},{entity:2,name:'Second',components:{Text:{text:'second'}}}],clearColor:[.1,.2,.3,1]}}));
    await fn(store);
  } finally { await server.close(); }
};
function fixture(store, detachedPanel) {
  store.select(null);
  const events=[], updates=[], observed=new observerClass(); let snapshot=store.presentationSnapshot(),selected=null,ids=[],broadcasts=0,full=0;
  Object.assign(observed,{store,observedState:{mode:'edit',sceneName:'Test',dirty:false,selectedIds:[],panelSignature:'panel',viewSignature:'view'},appendEvent:(type,data)=>events.push({type,data}),recordMenuEvent:()=>events.push({type:'menu'}),observe:()=>{full++;}});
  const handlers=makeHandlers({store,props:{detachedPanel},setSnap:update=>updates.push(update),setSelected:value=>{selected=value;},setSelectedIds:value=>{ids=value;},agentBridge:observed,broadcastScene:()=>{broadcasts++;},refresh:()=>{full++;},combineMarqueeSelection});
  return {...handlers,events,observed,updates,get snapshot(){return snapshot;},get selected(){return selected;},get ids(){return ids;},get broadcasts(){return broadcasts;},get full(){return full;},flush(){for(const update of updates.splice(0))snapshot=typeof update==='function'?update(snapshot):update;return snapshot;}};
}

test('Scene clicks, modifiers, marquee and clearing reuse content while updating selection and events',async()=>withStore(store=>{
  const f=fixture(store),before=f.snapshot,fingerprint=store.sceneContentFingerprint();
  const methods=['presentationSnapshot','snapshot','authoredEntities','sceneContentFingerprint'];const originals=Object.fromEntries(methods.map(key=>[key,store[key]]));
  for(const key of methods)store[key]=()=>{throw Error(`pure selection must not call ${key}`);};
  f.onPick(1,{});assert.deepEqual(f.ids,[1]);assert.equal(f.flush().entities,before.entities);assert.equal(f.snapshot.clearColor,before.clearColor);
  f.onPick(2,{additive:true});assert.deepEqual(f.ids,[1,2]);assert.equal(f.selected,2);
  f.onPick(1,{toggle:true});assert.deepEqual(f.ids,[2]);assert.equal(f.selected,2);
  f.onMarqueeSelect([1,2],'replace');assert.deepEqual(f.ids,[1,2]);
  f.onMarqueeSelect([1],'toggle');assert.deepEqual(f.ids,[2]);
  f.onMarqueeSelect([1],'add');assert.deepEqual(f.ids,[2,1]);
  f.onMarqueeSelect([],'replace');assert.deepEqual(f.ids,[]);assert.equal(f.selected,null);assert.equal(f.flush().entities,before.entities);
  assert.equal(f.broadcasts,7);assert.equal(f.full,0);assert.equal(f.events.filter(e=>e.type==='selection.changed').length,7);
  assert.equal(f.observed.observedState.dirty,false);assert.equal(f.observed.observedState.viewSignature,'view');
  Object.assign(store,originals);assert.equal(store.sceneContentFingerprint(),fingerprint);
}));

test('a queued content or Timeline refresh survives a later selection in the same React batch',async()=>withStore(store=>{
  const f=fixture(store);store.setComponent(1,'Custom',{values:[9]});const edited=store.presentationSnapshot();f.updates.push(edited);
  f.onPick(2,{});assert.equal(f.flush().entities,edited.entities);assert.deepEqual(f.snapshot.entities[0].components.Custom.values,[9]);
  store.setTimelinePreview({activations:[{entity:1,active:false}],animations:[],camera:null,particles:[]});const preview=store.presentationSnapshot();f.updates.push(preview);
  f.onPick(2,{});assert.equal(f.flush().entities,preview.entities);assert.equal(f.snapshot.entities[0].active,false);
  store.clearTimelinePreview();const cleared=store.presentationSnapshot();f.updates.push(cleared);f.onMarqueeSelect([],'replace');assert.equal(f.flush().entities,cleared.entities);assert.notEqual(f.snapshot.entities[0].active,false);
}));

test('unpickable objects are ignored, detached panels broadcast, and Play/Pause use full refresh',async()=>withStore(store=>{
  const f=fixture(store);store.setScenePickability(1,false);f.onPick(1,{});assert.equal(f.broadcasts,0);
  f.onMarqueeSelect([1,2],'replace');assert.deepEqual(f.ids,[2]);
  const detached=fixture(store,'scene');detached.onPick(2,{});assert.equal(detached.broadcasts,1);assert.equal(detached.events.length,0);
  store.play();f.refreshSelection();assert.equal(f.full,1);store.pause();f.refreshSelection();assert.equal(f.full,2);store.stop();
}));

test('selection observation initializes once, suppresses repeats and preserves the scene/view observation baseline',async()=>withStore(store=>{
  const f=fixture(store);f.observed.observeSelection();assert.equal(f.events.length,0);
  store.select(1);f.observed.observeSelection();f.observed.observeSelection();assert.equal(f.events.length,2);
  assert.deepEqual(f.events[0].data.selectedIds,[1]);store.select(2);assert.deepEqual(f.events[0].data.selectedIds,[1]);
  f.observed.observeSelection();assert.equal(f.events.length,4);assert.equal(f.observed.observedState.sceneName,'Test');
  f.observed.observedState=null;f.observed.observeSelection();assert.equal(f.full,1);
  f.observed.store=null;f.observed.observeSelection();assert.equal(f.full,1);
}));
