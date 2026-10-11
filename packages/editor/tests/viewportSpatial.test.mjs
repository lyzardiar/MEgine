// Author: MiYu. Compare browser octree visibility to exhaustive conservative bounds checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {boundsVisible, createViewportSpatialIndex, viewportPlanes, transformBounds} from '../src/viewportSpatial.ts';
import {project} from '../src/math3d.ts';
const box = (x, y, z) => ({min:[x-.1,y-.1,z-.1],max:[x+.1,y+.1,z+.1]});
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
