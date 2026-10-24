// Author: MiYu. Exercise actual Viewport paint gates and profiling statements without graphics APIs.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import {createEditorProfilerSampler} from '../src/editorProfiler.ts';
const source=fs.readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('Viewport.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const find=(node,predicate)=>predicate(node)?node:ts.forEachChild(node,child=>find(child,predicate));
const paint=find(tree,node=>ts.isVariableDeclaration(node)&&node.name.getText(tree)==='paint').initializer;
const statements=[...paint.body.statements],text=node=>node.getText(tree);
const recording=statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)==='recordViewportProfilerFrame');
assert.ok(recording,'completed paints record unconditionally at the paint body level');
const gates=statements.filter(node=>ts.isIfStatement(node)&&['rect.width < 1','pendingNativeGamePaintUnchanged','skipUnchangedScenePaint'].some(value=>node.expression.getText(tree).startsWith(value)));
assert.equal(gates.length,3);for(const gate of gates)assert.ok(gate.end<recording.pos);
const interval=statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(tree)==='frameIntervalMs'));
const measured=statements.find(node=>ts.isExpressionStatement(node)&&text(node).startsWith('lastMeasuredPaintRef.current ='));
const control=statements.find(node=>ts.isIfStatement(node)&&text(node).startsWith('if (animationFrame || nativeGamePaint) lastProfilerFrameRef.current'));
assert.ok(interval&&measured&&control);assert.ok(gates.every(g=>g.end<interval.pos));
const compiled=ts.transpileModule(`(function(){${[...gates,interval,control,measured,recording].map(text).join('\n')}})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const frames=[],samples=[],sampler=createEditorProfilerSampler(16),sceneFrame={};
 const env={now:0,paintStartedAt:0,performance:{now:()=>env.now+env.cost},cost:2,rect:{width:640,height:360},canvas:{},projectGeneration:1,pendingNativeGamePaintUnchanged:()=>env.skipGame,skipGame:false,skipUnchangedScenePaint:false,scenePaintState:{frame:sceneFrame,preview:null},nativeSceneFrameRef:{current:sceneFrame},nativeCameraPreviewFrameRef:{current:null},lastProfilerFrameRef:{current:0},lastMeasuredPaintRef:{current:null},animationFrame:false,nativeGamePaint:false,p:{tab:'scene',entities:[{}]},drawn:[],profilerUiPrimitives:0,profilerUiBatches:0,particleDrawByEntity:new Map(),liveSpineIds:new Set(),pw:640,ph:360,dpr:1,
 recordViewportProfilerFrame(frame){frames.push(frame);const sample=sampler(frame);if(sample)samples.push(sample);}};
 const draw=vm.runInNewContext(compiled,env);return{env,frames,samples,draw(at,cost=2){env.now=env.paintStartedAt=at;env.cost=cost;draw();}};
}
test('non-animation Scene completion paints are sampled once and unchanged native paints contribute nothing',()=>{
 const f=fixture();f.draw(0,2);assert.equal(f.frames.length,1);assert.equal(f.frames[0].frameIntervalMs,0);
 f.env.skipGame=true;f.draw(8,40);f.env.skipGame=false;f.env.skipUnchangedScenePaint=true;f.draw(12,40);assert.equal(f.frames.length,1);
 f.env.skipUnchangedScenePaint=false;f.draw(20,6);assert.equal(f.frames.length,2);assert.equal(f.frames[1].frameIntervalMs,20);assert.equal(f.samples.length,1);assert.equal(f.samples[0].sampleCount,2);assert.equal(f.samples[0].paintMs,4);assert.equal(f.samples[0].paintMaxMs,6);
 assert.equal(f.env.lastProfilerFrameRef.current,0,'measurement does not advance the existing wakeup clock');
});
test('interaction and animation paints share measurement cadence and hidden surfaces reset it',()=>{
 const f=fixture();f.env.p.tab='game';f.env.animationFrame=true;f.env.nativeGamePaint=true;f.draw(10,3);assert.equal(f.frames.length,1);assert.equal(f.env.lastProfilerFrameRef.current,10);
 f.env.animationFrame=f.env.nativeGamePaint=false;f.draw(30,5);assert.equal(f.frames.length,2);assert.equal(f.frames[1].frameIntervalMs,20);assert.equal(f.env.lastProfilerFrameRef.current,10);
 f.env.rect.width=0;f.draw(50);assert.equal(f.frames.length,2);assert.equal(f.env.lastMeasuredPaintRef.current,null);
 f.env.rect.width=640;f.draw(500,4);assert.equal(f.frames[2].frameIntervalMs,0);assert.equal(f.env.lastProfilerFrameRef.current,0);f.draw(520,6);assert.equal(f.samples.at(-1).sampleCount,2);assert.equal(f.samples.at(-1).paintMs,5);
});

test('switching Scene and Game restarts the measured source without an inactive-tab interval',()=>{
 const f=fixture();f.draw(10);f.draw(30);f.env.p.tab='game';f.draw(100);assert.equal(f.frames.at(-1).frameIntervalMs,0);
 f.draw(120);assert.equal(f.frames.at(-1).frameIntervalMs,20);f.env.p.tab='scene';f.draw(500);assert.equal(f.frames.at(-1).frameIntervalMs,0);
});
