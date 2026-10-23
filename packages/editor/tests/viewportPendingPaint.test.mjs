// Author: MiYu. Pending native Game wakeups skip world reads only when pixels are unchanged and submission/scheduling are blocked.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';

test('production pending Game gate preserves wakeups, ownership, new pixels and browser overlays',async()=>{
 const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('Viewport.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX),expressions={};let prefix;
 function visit(node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='letterbox')expressions.letterbox=node.getText(ast);
  if(ts.isVariableDeclaration(node)){
   const name=node.name.getText(ast);
   if(['currentNativeGamePaintState','pendingNativeGamePaintUnchanged'].includes(name))expressions[name]=node.initializer.getText(ast);
   if(name==='paint'){
    const statements=node.initializer.body.statements,index=statements.findIndex(statement=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(d=>d.name.getText(ast)==='requestedProps'));
    assert.ok(index>0);prefix='('+node.initializer.parameters.map(p=>p.getText(ast)).join(',')+')=>{'+statements.slice(0,index+1).map(s=>s.getText(ast)).join('\n')+';return requestedProps;}';
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);assert.equal(Object.keys(expressions).length,3);assert.ok(prefix);
 const compile=(expression,scope)=>new Function(...Object.keys(scope),ts.transpileModule('const callback = '+expression+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText+'\nreturn callback;')(...Object.values(scope));
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const {nativeGamePaintUnchanged}=await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
  const requests=await server.ssrLoadModule('/src/nativeViewportRequests.ts');
  function fixture(){
   let now=110,worldReads=0,environment=0;const rect={width:850,height:478},canvas={getContext:()=>({}),getBoundingClientRect:()=>rect};
   const p={tab:'game',playing:true,gameResolution:null,gameDisplay:0,timelineCameraPreview:null,readRuntimeSessionId:()=>0};
   const request=requests.createNativeViewportRequestState(),frame={world:{runtimeSessionId:0}},capabilities={hasSpine:false,requiresBrowserSnapshot:false};
   const scope={propsRef:{current:p},nativeGameRequestRef:{current:request},nativeGameFrameRef:{current:frame},nativePresentationRef:{current:()=>capabilities},previousGamePaintRef:{current:null},nativeGamePaintUnchanged,
    window:{__TAURI_INTERNALS__:{},devicePixelRatio:1},uiHoverRef:{current:null},uiPressRef:{current:null},scenePaintEpochRef:{current:0},environmentPreviewRevision:()=>environment,
    performance:{now:()=>now},lastAnimationFrameAtRef:{current:0},lastProfilerFrameRef:{current:0},canvasRef:{current:canvas},liveCam:{current:{}},scene2DRef:{current:false},nativeSceneFrameRef:{current:null},nativeCameraPreviewFrameRef:{current:null},hoverGizmoRef:{current:null},activeGizmoRef:{current:null},previousScenePaintRef:{current:null},projectAssetSessionGeneration:()=>4,
    currentViewportProps:()=>{worldReads++;return p;}};
   scope.letterbox=compile(expressions.letterbox,scope);
   scope.currentNativeGamePaintState=compile(expressions.currentNativeGamePaintState,scope);
   scope.pendingNativeGamePaintUnchanged=compile(expressions.pendingNativeGamePaintUnchanged,scope);
   const presentationKey=JSON.stringify([null,0,null]),vp=scope.letterbox(850,478,null);
   requests.synchronizeNativeViewportRequestOwner(request,0,'4:'+JSON.stringify(['game',true,0,presentationKey,vp.w,vp.h,1]));
   request.lastRequestAt=100;request.resumeTimer=42;
   scope.previousGamePaintRef.current=scope.currentNativeGamePaintState(canvas,presentationKey,vp,1,true);
   return {scope,p,request,frame,capabilities,rect,canvas,check:(project=4)=>scope.pendingNativeGamePaintUnchanged(canvas,rect,now,project),paint:compile(prefix,scope),reads:()=>worldReads,setNow:value=>{now=value;},setEnvironment:value=>{environment=value;}};
  }
  for(const scenario of ['timer','full','capture','retry','timer-zero']){
   const f=fixture();
   if(scenario==='full'){f.request.resumeTimer=null;requests.beginNativeViewportRequest(f.request,'a');requests.beginNativeViewportRequest(f.request,'b');f.setNow(200);}
   if(scenario==='capture'){f.request.resumeTimer=null;f.request.captures=1;f.setNow(200);}
   if(scenario==='retry'){f.request.retryAt=300;f.setNow(200);}
   if(scenario==='timer-zero')f.request.resumeTimer=0;
   assert.equal(f.check(),true,scenario);f.paint();assert.equal(f.reads(),0,scenario+' skips world certification');
  }
  const changes={
   'no timer':f=>{f.request.resumeTimer=null;},due:f=>f.setNow(100+1000/60),'retry due':f=>{f.request.retryAt=200;f.setNow(200);},
   'single pending without timer':f=>{f.request.resumeTimer=null;requests.beginNativeViewportRequest(f.request,'a');},
   scene:f=>{f.p.tab='scene';},edit:f=>{f.p.playing=false;},browser:f=>{delete f.scope.window.__TAURI_INTERNALS__;},error:f=>{f.request.reportedError=true;},
   'no frame':f=>{f.scope.nativeGameFrameRef.current=null;},'new frame':f=>{f.scope.nativeGameFrameRef.current={...f.frame};},'no previous paint':f=>{f.scope.previousGamePaintRef.current=null;},
   stop:f=>{f.p.readRuntimeSessionId=()=>undefined;},restart:f=>{f.p.readRuntimeSessionId=()=>1;},'missing reader':f=>{delete f.p.readRuntimeSessionId;},'request owner':f=>{f.request.owner=1;},'frame owner':f=>{f.frame.world.runtimeSessionId=1;},
   display:f=>{f.p.gameDisplay=1;},resolution:f=>{f.p.gameResolution={width:960,height:900};},camera:f=>{f.p.timelineCameraPreview={source:1,target:2,weight:.5};},size:f=>{f.rect.width=960;},dpr:f=>{f.scope.window.devicePixelRatio=2;},
   hover:f=>{f.scope.uiHoverRef.current=1;},press:f=>{f.scope.uiPressRef.current=1;},epoch:f=>{f.scope.scenePaintEpochRef.current=1;},environment:f=>f.setEnvironment(1),
   spine:f=>{f.capabilities.hasSpine=true;},interaction:f=>{f.capabilities.requiresBrowserSnapshot=true;},'previous overlay':f=>{f.scope.previousGamePaintRef.current.browserRendering=true;},
  };
  for(const [name,change] of Object.entries(changes)){const f=fixture();change(f);assert.equal(f.check(),false,name);}
  const project=fixture();assert.equal(project.check(5),false,'new project');
  const resumed=fixture();resumed.paint();assert.equal(resumed.reads(),0);resumed.request.resumeTimer=null;resumed.setNow(100+1000/60);resumed.paint();assert.equal(resumed.reads(),1,'timer callback resumes full world preparation when due');
  const completed=fixture();completed.paint();completed.scope.nativeGameFrameRef.current={...completed.frame};completed.paint();assert.equal(completed.reads(),1,'newly completed pixels render even before the next request is due');
 }finally{await server.close();}
});
