// Author: MiYu. Replay Scene hit preparation only when needed, without repainting pixels or advancing Spine.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';

const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const begin=source.indexOf('    if (deferSceneHits) {'),end=source.indexOf('    // The web renderer owns',begin);
assert.ok(begin>0&&end>begin);
const register=new Function('env',compile('const {deferSceneHits,deferredSceneHitsRef,hitCanvasRef,document,dpr,prepareDeferredDrawn,drawWorld,ctx,drawn,hitsRef}=env;'+source.slice(begin,end)));
function fixture(){
  const calls=[],hitsRef={current:[]},context={save:()=>calls.push('save'),setTransform:()=>calls.push('transform'),restore:()=>calls.push('restore')};
  const env={deferSceneHits:true,deferredSceneHitsRef:{current:null},hitCanvasRef:{current:null},document:{createElement:()=>{calls.push('canvas');return {width:300,height:150,getContext:()=>context};}},dpr:2,prepareDeferredDrawn:()=>{calls.push('prepare');return [{id:2},{id:1}];},drawWorld:(ctx,rows,hits,hitOnly)=>{calls.push({ctx,rows,hitOnly});hits.push(...rows);},ctx:{visible:true},drawn:[{id:9}],hitsRef};
  register(env);return{env,calls,context};
}

test('opaque Scene paints defer whole-world preparation and each displayed owner computes hits only once',()=>{
  const f=fixture();assert.equal(f.calls.length,0);assert.deepEqual(f.env.hitsRef.current,[]);
  const read=f.env.deferredSceneHitsRef.current,hits=read();assert.deepEqual(hits,[{id:2},{id:1}]);assert.equal(read(),hits);
  assert.equal(f.calls.filter(c=>c==='prepare').length,1);assert.equal(f.calls.filter(c=>c==='canvas').length,1);assert.equal(f.env.hitCanvasRef.current.width,1);assert.equal(f.env.hitCanvasRef.current.height,1);
  const call=f.calls.find(c=>typeof c==='object');assert.equal(call.ctx,f.context);assert.equal(call.hitOnly,true);assert.deepEqual(f.env.hitsRef.current,[]);
  f.env.prepareDeferredDrawn=()=>[{id:3}];register(f.env);assert.deepEqual(f.env.deferredSceneHitsRef.current(),[{id:3}]);assert.equal(read(),hits);assert.equal(f.calls.filter(c=>c==='canvas').length,1);
});

test('failed hit preparation restores the isolated context and retries instead of caching partial hits',()=>{
  const f=fixture(),draw=f.env.drawWorld;let fail=true;f.env.drawWorld=(...args)=>{if(fail){args[2].push({id:99});throw Error('hit failure');}draw(...args);};register(f.env);
  assert.throws(()=>f.env.deferredSceneHitsRef.current(),/hit failure/);assert.equal(f.calls.at(-1),'restore');assert.deepEqual(f.env.hitsRef.current,[]);
  fail=false;assert.deepEqual(f.env.deferredSceneHitsRef.current(),[{id:2},{id:1}]);
});

test('transparent and browser paints retain immediate drawing and discard the previous lazy owner',()=>{
  const f=fixture();f.env.deferSceneHits=false;register(f.env);
  assert.equal(f.env.deferredSceneHitsRef.current,null);const call=f.calls.find(c=>typeof c==='object');assert.equal(call.ctx,f.env.ctx);assert.deepEqual(f.env.hitsRef.current,[{id:9}]);
});

test('Spine advances once in either composition path and hit replay never advances or draws it',()=>{
  const a=source.indexOf("if (renderKind === 'spine') {"),b=source.indexOf('const mesh = e.components.MeshRenderer;',a);assert.ok(a>0&&b>a);
  const replay=new Function('env',compile('const {hitOnly,e,pr,isGame,t,project,cam,vp,spineRuntimeRef,spineRuntimeErrorRef,ctx,simulationDelta,window}=env;for(const renderKind of ["spine"]){'+source.slice(a,b)+'}'));
  const a2=source.indexOf('            spineRuntimeRef.current?.drawEntity({'),b2=source.indexOf('            });',a2)+15;assert.ok(a2>0&&b2>a2);
  const overlay=new Function('env',compile('const {spineRuntimeRef,entity,spine,ctx,screen,pixelsPerWorldUnit,deferSceneHits,simulationDelta}=env;'+source.slice(a2,b2)));
  for(const deferSceneHits of [false,true]){
    const deltas=[],spineRuntimeRef={current:{drawEntity:args=>{deltas.push(args.deltaSeconds);return 'drawn';}}};
    replay({hitOnly:deferSceneHits,e:{entity:1,components:{SpineSkeleton:{}}},pr:{x:1,y:2},isGame:false,t:{position:[0,0,0],scale:[1,1,1]},project:()=>({x:2,y:2}),cam:{},vp:{},spineRuntimeRef,spineRuntimeErrorRef:{current:null},ctx:{},simulationDelta:.02,window:{}});
    overlay({spineRuntimeRef,entity:{entity:1},spine:{},ctx:{},screen:{x:1,y:2},pixelsPerWorldUnit:1,deferSceneHits,simulationDelta:.02});
    assert.equal(deltas.reduce((a,b)=>a+b,0),.02);assert.equal(deltas.filter(d=>d>0).length,1);
  }
});
