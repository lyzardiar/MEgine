// Author: MiYu. Exercise owned request order, invalidation, backpressure and fresh capture barriers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { beginNativeViewportRequest, captureLatestNativeViewportFrames, createNativeViewportRequestState, finishNativeViewportRequest, nativeViewportReadbackBusy, nativeViewportSessionExpired, nativeViewportRequestCanPublish, retryNativeViewportReadback, synchronizeNativeViewportRequestOwner } from '../src/nativeViewportRequests.ts';

function deferredRequest(state, key, publish = true) {
  const ticket = beginNativeViewportRequest(state, key);
  assert.ok(ticket);
  let finish;
  ticket.ready = new Promise(resolve => { finish = () => {
    if (publish && nativeViewportRequestCanPublish(state, ticket)) state.presentedSequence = ticket.sequence;
    finishNativeViewportRequest(state, ticket); resolve();
  }; });
  return { ticket, finish };
}

test('only an accepted request advances the pacing timestamp', () => {
  const state = createNativeViewportRequestState();
  const first = beginNativeViewportRequest(state, 'revision:1', 100); assert.ok(first);
  assert.equal(beginNativeViewportRequest(state, 'revision:1', 120), null); assert.equal(state.lastRequestAt, 100);
  assert.ok(beginNativeViewportRequest(state, 'revision:2', 121));
  assert.equal(beginNativeViewportRequest(state, 'revision:3', 140), null); assert.equal(state.lastRequestAt, 121);
  finishNativeViewportRequest(state, first); assert.ok(beginNativeViewportRequest(state, 'revision:3', 141)); assert.equal(state.lastRequestAt, 141);
});

test('two requests retain independent slots, deduplicate revisions and publish monotonically', async () => {
  const state = createNativeViewportRequestState();
  const first = deferredRequest(state, 'session:7:revision:1');
  assert.equal(beginNativeViewportRequest(state, first.ticket.key), null);
  const second = deferredRequest(state, 'session:7:revision:2');
  assert.equal(state.pending.size, 2); assert.equal(state.full, true);
  assert.equal(beginNativeViewportRequest(state, 'session:7:revision:3'), null);
  assert.equal(nativeViewportRequestCanPublish(state, first.ticket), true, 'new submission does not invalidate an earlier frame');
  second.finish(); await second.ticket.ready;
  assert.equal(state.presentedSequence, 2); assert.equal(state.inFlight, true);
  assert.equal(nativeViewportRequestCanPublish(state, first.ticket), false);
  first.finish(); await first.ticket.ready;
  assert.equal(state.presentedSequence, 2); assert.equal(state.pending.size, 0);
});

test('project, edit, session, camera and resize invalidation retain outstanding slots until their own completion', async () => {
  const changes = [
    ['project:2/session:7/camera:A/640x480', 7],
    ['project:1/session:8/camera:A/640x480', 8],
    ['project:1/session:7/camera:B/640x480', 7],
    ['project:1/session:7/camera:A/800x600', 7],
    ['project:1/edit/camera:A/640x480', []],
  ];
  for (const [key, owner] of changes) {
    const state = createNativeViewportRequestState();
    synchronizeNativeViewportRequestOwner(state, 7, 'project:1/session:7/camera:A/640x480');
    const first = deferredRequest(state, 'owned');
    synchronizeNativeViewportRequestOwner(state, owner, key);
    assert.equal(nativeViewportRequestCanPublish(state, first.ticket), false);
    assert.equal(state.pending.size, 1);
    const second = deferredRequest(state, 'new');
    first.finish(); await first.ticket.ready;
    assert.equal(state.pending.size, 1, 'old completion cannot clear the new request');
    second.finish(); await second.ticket.ready;
    assert.equal(state.presentedSequence, second.ticket.sequence);
  }
  const state = createNativeViewportRequestState();
  synchronizeNativeViewportRequestOwner(state, 7, 'same camera');
  const ticket = beginNativeViewportRequest(state, 'revision1');
  synchronizeNativeViewportRequestOwner(state, 7, 'same camera');
  assert.equal(nativeViewportRequestCanPublish(state, ticket), true, 'runtime revision progression keeps its owned camera/world valid');
});

test('capture waits for every old request and a newly submitted frame, including busy retry', async () => {
  const state = createNativeViewportRequestState();
  const first = deferredRequest(state, 'old1'), second = deferredRequest(state, 'old2');
  let submissions = 0, result;
  const capture = captureLatestNativeViewportFrames([state], () => {
    submissions++;
    const fresh = deferredRequest(state, `fresh${submissions}`, submissions > 1);
    setTimeout(fresh.finish, 1);
  }, 1000).then(value => { result = value; });
  second.finish(); await second.ticket.ready;
  assert.equal(submissions, 0); assert.equal(result, undefined);
  first.finish(); await capture;
  assert.equal(submissions, 2); assert.equal(result, true);
  assert.equal(state.presentedSequence, 4);
});

test('capture rejects a stale frame when no new request can be submitted and handles timeout', async () => {
  const state = createNativeViewportRequestState();
  state.presentedSequence = state.nextSequence = 5;
  assert.equal(await captureLatestNativeViewportFrames([state], () => {}, 20), false);
  deferredRequest(state, 'stuck');
  assert.equal(await captureLatestNativeViewportFrames([state], () => assert.fail('cannot submit while draining'), 10), false);
});

test('capture cannot accept a result invalidated while awaiting its new request', async () => {
  const state = createNativeViewportRequestState(); let submissions = 0;
  assert.equal(await captureLatestNativeViewportFrames([state], () => {
    const fresh = deferredRequest(state, `fresh${++submissions}`);
    if (submissions === 1) state.generation++;
    setTimeout(fresh.finish, 1);
  }, 500), true);
  assert.equal(submissions, 2); assert.equal(state.presentedSequence, 2);
});

test('only typed readback saturation is transient and preview capacity remains one', async () => {
  const busy = new Error('render frame: offscreen readback busy: all three slots have outstanding tickets');
  assert.equal(nativeViewportReadbackBusy(busy), true);
  assert.equal(nativeViewportReadbackBusy(new Error('GPU unavailable')), false);
  assert.equal(nativeViewportSessionExpired('Viewport session expired'), true);
  assert.equal(nativeViewportSessionExpired(new Error('Play session expired')), true);
  assert.equal(nativeViewportSessionExpired('Play viewport revision expired'), false);
  let calls = 0;
  assert.equal(await retryNativeViewportReadback(async () => { if (++calls < 3) throw busy; return 'owned pixels'; }, 500), 'owned pixels');
  assert.equal(calls, 3);
  await assert.rejects(retryNativeViewportReadback(async () => { throw Error('invalid snapshot'); }, 500), /invalid snapshot/);
  const preview = createNativeViewportRequestState(1);
  assert.ok(beginNativeViewportRequest(preview, 'camera1')); assert.equal(beginNativeViewportRequest(preview, 'camera2'), null);
});

test('viewport publishes and hit tests the owned frame, and rejects stale selection before preview upload', () => {
  const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8');
  for (const marker of ['currentGameRequestKey(current) !== requestKey', 'currentSceneRequestKey(current) !== nativeSceneIdentity?.key', '!== cameraPreviewKey']) {
    const at = source.indexOf(marker); assert.ok(at > 0);
    const upload = source.indexOf('uploadNativeViewportFrame(buffer', at);
    assert.ok(upload > at); assert.match(source.slice(at, upload), /releaseNativeViewportFrame\(buffer\)/);
  }
  assert.match(source, /if \(nativeSceneFrame\) cam = nativeSceneFrame.camera;/);
  assert.match(source, /nativeSceneMeshHitRef.current.beginFrame\(nativeSceneFrame, vp\);/);
  assert.match(source, /const displayedWorld = isGame \? nativeGameFrameRef.current\?\.world : nativeSceneFrame\?\.world;/);
  assert.match(source, /projectAssetSessionGeneration\(\) !== projectGeneration/);
  assert.match(source, /captureLatestNativeViewportFrames\(nativeRequests/);
});
