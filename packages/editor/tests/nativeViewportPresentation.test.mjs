// Author: MiYu. Displayed-frame reuse must preserve revision ownership and current camera preview settings.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createNativeViewportPresentationReader } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const { createNativeViewportWorldArgs } = await server.ssrLoadModule('/src/nativeViewportFrame.ts');
const { timelineGameCamera } = await server.ssrLoadModule('/src/gameCamera.ts');
test.after(() => server.close());
const transform = x => ({ position: [x, 0, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
const props = () => ({ entities: [{ entity: 1, components: { Transform: transform(0) } }, { entity: 2, parent: 1, components: { Camera3D: { primary: true }, Transform: transform(0) } }, { entity: 3, parent: 1, components: { Button: {} } }, { entity: 4, components: { SpineSkeleton: {} } }], clearColor: [0, 0, 0, 1], simulationTime: 0 });

test('only the owned displayed frame is reused; live edits and new frames retain separate activity, camera and UI values', () => {
  const live = props(), read = createNativeViewportPresentationReader(), world = createNativeViewportWorldArgs(live).frameWorld(), first = read(world);
  assert.equal(read(world), first); assert.equal(first.active(3), true); assert.equal(first.hasSpine, true); assert.equal(first.requiresBrowserSnapshot, true);
  const camera = first.gameCamera(null, 0); assert.ok(camera); assert.equal(first.gameCamera(null, 0), camera);
  live.entities[0].active = false; live.entities[1].components.Transform.position[0] = 9;
  delete live.entities[2].components.Button; delete live.entities[3].components.SpineSkeleton;
  assert.equal(read(world), first); assert.equal(first.active(3), true); assert.equal(first.gameCamera(null, 0), camera); assert.equal(camera.eye[0], 0);
  const nextWorld = createNativeViewportWorldArgs(live).frameWorld(), next = read(nextWorld);
  assert.notEqual(next, first); assert.equal(next.active(3), false); assert.equal(next.gameCamera(null, 0), null); assert.equal(next.hasSpine, false); assert.equal(next.requiresBrowserSnapshot, false);
  live.entities[0].active = true;
  const restored = read(createNativeViewportWorldArgs(live).frameWorld()); assert.equal(restored.active(3), true); assert.equal(restored.gameCamera(null, 0).eye[0], 9);
  assert.equal(read(world).gameCamera(null, 0).eye[0], 0, 'returning to an earlier frame restores its own camera');
});

test('in-place Timeline preview edits and display changes invalidate camera selection within one displayed frame', () => {
  const live = props(); live.entities.push({ entity: 5, components: { Camera3D: { primary: true, target_display: 1 }, Transform: transform(20) } }, { entity: 6, components: { Camera3D: {}, Transform: transform(10) } });
  const world = createNativeViewportWorldArgs(live).frameWorld(), read = createNativeViewportPresentationReader(), presentation = read(world), preview = { source: 2, target: 6, weight: .25 };
  for (const weight of [.25, .75, 0, 1, NaN, Infinity, -Infinity, .5]) {
    preview.weight = weight;
    assert.deepEqual(presentation.gameCamera(preview, 0), timelineGameCamera(world.entities, preview, presentation.active, 0));
  }
  assert.deepEqual(presentation.gameCamera(preview, 1), timelineGameCamera(world.entities, preview, presentation.active, 1));
  assert.equal(presentation.gameCamera(null, 1).entity, 5); assert.equal(presentation.gameCamera(null, 0).entity, 2);
});
