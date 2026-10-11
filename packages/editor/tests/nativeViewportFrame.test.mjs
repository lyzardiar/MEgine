// Author: MiYu. Verify native frame ownership, filtering and immutable browser-only snapshots.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeViewportWorldArgs, nativeGameFrameMatchesRequest, nativeGamePreviewSize, nativeViewportFrameWorldCurrent, parseNativeViewportFrame, requiresBrowserViewportSnapshot } from '../src/nativeViewportFrame.ts';

test('browser overlays and interactive UI retain a matching snapshot', () => {
  assert.equal(requiresBrowserViewportSnapshot([{ components: { Text: {}, SpriteRenderer: {} } }]), false);
  for (const type of ['SpineSkeleton', 'Button', 'Toggle', 'Slider', 'Scrollbar', 'InputField', 'Dropdown', 'ListView', 'ScrollView', 'TabView']) {
    assert.equal(requiresBrowserViewportSnapshot([{ components: { [type]: {} } }]), true);
    assert.equal(requiresBrowserViewportSnapshot([{ active: false, components: { [type]: {} } }]), false);
  }
});

function packet(width=2,height=1){
  const metadata=new TextEncoder().encode(JSON.stringify({hasAuthoredCamera:true,profile:{schemaVersion:1,totalMs:1}}));
  const buffer=new ArrayBuffer(16+metadata.length+width*height*4),view=new DataView(buffer);
  [0x3146474d,width,height,metadata.length].forEach((value,index)=>view.setUint32(index*4,value,true));
  new Uint8Array(buffer,16,metadata.length).set(metadata);
  new Uint8Array(buffer,16+metadata.length).set([255,12,34,255,56,78,90,128]);
  return buffer;
}
test('live preview matches display pixels without changing aspect or upscaling low-resolution games',()=>{
  assert.deepEqual(nativeGamePreviewSize(1080,1920,503,895),{width:503,height:894});
  assert.deepEqual(nativeGamePreviewSize(320,180,1920,1080),{width:320,height:180});
  assert.deepEqual(nativeGamePreviewSize(1080,1920,1080,1920),{width:1080,height:1920});
  assert.deepEqual(nativeGamePreviewSize(1080,1920,503,895,true),{width:1080,height:1920});
});
test('native frame preserves exact RGBA pixels and metadata without copying the pixel buffer',()=>{
  const buffer=packet(),frame=parseNativeViewportFrame(buffer);
  assert.equal(frame.width,2);assert.equal(frame.height,1);assert.equal(frame.hasAuthoredCamera,true);
  assert.deepEqual([...frame.rgba],[255,12,34,255,56,78,90,128]);assert.equal(frame.rgba.buffer,buffer);
});
test('native frame rejects invalid magic, dimensions, metadata length and truncated pixels',()=>{
  for(const [offset,value] of [[0,0],[4,0],[8,4097],[12,0xffffffff]]){const buffer=packet();new DataView(buffer).setUint32(offset,value,true);assert.throws(()=>parseNativeViewportFrame(buffer));}
  assert.throws(()=>parseNativeViewportFrame(packet().slice(0,-1)));assert.throws(()=>parseNativeViewportFrame(new ArrayBuffer(8)));
});

test('one paint resolves native session once and the next paint reads fresh state', () => {
  let reads=0, session=12;
  const props={entities:[{components:{}}],clearColor:[0,0,0,1],simulationTime:1,get nativeSessionId(){reads++;return session;}};
  const first=createNativeViewportWorldArgs(props);
  assert.equal(reads,0);
  assert.deepEqual(first.worldArgs(),{playSessionId:12});
  assert.equal(first.worldArgs(),first.worldArgs());
  assert.equal(first.requiresBrowserSnapshot(),false);
  assert.equal(reads,1);
  session=13;
  assert.deepEqual(createNativeViewportWorldArgs(props).worldArgs(),{playSessionId:13});
  assert.equal(reads,2);
});

test('Scene render snapshots exclude inactive subtrees while browser ownership retains editable records', () => {
  const entities = [{ entity: 1, components: {} }, { entity: 2, parent: 1, active: false, components: {} }, { entity: 3, parent: 2, components: {} }, { entity: 4, parent: 1, components: {} }];
  const props = { entities, clearColor: [0, 0, 0, 1], simulationTime: 0 };
  const scene = createNativeViewportWorldArgs(props, true);
  assert.deepEqual(scene.snapshotArgs().snapshot.entities.map(entity => entity.entity), [1, 4]);
  assert.equal(scene.frameWorld().entities.length, 4); assert.equal(scene.frameWorld().sourceEntities, entities);
  entities[1].active = true; entities[2].parent = 4;
  assert.deepEqual(scene.snapshotArgs().snapshot.entities.map(entity => entity.entity), [1, 4], 'one request owns its captured activity and hierarchy');
  assert.equal(createNativeViewportWorldArgs(props, true).snapshotArgs().snapshot.entities.length, 4, 'the next request observes live authoring changes');
  assert.equal(createNativeViewportWorldArgs(props).snapshotArgs().snapshot.entities.length, 4, 'Game snapshots retain their complete world');
});
test('interactive snapshot skips session fingerprint and refreshes after UI changes', () => {
  let reads=0;
  const props={entities:[{components:{Button:{}}}],clearColor:[0,0,0,1],simulationTime:1,get nativeSessionId(){reads++;return 12;}};
  const paint=createNativeViewportWorldArgs(props);
  assert.deepEqual(paint.worldArgs().snapshot.entities,props.entities);
  assert.notEqual(paint.worldArgs().snapshot.entities,props.entities);
  assert.equal(paint.requiresBrowserSnapshot(),true);
  assert.equal(reads,0);
  props.entities=[{components:{}}];
  assert.deepEqual(createNativeViewportWorldArgs(props).worldArgs(),{playSessionId:12});
  assert.equal(reads,1);
  const detached=createNativeViewportWorldArgs({...props,nativeSessionId:undefined});
  assert.deepEqual(detached.worldArgs().snapshot.entities,props.entities);
  assert.notEqual(detached.worldArgs().snapshot.entities,props.entities);
});

test('revisioned interactive frames retain one owned world and reject a different runtime session', () => {
  let reads=0;
  const retained={sessionId:12,revision:0,entities:[{components:{Button:{label:'first'}}}],clearColor:[0,0,0,1],simulationTime:1};
  const props={entities:[{components:{Button:{label:'first'}}}],clearColor:[0,0,0,1],simulationTime:1,runtimeSessionId:12,get nativeWorldReference(){reads++;return retained;},get nativeSessionId(){throw Error('legacy lookup');}};
  const paint=createNativeViewportWorldArgs(props);
  assert.deepEqual(paint.worldArgs(),{playSessionId:12,playRevision:0});
  const frame=paint.frameWorld();assert.equal(frame.entities,retained.entities);assert.equal(reads,1);
  props.entities[0].components.Button.label='second';props.simulationTime=2;
  assert.equal(paint.snapshotArgs().snapshot.entities[0].components.Button.label,'first');
  assert.equal(paint.snapshotArgs().snapshot.simulationTime,1);
  assert.equal(nativeViewportFrameWorldCurrent(frame,props),true);
  assert.equal(nativeViewportFrameWorldCurrent(frame,{entities:props.entities,runtimeSessionId:13}),false);
  assert.equal(nativeViewportFrameWorldCurrent(frame,{entities:props.entities,runtimeSessionId:undefined}),false);
  const detached=createNativeViewportWorldArgs(Object.assign(Object.create(props),{runtimeSessionId:undefined})).frameWorld();
  assert.equal(detached.runtimeSessionId,12);
});

test('full snapshot captures own deep UI values and preserve explicit capture dimensions', () => {
  const props={entities:[{components:{InputField:{text:'first'}}}],clearColor:[0,0,0,1],simulationTime:1};
  const paint=createNativeViewportWorldArgs(props),frame=paint.frameWorld();
  props.entities[0].components.InputField.text='second';props.clearColor[0]=1;
  assert.equal(frame.entities[0].components.InputField.text,'first');assert.equal(frame.clearColor[0],0);
  const request={width:1920,height:1080,...paint.snapshotArgs()};
  assert.deepEqual([request.width,request.height],[1920,1080]);
  assert.equal(nativeViewportFrameWorldCurrent(frame,props),true);
  assert.equal(nativeViewportFrameWorldCurrent(frame,{...props,entities:props.entities.slice()}),false);
});

test('filtered Scene revisions share immutable records while camera previews and fallback keep filtered payloads', () => {
  const record = (entity, parent, components) => Object.freeze({ entity, parent, components: Object.freeze(components) });
  const hidden = record(1, null, {}), child = record(2, 1, {}), visible = record(3, null, { Transform: Object.freeze({ position: Object.freeze([3, 0, 0]) }) });
  const owned = { entities: Object.freeze([child, visible]), clearColor: Object.freeze([.1, .2, .3, 1]), simulationTime: 4, sessionId: 12, revision: 7 };
  let reads = 0;
  const live = { entities: [child, { ...visible, components: { Transform: { position: [3, 0, 0] } } }], clearColor: [.1, .2, .3, 1], simulationTime: 4, runtimeSessionId: 12, get nativeSceneWorldReference() { reads++; return owned; } };
  const paint = createNativeViewportWorldArgs(live, true), frame = paint.frameWorld(), snapshot = paint.worldArgs().snapshot;
  assert.equal(reads, 1); assert.equal(paint.frameWorld(), frame); assert.equal(frame.entities, owned.entities);
  assert.deepEqual(snapshot.entities, [visible], 'hidden roots and their children stay absent from the native payload');
  assert.equal(snapshot.entities[0], visible); assert.equal(frame.runtimeSessionId, 12);
  assert.equal(paint.worldArgs().playSessionId, undefined); assert.equal(snapshot.simulationTime, 4);
  assert.deepEqual(paint.scenePlayWorldArgs(), { playSessionId: 12, playRevision: 7 }); assert.equal(reads, 1);
  live.entities[1].components.Transform.position[0] = 9; live.clearColor[0] = .8;
  assert.equal(frame.entities[1].components.Transform.position[0], 3); assert.equal(frame.clearColor[0], .1);
  const dirtyArgs = createNativeViewportWorldArgs({ ...live, nativeSceneWorldReference: undefined }, true), dirty = dirtyArgs.frameWorld();
  assert.equal(dirtyArgs.scenePlayWorldArgs().playSessionId, undefined); assert.ok(dirtyArgs.scenePlayWorldArgs().snapshot);
  assert.equal(dirty.entities[1].components.Transform.position[0], 9); assert.equal(dirty.clearColor[0], .8);
  assert.notEqual(dirty.entities[1], live.entities[1], 'unverified edits still require a detached deep copy');
  assert.equal(nativeViewportFrameWorldCurrent(frame, { ...live, runtimeSessionId: 13 }), false);
  assert.equal(createNativeViewportWorldArgs({ entities: [hidden, child, visible], clearColor: [.1, .2, .3, 1], simulationTime: 4 }, true).snapshotArgs().snapshot.entities.length, 3);
});

test('edit Scene world uploads once and unchanged camera frames send only the retained revision', () => {
  const props = { entities: [{ entity: 1, components: {} }], clearColor: [0, 0, 0, 1], simulationTime: 0 };
  const first = createNativeViewportWorldArgs(props, true), initial = first.sceneWorldArgs();
  assert.ok(initial.snapshot); assert.equal(initial.sceneWorldKey, first.sceneWorldArgs().sceneWorldKey);
  first.markSceneWorldUploaded();
  assert.deepEqual(first.sceneWorldArgs(), { sceneWorldKey: initial.sceneWorldKey });
  assert.equal(first.snapshotArgs().snapshot, initial.snapshot);
  const changed = createNativeViewportWorldArgs(props, true).sceneWorldArgs();
  assert.ok(changed.snapshot); assert.notEqual(changed.sceneWorldKey, initial.sceneWorldKey);
});

test('frame reuse requires an exact session, revision and render configuration', () => {
  const frame = {world:{runtimeSessionId:4},worldRevision:0,requestKey:'size-display-dpr'};
  assert.equal(nativeGameFrameMatchesRequest(frame,{playSessionId:4,playRevision:0},frame.requestKey),true);
  for (const args of [{playSessionId:4}, {playSessionId:5,playRevision:0}, {playSessionId:4,playRevision:1}, {snapshot:{}}]) assert.equal(nativeGameFrameMatchesRequest(frame,args,frame.requestKey),false);
  assert.equal(nativeGameFrameMatchesRequest(frame,{playSessionId:4,playRevision:0},'resized'),false);
  assert.equal(nativeGameFrameMatchesRequest(null,{playSessionId:4,playRevision:0},frame.requestKey),false);
});
