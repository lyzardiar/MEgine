// Author: MiYu. Exercise App synchronization handlers with independent real stores and queued channel messages.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';

const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const find=(node,predicate)=>predicate(node)?node:ts.forEachChild(node,child=>find(child,predicate));
const variable=name=>find(tree,node=>ts.isVariableDeclaration(node)&&node.name.getText(tree)===name).initializer.getText(tree);
const receiver=find(tree,node=>ts.isBinaryExpression(node)&&node.left.getText(tree)==='channel.onmessage').right.getText(tree);
const code=['broadcastScene','broadcastSelection','refreshSelection'].map(name=>`const ${name}=${variable(name)};`).join('\n')+`({broadcastScene,broadcastSelection,refreshSelection,receive:${receiver}})`;
const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const ref=current=>({current});

async function withPair(run){
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts');
    const host=(sender,detachedPanel)=>{
      const store=createEditorStore();store.loadSceneJson(JSON.stringify({version:1,name:'Map',world:{entities:[{entity:1,name:'Root',components:{}},{entity:2,name:'Child',parent:1,components:{Text:{text:'original'}}}]}}));
      const sent=[],timers=new Map();let timerId=0,snapshot=store.presentationSnapshot(),observations=0,fullRefreshes=0;
      const env={Date:{now:()=>1000},store,props:{detachedPanel},syncSender:ref(sender),syncChannel:ref({postMessage:message=>sent.push(structuredClone(message))}),syncReady:ref(true),applyingRemote:ref(false),booted:ref(true),syncTimer:ref(null),sceneSyncId:ref(null),sceneSyncSequence:ref(0),selectionSyncOrder:ref({revision:0,sender:''}),sceneNameRef:ref('Map'),lastSceneTimestamp:ref(0),remoteDirtyPeers:ref(new Map([['peer',{timestamp:Date.now()}]])),logsRef:ref([]),sceneDirtyRef:ref(false),resourceDocumentPathsRef:ref({}),localTimelinePreview:ref(null),remoteTimelinePreview:ref(null),remoteSceneFingerprint:ref(''),remoteSceneDirty:ref(false),savedSceneFingerprint:ref(store.sceneContentFingerprint()),logEnd:ref(0),
        setSnap:value=>{snapshot=typeof value==='function'?value(snapshot):value;},setSelected:()=>{},setSelectedIds:()=>{},setSceneDirty:()=>{},setSceneName:()=>{},setMode:()=>{},setGizmo:()=>{},setGameResolution:()=>{},setGameDisplay:()=>{},setLogs:()=>{},setTreeTick:()=>{},
        agentBridge:{observeSelection:()=>observations++},refresh:()=>fullRefreshes++,logService:{syncConsoleLines:()=>{},getEntries:()=>[]},formatConsoleLog:value=>value,
        window:{setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)},console:{error:(...args)=>assert.fail(args.join(' '))}};
      const handlers=vm.runInNewContext(compiled,env);
      return {...handlers,env,store,sent,get snapshot(){return snapshot;},get observations(){return observations;},get fullRefreshes(){return fullRefreshes;},flush(){for(const [id,fn] of timers){timers.delete(id);fn();}},deliver(to){for(const message of sent.splice(0))to.receive({data:message});}};
    };
    await run(host('main',undefined),host('hierarchy','hierarchy'),host('inspector','inspector'));
  }finally{await server.close();}
}

test('selection crosses windows without world serialization, loading, dirty calculation or an echo',async()=>withPair((main,detached)=>{
  main.broadcastScene(true);assert.equal(main.sent[0].type,'scene-state');main.deliver(detached);
  const entities=detached.snapshot.entities,fingerprint=detached.env.remoteSceneFingerprint.current;
  detached.env.sceneDirtyRef.current=true;
  for(const host of [main,detached])for(const key of ['saveSessionSceneJson','loadRemoteSceneJson','snapshot','presentationSnapshot','sceneContentFingerprint'])host.store[key]=()=>assert.fail('selection called '+key);
  main.store.selectMany([2],'replace');main.refreshSelection();assert.equal(main.sent.length,1);assert.equal(main.sent[0].type,'scene-selection');assert.equal('sceneJson' in main.sent[0],false);main.deliver(detached);
  assert.deepEqual(detached.store.selectedIds,[2]);assert.equal(detached.snapshot.entities,entities);assert.equal(detached.env.sceneDirtyRef.current,true);assert.equal(detached.env.remoteSceneFingerprint.current,fingerprint);assert.equal(detached.sent.length,0);
  detached.store.selectMany([1,2],'replace');detached.refreshSelection();detached.deliver(main);assert.deepEqual(main.store.selectedIds,[1,2]);assert.equal(main.sent.length,0);assert.equal(main.observations,2);
  detached.store.selectMany([],'replace');detached.refreshSelection();detached.deliver(main);assert.deepEqual(main.store.selectedIds,[]);
}));

test('queued content carries the newest selection and replaces the accepted synchronization identity',async()=>withPair((main,detached)=>{
  main.broadcastScene(true);main.deliver(detached);const previousId=main.env.sceneSyncId.current;
  main.store.selectMany([1],'replace');main.refreshSelection();const stale=main.sent.shift();
  main.store.rename(2,'Renamed');main.broadcastScene();main.store.selectMany([2],'replace');main.refreshSelection();assert.equal(main.sent.length,0);
  main.flush();assert.equal(main.sent.length,1);assert.equal(main.sent[0].type,'scene-state');assert.notEqual(main.sent[0].stateId,previousId);main.deliver(detached);
  assert.equal(detached.store.entitySnapshot(2).name,'Renamed');assert.deepEqual(detached.store.selectedIds,[2]);assert.equal(detached.env.sceneSyncId.current,main.env.sceneSyncId.current);
  detached.receive({data:stale});assert.deepEqual(detached.store.selectedIds,[2],'old selection cannot apply after content replacement');
}));

test('bootstrap, scene identity, playback and readiness retain full synchronization boundaries',async()=>withPair((main,detached)=>{
  main.store.selectMany([1],'replace');main.refreshSelection();assert.equal(main.sent.length,0);main.flush();assert.equal(main.sent[0].type,'scene-state');main.deliver(detached);
  main.store.selectMany([2],'replace');main.refreshSelection();const message=main.sent.shift();
  detached.receive({data:{...message,sceneName:'Other'}});assert.deepEqual(detached.store.selectedIds,[1]);
  detached.env.syncReady.current=false;detached.receive({data:message});assert.deepEqual(detached.store.selectedIds,[1]);detached.env.syncReady.current=true;
  detached.store.play();detached.receive({data:message});assert.deepEqual(detached.store.selectedIds,[1]);detached.refreshSelection();assert.equal(detached.fullRefreshes,1);detached.store.stop();
  main.env.remoteDirtyPeers.current.clear();main.refreshSelection();assert.equal(main.sent.length,0);
  main.env.applyingRemote.current=true;main.broadcastSelection();assert.equal(main.sent.length,0);
}));


test('three windows converge after concurrent bootstrap replies and same-time content publications',async()=>withPair((main,detached,third)=>{
  main.broadcastScene(true);const initial=main.sent.shift();detached.receive({data:initial});third.receive({data:initial});
  for(const host of [main,detached])host.receive({data:{type:'request-scene',sender:'inspector'}});
  const replies=[main.sent.shift(),detached.sent.shift()];
  for(const host of [main,detached,third])for(const message of host===third?[...replies].reverse():replies)host.receive({data:message});
  assert.equal(new Set([main,detached,third].map(h=>h.env.sceneSyncId.current)).size,1);
  main.store.rename(2,'main edit');detached.store.rename(2,'detached edit');
  main.broadcastScene(true);detached.broadcastScene(true);
  const edits=[main.sent.shift(),detached.sent.shift()];assert.equal(edits[0].timestamp,edits[1].timestamp);
  for(const host of [main,detached,third])for(const message of host===third?[...edits].reverse():edits)host.receive({data:message});
  assert.equal(new Set([main,detached,third].map(h=>h.env.sceneSyncId.current)).size,1);
  assert.equal(new Set([main,detached,third].map(h=>h.store.entitySnapshot(2).name)).size,1);
  for(const host of [main,detached,third])host.receive({data:initial});
  for(const sender of [main,detached,third]){
    sender.store.selectMany([2],'replace');sender.refreshSelection();const message=sender.sent.shift();
    assert.equal(message.type,'scene-selection');
    for(const host of [main,detached,third])if(host!==sender)host.receive({data:message});
    for(const host of [main,detached,third])assert.deepEqual(host.store.selectedIds,[2]);
  }
}));

test('pending local content and an uninitialized state reject thin selections',async()=>withPair((main,detached)=>{
  detached.receive({data:{type:'scene-selection',sender:'main',sceneName:'Map',stateId:null,selectedIds:[2]}});assert.deepEqual(detached.store.selectedIds,[1]);
  main.broadcastScene(true);main.deliver(detached);
  main.store.selectMany([2],'replace');main.refreshSelection();const selection=main.sent.shift();
  detached.store.rename(1,'local replacement');detached.store.selectMany([1],'replace');detached.broadcastScene();
  detached.receive({data:selection});assert.deepEqual(detached.store.selectedIds,[1]);
  detached.flush();detached.deliver(main);assert.deepEqual(main.store.selectedIds,[1]);assert.equal(main.store.entitySnapshot(1).name,'local replacement');
}));


test('simultaneous thin selections converge across three windows and ignore delayed duplicates',async()=>withPair((main,detached,third)=>{
 main.broadcastScene(true);const initial=main.sent.shift();detached.receive({data:initial});third.receive({data:initial});
 main.store.selectMany([1],'replace');main.refreshSelection();detached.store.selectMany([2],'replace');detached.refreshSelection();
 const messages=[main.sent.shift(),detached.sent.shift()];assert.equal(messages[0].revision,messages[1].revision);
 for(const host of [main,detached,third])for(const message of host===third?[...messages].reverse():messages)host.receive({data:message});
 for(const host of [main,detached,third])assert.deepEqual(host.store.selectedIds,[1]);
 third.store.selectMany([2],'replace');third.refreshSelection();const newer=third.sent.shift();assert.ok(newer.revision>messages[0].revision);
 for(const host of [main,detached,third]){host.receive({data:newer});for(const message of messages)host.receive({data:message});assert.deepEqual(host.store.selectedIds,[2]);}
}));
