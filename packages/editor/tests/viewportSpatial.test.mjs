// Author: MiYu. Compare browser octree visibility to exhaustive conservative bounds checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {boundsVisible, createViewportSpatialIndex, createOwnedTransformBoundsReader, viewportPlanes, transformBounds} from '../src/viewportSpatial.ts';
import {project, quatRotateVec} from '../src/math3d.ts';
const box = (x, y, z) => ({min:[x-.1,y-.1,z-.1],max:[x+.1,y+.1,z+.1]});

test('owned bounds reuse follows fixed world transforms and replaced model geometry without retaining old results', () => {
  const read=createOwnedTransformBoundsReader(),local=box(0,0,0);
  const transform={position:[1,2,3],scale:[-2,3,1],rotation:[0,0,0,1]};
  for(const value of [local.min,local.max,local,...Object.values(transform),transform])Object.freeze(value);
  const first=read(local,transform);assert.deepEqual(first,transformBounds(local,transform));
  for(let i=0;i<100;i++)assert.equal(read(local,transform),first);
  const moved={...transform,position:[10,2,3]},second=read(local,moved);assert.notEqual(second,first);assert.deepEqual(second,transformBounds(local,moved));
  const loadedMesh=box(20,0,0),loaded=read(loadedMesh,transform);assert.notEqual(loaded,first);assert.deepEqual(loaded,transformBounds(loadedMesh,transform));
  assert.deepEqual(read(local,transform),first,'older displayed geometry may still request its own bounds');
  const invalid={...transform,scale:[NaN,1,1]};assert.equal(read(local,invalid),null);assert.equal(read(local,invalid),null);
  const editable={...transform,position:[0,0,0]};const before=transformBounds(local,editable);editable.position[0]=30;assert.notDeepEqual(transformBounds(local,editable),before,'mutable edit path computes current values');
});
test('perspective and orthographic octree queries match linear checks across motion/removal', () => {
  const index = createViewportSpatialIndex();
  let entries = Array.from({length:10000},(_,i)=>box(i%100-50,Math.floor(i/100)-50,0));
  entries.push(null);
  for (const projection of ['perspective','orthographic']) for (const x of [0, 10, -20]) {
    const planes = viewportPlanes({eye:[x,0,5],target:[x,0,0],up:[0,1,0],fovYDeg:60,projection,orthographicSize:3,near:.1,far:100},1);
    entries[5000] = box(x,0,0); index.update(entries);
    assert.deepEqual(index.query(planes),entries.flatMap((b,i)=>!b||boundsVisible(b,planes)?[i]:[]));
  }
  index.update([]); assert.deepEqual(index.query([]),[]);
});
test('large bounds across the screen and mirrored/rotated sprites remain candidates', () => {
  const planes = viewportPlanes({eye:[0,0,5],target:[0,0,0],up:[0,1,0],fovYDeg:60,near:.1,far:100},1);
  assert.equal(boundsVisible({min:[-100,-100,-100],max:[100,100,100]},planes),true);
  assert.equal(boundsVisible(box(0,0,6),planes),false);
  const bounds = transformBounds({min:[-2,-1,-.5],max:[2,1,.5]},{position:[1,0,0],scale:[-2,3,1],rotation:[0,0,0,1]});
  assert.deepEqual(bounds,{min:[-3,-3,-.5],max:[5,3,.5]});
});

test('animated bounds, cell migration and unknown bounds preserve exact candidates without duplicate ownership', () => {
  const index = createViewportSpatialIndex();
  let entries = Array.from({length:1800},(_,i)=>box(i%60-30,Math.floor(i/60)-15,(i%5)-2));
  const check = () => {
    index.update(entries);
    for (const x of [-25,0,25]) {
      const planes = viewportPlanes({eye:[x,0,8],target:[x,0,0],fovYDeg:60,near:.1,far:100},1.4);
      assert.deepEqual(index.query(planes),entries.flatMap((b,i)=>!b||boundsVisible(b,planes)?[i]:[]));
    }
    assert.deepEqual(index.query([]),entries.map((_,i)=>i),'every slot has exactly one owner or unknown entry');
  };
  check();
  for (let frame=0;frame<70;frame++) {
    for (let i=0;i<40;i++) {
      const id=(i*43+frame*7)%entries.length;
      entries[id]=frame%7===0?null:box(Math.sin(frame+i)*28,Math.cos(frame-i)*13,(i%5)-2);
    }
    if(frame===20)entries.reverse();
    if(frame===30)entries.splice(100,20);
    if(frame===40)entries.push(box(300,0,0),null);
    if(frame===50)for(let i=0;i<500;i++)entries[i]=box(25,10,1);
    check();
  }
  const known=entries.findIndex(Boolean);entries[known].min[0]=-500;entries[known].max[0]=-499;check();
  entries=entries.map(()=>null);check();
  entries[0]=box(-200,0,0);check();
  entries=[];check();entries=[null,box(0,0,0)];check();
});

test('small pose changes do not revisit unchanged input bounds for octree construction', () => {
  const index = createViewportSpatialIndex();let reads=0;
  const entries=Array.from({length:3000},(_,i)=>{
    const value=box(i%100-50,Math.floor(i/100)-15,0);
    return i===1500?value:{get min(){reads++;return value.min;},get max(){reads++;return value.max;}};
  });
  index.update(entries);reads=0;entries[1500]=box(-49.99,0,0);index.update(entries);
  assert.ok(reads<=4*2999,'unchanged inputs are compared once; their geometry is not reread to rebuild cells');
});
test('frustum planes agree with independently projected screen points', () => {
  for (const projection of ['perspective','orthographic']) {
    const camera={eye:[3,4,6],target:[1,0,0],up:[0,1,0],fovYDeg:60,projection,orthographicSize:3,near:.1,far:100};
    const planes=viewportPlanes(camera,1.5),viewport={x:0,y:0,w:600,h:400};
    for(let x=-10;x<10;x++)for(let y=-10;y<10;y++)for(let z=-10;z<10;z++) {
      const point=[x,y,z],screen=project(point,camera,viewport),visible=boundsVisible({min:point,max:point},planes);
      const projectedInside=screen!=null&&screen.x>=-12&&screen.x<=612&&screen.y>=-8&&screen.y<=408;
      assert.equal(visible,projectedInside,`${projection}:${point}`);
    }
  }
});

test('transformed bounds agree with eight-corner geometry across rotations, offsets and signed scales', () => {
  let seed=173;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<2000;i++) {
    const min=[0,1,2].map(()=>random()*20-10),max=min.map(v=>v+random()*10);
    const rotation=[0,1,2,3].map(()=>random()*2-1);if(i%2) {const length=Math.hypot(...rotation);for(let j=0;j<4;j++)rotation[j]/=length;}
    const transform={position:[0,1,2].map(()=>random()*40-20),scale:[0,1,2].map(()=>i%7?random()*6-3:0),rotation};
    const corners=Array.from({length:8},(_,bits)=>quatRotateVec(rotation,min.map((v,axis)=>((bits&(1<<axis))?max[axis]:v)*transform.scale[axis])).map((v,axis)=>v+transform.position[axis]));
    const actual=transformBounds({min,max},transform);assert.ok(actual);
    for(const side of ['min','max'])for(let axis=0;axis<3;axis++) {const expected=Math[side](...corners.map(p=>p[axis]));assert.ok(Math.abs(actual[side][axis]-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${i}/${side}/${axis}`);}
  }
  for(const field of ['position','scale','rotation'])for(const invalid of [NaN,Infinity,-Infinity]) {
    const transform={position:[0,0,0],scale:[1,1,1],rotation:[0,0,0,1]};transform[field][0]=invalid;
    assert.equal(transformBounds(box(0,0,0),transform),null);
  }
  assert.equal(transformBounds({min:[NaN,0,0],max:[1,1,1]},{position:[0,0,0],scale:[1,1,1],rotation:[0,0,0,1]}),null);
});
