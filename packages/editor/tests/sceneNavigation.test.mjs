import test from 'node:test';
import assert from 'node:assert/strict';
import { dollySceneCamera, flySceneCamera } from '../src/sceneNavigation.ts';
import { orbitEye, sub, len, dot, lookBasis } from '../src/math3d.ts';
import { frameSceneBounds, frameSceneSelection, sceneFrameEntities } from '../src/sceneFraming.ts';

const camera = { pivot: [0, 0, 0], yaw: 35, pitch: 30, distance: 10 };
test('framing keeps every corner inside portrait and wide perspective views', () => {
  const bounds = { min: [-20, -3, -8], max: [60, 12, 4] };
  for (const aspect of [0.25, 1, 3]) {
    const frame = frameSceneBounds(bounds, camera, aspect), eye = orbitEye(frame.pivot, camera.yaw, camera.pitch, frame.distance), basis = lookBasis(eye, frame.pivot);
    for (let i = 0; i < 8; i++) {
      const point = bounds.min.map((v, axis) => (i & (1 << axis)) ? bounds.max[axis] : v), offset = sub(point, eye), z = dot(offset, basis.forward);
      assert.ok(z > 0.1); assert.ok(Math.abs(dot(offset, basis.right)) < z * Math.tan(Math.PI / 6) * aspect); assert.ok(Math.abs(dot(offset, basis.up)) < z * Math.tan(Math.PI / 6));
    }
  }
});
test('group framing includes transformed descendants and authored mesh bounds without unrelated objects', () => {
  const entities = [
    { entity: 1, components: { Transform: { position: [100, 0, 0], scale: [2, 2, 2] } } },
    { entity: 2, parent: 1, components: { Transform: { position: [10, 0, 0], scale: [-1, 1, 1] }, MeshRenderer: { mesh: 'castle.glb' } } },
    { entity: 3, components: { Transform: { position: [99999, 0, 0] }, MeshRenderer: { mesh: 'cube' } } },
  ];
  const frame = frameSceneSelection(entities, [1], camera, 1, new Map([['castle.glb', { min: [0, 0, 0], max: [20, 30, 10] }]]));
  assert.deepEqual(frame.pivot, [100, 30, 10]); assert.ok(frame.distance > 60 && frame.distance < 200);
  assert.deepEqual(new Set(sceneFrameEntities([{entity:1,parent:2},{entity:2,parent:1}], [1,2]).map(e=>e.entity)), new Set([1,2]));
});
test('continuous dolly crosses the orbit pivot and framing restores a usable orbit', () => {
  let next = camera;
  for (let i = 0; i < 200; i++) next = dollySceneCamera(next, -100, 10);
  assert.equal(next.distance, 0.5); const before = orbitEye(next.pivot, next.yaw, next.pitch, next.distance);
  next = dollySceneCamera(next, -100, 10); assert.ok(Math.abs(len(sub(orbitEye(next.pivot, next.yaw, next.pitch, next.distance), before)) - 0.2) < 1e-8);
  const framed = frameSceneBounds({min:[-2,-2,-2],max:[2,2,2]},next,1); assert.deepEqual(framed.pivot,[0,0,0]); assert.ok(framed.distance>2);
  assert.equal(dollySceneCamera(camera,0,10),camera); assert.equal(dollySceneCamera(camera,NaN,10),camera);
});
test('navigation follows camera heading, normalizes diagonals, accelerates and stops on release', () => {
  const start = {...camera,yaw:90,pitch:0};
  const straight=flySceneCamera(start,new Set(['KeyW']),0.02,10), diagonal=flySceneCamera(start,new Set(['KeyW','KeyD']),0.02,10);
  assert.ok(straight.pivot[0]<0); assert.ok(Math.abs(straight.pivot[2])<1e-8);
  assert.ok(Math.abs(len(sub(straight.pivot,start.pivot))-len(sub(diagonal.pivot,start.pivot)))<1e-8);
  assert.deepEqual(flySceneCamera(start,new Set(['ArrowUp']),0.02,10),straight);
  assert.equal(flySceneCamera(start,new Set(),0.02,10),start); assert.equal(flySceneCamera(start,new Set(['KeyW','KeyS']),0.02,10),start);
  assert.ok(Math.abs(len(sub(flySceneCamera(start,new Set(['KeyW']),0.02,10,true).pivot,start.pivot))/len(sub(straight.pivot,start.pivot))-3)<1e-8);
});

test('large line, tilemap and sprite batch frame their geometry', () => {
  const at = components => [{entity:1,components:{Transform:{position:[0,0,0]},...components}}];
  const line = frameSceneSelection(at({Line2D:{points:[[10,0],[30,0]],width:2}}),[1],camera);
  assert.deepEqual(line.pivot,[20,0,0]);assert.ok(line.distance>10);
  const tiles = frameSceneSelection(at({Tilemap:{cells:[[10,20],[30,40]],sprites:['white','white']}}),[1],camera);
  assert.deepEqual(tiles.pivot,[20,30,0]);assert.ok(tiles.distance>10);
  const batch = frameSceneSelection(at({SpriteBatch2D:{size:[4,2],instances:[[20,30,Math.PI/2,2]]}}),[1],camera);
  assert.deepEqual(batch.pivot,[20,30,0]);assert.ok(batch.distance>5);
});

test('tile framing follows mirrored centers with absolute anchored sprite dimensions', () => {
  const entities=[{entity:1,components:{Transform:{position:[0,0,0],scale:[-2,1,1]},Tilemap:{cells:[[0,0]],sprites:['white'],tile_anchor:[0,.5]}}}];
  assert.deepEqual(frameSceneSelection(entities,[1],camera).pivot,[1,0,0]);
});

test('generated terrain patches frame their eight-unit surface instead of a unit cube', () => {
  const frame = frameSceneSelection([{entity:1,components:{Transform:{position:[-20,0,-20]},MeshRenderer:{mesh:'terrain4:'+'0'.repeat(64)}}}],[1],camera);
  assert.deepEqual(frame.pivot,[-20,-.125,-20]);assert.ok(frame.distance>8);
});
