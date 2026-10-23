// Author: MiYu. Live session ownership is independent from native world certification and stale React props.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';

test('production ownership reader follows pending start, Stop, restart, remote sessions and browser fallback',async()=>{
 const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('Viewport.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX),expressions={};
 function visit(node){if(ts.isVariableDeclaration(node)&&['currentViewportProps','currentViewportOwner','currentUiItems','currentUiEntities'].includes(node.name.getText(ast)))expressions[node.name.getText(ast)]=node.initializer.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);assert.equal(Object.keys(expressions).length,4);
 const app=ts.createSourceFile('App.tsx',readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 function visitApp(node){if(ts.isJsxAttribute(node)&&node.name.getText(app)==='readRuntimeSessionId')expressions.readRuntimeSessionId=node.initializer.expression.getText(app);ts.forEachChild(node,visitApp);}visitApp(app);assert.ok(expressions.readRuntimeSessionId);
 const compile=(name,scope)=>new Function(...Object.keys(scope),ts.transpileModule('const callback = '+expressions[name]+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText+'\nreturn callback;')(...Object.values(scope));
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 const originalWindow=globalThis.window;globalThis.window={};let runtime,clearMocks;
 try{
  const mocks=await server.ssrLoadModule('@tauri-apps/api/mocks');clearMocks=mocks.clearMocks;
  const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
  const {createNativePlayRuntime}=await server.ssrLoadModule('/src/playRuntime.ts');
  const {nativeViewportFrameWorldCurrent,nativeSceneWorldReference,createNativeViewportWorldArgs}=await server.ssrLoadModule('/src/nativeViewportFrame.ts');
  let nextSession=0,startResolve,worldReads=0;
  mocks.mockIPC(cmd=>{if(cmd==='start_editor_play')return new Promise(resolve=>{startResolve=resolve;});});
  runtime=createNativePlayRuntime(error=>{throw error;});store.setPlayRuntime(runtime);
  const propsRef={current:{tab:'game',entities:store.snapshot().entities,clearColor:[0,0,0,1],readRuntimeSessionId:compile('readRuntimeSessionId',{store}),runtimeSnapshot:()=>{worldReads++;return store.playRenderSnapshot();}}};
  const scope={propsRef,filteredSceneRef:{current:null},nativeSceneWorldReference,nativeViewportFrameWorldCurrent,uiFrameWorldRef:{current:null},uiItemsRef:{current:[{id:'button'}]}};
  scope.currentViewportProps=compile('currentViewportProps',scope);scope.currentViewportOwner=compile('currentViewportOwner',scope);
  const items=compile('currentUiItems',scope),entities=compile('currentUiEntities',scope),owner=scope.currentViewportOwner;
  const finishStart=async()=>{await new Promise(resolve=>setImmediate(resolve));assert.ok(startResolve);startResolve({sessionId:nextSession++,snapshot:{entities:store.snapshot().entities,frame:0,sim_frame:0,clear_color:[0,0,0,1]}});await store.waitForPlayRuntime();store.pause();};
  store.play();await finishStart();
  const initial=store.playRenderSnapshot(),frame=createNativeViewportWorldArgs(initial).frameWorld();assert.equal(frame.runtimeSessionId,0,'zero is a valid session');
  scope.uiFrameWorldRef.current=frame;
  propsRef.current={...propsRef.current,...initial};
  worldReads=0;
  for(let i=0;i<20;i++){assert.equal(nativeViewportFrameWorldCurrent(frame,owner()),true);assert.equal(items(),scope.uiItemsRef.current);assert.equal(entities(),frame.entities);}
  assert.equal(worldReads,0,'ownership and UI hit validation do not certify the world');
  const editable=store.playViewportSnapshot().entities[0];editable.name='Direct edit';
  assert.equal(nativeViewportFrameWorldCurrent(frame,owner()),true,'same-session presentation remains valid');assert.equal(worldReads,0);
  const request=createNativeViewportWorldArgs(scope.currentViewportProps()).worldArgs();assert.ok(request.snapshot,'new requests still upload direct edits');assert.equal(request.snapshot.entities[0].name,'Direct edit');
  store.stop();assert.equal(propsRef.current.runtimeSessionId,0,'React props intentionally stay stale');
  assert.equal(nativeViewportFrameWorldCurrent(frame,owner()),false);assert.deepEqual(items(),[]);assert.deepEqual(entities(),[]);
  store.play();assert.equal(nativeViewportFrameWorldCurrent(frame,owner()),false,'pending startup must reject the old session');await finishStart();
  worldReads=0;assert.equal(owner().runtimeSessionId,1);assert.equal(nativeViewportFrameWorldCurrent(frame,owner()),false);assert.equal(worldReads,0);
  store.stop();store.setPlayRuntime(null);
  const document=JSON.stringify({world:{entities:store.snapshot().entities,clearColor:[0,0,0,1]}});
  store.loadRemoteSceneJson(document,'pause',90,1);assert.equal(owner().runtimeSessionId,90);store.loadRemoteSceneJson(document,'pause',91,2);assert.equal(owner().runtimeSessionId,91);
  store.loadRemoteSceneJson(document,'edit');assert.equal(owner().runtimeSessionId,undefined);
  store.play();store.pause();worldReads=0;const browser=scope.currentViewportProps();const browserFrame=createNativeViewportWorldArgs(browser).frameWorld();assert.equal(nativeViewportFrameWorldCurrent(browserFrame,owner()),true);assert.ok(worldReads>=2,'non-native worlds keep full identity reads');store.stop();
  delete propsRef.current.readRuntimeSessionId;worldReads=0;assert.equal(owner(),propsRef.current);assert.equal(worldReads,1,'embedded callers without a session reader retain the original fallback');
 }finally{runtime?.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks?.();globalThis.window=originalWindow;await server.close();}
});
