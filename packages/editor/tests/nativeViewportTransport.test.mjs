import assert from 'node:assert/strict';
import test from 'node:test';

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
  const deliver = (index, buffer) => receive({ additionalData: { nativeViewportRequest: requests[index].args.sharedRequest }, getBuffer: () => buffer });
  const first = transport.requestNativeViewportFrame('game', {}), second = transport.requestNativeViewportFrame('scene', {});
  const a = new ArrayBuffer(8), b = new ArrayBuffer(16);
  deliver(1, b); deliver(0, a);
  assert.equal(await first, a); assert.equal(await second, b);
  assert.equal(transport.isSharedNativeViewportFrame(a), true);
  transport.releaseNativeViewportFrame(a); transport.releaseNativeViewportFrame(a); transport.releaseNativeViewportFrame(b);
  assert.deepEqual(released, [a, b]);
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
