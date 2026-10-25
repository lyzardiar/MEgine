// Author: MiYu. Awaiting a native Game image must skip browser geometry, with full fallback after failure.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from '../node_modules/typescript/lib/typescript.js';

const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
const pending=source.split('\n').find(line=>line.includes('const nativeGamePending ='));
const start=source.indexOf('    const worldEntries ='),end=source.indexOf('    const spatialCandidates =',start);
assert.ok(pending&&start>0&&end>start);
const body=`const nativeSceneBrowser=null; const {isGame,nativeGameReady,window,nativeGameRequestRef,displayedPresentation,p,isActive,worldTransforms,resolvedTransform,spatialIndexRef,selSet,trailDrawByEntity,particleDrawByEntity,entityBoundsRef}=env;${pending}\n${source.slice(start,end)} return worldEntries;`;
const submit=new Function('env',ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
const entities=[{entity:1,components:{MeshRenderer:{mesh:'model.gltf'}}},{entity:2,components:{SpineSkeleton:{}}},{entity:3,active:false,components:{MeshRenderer:{mesh:'inactive.glb'}}}];

test('native Game startup skips model bounds and preview preparation until a complete frame exists', () => {
  for(const displayed of [false,true]){
    let entries=0,boundsReads=0,submitted;
    submitted=submit({isGame:true,nativeGameReady:false,window:{__TAURI_INTERNALS__:{}},nativeGameRequestRef:{current:{reportedError:false}},displayedPresentation:displayed?{worldEntries(){entries++;throw Error('Pending native Game does not need browser geometry');}}:undefined,p:{entities},isActive:id=>id!==3,worldTransforms:new Map(),resolvedTransform:()=>({}),spatialIndexRef:{current:{update:value=>{submitted=value;}}},selSet:new Set(),trailDrawByEntity:new Map(),particleDrawByEntity:new Map(),entityBoundsRef:{current:()=>{boundsReads++;throw Error('No duplicate model loading');}}});
    assert.equal(entries,0);assert.equal(boundsReads,0);assert.deepEqual(submitted,[]);
  }
});

test('browser Game, native failure and Scene retain geometry; a complete native image retains Spine overlays', () => {
  for(const variant of [{isGame:true,desktop:false,failed:false,ready:false},{isGame:true,desktop:true,failed:true,ready:false},{isGame:false,desktop:true,failed:false,ready:false},{isGame:true,desktop:true,failed:false,ready:true}]){
    const reads=[];let submitted;
    submitted=submit({isGame:variant.isGame,nativeGameReady:variant.ready,window:variant.desktop?{__TAURI_INTERNALS__:{}}:{},nativeGameRequestRef:{current:{reportedError:variant.failed}},displayedPresentation:{worldEntries(spineOnly){return entities.filter(e=>e.active!==false&&(!spineOnly||e.components.SpineSkeleton)).map(e=>({e,t:{}}));}},p:{entities},isActive:id=>id!==3,worldTransforms:new Map(),resolvedTransform:()=>({}),spatialIndexRef:{current:{update:value=>{submitted=value;}}},selSet:new Set(),trailDrawByEntity:new Map(),particleDrawByEntity:new Map(),entityBoundsRef:{current:components=>{reads.push(components);return null;}}});
    assert.equal(submitted.length,variant.ready?1:2);assert.equal(reads.some(c=>c.MeshRenderer),!variant.ready);
  }
});

test('Game startup and failure paint distinct status text from the current request',()=>{
  const start=source.indexOf('        const error = nativeGameRequestRef.current.error;'),end=source.indexOf('\n      }',start);
  assert.ok(start>0&&end>start);const draw=new Function('nativeGameRequestRef','ctx','vp',ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
  for(const error of [null,'graphics device initialization failed']){
    const text=[];draw({current:{error}},{fillText:value=>text.push(value)},{x:0,y:0,w:640,h:360});
    if(error)assert.deepEqual(text,['Game View rendering failed',error]);else assert.deepEqual(text,['Preparing Game View…']);
  }
});
