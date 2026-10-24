// Author: MiYu. Fixed component classification must retain conservative culling and asset reload behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createViewportEntityBoundsReader } from '../src/viewportEntityBounds.ts';

const transform = (x=0) => ({ position:[x,0,0], scale:[1,1,1], rotation:[0,0,0,1] });
const mesh = (x=0) => ({ positions:[[x-1,-2,-3],[x+1,2,3]], indices:[0,1,0] });

test('model readiness, replacement, removal and path changes update owned world bounds', () => {
  const previews=new Map(),read=createViewportEntityBoundsReader(path=>previews.get(path)??null), t=transform(10), components={MeshRenderer:{mesh:'a.GLTF'}};
  const fallback=read(components,t,true);assert.deepEqual(fallback,{min:[9.5,-.5,-.5],max:[10.5,.5,.5]});
  previews.set('a.GLTF',mesh(-10));const loaded=read(components,t,true);assert.deepEqual(loaded,{min:[-1,-2,-3],max:[1,2,3]});assert.equal(read(components,t,true),loaded);
  previews.set('a.GLTF',mesh(20));assert.deepEqual(read(components,t,true),{min:[29,-2,-3],max:[31,2,3]});
  previews.delete('a.GLTF');assert.deepEqual(read(components,t,true),fallback);
  previews.set('b.glb',mesh(-5));assert.deepEqual(read({MeshRenderer:{mesh:'b.glb'}},t,true),{min:[4,-2,-3],max:[6,2,3]});
  previews.set('a.GLTF',{positions:[[NaN,0,0]],indices:[]});assert.equal(read(components,t,true),null);
  assert.deepEqual(loaded,{min:[-1,-2,-3],max:[1,2,3]},'later assets do not mutate prior frame bounds');
});

test('fixed classification skips repeated component inspection while querying live preview identity', () => {
  let reads=0,previews=0;
  const components=new Proxy({MeshRenderer:{mesh:'a.glb'}},{get(target,key){reads++;return target[key];}}),preview=mesh();
  const read=createViewportEntityBoundsReader(()=>{previews++;return preview;}),t=transform(),first=read(components,t,true),initialReads=reads;
  for(let i=0;i<100;i++)assert.equal(read(components,t,true),first);
  assert.equal(reads,initialReads);assert.equal(previews,101);
  assert.deepEqual(read(components,transform(50),true),{min:[49,-2,-3],max:[51,2,3]});
});

test('sprite pivots, signed scales and immutable replacement preserve conservative extents', () => {
  const read=createViewportEntityBoundsReader(()=>null),t={position:[3,4,5],scale:[-2,3,1],rotation:[0,0,0,1]},components={SpriteRenderer:{size:[4,6],pivot:[1.25,-.5]}};
  const first=read(components,t,true);assert.deepEqual(first,{min:[-7,-23,5],max:[13,31,5]});assert.equal(read(components,t,true),first);
  const animated={...components,AnimatedSprite2D:{size:[2,2],pivot:[.5,.5]}};
  assert.deepEqual(read(animated,t,true),{min:[1,1,5],max:[5,7,5]});
  assert.deepEqual(read({SpriteRenderer:{size:[NaN,Infinity],pivot:[NaN,Infinity]}},transform(),true),{min:[-.5,-.5,0],max:[.5,.5,0]});
});

test('mutable author data always observes in-place component and transform edits', () => {
  const read=createViewportEntityBoundsReader(()=>null),t=transform(),components={MeshRenderer:{mesh:'cube'}};
  read(components,t);t.position[0]=20;assert.deepEqual(read(components,t),{min:[19.5,-.5,-.5],max:[20.5,.5,.5]});
  components.BoxCollider3D={};assert.equal(read(components,t),null);delete components.BoxCollider3D;delete components.MeshRenderer;
  components.SpriteRenderer={size:[2,4],pivot:[.5,.5]};read(components,t);components.SpriteRenderer.size[0]=6;
  assert.deepEqual(read(components,t),{min:[17,-2,0],max:[23,2,0]});
});

test('helpers and complex renderers remain unbounded even when they also carry a mesh', () => {
  const read=createViewportEntityBoundsReader(()=>{throw Error('Helpers do not need model geometry');});
  for(const key of ['Camera3D','Camera2D','DirectionalLight','PointLight','SpotLight','Light2D','RectTransform','Tilemap','Line2D','SpriteBatch2D','SpineSkeleton','ParticleEmitter2D','ParticleEmitter3D','TrailRenderer2D','SampledEffect','BoxCollider3D','SphereCollider3D','BoxCollider2D','CircleCollider2D','PolygonCollider2D','EdgeCollider2D','TargetJoint2D']) {
    const components={MeshRenderer:{mesh:'a.glb'},[key]:{}};assert.equal(read(components,transform(),true),null);assert.equal(read(components,transform()),null);
  }
  assert.equal(read({},transform(),true),null);
});

test('actual Viewport eagerly prepares conservative bounds and passes frame ownership to lazy culling', () => {
  const source=readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8');
  const lines=source.split('\n').filter(line=>line.includes('const readSpatialBounds =')||line.includes('const spatialBounds = readSpatialBounds(')||line.includes('const spatialCandidates = createViewportSpatialFrame('));assert.equal(lines.length,3);
  const submit=new Function('worldEntries','selSet','trailDrawByEntity','particleDrawByEntity','entityBoundsRef','displayedPresentation','spatialIndexRef','createViewportSpatialFrame','viewportPlanes','cam','vp',lines.join('\n'));
  const worldEntries=[1,2,3,4].map(entity=>({e:{entity,components:{MeshRenderer:{}}},t:transform(entity)}));
  for(const owned of [undefined,{}]){
    const calls=[];let bounds,indexOwned;
    const index={update:()=>assert.fail('paint does not update the index before requesting candidates')};
    submit(worldEntries,new Set([1]),new Map([[2,{}]]),new Map([[3,{}]]),{current:(...args)=>{calls.push(args);return 'bound';}},owned,{current:index},(actual,value,planes,owned)=>{assert.equal(actual,index);assert.equal(planes,'planes');bounds=value;indexOwned=owned;return()=>[];},()=> 'planes',{}, {w:100,h:50});
    assert.deepEqual(bounds,[null,null,null,'bound']);assert.deepEqual(calls,[[worldEntries[3].e.components,worldEntries[3].t,!!owned]]);
    assert.equal(indexOwned,!!owned);
  }
});
