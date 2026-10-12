// Author: MiYu. Verify request correlation, transport timing ownership and lease cleanup.
import assert from 'node:assert/strict';
import test from 'node:test';

test('pooled leases acknowledge detach once, including failed and timed-out late frames', async t => {
  const original=globalThis.window,requests=[],released=[],acknowledged=[];let receive,releaseError=false;
  globalThis.window={chrome:{webview:{addEventListener:(_,callback)=>{receive=callback;},releaseBuffer:buffer=>{if(releaseError)throw Error('detach failed');released.push(buffer);}}},__TAURI_INTERNALS__:{invoke:(command,args)=>{if(command==='release_native_viewport_frame'){assert.equal(released.length,acknowledged.length+1,'ACK follows detach');assert.equal(args.lease,String(acknowledged.length+1));acknowledged.push(args.request);return Promise.resolve();}return new Promise((resolve,reject)=>requests.push({args,resolve,reject}));}}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?pooled-leases');
  const deliver=index=>{const buffer=new ArrayBuffer(8);receive({additionalData:{nativeViewportRequest:requests[index].args.sharedRequest,nativeViewportPooled:true,nativeViewportLease:String(index+1)},getBuffer:()=>buffer});return buffer;};
  const first=transport.requestNativeViewportFrame('scene',{}),buffer=deliver(0);
  assert.equal(requests[0].args.sharedBufferReuse,true);assert.equal(await first,buffer);
  releaseError=true;assert.throws(()=>transport.releaseNativeViewportFrame(buffer),/detach failed/);assert.equal(acknowledged.length,0);assert.equal(transport.isSharedNativeViewportFrame(buffer),true);
  releaseError=false;transport.releaseNativeViewportFrame(buffer);transport.releaseNativeViewportFrame(buffer);
  requests[0].resolve(new ArrayBuffer(0));
  const failed=transport.requestNativeViewportFrame('scene',{});requests[1].reject(Error('render failed'));await assert.rejects(failed,/render failed/);deliver(1);
  t.mock.timers.enable({apis:['setTimeout']});const expired=transport.requestNativeViewportFrame('scene',{});t.mock.timers.tick(15_000);await assert.rejects(expired,/timed out/);deliver(2);requests[2].resolve(new ArrayBuffer(0));
  assert.equal(released.length,3);assert.deepEqual(acknowledged,requests.map(request=>request.args.sharedRequest));
});

test('shared frames correlate concurrent requests and release once; failures and late frames do not leak', async t => {
  const original = globalThis.window;
  const requests = [], released = [];
  let receive;
  globalThis.window = {
    chrome: { webview: { addEventListener: (_, callback) => { receive = callback; }, releaseBuffer: buffer => released.push(buffer) } },
    __TAURI_INTERNALS__: { invoke: (_, args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) },
  };
  t.after(() => { globalThis.window = original; });
  const transport = await import('../src/nativeViewportTransport.ts?shared-test');
  const deliver = (index, buffer, profile) => receive({ additionalData: { nativeViewportRequest: requests[index].args.sharedRequest, nativeViewportTransport: profile }, getBuffer: () => buffer });
  const first = transport.requestNativeViewportFrame('game', {}), second = transport.requestNativeViewportFrame('scene', {});
  const a = new ArrayBuffer(8), b = new ArrayBuffer(16);
  const pa={uiQueueMs:2,setupMs:.1,allocateMs:3,copyMs:1,bytes:8},pb={...pa,uiQueueMs:7,bytes:16};
  deliver(1, b, pb); deliver(0, a, pa);
  assert.equal(await first, a); assert.equal(await second, b);
  assert.equal(transport.isSharedNativeViewportFrame(a), true);
  assert.equal(transport.nativeViewportTransportProfile(a).uiQueueMs,2); assert.equal(transport.nativeViewportTransportProfile(b).uiQueueMs,7);
  assert.ok(transport.nativeViewportTransportProfile(a).getBufferMs>=0); assert.ok(transport.nativeViewportTransportProfile(a).requestElapsedMs>=0);
  assert.equal(transport.nativeViewportTransportProfile(a).requestId,requests[0].args.sharedRequest);
  assert.equal(transport.nativeViewportTransportProfile(a).publicationReadyToEventMs,undefined,'older hosts provide no publication epoch');
  const firstProfile=transport.nativeViewportTransportProfile(a);
  transport.releaseNativeViewportFrame(a); transport.releaseNativeViewportFrame(a); transport.releaseNativeViewportFrame(b);
  assert.deepEqual(released, [a, b]);
  assert.ok(firstProfile.releaseMs>=0,'retained frame profile observes lease release time');
  assert.equal(transport.nativeViewportTransportProfile(a),undefined); assert.equal(transport.nativeViewportTransportProfile(b),undefined);
  requests[0].resolve(new ArrayBuffer(0)); requests[1].resolve(new ArrayBuffer(0));
  const failed = transport.requestNativeViewportFrame('game', {});
  requests[2].reject(Error('closed window'));
  await assert.rejects(failed, /closed window/);
  const late = new ArrayBuffer(4);
  deliver(2, late);
  assert.equal(released.at(-1), late);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timedOut = transport.requestNativeViewportFrame('game', {});
  t.mock.timers.tick(15_000);
  await assert.rejects(timedOut, /timed out/);
  deliver(3, late);
  assert.equal(released.filter(value => value === late).length, 2);
  requests[3].resolve(new ArrayBuffer(0));
});

test('publication timestamps correlate per request and preserve clock overlap instead of clamping', async t => {
  const original=globalThis.window,requests=[];let receive;
  globalThis.window={chrome:{webview:{addEventListener:(_,callback)=>{receive=callback;},releaseBuffer(){}}},__TAURI_INTERNALS__:{invoke:(_,args)=>new Promise(resolve=>requests.push({args,resolve}))}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?publication-timestamps'),frame=transport.requestNativeViewportFrame('game',{}),buffer=new ArrayBuffer(24);
  const futureEpoch=performance.timeOrigin+performance.now()+1000;
  receive({additionalData:{nativeViewportRequest:requests[0].args.sharedRequest,nativeViewportTransport:{uiQueueMs:0,setupMs:0,allocateMs:0,copyMs:0,bytes:24,publicationReadyEpochMs:futureEpoch}},getBuffer:()=>buffer});
  assert.equal(await frame,buffer);
  const profile=transport.nativeViewportTransportProfile(buffer);
  assert.equal(profile.publicationReadyToEventMs,profile.receivedEpochMs-futureEpoch);
  assert.ok(profile.publicationReadyToEventMs<0,'clock discrepancies remain visible');
  transport.releaseNativeViewportFrame(buffer);requests[0].resolve(new ArrayBuffer(0));
});

test('unsupported shared transport falls back to binary IPC for subsequent requests', async t => {
  const original = globalThis.window, requests = [], bytes = new ArrayBuffer(24);
  globalThis.window = {
    chrome: { webview: { addEventListener() {}, releaseBuffer() {} } },
    __TAURI_INTERNALS__: { invoke: async (_, args) => { requests.push(args); return bytes; } },
  };
  t.after(() => { globalThis.window = original; });
  const transport = await import('../src/nativeViewportTransport.ts?fallback-test');
  assert.equal(await transport.requestNativeViewportFrame('game', {}), bytes);
  assert.equal(await transport.requestNativeViewportFrame('game', {}), bytes);
  assert.equal(typeof requests[0].sharedRequest, 'string');
  assert.equal(requests[1].sharedRequest, undefined);
  assert.equal(transport.isSharedNativeViewportFrame(bytes), false);
});

test('evicted revision falls back to its owned snapshot and other errors propagate', async t => {
  const original=globalThis.window,requests=[],bytes=new ArrayBuffer(24);
  let error='Play viewport revision expired',fallbacks=0;
  globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args)=>{requests.push({command,args});if(args.playRevision!=null)throw Error(error);return bytes;}}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?revision-test');
  const snapshot={entities:[{entity:1,components:{Button:{label:'frame 4'}}}],simulationTime:4,clearColor:[0,0,0,1]},fallback=()=>{fallbacks++;return {snapshot};};
  assert.equal(await transport.requestRevisionedNativeViewportFrame('game',{width:1920,height:1080,playSessionId:7,playRevision:4},fallback),bytes);
  assert.equal(fallbacks,1);assert.equal(requests[1].args.snapshot,snapshot);
  assert.equal(requests[1].args.playSessionId,undefined);assert.equal(requests[1].args.playRevision,undefined);
  assert.deepEqual([requests[1].args.width,requests[1].args.height],[1920,1080]);
  error='Play session expired';await assert.rejects(transport.requestRevisionedNativeViewportFrame('game',{playSessionId:7,playRevision:4},fallback),/session expired/);
  assert.equal(fallbacks,1);
});

test('evicted filtered Scene revisions retain visibility and use their exact owned payload', async t => {
  const original = globalThis.window, requests = [], bytes = new ArrayBuffer(24);
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (_, args) => { requests.push(args); if (args.playRevision != null) throw Error('Play viewport revision expired'); return bytes; } } };
  t.after(() => { globalThis.window = original; });
  const transport = await import('../src/nativeViewportTransport.ts?filtered-scene-revision');
  const snapshot = { entities: [{ entity: 7, components: {} }], clearColor: [0, 0, 0, 1], simulationTime: 2 }, request = { width: 800, hiddenEntityIds: [4294967297] };
  assert.equal(await transport.requestRevisionedNativeViewportFrame('render_native_scene_view', { request, playSessionId: 4, playRevision: 2 }, () => ({ snapshot })), bytes);
  assert.equal(requests[1].snapshot, snapshot); assert.equal(requests[1].request, request);
  assert.equal(requests[1].playSessionId, undefined); assert.equal(requests[1].playRevision, undefined);
});

test('evicted edit Scene world reuploads its owned snapshot under the same revision key', async t => {
  const original = globalThis.window, requests = [], bytes = new ArrayBuffer(24), snapshot = { entities: [], clearColor: [0, 0, 0, 1], simulationTime: 0 };
  let failure = 'Scene viewport revision expired';
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => { requests.push(args); if (!args.snapshot) throw Error(failure); return bytes; } } };
  t.after(() => { globalThis.window = original; });
  const transport = await import('../src/nativeViewportTransport.ts?scene-revision-test');
  assert.equal(await transport.requestRevisionedNativeViewportFrame('scene', { sceneWorldKey: 'owned-world', request: { width: 100 } }, () => ({ snapshot })), bytes);
  assert.equal(requests[1].sceneWorldKey, 'owned-world'); assert.equal(requests[1].snapshot, snapshot); assert.deepEqual(requests[1].request, { width: 100 });
  failure = 'GPU device unavailable';
  await assert.rejects(() => transport.requestRevisionedNativeViewportFrame('scene', { sceneWorldKey: 'owned-world' }, () => ({ snapshot })), /GPU device unavailable/);
});
