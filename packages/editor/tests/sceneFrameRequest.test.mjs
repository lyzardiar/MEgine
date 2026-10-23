// Author: MiYu. Exercise the actual asynchronous frame handler against live snapshot publication.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';
const source=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),start=source.indexOf('  const frameSelection = async () => {'),end=source.indexOf('  frameSelectionRef.current =',start);
assert.ok(start>0&&end>start);
function fixture(){
  let finish;const pending=new Promise(resolve=>finish=resolve),calls=[],events=[];
  const store={selectedIds:[1],mode:'play',sceneCamera:{pivot:[0,0,0]},frameSelected:(aspect,models)=>calls.push({aspect,models})};
  const context={store,frameRequestRef:{current:0},frameWorldRef:{current:[{entity:1,components:{MeshRenderer:{mesh:'unit.glb'}}}]},sceneNameRef:{current:'Main'},sceneFrameEntities:e=>e,loadModelPreview:()=>pending,pointBounds:()=>({min:[0,0,0],max:[1,1,1]}),publishSceneCamera:()=>{},window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},document:{querySelector:()=>({getBoundingClientRect:()=>({width:800,height:400})})}};
  const run=vm.runInNewContext(ts.transpileModule(`(()=>{${source.slice(start,end)}return frameSelection;})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {context,store,calls,events,run,finish:()=>finish({positions:[[0,0,0]]})};
}
test('focus immediately selects Scene and refines after live snapshots change',async()=>{
  const f=fixture(),task=f.run();assert.equal(f.calls.length,1);assert.equal(f.events[0].detail.panel,'scene');
  f.context.frameWorldRef.current=[...f.context.frameWorldRef.current];f.finish();await task;assert.equal(f.calls.length,2);assert.equal(f.calls[1].models.size,1);
});
test('pending bounds do not override user camera, selection, scene or playback changes',async()=>{
  for(const change of [f=>f.store.sceneCamera={pivot:[9,9,9]},f=>f.store.selectedIds=[2],f=>f.context.sceneNameRef.current='Other',f=>f.store.mode='edit']){
    const f=fixture(),task=f.run();change(f);f.finish();await task;assert.equal(f.calls.length,1);
  }
});
test('newer focus supersedes pending work and empty selection does nothing',async()=>{
  const f=fixture(),a=f.run(),b=f.run();f.finish();await Promise.all([a,b]);assert.equal(f.calls.length,3);
  f.store.selectedIds=[];await f.run();assert.equal(f.calls.length,3);
});
