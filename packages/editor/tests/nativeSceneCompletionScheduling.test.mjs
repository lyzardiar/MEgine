// Author: MiYu. Exercise Scene completion pacing, camera changes, capture and request lifetimes without rAF.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import { pendingNativeScenePaintUnchanged } from '../src/nativeSceneFrame.ts';
import { requestRevisionedNativeViewport } from '../src/nativeViewportTransport.ts';
const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = source.indexOf('    const sceneRequest = nativeSceneRequestRef.current;'), end = source.indexOf('    if (\n      selectedCamera', start);
assert.ok(start > 0 && end > start);
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const helpers = compile((readFileSync(new URL('../src/frameCadence.ts', import.meta.url), 'utf8')+'\n'+readFileSync(new URL('../src/nativeViewportRequests.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '')).replaceAll('export ', ''));
const scheduler = compile(source.slice(source.indexOf('    const scheduleRequest ='), source.indexOf('    // Native Game requests continue')));
const requestBlock = compile(`(function(p, now, nativeSceneIdentity, cam, requestWorldFrame) { ${source.slice(start, end)} })`);
const cleanupStart = source.indexOf('  useEffect(() => () => {\n    const request = nativeSceneRequestRef.current;'), cleanupEnd = source.indexOf('  useEffect(() => props.subscribeRuntimeFrames', cleanupStart);
assert.ok(cleanupStart > 0 && cleanupEnd > cleanupStart);
const captureStart = source.indexOf('    return agentBridge.registerViewportCapture(props.tab, async'), captureEnd = source.indexOf('\n  }, [props.tab]);', captureStart);
const captureBlock = compile(`(function() { ${source.slice(captureStart, captureEnd)} })`);
function fixture(duration, playing = true, wakeDelay = 0) {
  let now = 0, serial = 0, active = 0, maxActive = 0, released = 0, shown = 0;
  const tasks = new Map(), starts = [], uploaded = [];
  const propsRef = { current: { tab: 'scene', playing, runtimeSessionId: 1, key: 'camera-a' } };
  propsRef.current.mode=playing?'play':'edit';propsRef.current.readPlaybackMode=()=>propsRef.current.mode;
  const nativeSceneRequestRef = { current: null }, nativeSceneFrameRef = { current: null };
  const scene2DRef = { current: false }, draggingRef = { current: false }, lastProfilerFrameRef = { current: 1 };
  const setTimeout = (callback, delay) => { const id = ++serial; tasks.set(id, { callback, at: now + Math.trunc(delay) + wakeDelay }); return id; };
  const canvasRef = { current: { width: 640, height: 360, toDataURL: () => 'data:image/png;frame=' + shown } };
  const env = { panelVisibleRef: { current: true }, window: { __TAURI_INTERNALS__: {}, setTimeout, clearTimeout: id => tasks.delete(id) }, performance: { now: () => now }, lastAnimationFrameAtRef: { current: -Infinity }, structuredClone, propsRef, nativeSceneRequestRef, nativeSceneFrameRef, nativeCameraPreviewRequestRef: { current: { inFlight: false, ready: null, lastRequestAt: 0 } }, scene2DRef, draggingRef, lastProfilerFrameRef, currentViewportOwner: () => propsRef.current, currentViewportProps: () => propsRef.current, nativeWorld: { frameWorld: () => ({ runtimeSessionId: 1 }) }, nativeViewportFrameWorldCurrent: (world, props) => world.runtimeSessionId === props.runtimeSessionId, releaseNativeViewportFrame: () => released++, uploadNativeViewportFrame: buffer => { uploaded.push(buffer); return { profile: {}, image: {}, width: 640, height: 360 }; }, recordNativeViewportProfile() {}, console: { warn() {} }, canvasRef, NATIVE_CAPTURE_READY_TIMEOUT_MS: 8000 };
  Object.assign(env, { clearTimeout: env.window.clearTimeout, setTimeout, projectGeneration: 0, projectAssetSessionGeneration: () => 0, canvas: { getBoundingClientRect: () => ({ width: 640, height: 360 }) }, liveCam: { current: { pivot: 'camera-a' } }, orbitEye: pivot => [pivot, 4, 7], nativeSceneFrameRequestIdentity: camera => ({ key: camera.eye[0], presentationKey: 'size' }), MAX_NATIVE_SCENE_VIEW_DIMENSION: 4096, cameraPreviewKey: undefined, recordOwnedNativeViewportProfile() {}, isGame: false, p: propsRef.current });
  const context = vm.createContext(env); vm.runInContext(helpers, context); vm.runInContext(scheduler, context);
  nativeSceneRequestRef.current = vm.runInContext('createNativeViewportRequestState()', context);
  env.nativeCameraPreviewRequestRef.current = vm.runInContext('createNativeViewportRequestState(1)', context);
  env.syncRequestOwner = vm.runInContext('(state, key) => synchronizeNativeViewportRequestOwner(state, propsRef.current.runtimeSessionId, key)', context);
  const request = vm.runInContext(requestBlock, context);
  const paint = (animationFrame = false, completedSceneFrame = false, resumeSceneRequest = false, captureSceneFrame = false) => {
    if (!env.panelVisibleRef.current && !captureSceneFrame) return;
    env.captureSceneFrame = captureSceneFrame; env.completedSceneFrame = completedSceneFrame; env.resumeSceneRequest = resumeSceneRequest;
    const p = { ...propsRef.current };
    env.liveCam.current.pivot = p.key; env.nativeWorld = { requestKey: () => `${p.runtimeSessionId}:${now}`, frameWorld: () => ({ runtimeSessionId: p.runtimeSessionId }) };
    env.isGame = p.tab === 'game'; env.scene2DActive = scene2DRef.current;
    const camera = { eye: [p.key, 4, 7], target: [0, 0, 0], fovYDeg: 60 };
    request(p, now, { key: p.key, presentationKey: 'size', width: 640, height: 360 }, camera, (_command,_args,deferExpired) => requestRevisionedNativeViewport({playSessionId:p.runtimeSessionId,playRevision:now},()=>{env.snapshotFallbacks=(env.snapshotFallbacks??0)+1;return {snapshot:{}};},args => {
      starts.push({ at: now, key: p.key }); maxActive = Math.max(maxActive, ++active);
      return new Promise((resolve, reject) => { const id = ++serial; tasks.set(id, { at: now + duration, callback: () => { active--; env.expireRevision&&args.snapshot==null ? reject(Error('Play viewport revision expired')) : env.fail ? reject(env.error ?? Error('render failed')) : resolve({ key: p.key, runtimeSessionId: p.runtimeSessionId }); } }); });
    },undefined,deferExpired));
    shown = uploaded.length;
  };
  env.paint = paint;
  let dispose; env.useEffect = callback => { dispose = callback(); };
  vm.runInContext(compile(source.slice(cleanupStart, cleanupEnd)), context);
  let capture; env.props = { tab: 'scene' }; env.agentBridge = { registerViewportCapture: (_tab, callback) => { capture = callback; return () => {}; } };
  vm.runInContext(captureBlock, context)();
  async function advance(to) {
    for (;;) {
      const next = [...tasks].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next; now = task.at; tasks.delete(id); task.callback();
      for (let i = 0; i < 12; i++) await Promise.resolve();
    }
    now = to;
  }
  paint();
  return { starts, uploaded, propsRef, env, nativeSceneRequestRef, nativeSceneFrameRef, scene2DRef, draggingRef, paint, advance, dispose, capture: () => capture('image/png', .9, 2048), get maxActive() { return maxActive; }, get released() { return released; } };
}
test('slow Scene renders present and continue on completion without animation', async () => {
  const f = fixture(24); await f.advance(95); assert.deepEqual(f.starts.map(s => s.at), [0, 17, 34, 50, 67, 84]); assert.equal(f.maxActive, 2); f.dispose();
});

test('live Scene expiry yields to a fresh request without uploading the obsolete snapshot', async () => {
  const f=fixture(5),profiles=[];f.env.recordOwnedNativeViewportProfile=(_source,profile)=>profiles.push(profile);f.env.expireRevision=true;
  await f.advance(6);assert.equal(f.nativeSceneRequestRef.current.deferredRevisionRetries,1);assert.equal(f.env.snapshotFallbacks,undefined);assert.equal(f.nativeSceneRequestRef.current.reportedError,false);
  f.env.expireRevision=false;await f.advance(35);assert.ok(f.uploaded.length>0);assert.equal(profiles[0].deferredRevisionRetries,1);assert.equal(f.nativeSceneRequestRef.current.deferredRevisionRetries,0);assert.equal(f.env.snapshotFallbacks,undefined);f.dispose();
});

test('persistent Scene expiry falls back after two retries so live presentation cannot starve', async () => {
  const f=fixture(5),profiles=[];f.env.recordOwnedNativeViewportProfile=(_source,profile)=>profiles.push(profile);f.env.expireRevision=true;
  await f.advance(55);assert.ok(f.uploaded.length>0);assert.equal(f.env.snapshotFallbacks,1);assert.equal(profiles[0].deferredRevisionRetries,2);assert.equal(f.nativeSceneRequestRef.current.reportedError,false);f.dispose();
});

test('paused Scene and explicit captures retain immediate exact fallback', async () => {
  for(const mode of ['pause','capture']){const f=fixture(5);f.env.expireRevision=true;if(mode==='pause')f.propsRef.current.mode='pause';else f.nativeSceneRequestRef.current.captures=1;
    await f.advance(11);assert.equal(f.env.snapshotFallbacks,1);assert.ok(f.uploaded.length>0);assert.equal(f.nativeSceneRequestRef.current.deferredRevisionRetries,0);f.dispose();}
});

test('a superseded expired Scene request cannot upload an old snapshot after Stop', async () => {
  const f=fixture(5);f.env.expireRevision=true;f.propsRef.current.mode='edit';f.propsRef.current.playing=false;f.propsRef.current.runtimeSessionId=undefined;
  await f.advance(6);assert.equal(f.env.snapshotFallbacks,undefined);assert.equal(f.uploaded.length,0);assert.equal(f.nativeSceneRequestRef.current.deferredRevisionRetries,0);assert.equal(f.nativeSceneRequestRef.current.reportedError,false);f.dispose();
});
test('fast Scene renders respect 60 Hz with integer WebView timers', async () => {
  const f = fixture(5); await f.advance(95); assert.deepEqual(f.starts.map(s => s.at), [0, 17, 34, 50, 67, 84]); assert.equal(f.maxActive, 1); f.dispose();
});
test('final camera changes continue at the deadline after dragging stops', async () => {
  const f = fixture(5, false); f.draggingRef.current = true; f.propsRef.current = { ...f.propsRef.current, key: 'camera-b' }; await f.advance(6); f.draggingRef.current = false;
  await f.advance(40); assert.deepEqual(f.starts.map(s => [s.at, s.key]), [[0, 'camera-a'], [17, 'camera-b']]); assert.deepEqual(Array.from(f.nativeSceneFrameRef.current.camera.eye), ['camera-b', 4, 7]); assert.equal(f.maxActive, 1); f.dispose();
});
test('an unchanged static Scene does not create a completion rendering loop', async () => {
  const f = fixture(5, false); await f.advance(95); assert.equal(f.starts.length, 1); assert.equal(f.nativeSceneRequestRef.current.resumeTimer, null); f.dispose();
});
test('animation starts at the deadline and cancels its pending timer', async () => {
  const f = fixture(5); await f.advance(6); assert.notEqual(f.nativeSceneRequestRef.current.resumeTimer, null); await f.advance(16.8); f.paint(); await f.advance(33); assert.deepEqual(f.starts.map(s => s.at), [0, 16.8]); assert.equal(f.maxActive, 1); f.dispose();
});
test('switching to Game or 2D prevents scheduled Scene continuation', async () => {
  for (const change of [f => f.propsRef.current.tab = 'game', f => f.scene2DRef.current = true]) { const f = fixture(5); await f.advance(6); change(f); await f.advance(95); assert.equal(f.starts.length, 1); assert.equal(f.nativeSceneRequestRef.current.resumeTimer, null); f.dispose(); }
});
test('unmount cancels scheduled requests and releases unconsumed native pixels', async () => {
  for (const duration of [5, 24]) { const f = fixture(duration); await f.advance(6); f.dispose(); await f.advance(95); assert.equal(f.starts.length, 1); assert.equal(f.nativeSceneRequestRef.current.resumeTimer, null); if (duration === 24) { assert.equal(f.uploaded.length, 0); assert.equal(f.released, 1); } }
});
test('asset invalidation discards a stale response without a completion retry', async () => {
  const f = fixture(24); f.nativeSceneRequestRef.current.generation++; await f.advance(95); assert.equal(f.uploaded.length, 0); assert.equal(f.released, 1); assert.equal(f.starts.length, 1); f.dispose();
});
test('render failures do not create completion retry loops', async () => {
  const f = fixture(24); f.env.fail = true; await f.advance(95); assert.equal(f.starts.length, 2); assert.equal(f.nativeSceneRequestRef.current.reportedError, true); assert.equal(f.nativeSceneRequestRef.current.resumeTimer, null); f.dispose();
});
test('Scene captures finish while Play completion rendering is active', async () => {
  const f = fixture(24), captured = f.capture(); assert.equal(f.nativeSceneRequestRef.current.captures, 1); await f.advance(55); const result = await captured; assert.ok(result.dataUrl.startsWith('data:image/png;frame=')); assert.equal(f.nativeSceneRequestRef.current.captures, 0); assert.equal(f.maxActive, 1); await f.advance(95); assert.ok(f.starts.length > 2); f.dispose();
});

const paintStart = source.indexOf('    const nativeScene3D ='), paintEnd = source.indexOf('    const projectGeneration =', paintStart);
assert.ok(paintStart > 0 && paintEnd > paintStart);
const paintGate = compile(`(function(sc, rect) { ${source.slice(paintStart, paintEnd)} return skipUnchangedScenePaint ? undefined : 'paint'; })`);
function paintFixture(playing, components = {}) {
  const frame = { camera: { eye: [3, 4, 7], target: [0, 0, 0] } }, sc = { yaw: 30 }, rect = { width: 800, height: 600 };
  const env = { projectAssetSessionGeneration: () => 0, resumeSceneRequest: false, completedSceneFrame: false, captureSceneFrame: false, now: 10, lastViewportPaintRef: { current: 0 }, animationFrame: true, window: { __TAURI_INTERNALS__: {}, devicePixelRatio: 1 }, propsRef: { current: { tab: 'scene', playing, entities: [{ entity: 1, components }] } }, scene2DRef: { current: false }, nativeSceneFrameRef: { current: frame }, nativeCameraPreviewFrameRef: { current: null }, nativeSceneRequestRef: { current: { inFlight: false } }, scenePaintEpochRef: { current: 1 }, previousScenePaintRef: { current: null }, hoverGizmoRef: { current: null }, activeGizmoRef: { current: null }, uiHoverRef: { current: null }, uiPressRef: { current: null }, pendingNativeScenePaintUnchanged };
  const draw = vm.runInContext(paintGate, vm.createContext(env));
  assert.equal(draw(sc, rect), 'paint'); env.nativeSceneRequestRef.current.inFlight = true;
  return { env, sc, rect, draw: () => draw(sc, rect) };
}
test('pending Play Scene paints reuse the displayed camera until completed pixels change', () => {
  const f = paintFixture(true); assert.equal(f.draw(), undefined); f.sc.yaw += 10; assert.equal(f.draw(), undefined);
  f.env.nativeSceneFrameRef.current = { camera: { eye: [7, 4, 3], target: [0, 0, 0] } }; assert.equal(f.draw(), 'paint');
  assert.equal(f.draw(), undefined); f.env.nativeSceneRequestRef.current.inFlight = false; assert.equal(f.draw(), undefined, 'unchanged pixels are skipped after request scheduling');
});
test('pending Scene paint coalescing preserves resize, authoring, hover and camera-preview updates', () => {
  for (const change of [f => f.rect.width++, f => f.env.window.devicePixelRatio++, f => f.env.scenePaintEpochRef.current++, f => f.env.hoverGizmoRef.current = 'x', f => f.env.nativeCameraPreviewFrameRef.current = {}]) { const f = paintFixture(true); assert.equal(f.draw(), undefined); change(f); assert.equal(f.draw(), 'paint'); }
});
test('animated edit Scene overlays keep wall-clock redraws while runtime overlays follow completed frames', () => {
  for (const component of ['SpineSkeleton', 'ParticleEmitter3D', 'AnimatedSprite2D']) { const edit = paintFixture(false, { [component]: {} }); assert.equal(edit.draw(), 'paint'); const play = paintFixture(true, { [component]: {} }); assert.equal(play.draw(), undefined); play.env.nativeSceneFrameRef.current = { camera: play.env.nativeSceneFrameRef.current.camera }; assert.equal(play.draw(), 'paint'); }
});
test('camera movement before the first native bitmap still redraws the browser fallback', () => {
  const f = paintFixture(true); f.env.nativeSceneFrameRef.current = null; assert.equal(f.draw(), 'paint'); assert.equal(f.draw(), undefined); f.sc.yaw++; assert.equal(f.draw(), 'paint');
});

test('first-frame composition and explicit captures redraw across task boundaries', () => {
  const f = paintFixture(true); assert.equal(f.draw(), undefined); f.env.animationFrame = false; assert.equal(f.draw(), 'paint');
});

const inputsStart = source.indexOf('  const scenePaintInputs ='), inputsEnd = source.indexOf('  const hoverGizmoRef', inputsStart);
assert.ok(inputsStart > 0 && inputsEnd > inputsStart);
const invalidate = vm.runInNewContext(compile(`(function(props, scenePaintInputsRef, scenePaintEpochRef) { ${source.slice(inputsStart, inputsEnd)} })`));
function inputsFixture(playing) {
  const props = { playing, entities: [{}], selectedIds: [], sceneHiddenIds: [], timelineParticlePreviews: [], clearColor: [0, 0, 0, 1] }, inputs = { current: [] }, epoch = { current: 0 };
  const update = () => invalidate(props, inputs, epoch); update();
  return { props, epoch, update };
}
test('runtime publications and equal interaction arrays retain the pending paint epoch', () => {
  const f = inputsFixture(true), epoch = f.epoch.current;
  f.props.entities = [{}]; f.props.simulationTime = 2; f.props.clearColor = [1, 0, 0, 1]; f.props.selectedIds = []; f.props.sceneHiddenIds = []; f.props.timelineParticlePreviews = []; f.update(); assert.equal(f.epoch.current, epoch);
});
test('visible authoring and interaction changes invalidate pending Scene paints', () => {
  for (const change of [p => p.selectedIds = [2], p => p.sceneHiddenIds = [2], p => p.gizmo = 'rotate', p => p.pivotMode = 'center', p => p.handleOrientation = 'local', p => p.timelineCameraPreview = { entity: 2 }, p => p.timelineParticlePreviews = [{ entity: 2 }], p => p.playing = false, p => p.runtimeSessionId = 2]) {
    const f = inputsFixture(true), epoch = f.epoch.current; change(f.props); f.update(); assert.equal(f.epoch.current, epoch + 1);
  }
  for (const change of [p => p.entities = [{}], p => p.clearColor = [1, 0, 0, 1]]) { const f = inputsFixture(false), epoch = f.epoch.current; change(f.props); f.update(); assert.equal(f.epoch.current, epoch + 1); }
});
const commitStart = source.indexOf('    if (skipUnchangedScenePaint && scenePaintState.frame'), commitEnd = source.indexOf('    const nativeSceneFrame = !isGame', commitStart);
assert.ok(commitStart > 0 && commitEnd > commitStart);
const commitPaint = vm.runInNewContext(compile(`(function(env) { const {skipUnchangedScenePaint,scenePaintState,nativeSceneFrameRef,nativeCameraPreviewFrameRef,lastViewportPaintRef,now,lastProfilerFrameRef,lastMeasuredPaintRef,p,animationFrame,nativeGamePaint,nativeScene3D,clearViewport}=env; ${source.slice(commitStart, commitEnd)} return 'paint'; })`));
test('request-only animation paints preserve pixels and picking before clearing the viewport', () => {
  const frame={}, preview={}, env={skipUnchangedScenePaint:true, scenePaintState:{frame,preview}, nativeSceneFrameRef:{current:frame}, nativeCameraPreviewFrameRef:{current:preview}, lastViewportPaintRef:{current:10}, now:20, lastProfilerFrameRef:{current:10}, lastMeasuredPaintRef:{current:{source:'scene',at:10}}, p:{tab:'scene'}, nativeGamePaint:false, animationFrame:true, nativeScene3D:true, clearViewport:()=>assert.fail('unchanged request must preserve pixels and picking')};
  assert.equal(commitPaint(env),undefined); assert.equal(env.lastViewportPaintRef.current,10); assert.equal(env.lastProfilerFrameRef.current,10);
  let clears=0;env.clearViewport=()=>clears++;env.nativeSceneFrameRef.current={};assert.equal(commitPaint(env),'paint');assert.equal(clears,1);assert.equal(env.lastViewportPaintRef.current,20);
  assert.ok(source.includes('if (performance.now() - lastViewportPaintRef.current > 100) paint();'));
});

test('active edit Scene animation owns its paints while background completion continues the camera', async () => {
  const visible = fixture(5, false); visible.env.lastAnimationFrameAtRef.current = 1; await visible.advance(6); visible.draggingRef.current = true; assert.equal(visible.starts.length, 1);
  visible.paint(); await visible.advance(12); assert.deepEqual(visible.starts.map(s => s.at), [0, 6]); visible.dispose();
  const background = fixture(5, false); background.draggingRef.current = true; await background.advance(40); assert.deepEqual(background.starts.map(s => s.at), [0, 17, 34]); background.dispose();
});

test('active Play completion yields before the paced request continuation', async () => {
  const f=fixture(5); f.env.lastAnimationFrameAtRef.current=1; await f.advance(20); assert.deepEqual(f.starts.map(s=>s.at),[0,17]); await f.advance(25); f.paint(true); await f.advance(40); assert.deepEqual(f.starts.map(s=>s.at),[0,17,34]); f.dispose();
});

test('request continuation coalesces unchanged pixels without impersonating an animation frame', () => {
  const f=paintFixture(true); f.env.nativeSceneRequestRef.current.inFlight=false; f.env.animationFrame=false; f.env.resumeSceneRequest=true; assert.equal(f.draw(),undefined);
  assert.ok(source.includes('if (animationFrame) lastAnimationFrameAtRef.current = paintStartedAt;'));
  assert.ok(source.includes('if (sceneRequest.generation === generation') && source.includes('paint(false, false, true)'));
});


test('Scene capture owns request starts while a camera preview is still completing', async () => {
  const f = fixture(24); let completePreview;
  const preview = f.env.nativeCameraPreviewRequestRef.current; const ticket = { sequence: 1, generation: 0, key: 'camera', ready: new Promise(resolve => { completePreview = resolve; }) }; preview.pending.set(1, ticket);
  const captured = f.capture(); await f.advance(30); f.paint(true);
  assert.equal(f.starts.length, 1, 'animation cannot start work while capture waits for preview');
  preview.pending.delete(1); completePreview(); for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(f.starts.length, 2, 'capture starts its fresh Scene request'); await f.advance(60);
  const result = await captured; assert.ok(result.dataUrl.startsWith('data:image/png;frame='));
  assert.equal(f.nativeSceneRequestRef.current.captures, 0); assert.equal(f.starts.length, 3, 'Play resumes after capture'); assert.equal(f.maxActive, 1); f.dispose();
});


test('capture timeout releases request ownership and lets Play continue', async () => {
  const f = fixture(9000), captured = f.capture(); await f.advance(8001);
  assert.equal(await captured, null); assert.equal(f.nativeSceneRequestRef.current.captures, 0);
  assert.equal(f.starts.length, 2); await f.advance(9010); assert.equal(f.starts.length, 3); assert.equal(f.maxActive, 2); f.dispose();
});


test('Scene busy and expired tickets retry in a hidden view without disabling rendering', async () => {
  for (const error of ['offscreen readback busy: all three slots have outstanding tickets', 'Viewport session expired']) {
    const f = fixture(5); f.env.fail = true; f.env.error = error;
    await f.advance(6); assert.equal(f.nativeSceneRequestRef.current.reportedError, false);
    f.env.fail = false; await f.advance(50);
    assert.ok(f.uploaded.length > 0); assert.ok(f.starts[1].at >= 21); assert.ok(f.maxActive <= 2); f.dispose();
  }
});


test('late WebView wakeups do not accumulate drift in live Scene scheduling', async () => {
  const f=fixture(5,true,1.3);await f.advance(2000);assert.equal(f.starts.length,120);assert.equal(f.maxActive,1);
  for(let i=1;i<f.starts.length;i++){assert.ok(Math.abs(f.starts[i].at-i*1000/60)<2.31);assert.ok(f.starts[i].at-f.starts[i-1].at>=1000/120-1e-8);}
  f.dispose();
});


test('deferred completion paints skip unchanged pixels while fresh frames still compose',()=>{
 const f=paintFixture(true);f.env.animationFrame=false;f.env.completedSceneFrame=true;
 assert.equal(f.draw(),undefined,'a deferred request has no new image to compose');
 f.env.propsRef.current.entities=[{entity:1,components:{}}];f.env.propsRef.current.simulationTime=2;
 assert.equal(f.draw(),undefined,'a newer incoming world does not change the displayed old frame');
 f.env.nativeSceneFrameRef.current={camera:f.env.nativeSceneFrameRef.current.camera};assert.equal(f.draw(),'paint');assert.equal(f.draw(),undefined);
 f.env.captureSceneFrame=true;assert.equal(f.draw(),'paint','explicit captures always compose');
});

test('completion paint coalescing keeps presentation and interaction invalidations',()=>{
 for(const change of [f=>f.rect.height++,f=>f.env.window.devicePixelRatio++,f=>f.env.scenePaintEpochRef.current++,f=>f.env.activeGizmoRef.current='x',f=>f.env.uiHoverRef.current=1,f=>f.env.uiPressRef.current=2,f=>f.env.nativeCameraPreviewFrameRef.current={},f=>f.env.nativeSceneFrameRef.current={camera:{eye:[9,8,7],target:[0,0,0]}}]){
  const f=paintFixture(true);f.env.animationFrame=false;f.env.completedSceneFrame=true;assert.equal(f.draw(),undefined);change(f);assert.equal(f.draw(),'paint');
 }
 const animated=paintFixture(false,{ParticleEmitter3D:{}});animated.env.animationFrame=false;animated.env.completedSceneFrame=true;assert.equal(animated.draw(),'paint');
 const fallback=paintFixture(true);fallback.env.animationFrame=false;fallback.env.completedSceneFrame=true;fallback.env.nativeSceneFrameRef.current=null;assert.equal(fallback.draw(),'paint');fallback.sc.yaw++;assert.equal(fallback.draw(),'paint');
});


test('continuous orbit presents completed cameras while requesting the newest camera', async () => {
  const f = fixture(24, false); f.draggingRef.current = true;
  for (let at = 4; at <= 100; at += 4) { await f.advance(at); f.propsRef.current.key = `camera-${at}`; f.paint(true); }
  assert.ok(f.uploaded.length >= 4, 'continuous input must not starve native presentation');
  assert.ok(f.maxActive <= 2, 'camera motion retains the bounded in-flight queue');
  assert.ok(f.uploaded.some(frame => frame.key !== 'camera-a'));
  f.draggingRef.current = false; await f.advance(160);
  assert.equal(f.nativeSceneFrameRef.current.camera.eye[0], 'camera-100'); f.dispose();
});

test('inactive dock Scene discards in-flight pixels and schedules no continuation', async () => {
  const f = fixture(24); f.env.panelVisibleRef.current = false; await f.advance(100);
  assert.equal(f.uploaded.length, 0); assert.equal(f.starts.length, 1); assert.equal(f.released, 1);
  assert.equal(f.nativeSceneRequestRef.current.resumeTimer, null);
  f.env.panelVisibleRef.current = true; f.paint(); await f.advance(140); assert.ok(f.uploaded.length > 0); f.dispose();
});

test('dock visibility suspends animation and cancels Scene, Game and preview timers', () => {
  const start = source.indexOf('  // Continuous render loop'), end = source.indexOf('  const currentNativeGamePaintState', start);
  const requests = Array.from({length:3}, (_, i) => ({current:{generation:1,resumeTimer:i+1}})), cleared = [];
  let callback; const env = {useEffect: fn => {callback=fn;}, panelVisible:false, nativeGameRequestRef:requests[0], nativeSceneRequestRef:requests[1], nativeCameraPreviewRequestRef:requests[2], navigationKeysRef:{current:new Set(['KeyW'])}, navigationTimeRef:{current:7}, lastMeasuredPaintRef:{current:{}}, window:{clearTimeout:id=>cleared.push(id)}, requestAnimationFrame:()=>assert.fail('inactive panel must not schedule rAF')};
  vm.runInNewContext(compile(source.slice(start,end)), env); callback();
  assert.deepEqual(cleared,[1,2,3]);for(const r of requests){assert.equal(r.current.generation,2);assert.equal(r.current.resumeTimer,null);}
  assert.equal(env.navigationKeysRef.current.size,0);assert.equal(env.lastMeasuredPaintRef.current,null);
  const paintStart=source.indexOf('  const paint ='), guard=source.indexOf('    const paintStartedAt',paintStart);
  const early=vm.runInNewContext(compile(source.slice(paintStart,guard)+' return "paint"; }; paint;'),{panelVisibleRef:{current:false}});
  assert.equal(early(),undefined);assert.equal(early(false,false,false,true),'paint','explicit captures may render on request');
});
