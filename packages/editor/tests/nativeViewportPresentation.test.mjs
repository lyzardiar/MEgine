// Author: MiYu. Displayed-frame reuse must preserve revision ownership and current camera preview settings.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from '../node_modules/typescript/lib/typescript.js';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createNativeViewportPresentationReader, nativeGamePaintUnchanged } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const { createNativeViewportWorldArgs } = await server.ssrLoadModule('/src/nativeViewportFrame.ts');
const { timelineGameCamera } = await server.ssrLoadModule('/src/gameCamera.ts');
const { layoutUiScene3D, layoutUiWorldSpace, sceneUiEntities } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(() => server.close());

test('unchanged native Game pixels remain on their owned canvas while new images, interaction and browser content repaint', () => {
  const image = {}, frame = { image }, surface = {};
  const state = { frame, surface, key: '1280x720@1/display0/hover0', epoch: 1, browserRendering: false };
  assert.equal(nativeGamePaintUnchanged(null,state),false);
  for (let i=0;i<100;i++) assert.equal(nativeGamePaintUnchanged(state,{...state}),true,'repeated wakeups reuse displayed pixels');
  for (const changed of [{frame:{image}},{surface:{}},{key:'1280x720@2/display0/hover0'},{key:'1280x720@1/display1/hover0'},{key:'1280x720@1/display0/hover1'},{epoch:2},{frame:null},{browserRendering:true}]) assert.equal(nativeGamePaintUnchanged(state,{...state,...changed}),false,'new display state must repaint');
  assert.equal(nativeGamePaintUnchanged({...state,browserRendering:true},state),false,'leaving browser overlays paints the native base first');
  const read = createNativeViewportPresentationReader();
  for (const component of ['SpineSkeleton','Button','Toggle','Slider','Scrollbar','InputField','Dropdown','ListView','ScrollView','TabView']) {
    const world = { entities:[{entity:1,active:true,components:{[component]:{}}}],clearColor:[0,0,0,1],simulationTime:0,sourceEntities:[] };
    assert.equal(nativeGamePaintUnchanged(state,{...state,browserRendering:read(world).requiresBrowserSnapshot}),false,component+' keeps browser drawing live');
  }
});

test('Game to Scene to Game on the same canvas invalidates both retained presentations', () => {
  const source = readFileSync(new URL('../src/panels/Viewport.tsx',import.meta.url),'utf8'),ast = ts.createSourceFile('Viewport.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  let expression;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast)==='scenePaintInputs') expression=node.initializer.getText(ast); ts.forEachChild(node,visit); }
  visit(ast); assert.ok(expression);
  const read = new Function('props','return '+expression),props = {tab:'game',playing:true,entities:[]};
  let inputs=read(props),epoch=1;
  const frame={},surface={},before={frame,surface,key:'same viewport',epoch,browserRendering:false};
  for (const tab of ['scene','game']) { props.tab=tab;const next=read(props);if(next.some((value,index)=>value!==inputs[index]))epoch++;inputs=next; }
  assert.equal(epoch,3,'each tab transition invalidates canvas ownership');
  assert.equal(nativeGamePaintUnchanged(before,{...before,epoch}),false,'the retained Game image replaces Scene pixels even at the same native revision');
});
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

test('displayed Scene transforms resolve once per immutable frame and preserve parent edits, mirrored scale and missing parents', () => {
  const live = props(), angle = Math.PI / 4;
  live.entities[0].components.Transform = { position: [10, 5, 0], rotation: [0, 0, Math.sin(angle), Math.cos(angle)], scale: [-2, 3, 1] };
  live.entities[1].components.Transform = { position: [1, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 2, 1] };
  const reader = createNativeViewportPresentationReader(), firstWorld = createNativeViewportWorldArgs(live).frameWorld(), first = reader(firstWorld), transforms = first.worldTransforms(), child = transforms.get(2).transform;
  assert.ok(Math.abs(child.position[0] - 4) < 1e-10); assert.ok(Math.abs(child.position[1] - 3) < 1e-10); assert.deepEqual(child.scale, [-2, 6, 1]);
  for (let i = 0; i < 200; i++) assert.equal(reader(firstWorld).worldTransforms(), transforms);
  live.entities[0].components.Transform.position[0] += 7;
  const next = reader(createNativeViewportWorldArgs(live).frameWorld());
  assert.notEqual(next.worldTransforms(), transforms); assert.ok(Math.abs(next.worldTransforms().get(2).transform.position[0] - 11) < 1e-10);
  assert.ok(Math.abs(transforms.get(2).transform.position[0] - 4) < 1e-10, 'the old completed frame retains its original pose');
  live.entities[0].active = false;
  assert.equal(reader(createNativeViewportWorldArgs(live).frameWorld()).worldTransforms().get(2).active, false);
  live.entities.splice(0, 1);
  assert.equal(reader(createNativeViewportWorldArgs(live).frameWorld()).worldTransforms().get(2).active, false);
  assert.ok(Math.abs(reader(firstWorld).worldTransforms().get(2).transform.position[0] - 4) < 1e-10);
});


test('camera-only native frames share derived data while newer records restore their own hierarchy and poses', async () => {
  const { retainPlayWorld } = await server.ssrLoadModule('/src/playWorldSync.ts');
  const live = props(), owned = retainPlayWorld({ ...live, frame: 0, simFrame: 0, selected: null });
  const reference = { ...owned, sessionId: 9, revision: 1 };
  const frame = () => createNativeViewportWorldArgs({ ...live, nativeWorldReference: reference, runtimeSessionId: 9 }).frameWorld();
  const read = createNativeViewportPresentationReader(), firstWorld = frame(), first = read(firstWorld), transforms = first.worldTransforms();
  const camera = first.gameCamera(null, 0), nextWorld = frame();
  assert.notEqual(nextWorld, firstWorld); assert.equal(nextWorld.entities, firstWorld.entities);
  assert.equal(read(nextWorld).worldTransforms(), transforms); assert.equal(read(nextWorld).gameCamera(null, 0), camera);
  assert.equal(read(nextWorld).sceneUiEntities(), first.sceneUiEntities());
  assert.equal(read(nextWorld).active(3), true); assert.equal(read(nextWorld).requiresBrowserSnapshot, true);
  live.entities[0].active = false; live.entities[1].components.Transform.position[0] = 14;
  const newer = retainPlayWorld({ ...live, frame: 1, simFrame: 1, selected: null });
  const changed = createNativeViewportWorldArgs({ ...live, nativeWorldReference: { ...newer, sessionId: 9, revision: 2 }, runtimeSessionId: 9 }).frameWorld();
  assert.notEqual(read(changed).worldTransforms(), transforms); assert.equal(read(changed).active(3), false);
  assert.equal(read(changed).gameCamera(null, 0), null); assert.equal(read(changed).worldTransforms().get(2).transform.position[0], 14);
  assert.equal(read(firstWorld).active(3), true); assert.equal(read(firstWorld).gameCamera(null, 0).eye[0], 0);
});

test('owned Scene UI membership preserves full layout and projection while new revisions observe Canvas, hierarchy and camera edits', () => {
  const rect = { anchor_min: [0, 0], anchor_max: [0, 0], pivot: [.5, .5], anchored_position: [40, 40], size_delta: [80, 30] };
  const camera = { eye: [0, 2, 8], target: [0, 0, 0], fovYDeg: 60 }, viewport = { x: 13, y: 19, w: 800, h: 600 }, size = { w: 800, h: 600 };
  const live = { entities: [
    { entity: 1, components: { Transform: transform(2) } },
    { entity: 2, parent: 1, components: { Canvas: { render_mode: 'ScreenSpaceOverlay' }, RectTransform: rect } },
    { entity: 3, parent: 2, components: { Image: { sprite: 'white' } } },
    { entity: 4, parent: 3, components: { RectTransform: rect, Text: { text: 'owned revision' } } },
    { entity: 5, parent: 1, components: { Canvas: { render_mode: 'WorldSpace' }, RectTransform: rect, Transform: { ...transform(0), scale: [.01, .01, .01] } } },
    { entity: 6, parent: 5, components: { RectTransform: rect, Image: { color: [1, 0, 0, 1] } } },
    { entity: 7, components: { Canvas: { render_mode: 'ScreenSpaceCamera', render_camera: '4294967297', plane_distance: 3 }, RectTransform: rect } },
    { entity: 8, parent: 7, components: { RectTransform: rect, Image: { sprite: 'white' } } },
    { entity: 9, components: { Transform: { ...transform(0), position: [0, 2, 8] } } },
    { entity: 4294967297, parent: 9, components: { Camera3D: { primary: true } } },
    { entity: 10, components: { Camera2D: {} } },
    { entity: 11, parent: 1, components: { RectTransform: rect, Image: { sprite: 'white' } } },
    ...Array.from({ length: 20000 }, (_, i) => ({ entity: 1000 + i, components: { Transform: transform(i), MeshRenderer: { mesh: 'cube' } } })),
  ], clearColor: [0, 0, 0, 1], simulationTime: 0 };
  const read = createNativeViewportPresentationReader(), world = createNativeViewportWorldArgs(live).frameWorld(), first = read(world), subset = first.sceneUiEntities();
  assert.equal(subset.length, 11); assert.deepEqual(subset, sceneUiEntities(world.entities)); assert.equal(subset[0], world.entities[0]);
  for (let i = 0; i < 100; i++) assert.equal(read(world).sceneUiEntities(), subset);
  const verifyLayout = frame => {
    const ui = read(frame).sceneUiEntities();
    for (const selected of [new Set(), new Set([4, 6, 8])]) {
      assert.deepEqual(layoutUiScene3D(ui, camera, viewport, selected, size), layoutUiScene3D(frame.entities, camera, viewport, selected, size));
      assert.deepEqual(layoutUiWorldSpace(ui, camera, viewport, selected), layoutUiWorldSpace(frame.entities, camera, viewport, selected));
    }
  };
  verifyLayout(world);
  live.entities[0].active = false; live.entities[3].parent = 5; live.entities[9].components.Camera3D = { primary: true, orthographic: true, orthographic_size: 6 };
  delete live.entities[1].components.Canvas; live.entities[11].components.Canvas = { render_mode: 'ScreenSpaceOverlay' };
  const next = createNativeViewportWorldArgs(live).frameWorld();
  assert.notEqual(read(next).sceneUiEntities(), subset); assert.ok(read(next).sceneUiEntities().some(entity => entity.entity === 11));
  verifyLayout(next); assert.equal(read(world).sceneUiEntities().some(entity => entity.entity === 11), false); verifyLayout(world);
});

test('native delta revisions share static resolved nodes and invalidate retained children when their parent changes', async () => {
  const { retainPlayWorld } = await server.ssrLoadModule('/src/playWorldSync.ts');
  const { createPlayWorldUpdater } = await server.ssrLoadModule('/src/playRuntime.ts');
  const { buildWorldTransforms } = await server.ssrLoadModule('/src/worldTransform.ts');
  const initial = { ...props(), frame: 0, simFrame: 0, selected: null }, update = createPlayWorldUpdater(), read = createNativeViewportPresentationReader();
  let owned = retainPlayWorld(initial);
  const worlds = [], results = [];
  const present = revision => {
    const world = createNativeViewportWorldArgs({ ...initial, nativeWorldReference: { ...owned, sessionId: 19, revision }, runtimeSessionId: 19 }).frameWorld();
    const result = read(world).worldTransforms(); assert.deepEqual([...result], [...buildWorldTransforms(world.entities)]);
    worlds.push(world); results.push(result);
  };
  const advance = (revision, entities) => {
    const previous = owned, snapshot = { frame: revision, sim_frame: revision, selected: null, clear_color: initial.clearColor, entities };
    owned = retainPlayWorld(update(previous, revision - 1, { snapshot, baseRevision: revision - 1, revision, reset: false }), previous);
  };
  present(0); advance(1, []); present(1);
  assert.notEqual(worlds[0].entities, worlds[1].entities); assert.equal(worlds[0].entities[1], worlds[1].entities[1]);
  for (const id of [1, 2, 3, 4]) assert.equal(results[0].get(id), results[1].get(id));
  advance(2, [{ entity: 1, active: false, components: { Transform: transform(12) } }]); present(2);
  assert.equal(worlds[1].entities[1], worlds[2].entities[1]); assert.notEqual(results[1].get(2), results[2].get(2));
  assert.equal(results[2].get(2).active, false); assert.equal(results[2].get(2).transform.position[0], 12);
  assert.equal(results[1].get(4), results[2].get(4));
  assert.deepEqual([...read(worlds[0]).worldTransforms()], [...results[0]]);
});
