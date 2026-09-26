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
