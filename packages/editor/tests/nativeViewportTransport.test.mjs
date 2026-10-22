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

test('image captures reuse the exact Play revision without constructing a snapshot', async () => {
  const { requestRevisionedNativeViewport } = await import('../src/nativeViewportTransport.ts');
  const args={width:850,height:478,playSessionId:7,playRevision:0};
  const image={pngBase64:'owned-image',profile:{worldRevision:0}};
  const result=await requestRevisionedNativeViewport(args,()=>{throw Error('snapshot must stay lazy');},async request=>{assert.equal(request,args);assert.equal(request.raw,undefined);return image;});
  assert.equal(result,image);
});

test('image revision fallback preserves capture ownership and fails closed for other errors', async () => {
  const { requestRevisionedNativeViewport } = await import('../src/nativeViewportTransport.ts');
  const { createNativeViewportWorldArgs } = await import('../src/nativeViewportFrame.ts');
  const retained={entities:[{components:{Text:{text:'owned'}}}],clearColor:[0,0,0,1],simulationTime:1,sessionId:7,revision:2};
  const props={entities:[],clearColor:[1,0,0,1],simulationTime:2,runtimeSessionId:7,nativeWorldReference:retained};
  const world=createNativeViewportWorldArgs(props),args={width:320,height:180,...world.worldArgs()},requests=[];
  const image={pngBase64:'fallback-image',profile:{}};
  const result=await requestRevisionedNativeViewport(args,world.snapshotArgs,async request=>{
    requests.push(request);
    if(request.playRevision!=null){props.nativeWorldReference={...retained,simulationTime:9};throw Error('Play viewport revision expired');}
    return image;
  });
  assert.equal(result,image);assert.equal(requests.length,2);
  assert.deepEqual(requests[1],{width:320,height:180,playSessionId:7,snapshot:{entities:retained.entities,clearColor:retained.clearColor,simulationTime:1}});
  for(const message of ['Play session expired','GPU device unavailable','unrelated failure']){
    let count=0;
    await assert.rejects(requestRevisionedNativeViewport(args,()=>{throw Error('unexpected fallback');},async()=>{count++;throw Error(message);}),error=>error.message===message);
    assert.equal(count,1);
  }
  let count=0;
  await assert.rejects(requestRevisionedNativeViewport(args,world.snapshotArgs,async()=>{count++;throw Error('Play viewport revision expired');}),/Play viewport revision expired/);
  assert.equal(count,2,'snapshot fallback is bounded');
});

test('evicted edit Scene world reuploads its owned snapshot under the same revision key', async t => {
  const original = globalThis.window, requests = [], bytes = new ArrayBuffer(24), snapshot = { entities: [], clearColor: [0, 0, 0, 1], simulationTime: 0 };
  let failure = 'Scene viewport revision expired';
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => { requests.push(args); if (!args.snapshot) throw Error(failure); return bytes; } } };
  t.after(() => { globalThis.window = original; });
  const transport = await import('../src/nativeViewportTransport.ts?scene-revision-test');
  assert.equal(await transport.requestRevisionedNativeViewportFrame('scene', { sceneWorldKey: 'owned-world', request: { width: 100 } }, () => ({ snapshot })), bytes);
  assert.equal(requests[1].sceneWorldKey, 'owned-world'); assert.equal(requests[1].snapshot, snapshot); assert.deepEqual(requests[1].request, { width: 100 });
  assert.equal(await transport.requestRevisionedNativeViewportFrame('render_native_game_view', { sceneWorldKey: 'owned-game', width: 320, height: 180 }, () => ({ snapshot })), bytes);
  assert.equal(requests[3].sceneWorldKey, 'owned-game'); assert.equal(requests[3].snapshot, snapshot); assert.equal(requests[3].width, 320);
  failure = 'GPU device unavailable';
  await assert.rejects(() => transport.requestRevisionedNativeViewportFrame('scene', { sceneWorldKey: 'owned-world' }, () => ({ snapshot })), /GPU device unavailable/);
});

test('pooled mappings reuse pixel pages while leases and profiles remain per frame', async t => {
  const original=globalThis.window,requests=[],released=[],acks=[];let receive,hide;
  const webview={addEventListener:(_,callback)=>{receive=callback;},releaseBuffer:buffer=>{released.push(buffer);structuredClone(buffer,{transfer:[buffer]});}};
  globalThis.window={chrome:{webview},addEventListener:(type,callback)=>{if(type==='pagehide')hide=callback;},__TAURI_INTERNALS__:{invoke:(command,args)=>{if(command==='release_native_viewport_frame'){acks.push(args);return Promise.resolve();}return new Promise(resolve=>requests.push({args,resolve}));}}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?retained-pages');
  const deliver=(index,buffer,id=1)=>{receive({additionalData:{nativeViewportRequest:requests[index].args.sharedRequest,nativeViewportPooled:true,nativeViewportLease:String(index+1),nativeViewportTransport:{bufferId:id,bytes:buffer.byteLength}},getBuffer:()=>buffer});requests[index].resolve(new ArrayBuffer(0));};
  const first=transport.requestNativeViewportFrame('game',{}),a=new ArrayBuffer(8);deliver(0,a);assert.equal(await first,a);
  transport.releaseNativeViewportFrame(a);transport.releaseNativeViewportFrame(a);assert.equal(released.length,0);assert.equal(acks.length,1);assert.equal(transport.isSharedNativeViewportFrame(a),false);
  new Uint8Array(a)[0]=93; // Native writes the next frame into the same backing pages after ACK.
  const next=transport.requestNativeViewportFrame('game',{}),b=new ArrayBuffer(8);deliver(1,b);assert.equal(await next,a);assert.equal(b.byteLength,0);assert.equal(new Uint8Array(a)[0],93);assert.equal(transport.nativeViewportTransportProfile(a).requestId,requests[1].args.sharedRequest);
  hide();assert.equal(a.byteLength,8,'pagehide preserves the consumer active lease');transport.releaseNativeViewportFrame(a);assert.equal(a.byteLength,0);assert.equal(acks.length,2);assert.equal(transport.nativeViewportTransportProfile(a),undefined);
  const third=transport.requestNativeViewportFrame('game',{}),c=new ArrayBuffer(16);deliver(2,c);await third;transport.releaseNativeViewportFrame(c);hide();assert.equal(c.byteLength,0,'idle pages released on pagehide');
});

test('mapping cache bounds evictions, preserves active frames and releases late frames', async t => {
  const original=globalThis.window,requests=[],released=[],acks=[];let receive,hide;
  globalThis.window={chrome:{webview:{addEventListener:(_,callback)=>{receive=callback;},releaseBuffer:buffer=>{released.push(buffer);structuredClone(buffer,{transfer:[buffer]});}}},addEventListener:(type,callback)=>{if(type==='pagehide')hide=callback;},__TAURI_INTERNALS__:{invoke:(command,args)=>{if(command==='release_native_viewport_frame'){acks.push(args);return Promise.resolve();}return new Promise((resolve,reject)=>requests.push({args,resolve,reject}));}}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?mapping-bounds');
  const deliver=(index,buffer,id)=>{receive({additionalData:{nativeViewportRequest:requests[index].args.sharedRequest,nativeViewportPooled:true,nativeViewportLease:String(index+1),nativeViewportTransport:{bufferId:id,bytes:buffer.byteLength}},getBuffer:()=>buffer});requests[index].resolve(new ArrayBuffer(0));};
  const frames=[];
  for(let i=0;i<4;i++){const promise=transport.requestNativeViewportFrame('scene',{}),buffer=new ArrayBuffer(8);deliver(i,buffer,i+1);frames.push(await promise);}
  transport.releaseNativeViewportFrame(frames[3]);assert.equal(frames[3].byteLength,0,'fourth mapping is not retained while three are active');assert.ok(frames.slice(0,3).every(b=>b.byteLength===8));
  transport.releaseNativeViewportFrame(frames[1]);const fifth=transport.requestNativeViewportFrame('scene',{}),replacement=new ArrayBuffer(16);deliver(4,replacement,5);await fifth;assert.equal(frames[1].byteLength,0,'only an idle mapping is evicted');
  const expired=transport.requestNativeViewportFrame('scene',{});requests[5].reject(Error('render failed'));await assert.rejects(expired,/render failed/);const late=new ArrayBuffer(8);deliver(5,late,1);assert.equal(late.byteLength,0);assert.equal(frames[0].byteLength,8,'late events cannot replace an active mapping');
  for(const buffer of [frames[0],frames[2],replacement])transport.releaseNativeViewportFrame(buffer);hide();assert.equal(acks.length,6);assert.ok(frames.every(b=>b.byteLength===0));assert.equal(replacement.byteLength,0);
});

test('mapping byte budget, resize and WebView changes retire only completed consumers', async t => {
  const original=globalThis.window,requests=[],receivers=[],releases=[];let hide;
  const makeWebview=()=>{const index=receivers.length;return {addEventListener:(_,callback)=>{receivers[index]=callback;},releaseBuffer:buffer=>{releases.push({index,buffer});structuredClone(buffer,{transfer:[buffer]});}};};
  globalThis.window={chrome:{webview:makeWebview()},addEventListener:(type,callback)=>{if(type==='pagehide')hide=callback;},__TAURI_INTERNALS__:{invoke:(command,args)=>command==='release_native_viewport_frame'?Promise.resolve():new Promise(resolve=>requests.push({args,resolve}))}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?mapping-resize');
  const deliver=(index,buffer,id,receiver=0)=>{receivers[receiver]({additionalData:{nativeViewportRequest:requests[index].args.sharedRequest,nativeViewportPooled:true,nativeViewportLease:String(index+1),nativeViewportTransport:{bufferId:id,bytes:buffer.byteLength}},getBuffer:()=>buffer});requests[index].resolve(new ArrayBuffer(0));};
  const first=transport.requestNativeViewportFrame('game',{}),a=new ArrayBuffer(8);deliver(0,a,1);await first;transport.releaseNativeViewportFrame(a);
  const resized=transport.requestNativeViewportFrame('game',{}),b=new ArrayBuffer(16);deliver(1,b,1);assert.equal(await resized,b);assert.equal(a.byteLength,0);transport.releaseNativeViewportFrame(b);
  const large=transport.requestNativeViewportFrame('game',{}),c=new ArrayBuffer(64*1024*1024);deliver(2,c,2);await large;
  const overflow=transport.requestNativeViewportFrame('game',{}),d=new ArrayBuffer(40*1024*1024);deliver(3,d,3);await overflow;transport.releaseNativeViewportFrame(d);assert.equal(d.byteLength,0,'96 MiB cap holds with an active 64 MiB mapping');
  globalThis.window.chrome.webview=makeWebview();const newWindow=transport.requestNativeViewportFrame('game',{}),e=new ArrayBuffer(8);assert.equal(b.byteLength,0);assert.ok(c.byteLength>0);deliver(4,e,2,1);assert.equal(await newWindow,e);transport.releaseNativeViewportFrame(c);assert.equal(c.byteLength,0);transport.releaseNativeViewportFrame(e);hide();assert.equal(e.byteLength,0);
});



test('mapping failures preserve delivery and fallback or pagehide prevents late retention', async t => {
  const original=globalThis.window,requests=[],acks=[],warnings=[];let receive,hide,failRelease=false;
  t.mock.method(console,'warn',(...args)=>warnings.push(args));
  globalThis.window={chrome:{webview:{addEventListener:(_,callback)=>{receive=callback;},releaseBuffer:buffer=>{if(failRelease){failRelease=false;throw Error('release failed');}structuredClone(buffer,{transfer:[buffer]});}}},addEventListener:(type,callback)=>{if(type==='pagehide')hide=callback;},__TAURI_INTERNALS__:{invoke:(command,args)=>{if(command==='release_native_viewport_frame'){acks.push(args);return Promise.resolve();}return new Promise(resolve=>requests.push({args,resolve}));}}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?mapping-failures');
  const deliver=(index,buffer,id=1)=>receive({additionalData:{nativeViewportRequest:requests[index].args.sharedRequest,nativeViewportPooled:true,nativeViewportLease:String(index+1),nativeViewportTransport:{bufferId:id,bytes:buffer.byteLength}},getBuffer:()=>buffer});
  const first=transport.requestNativeViewportFrame('game',{}),a=new ArrayBuffer(8);deliver(0,a);await first;requests[0].resolve(new ArrayBuffer(0));transport.releaseNativeViewportFrame(a);
  const second=transport.requestNativeViewportFrame('game',{}),b=new ArrayBuffer(8);failRelease=true;deliver(1,b);assert.equal(await second,b,'failed reuse falls back to incoming frame');requests[1].resolve(new ArrayBuffer(0));transport.releaseNativeViewportFrame(b);assert.equal(b.byteLength,0);assert.equal(warnings.length,1);assert.equal(acks.length,2);
  const pending=transport.requestNativeViewportFrame('scene',{});hide();assert.equal(a.byteLength,0);const late=new ArrayBuffer(8);deliver(2,late);await pending;requests[2].resolve(new ArrayBuffer(0));transport.releaseNativeViewportFrame(late);assert.equal(late.byteLength,0,'pagehide prevents in-flight events repopulating the cache');
  assert.equal(acks.length,3);
});

test('binary fallback clears retained mappings and later shared consumers still acknowledge', async t => {
  const original=globalThis.window,requests=[],acks=[];let receive;
  globalThis.window={chrome:{webview:{addEventListener:(_,callback)=>{receive=callback;},releaseBuffer:buffer=>structuredClone(buffer,{transfer:[buffer]})}},__TAURI_INTERNALS__:{invoke:(command,args)=>{if(command==='release_native_viewport_frame'){acks.push(args);return Promise.resolve();}return new Promise(resolve=>requests.push({args,resolve}));}}};
  t.after(()=>{globalThis.window=original;});
  const transport=await import('../src/nativeViewportTransport.ts?mapping-fallback');
  const deliver=(index,buffer)=>receive({additionalData:{nativeViewportRequest:requests[index].args.sharedRequest,nativeViewportPooled:true,nativeViewportLease:String(index+1),nativeViewportTransport:{bufferId:index+1,bytes:buffer.byteLength}},getBuffer:()=>buffer});
  const first=transport.requestNativeViewportFrame('game',{}),a=new ArrayBuffer(8);deliver(0,a);await first;requests[0].resolve(new ArrayBuffer(0));transport.releaseNativeViewportFrame(a);
  const pending=transport.requestNativeViewportFrame('scene',{}),fallback=transport.requestNativeViewportFrame('game',{}),binary=new ArrayBuffer(12);requests[2].resolve(binary);assert.equal(await fallback,binary);assert.equal(a.byteLength,0);
  const b=new ArrayBuffer(8);deliver(1,b);await pending;requests[1].resolve(new ArrayBuffer(0));transport.releaseNativeViewportFrame(b);assert.equal(b.byteLength,0);assert.equal(acks.length,2);
});
