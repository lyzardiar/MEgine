// Author: MiYu. Keep owned frame feature scans lazy and preserve legacy Game overlay eligibility.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createNativeViewportPresentationReader } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const { requiresBrowserViewportSnapshot } = await server.ssrLoadModule('/src/nativeViewportFrame.ts');
test.after(() => server.close());
const transform = { position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] };
const world = entities => ({ entities, sourceEntities: entities, clearColor: [0, 0, 0, 1], simulationTime: 0 });

test('Scene preparation does not read unused browser-control flags and false results cache once', () => {
  let spineReads = 0, buttonReads = 0;
  const entities = Array.from({ length: 3000 }, (_, i) => ({ entity: i + 1, components: { MeshRenderer: {}, get SpineSkeleton() { spineReads++; return undefined; }, get Button() { buttonReads++; return undefined; }, get Transform() { throw Error('ordinary native mesh transforms must remain unrequested'); } } }));
  const p = createNativeViewportPresentationReader()(world(entities));
  assert.equal(spineReads, 0); assert.equal(buttonReads, 0, 'creating an owned presentation must not certify unused Game overlay flags');
  p.sceneBrowserFrame(new Set(), null, true); p.sceneOverlayEntries(); assert.equal(buttonReads, 0, 'Scene helper preparation needs no browser-control eligibility scan');
  const before = spineReads; assert.equal(p.hasSpine, false); assert.equal(spineReads, before + entities.length);
  assert.equal(p.hasSpine, false); assert.equal(spineReads, before + entities.length);
  const count = spineReads, entries = p.worldEntries(true); assert.deepEqual(entries, []); assert.equal(p.worldEntries(true), entries); assert.equal(spineReads, count, 'native Game skips the Spine collection pass after a cached negative flag');
  assert.equal(p.requiresBrowserSnapshot, false); assert.equal(buttonReads, entities.length);
  assert.equal(p.requiresBrowserSnapshot, false); assert.equal(buttonReads, entities.length);
});

test('lazy flags preserve each legacy interactive component and local activity semantics', () => {
  for (const key of ['SpineSkeleton', 'Button', 'Toggle', 'Slider', 'Scrollbar', 'InputField', 'Dropdown', 'ListView', 'ScrollView', 'TabView']) for (const active of [undefined, true, false]) {
    const frame = world([{ entity: 1, active: false, components: {} }, { entity: 2, parent: 1, active, components: { [key]: {} } }]);
    const p = createNativeViewportPresentationReader()(frame);
    assert.equal(p.requiresBrowserSnapshot, requiresBrowserViewportSnapshot(frame.entities), key + ' local activity');
    assert.equal(p.hasSpine, key === 'SpineSkeleton');
    assert.equal(p.requiresBrowserSnapshot, active !== false, 'parent activity does not change the existing feature-scan contract');
  }
});

test('new frame records invalidate flags while old frame and camera-only publications retain their own values', () => {
  const read = createNativeViewportPresentationReader(), firstWorld = world([{ entity: 1, components: { Transform: transform } }]), first = read(firstWorld);
  assert.equal(first.hasSpine, false); assert.equal(first.requiresBrowserSnapshot, false);
  assert.equal(read({ ...firstWorld, simulationTime: 1 }), first);
  const next = read(world([{ entity: 1, components: { Transform: transform, SpineSkeleton: {}, Button: {} } }]));
  assert.equal(next.hasSpine, true); assert.equal(next.requiresBrowserSnapshot, true);
  const inactive = read(world([{ entity: 1, active: false, components: { Transform: transform, SpineSkeleton: {} } }]));
  assert.equal(inactive.hasSpine, true); assert.equal(inactive.requiresBrowserSnapshot, false); assert.deepEqual(inactive.worldEntries(true), []);
  assert.equal(first.hasSpine, false); assert.equal(first.requiresBrowserSnapshot, false); assert.equal(next.requiresBrowserSnapshot, true);
  assert.equal(read(firstWorld).hasSpine, false);
});

test('positive Spine collection retains active records, full parent transforms and per-frame array reuse', () => {
  const frame = world([{ entity: 1, components: { Transform: { ...transform, position: [5, 0, 0] } } }, { entity: 2, parent: 1, components: { Transform: { ...transform, position: [2, 0, 0] }, SpineSkeleton: {} } }, { entity: 3, active: false, components: { Transform: transform, SpineSkeleton: {} } }]);
  const p = createNativeViewportPresentationReader()(frame), entries = p.worldEntries(true);
  assert.deepEqual(entries.map(e => e.e.entity), [2]); assert.equal(entries[0].t.position[0], 7); assert.equal(p.worldEntries(true), entries);
  assert.equal(p.hasSpine, true); assert.equal(p.requiresBrowserSnapshot, true); assert.equal(entries[0].e, frame.entities[1]);
});

test('explicit presentation enumeration exposes the same boolean fields and keeps lazy results stable', () => {
  let reads = 0; const p = createNativeViewportPresentationReader()(world([{ entity: 1, components: { get Button() { reads++; return {}; } } }]));
  assert.equal(reads, 0); const copy = { ...p }; assert.equal(copy.hasSpine, false); assert.equal(copy.requiresBrowserSnapshot, true); assert.equal(reads, 1);
  assert.equal(p.requiresBrowserSnapshot, true); assert.equal(reads, 1); assert.ok(Object.keys(p).includes('hasSpine')); assert.ok(Object.keys(p).includes('requiresBrowserSnapshot'));
});
