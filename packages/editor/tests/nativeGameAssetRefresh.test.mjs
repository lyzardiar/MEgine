// Author: MiYu. Asset reload requests new native pixels while retaining the displayed Game frame.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import { nativeGameFrameMatchesRequest, nativeViewportFrameWorldCurrent } from '../src/nativeViewportFrame.ts';

const source=fs.readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
const start=source.lastIndexOf('    const clear =',source.indexOf('      clearModelPreview();')),end=source.indexOf('    const clearUiLayout',start);
assert.ok(start>0&&end>start);
const run=vm.runInNewContext(ts.transpileModule(`env=>{const {clearModelPreview,clearMaterialPreviews,nativeGameRequestRef,nativeSceneRequestRef,nativeCameraPreviewRequestRef,nativeGameFrameRef,nativeSceneFrameRef,nativeCameraPreviewFrameRef,sceneWorldArgsRef,sceneCanvasSurfaceRef,sceneOverlayLayoutRef,reportedMaterialErrorsRef,invalidateEnvironmentPreviews,window}=env;${source.slice(start,end)}clear();}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
const fixture=frame=>({clearModelPreview(){},clearMaterialPreviews(){},nativeGameRequestRef:{current:{generation:4,inFlight:true}},nativeSceneRequestRef:{current:{generation:5,resumeTimer:null}},nativeCameraPreviewRequestRef:{current:{generation:6}},nativeGameFrameRef:{current:frame},nativeSceneFrameRef:{current:{}},nativeCameraPreviewFrameRef:{current:{}},sceneWorldArgsRef:{current:{}},sceneCanvasSurfaceRef:{current:{}},sceneOverlayLayoutRef:{current:{}},reportedMaterialErrorsRef:{current:new Set()},invalidateEnvironmentPreviews(){},window:{clearTimeout(){}}});

test('asset reload retains frame pixels and world ownership, invalidates pending work and forces refresh',()=>{
  const frame={image:{pixels:'last complete frame'},world:{runtimeSessionId:7,sourceEntities:[]},worldRevision:12,requestKey:'view',presentationKey:'game'},env=fixture(frame);
  assert.equal(nativeGameFrameMatchesRequest(frame,{playSessionId:7,playRevision:12},'view'),true);
  run(env);const retained=env.nativeGameFrameRef.current;
  assert.equal(retained.image,frame.image);assert.equal(retained.world,frame.world);assert.equal(retained.worldRevision,12);assert.equal(retained.presentationKey,'game');
  assert.equal(nativeViewportFrameWorldCurrent(retained.world,{runtimeSessionId:7,entities:[]}),true);
  assert.equal(nativeViewportFrameWorldCurrent(retained.world,{runtimeSessionId:8,entities:[]}),false,'retaining asset pixels never crosses a Play session');
  assert.equal(nativeGameFrameMatchesRequest(retained,{playSessionId:7,playRevision:12},'view'),false,'same paused revision still requests new assets');
  assert.equal(env.nativeGameRequestRef.current.generation,5);assert.equal(env.nativeSceneRequestRef.current.generation,6);assert.equal(env.nativeCameraPreviewRequestRef.current.generation,7);
  assert.equal(frame.requestKey,'view','prior presentation state remains intact');
  run(env);assert.equal(env.nativeGameFrameRef.current.image,frame.image);assert.equal(env.nativeGameRequestRef.current.generation,6);
});

test('asset reload before the first Game frame keeps first-frame loading semantics',()=>{
  const env=fixture(null);run(env);assert.equal(env.nativeGameFrameRef.current,null);assert.equal(env.nativeGameRequestRef.current.generation,5);
});
