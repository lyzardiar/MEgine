// Author: MiYu. Verify owned browser consumer membership, frame identity and weak ownership.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
const {createOwnedViewportBrowserConsumerReader}=await server.ssrLoadModule('/src/viewportBrowserConsumers.ts');
const {createNativeViewportPresentationReader}=await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const {createNativeViewportWorldArgs}=await server.ssrLoadModule('/src/nativeViewportFrame.ts');
test.after(()=>server.close());

const reference = entities => ({ lights: entities.filter(e => e.components.Light2D), emitters: entities.filter(e => e.components.ParticleEmitter2D || e.components.ParticleEmitter3D), trails: entities.filter(e => e.components.TrailRenderer2D), spines: entities.filter(e => e.components.SpineSkeleton) });
const own = (entity, components, extra = {}) => Object.freeze({ entity, ...extra, components: Object.freeze(components) });

test('consumer groups preserve order, duplicate IDs, inactive records and overlapping components', () => {
  const read = createOwnedViewportBrowserConsumerReader();
  let entities = Array.from({length:16}, (_, mask) => own(mask % 4, { ...(mask & 1 ? {Light2D:{}} : {}), ...(mask & 2 ? {ParticleEmitter2D:{},ParticleEmitter3D:{}} : {}), ...(mask & 4 ? {TrailRenderer2D:{}} : {}), ...(mask & 8 ? {SpineSkeleton:{}} : {}) }, {active:mask % 2===0,parent:mask-1}));
  const check = input => { const result=read(input), expected=reference(input); assert.deepEqual(result,expected); for(const key of Object.keys(expected)) result[key].forEach((entity,index)=>assert.equal(entity,expected[key][index])); };
  const old=entities;check(old);check([...old].reverse());
  entities=[own(0,{SpineSkeleton:{}}),...entities.slice(1,8),own(0,{ParticleEmitter3D:{}})];check(entities);
  check(old);check([]);check([own(0,{Light2D:null,ParticleEmitter2D:0,SpineSkeleton:false,TrailRenderer2D:''})]);
});

test('unchanged owned records reuse zero and nonzero masks while replacement records refresh membership', () => {
  let reads=0;
  const make=(entity,components)=>Object.freeze({entity,get components(){reads++;return components;}});
  const fixed=Array.from({length:3000},(_,index)=>make(index,index%100 ? {} : {SpineSkeleton:{}}));
  const read=createOwnedViewportBrowserConsumerReader();read(fixed);assert.equal(reads,3000);
  for(let frame=0;frame<30;frame++) { const next=[...fixed,make(4000,frame%2 ? {Light2D:{}} : {ParticleEmitter3D:{}})];const result=read(next);assert.equal(result.spines.length,30);assert.equal(result.lights.length,frame%2); }
  assert.equal(reads,3030);read(fixed);assert.equal(reads,3030);
});

test('membership cache does not retain discarded owned records', {skip:typeof globalThis.gc!=='function'}, async () => {
  const read=createOwnedViewportBrowserConsumerReader();
  const refs=(()=>{const entities=[own(1,{SpineSkeleton:{}}),own(2,{})];read(entities);return entities.map(e=>new WeakRef(e));})();
  for(let attempt=0;attempt<10;attempt++){await setImmediate();globalThis.gc();if(refs.every(ref=>ref.deref()===undefined))return;}
  assert.ok(refs.every(ref=>ref.deref()===undefined));
});

test('presentation groups stay lazy and fixed for each displayed revision', () => {
  let reads=0;
  const entity=Object.freeze({entity:1,get components(){reads++;return {Light2D:{}};}});
  const read=createNativeViewportPresentationReader(),world={entities:[entity],sourceEntities:[],clearColor:[0,0,0,1],simulationTime:0};
  const first=read(world);assert.equal(reads,0);const groups=first.sceneConsumers();assert.equal(reads,1);assert.equal(first.sceneConsumers(),groups);
  const next=read({...world,entities:[entity,own(2,{SpineSkeleton:{}})]});assert.equal(next.sceneConsumers().lights[0],entity);assert.equal(reads,1);assert.equal(next.sceneConsumers().spines.length,1);assert.equal(groups.spines.length,0);
});

test('mutable edits are observed through a new owned snapshot without changing the displayed groups', () => {
  const live={entities:[{entity:1,active:false,components:{Light2D:{}}},{entity:2,parent:1,components:{ParticleEmitter2D:{}}}],clearColor:[0,0,0,1],simulationTime:0};
  const read=createNativeViewportPresentationReader(),world=createNativeViewportWorldArgs(live).frameWorld(),first=read(world),groups=first.sceneConsumers();
  delete live.entities[0].components.Light2D;live.entities[0].active=true;live.entities[1].components={SpineSkeleton:{}};
  assert.equal(first.sceneConsumers(),groups);assert.equal(groups.lights.length,1);assert.equal(groups.emitters.length,1);assert.equal(first.active(2),false);
  const next=read(createNativeViewportWorldArgs(live).frameWorld());assert.equal(next.sceneConsumers().lights.length,0);assert.equal(next.sceneConsumers().emitters.length,0);assert.equal(next.sceneConsumers().spines.length,1);assert.equal(next.active(2),true);
});
