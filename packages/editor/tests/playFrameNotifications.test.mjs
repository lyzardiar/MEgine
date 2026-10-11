// Author: MiYu. Verify complete-world notifications independently of React refresh.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('completed worlds notify subscribers and reject unsubscribed or expired generations', async () => {
  const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  const original = globalThis.queueMicrotask, queued = [];
  globalThis.queueMicrotask = callback => queued.push(callback);
  try {
    const {createEditorStore} = await server.ssrLoadModule('/src/store.ts'), store = createEditorStore();
    let world, revision = 0;
    store.setPlayRuntime({sessionId:42, retainsWorld:true, start:async snapshot => { world=structuredClone(snapshot); return {...world,nativeSessionId:42,nativeRevision:revision++}; }, step:async () => ({...world,frame:revision,nativeSessionId:42,nativeRevision:revision++}), stop(){},onError(error){throw error;}});
    const seen = [], listener = () => seen.push(store.nativePlayRevision);
    let unsubscribe = store.subscribePlayFrames(listener);
    const flush = () => { while(queued.length) queued.shift()(); };
    store.play(); await store.waitForPlayRuntime(); assert.deepEqual(seen,[]); flush(); assert.deepEqual(seen,[0]);
    store.pause(); store.step(); await store.waitForPlayRuntime(); flush(); assert.deepEqual(seen,[0,1]);
    const {createNativeViewportWorldArgs,nativeGameFrameMatchesRequest} = await server.ssrLoadModule('/src/nativeViewportFrame.ts');
    const before=store.playRenderSnapshot(), args=createNativeViewportWorldArgs(before).worldArgs();
    const rendered={world:{runtimeSessionId:42},worldRevision:1,requestKey:'same-view'};
    assert.equal(nativeGameFrameMatchesRequest(rendered,args,'same-view'),true);
    store.setComponent(before.entities[0].entity,'Text',{text:'Edited while paused'});
    const changed=createNativeViewportWorldArgs(store.playRenderSnapshot()).worldArgs();
    assert.ok(changed.snapshot,'edited UI must upload a complete owned snapshot');
    assert.equal(nativeGameFrameMatchesRequest(rendered,changed,'same-view'),false);
    store.step(); await store.waitForPlayRuntime(); unsubscribe(); unsubscribe = store.subscribePlayFrames(listener); flush(); assert.deepEqual(seen,[0,1],'resubscribing the same callback must not revive an old notification');
    store.step(); await store.waitForPlayRuntime(); store.stop(); flush(); assert.deepEqual(seen,[0,1]);
    store.play(); await store.waitForPlayRuntime(); store.stop(); store.play(); await store.waitForPlayRuntime(); flush(); assert.deepEqual(seen,[0,1,5],'only the current startup world is notified');
    unsubscribe(); store.stop();
  } finally {globalThis.queueMicrotask=original;await server.close();}
});
