// Author: MiYu. Scene completion checks ownership; camera-preview completion also validates current camera data.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';

test('Scene and camera-preview completions retain fresh ownership and reject changed views',async()=>{
 const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('Viewport.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 const callbacks={};let key,owner;
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentSceneRequestKey')key=node.initializer.getText(ast);
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='currentViewportOwner')owner=node.initializer.getText(ast);
  if(ts.isArrowFunction(node)&&node.parameters[0]?.name.getText(ast)==='buffer'){
   for(const [name,ref] of [['scene','nativeSceneFrameRef'],['preview','nativeCameraPreviewFrameRef']])if(node.body.getText(ast).includes(`const firstFrame = ${ref}.current == null;`))callbacks[name]=node.getText(ast);
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);assert.ok(key);assert.ok(owner);assert.equal(Object.keys(callbacks).length,2);
 const compile=(expression,scope)=>new Function(...Object.keys(scope),ts.transpileModule('const callback = '+expression+';', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText+'\nreturn callback;')(...Object.values(scope));
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const requests=await server.ssrLoadModule('/src/nativeViewportRequests.ts');
  const {nativeViewportFrameWorldCurrent}=await server.ssrLoadModule('/src/nativeViewportFrame.ts');
  const {nativeSceneFrameRequestIdentity}=await server.ssrLoadModule('/src/nativeSceneFrame.ts');
  const {orbitEye}=await server.ssrLoadModule('/src/math3d.ts');
  const {gameCameraForEntity}=await server.ssrLoadModule('/src/gameCamera.ts');
  for(const kind of ['scene','preview'])for(const scenario of ['accepted','project','ticket','sequence','tab','session','edit-source',...(kind==='scene'?['size','orbit','hidden','2d']:['selection','camera','resolution','display'])]){
   let reads=0,releases=0,uploads=0;
   const entities=[{entity:1,components:{Camera3D:{primary:true,fov_y_degrees:60},Transform:{position:[0,3,8],rotation:[0,0,0,1],scale:[1,1,1]}}}];
   const world={runtimeSessionId:7,sourceEntities:entities},current={tab:'scene',runtimeSessionId:7,entities,selected:1,gameResolution:null,gameDisplay:0,sceneHiddenIds:[]};
   current.readRuntimeSessionId=()=>current.runtimeSessionId;
   const request=requests.createNativeViewportRequestState(),ticket=requests.beginNativeViewportRequest(request,'revision'),bounds={width:850,height:478};
   const scope={projectAssetSessionGeneration:()=>scenario==='project'?2:1,projectGeneration:1,nativeViewportRequestCanPublish:requests.nativeViewportRequestCanPublish,request,ticket,
    propsRef:{current},currentViewportProps:()=>{reads++;return current;},nativeViewportFrameWorldCurrent,nativeWorld:{frameWorld:()=>world},releaseNativeViewportFrame:()=>{releases++;},
    uploadNativeViewportFrame:()=>{uploads++;return {width:850,height:478,image:{},profile:{}};},
    nativeSceneFrameRef:{current:{image:{}}},nativeCameraPreviewFrameRef:{current:{image:{}}},recordOwnedNativeViewportProfile:()=>{},p:{},now:0,
    performance:{now:()=>10},lastProfilerFrameRef:{current:10},paint:()=>assert.fail('not first frame'),window:{devicePixelRatio:1,setTimeout:()=>assert.fail('not first frame')},
    liveCam:{current:{pivot:[0,0,0],yaw:0,pitch:.7,distance:10}},canvas:{getBoundingClientRect:()=>bounds},scene2DRef:{current:false},nativeSceneFrameRequestIdentity,orbitEye,MAX_NATIVE_SCENE_VIEW_DIMENSION:4096,
    gameCameraForEntity,selectedCamera:gameCameraForEntity(entities,1),requestedSceneCamera:{eye:[0,3,8]}};
   scope.currentSceneRequestKey=compile(key,scope);scope.nativeSceneIdentity={key:scope.currentSceneRequestKey(current),presentationKey:'original'};
   scope.currentViewportOwner=compile(owner,scope);
   scope.cameraPreviewKey=JSON.stringify([scope.selectedCamera,current.gameResolution,current.gameDisplay]);
   if(scenario==='project')assert.equal(scope.projectAssetSessionGeneration(),2);
   if(scenario==='ticket')request.generation++;
   if(scenario==='sequence')request.presentedSequence=ticket.sequence;
   if(scenario==='tab')current.tab='game';
   if(scenario==='session')current.runtimeSessionId=8;
   if(scenario==='edit-source'){delete world.runtimeSessionId;delete current.runtimeSessionId;current.entities=[];}
   if(scenario==='size')bounds.width=960;
   if(scenario==='orbit')scope.liveCam.current.yaw=1;
   if(scenario==='hidden')current.sceneHiddenIds=[2];
   if(scenario==='2d')scope.scene2DRef.current=true;
   if(scenario==='selection')current.selected=null;
   if(scenario==='camera')entities[0].components.Camera3D.fov_y_degrees=75;
   if(scenario==='resolution')current.gameResolution={width:1920,height:1080};
   if(scenario==='display')current.gameDisplay=1;
   compile(callbacks[kind],scope)(new ArrayBuffer(0));
   assert.equal(reads,kind==='scene'?(scenario==='edit-source'?1:0):['project','ticket','sequence'].includes(scenario)?0:1,`${kind}/${scenario}`);
   assert.equal(uploads,scenario==='accepted'?1:0,`${kind}/${scenario}`);assert.equal(releases,scenario==='accepted'?0:1,`${kind}/${scenario}`);
   if(scenario==='accepted'){assert.equal(request.presentedSequence,ticket.sequence);assert.equal((kind==='scene'?scope.nativeSceneFrameRef:scope.nativeCameraPreviewFrameRef).current.world,world);}
  }
 }finally{await server.close();}
});
