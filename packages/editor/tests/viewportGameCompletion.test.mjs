// Author: MiYu. Exercise the production Game completion callback against current ownership and display changes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';

test('Game completion checks live ownership without world reads and releases every rejected buffer',async()=>{
 const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('Viewport.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 let completion,key,owner;
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentGameRequestKey')key=node.initializer.getText(ast);
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentViewportOwner')owner=node.initializer.getText(ast);
  if(ts.isArrowFunction(node)&&node.parameters[0]?.name.getText(ast)==='buffer'&&node.body.getText(ast).includes('const firstFrame = nativeGameFrameRef.current == null;'))completion=node.getText(ast);
  ts.forEachChild(node,visit);
 }
 visit(ast);assert.ok(key);assert.ok(completion);assert.ok(owner);
 const compile=(expression,scope)=>new Function(...Object.keys(scope),ts.transpileModule('const callback = '+expression+';', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText+'\nreturn callback;')(...Object.values(scope));
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const requests=await server.ssrLoadModule('/src/nativeViewportRequests.ts');
  const {nativeViewportFrameWorldCurrent}=await server.ssrLoadModule('/src/nativeViewportFrame.ts');
  for(const scenario of ['accepted','project','ticket','sequence','tab','size','display','session','edit-source']){
   let reads=0,releases=0,uploads=0,profile,clock=10;
   const entities=[],world={runtimeSessionId:7,sourceEntities:entities};
   const current={tab:'game',runtimeSessionId:7,entities,gameResolution:null,gameDisplay:0,timelineCameraPreview:null};
   current.readRuntimeSessionId=()=>current.runtimeSessionId;
   const bounds={width:850,height:478},request=requests.createNativeViewportRequestState();
   const ticket=requests.beginNativeViewportRequest(request,'revision');
   const scope={performance:{now:()=>++clock},projectAssetSessionGeneration:()=>scenario==='project'?2:1,projectGeneration:1,nativeViewportRequestCanPublish:requests.nativeViewportRequestCanPublish,request,ticket,
    propsRef:{current},currentViewportProps:()=>{reads++;return current;},nativeViewportFrameWorldCurrent,nativeWorld:{frameWorld:()=>world},releaseNativeViewportFrame:()=>{releases++;},
    uploadNativeViewportFrame:()=>{uploads++;return {width:850,height:478,image:{},profile:{counts:{uiPrimitives:0,uiBatches:0}}};},
    nativeGameFrameRef:{current:{image:{}}},recordOwnedNativeViewportProfile:(_,value)=>{profile=value;},p:{playing:true},gameRequestInterval:16,now:0,requestPreparedAt:4,presentationKey:'same',
    lastProfilerFrameRef:{current:10},paint:()=>assert.fail('no repaint needed'),window:{devicePixelRatio:1,setTimeout:()=>assert.fail('not first frame')},
    canvas:{getBoundingClientRect:()=>bounds},letterbox:(w,h)=>({w,h}),requestedGpuTimingRevision:0};
   scope.currentGameRequestKey=compile(key,scope);scope.requestKey=scope.currentGameRequestKey(current);
   scope.currentViewportOwner=compile(owner,scope);
   if(scenario==='ticket')request.generation++;
   if(scenario==='sequence')request.presentedSequence=ticket.sequence;
   if(scenario==='tab')current.tab='scene';
   if(scenario==='size')bounds.width=960;
   if(scenario==='display')current.gameDisplay=1;
   if(scenario==='session')current.runtimeSessionId=8;
   if(scenario==='edit-source'){delete world.runtimeSessionId;delete current.runtimeSessionId;current.entities=[];}
   compile(completion,scope)(new ArrayBuffer(0));
   assert.equal(reads,scenario==='edit-source'?1:0,scenario);
   assert.equal(uploads,scenario==='accepted'?1:0,scenario);assert.equal(releases,scenario==='accepted'?0:1,scenario);
   if(scenario==='accepted'){assert.equal(request.presentedSequence,ticket.sequence);assert.equal(profile.frontendPrepareMs,4);assert.ok(profile.frontendCompleteMs>=0);assert.equal(scope.nativeGameFrameRef.current.world,world);}
  }
 }finally{await server.close();}
});
