// Author: MiYu. Exercise deferred native mesh hits through the actual Viewport registration and click paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import { drawSolidCube, drawTriangleMesh } from '../src/math3d.ts';
import { createNativeSceneMeshHitCache } from '../src/nativeSceneMeshHit.ts';

const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8');
const begin = source.indexOf('      // Project selection geometry on demand'), end = source.indexOf('      const materialPath =', begin);
const pickBegin = source.indexOf('  const hitTest ='), pickEnd = source.indexOf('  const syncCamToStore', pickBegin);
assert.ok(begin > 0 && end > begin && pickBegin > 0 && pickEnd > pickBegin);
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const register = vm.runInNewContext(compile(`(function(env) { const {nativeSceneFrame,mesh,t,half,rot,selected,ctx,cam,vp,nativeSceneMeshHitRef,modelPreview,drawTriangleMesh,drawSolidCube,hitsRef}=env; const hits=hitsRef.current; for(const e of env.entities) { ${source.slice(begin, end)} } })`));
const picker = vm.runInNewContext(compile(`(function(env,x,y) { const {usingRectGizmoRef,rectGizmoHitsRef,gizmoHitsRef,hitTestRectGizmo,hitTestTransformGizmo,propsRef,hitTestUiSelect,uiItemsRef,scene2DRef,canvasWorkspaceActiveRef,hitsRef,deferredSceneHitsRef}=env; ${source.slice(pickBegin, pickEnd)} return hitTest(x,y); })`));
const mesh = { positions: [[-1,-1,0],[1,-1,0],[0,1,0]], indices: [0,1,2] };
const camera = () => ({ eye: [0,2,8], target: [0,0,0], fovYDeg: 60 });
const viewport = () => ({ x: 0, y: 0, w: 800, h: 600 });
const ctx = new Proxy({}, { get() { throw Error('Native mesh selection must not rasterize'); } });
function fixture() {
  let projections = 0, previews = 0;
  const env = { deferredSceneHitsRef:{current:null}, nativeSceneFrame: { image: {} }, mesh: { mesh: 'Assets/Model.glb' }, t: { position: [0,0,0], scale: [1,1,1] }, half: [.5,.5,.5], rot: undefined, selected: false, ctx, cam: camera(), vp: viewport(), nativeSceneMeshHitRef: { current: createNativeSceneMeshHitCache() }, modelPreview: () => { previews++; return mesh; }, drawTriangleMesh: (...args) => { projections++; return drawTriangleMesh(...args); }, drawSolidCube: (...args) => { projections++; return drawSolidCube(...args); }, hitsRef: { current: [] }, entities: [{ entity: 4294967297 }], usingRectGizmoRef: { current: false }, rectGizmoHitsRef: { current: [] }, gizmoHitsRef: { current: [] }, hitTestRectGizmo: () => null, hitTestTransformGizmo: () => null, propsRef: { current: { tab: 'scene' } }, hitTestUiSelect: () => null, uiItemsRef: { current: [] }, scene2DRef: { current: false }, canvasWorkspaceActiveRef: { current: false } };
  const show = () => { env.hitsRef.current = []; env.nativeSceneMeshHitRef.current.beginFrame(env.nativeSceneFrame, env.vp); register(env); };
  const region = () => drawTriangleMesh(ctx, env.cam, env.vp, env.t.position, env.t.scale, mesh.positions, mesh.indices, false, env.rot, undefined, true);
  return { env, show, region, pick: (x,y) => picker(env,x,y), get projections() { return projections; }, get previews() { return previews; } };
}

test('camera frames preload meshes without projecting vertices until an object click', () => {
  const f = fixture();
  for (let i=0;i<30;i++) { f.env.nativeSceneFrame = { image: {} }; f.env.cam = { ...camera(), eye: [i*.01,2,8] }; f.show(); }
  assert.equal(f.previews,30); assert.equal(f.projections,0);
  const region=f.region(); assert.equal(f.pick(region.x,region.y).id,4294967297); assert.equal(f.projections,1);
  f.pick(region.x,region.y); assert.equal(f.projections,1,'same displayed frame reuses the projected region');
});

test('pending camera requests keep click geometry paired with the displayed native frame', () => {
  const f=fixture(); f.show(); const before=f.region(); f.env.cam={...camera(),eye:[7,2,4]};
  assert.equal(f.pick(before.x,before.y).x,before.x); assert.equal(f.projections,1);
  f.env.nativeSceneFrame={image:{}}; f.show(); const after=f.region();
  assert.equal(f.pick(after.x,after.y).r,after.r); assert.equal(f.projections,2);
  f.env.vp={...viewport(),w:600}; f.show(); const resized=f.region(); assert.equal(f.pick(resized.x,resized.y).x,resized.x); assert.equal(f.projections,3);
});

test('gizmos, UI and unpickable meshes avoid deferred work while equal-distance object order stays stable', () => {
  const f=fixture(); f.show(); const region=f.region();
  f.env.hitTestTransformGizmo=()=>({axis:'x'}); assert.equal(f.pick(region.x,region.y).kind,'gizmo'); assert.equal(f.projections,0);
  f.env.hitTestTransformGizmo=()=>null; f.env.hitTestUiSelect=()=>({entity:2}); assert.equal(f.pick(region.x,region.y).id,2); assert.equal(f.projections,0);
  f.env.hitTestUiSelect=()=>null; f.env.propsRef.current.isPickable=()=>false; assert.equal(f.pick(region.x,region.y),null); assert.equal(f.projections,0);
  f.env.propsRef.current.isPickable=()=>true;
  const object={kind:'object',id:2,...region}; f.env.hitsRef.current.unshift(object); assert.equal(f.pick(region.x,region.y).id,2);
  f.env.hitsRef.current.shift(); f.env.hitsRef.current.push(object); assert.equal(f.pick(region.x,region.y).id,4294967297);
});

test('loaded mesh previews replace fallback geometry and clipped deferred candidates stay unselectable', () => {
  const f=fixture(); f.env.modelPreview=()=>null; f.show(); const fallback=drawSolidCube(ctx,f.env.cam,f.env.vp,f.env.t.position,f.env.half,false,undefined,undefined,true);
  assert.equal(f.pick(fallback.x,fallback.y).r,fallback.r);
  f.env.modelPreview=()=>mesh; f.show(); const loaded=f.region(); assert.equal(f.pick(loaded.x,loaded.y).r,loaded.r);
  f.env.cam={...camera(),eye:[0,0,-10],target:[0,0,-20]}; f.env.nativeSceneFrame={image:{}}; f.show(); assert.equal(f.pick(400,300),null);
});

test('gizmo and UI clicks avoid full Scene hit preparation and lazy world ties precede visible overlay hits',()=>{
  const f=fixture();f.show();const region=f.region();let reads=0;
  f.env.deferredSceneHitsRef.current=()=>{reads++;return [{kind:'object',id:9,...region}];};
  f.env.hitTestTransformGizmo=()=>({axis:'x'});assert.equal(f.pick(region.x,region.y).kind,'gizmo');assert.equal(reads,0);
  f.env.hitTestTransformGizmo=()=>null;f.env.hitTestUiSelect=()=>({entity:2});assert.equal(f.pick(region.x,region.y).id,2);assert.equal(reads,0);
  f.env.hitTestUiSelect=()=>null;assert.equal(f.pick(region.x,region.y).id,9);assert.equal(reads,1);
  f.env.propsRef.current.isPickable=id=>id!==9;assert.equal(f.pick(region.x,region.y).id,4294967297);
});
