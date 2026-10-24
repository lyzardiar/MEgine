import assert from 'node:assert/strict';
import test from 'node:test';
import { createSceneFingerprint, sceneContentFingerprint } from '../src/sceneFingerprint.ts';

test('scene fingerprints ignore object key order', () => {
  const left = sceneContentFingerprint([
    { entity: 1, components: { Transform: { position: [0, 1, 2], scale: [1, 1, 1] } } },
  ], [0.1, 0.2, 0.3, 1]);
  const right = sceneContentFingerprint([
    { components: { Transform: { scale: [1, 1, 1], position: [0, 1, 2] } }, entity: 1 },
  ], [0.1, 0.2, 0.3, 1]);
  assert.equal(left, right);
});

test('scene fingerprints detect authored world and clear color changes', () => {
  const initial = sceneContentFingerprint([{ entity: 1, active: true }], [0, 0, 0, 1]);
  assert.notEqual(
    initial,
    sceneContentFingerprint([{ entity: 1, active: false }], [0, 0, 0, 1]),
  );
  assert.notEqual(
    initial,
    sceneContentFingerprint([{ entity: 1, active: true }], [0.2, 0, 0, 1]),
  );
});


test('retained canonical fragments match original bytes for metadata, order and changed identities', async () => {
  const { retainPlayWorld } = await import('../src/playWorldSync.ts');
  const fingerprint = createSceneFingerprint();
  const first = retainPlayWorld({entities:[{entity:1,components:{Custom:{z:1,a:{'12':'x','2':'y',quote:'中文\n"'}}}},{entity:2,components:{}}],frame:0,simFrame:0,selected:null,clearColor:[.1,.2,.3,1]});
  for (const entities of [first.entities, [...first.entities].reverse(), [first.entities[1]], []]) {
    assert.equal(fingerprint(entities, first.clearColor), sceneContentFingerprint(entities, first.clearColor));
  }
  const next = retainPlayWorld({...first,entities:[first.entities[0],{entity:2,components:{Custom:{value:5}}}]});
  assert.notEqual(fingerprint(next.entities,first.clearColor),fingerprint(first.entities,first.clearColor));
  assert.equal(fingerprint(next.entities,[.5,.2,.3,1]),sceneContentFingerprint(next.entities,[.5,.2,.3,1]));
});

test('mutable authoring values and altered serialization remain live', async () => {
  const { retainPlayWorld } = await import('../src/playWorldSync.ts');
  const fingerprint=createSceneFingerprint(),entities=[{entity:1,components:{Custom:{values:[1]}}}],color=[0,0,0,1];
  const first=fingerprint(entities,color);entities[0].components.Custom.values.push(2);
  assert.notEqual(fingerprint(entities,color),first);assert.equal(fingerprint(entities,color),sceneContentFingerprint(entities,color));
  const owned=retainPlayWorld({entities,clearColor:color,frame:0,simFrame:0,selected:null});const original=fingerprint(owned.entities,color);
  Object.defineProperty(Object.prototype,'toJSON',{configurable:true,value(key){return key==='Custom'?{changed:true}:this;}});
  try{assert.equal(fingerprint(owned.entities,color),sceneContentFingerprint(owned.entities,color));assert.notEqual(fingerprint(owned.entities,color),original);}
  finally{delete Object.prototype.toJSON;}
  assert.equal(fingerprint(owned.entities,color),original);
  assert.equal(fingerprint(new Array(2),color),sceneContentFingerprint(new Array(2),color));
});
