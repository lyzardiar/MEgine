// Author: MiYu. Exercise production Play Scene Canvas preparation and its retained UI ownership.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createNativeViewportPresentationReader } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const { retainPlayWorld, retainPlayWorldPatch } = await server.ssrLoadModule('/src/playWorldSync.ts');
const { layoutUiOverlay, layoutUiScene3D, layoutUiWorldSpace } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(() => server.close());
const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8');
const start = source.indexOf('let overlayLayout: SceneUiOverlayLayout | undefined;');
const end = source.indexOf('        uiItemsRef.current = uiItems;', start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start, end).replace(/\s*}\s*$/, '');
const prepare = new Function('uiSource', 'cam', 'vp', 'selSet', 'sceneCanvasSize', 'now', 'sceneOverlayLayoutRef', 'layoutUiOverlay', 'layoutUiScene3D', 'layoutUiWorldSpace', 'nativeScene3D', 'editScene', 'textMeasurement', ts.transpileModule('let sceneSurface, uiItems, layoutScale;\n' + body + '\nreturn { sceneSurface, uiItems, layoutScale };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
const camera = { eye: [0, 0, 1500], target: [0, 0, 0], up: [0, 1, 0], fovYDeg: 60 };
const viewport = { x: 0, y: 0, w: 800, h: 600 }, size = { w: 1280, h: 720 };
const rect = { anchor_min: [.5, .5], anchor_max: [.5, .5], pivot: [.5, .5], anchored_position: [0, 0], size_delta: [200, 80] };
const initial = () => retainPlayWorld({ clearColor: [0, 0, 0, 1], simulationTime: 0, entities: [
  { entity: 1, components: { Canvas: { render_mode: 'ScreenSpaceOverlay' }, RectTransform: rect } },
  { entity: 2, parent: 1, components: { RectTransform: rect, Text: { text: 'session', font_size: 20 } } },
  { entity: 3, components: { Transform: { position: [0, 0, 0] }, MeshRenderer: { mesh: 'cube' } } },
] });
function fixture() {
  const ref = { current: null }; let layouts = 0;
  return { ref, get layouts() { return layouts; }, draw(ui, { cam = camera, vp = viewport, selected = new Set(), canvasSize = size, now = 0, native = true, edit = false } = {}) {
    const actual = prepare(ui, cam, vp, selected, canvasSize, now, ref, (...args) => { layouts++; return layoutUiOverlay(...args); }, layoutUiScene3D, layoutUiWorldSpace, native, edit);
    const full = layoutUiScene3D(ui, cam, vp, selected, canvasSize);
    assert.deepEqual(actual.uiItems, [...layoutUiWorldSpace(ui, cam, vp, selected), ...full.items]);
    assert.equal(actual.layoutScale, full.layoutScale);
    assert.deepEqual(actual.sceneSurface, native ? full.surface : undefined);
    return actual;
  } };
}

test('Play Scene retains overlay preparation across unrelated frames and reprojects camera and viewport immediately', () => {
  const f = fixture(), read = createNativeViewportPresentationReader(); let world = initial();
  const ui = () => read({ ...world, sourceEntities: world.entities }).sceneUiEntities();
  const firstUi = ui(), first = f.draw(firstUi); assert.ok(first.sceneSurface, 'running native Scene uses the complete Canvas surface');
  for (let i = 1; i <= 40; i++) {
    world = retainPlayWorldPatch(world, { ...world, simulationTime: i / 60, entities: [{ entity: 3, components: { Transform: { position: [i, 0, 0] }, MeshRenderer: { mesh: 'cube' } } }] });
    assert.equal(ui(), firstUi); f.draw(ui(), { now: i });
  }
  assert.equal(f.layouts, 1);
  const rotated = f.draw(ui(), { now: 41, cam: { ...camera, eye: [700, 300, 1200] } });
  assert.notDeepEqual(rotated.sceneSurface.corners, first.sceneSurface.corners);
  const resized = f.draw(ui(), { now: 42, vp: { ...viewport, w: 1100, h: 500 } });
  assert.notDeepEqual(resized.sceneSurface.corners, first.sceneSurface.corners);
  assert.equal(f.layouts, 1, 'logical overlay can survive camera and physical viewport changes');
});

test('Play Scene invalidates UI, selection, resolution, resource refresh and mode transitions', () => {
  const f = fixture(); let ui = initial().entities.slice(0, 2);
  f.draw(ui); f.draw(ui, { now: 10, edit: true }); assert.equal(f.layouts, 1);
  ui = ui.map(e => e.entity === 2 ? { ...e, components: { ...e.components, Text: { text: 'updated', font_size: 28 } } } : e);
  const changed = f.draw(ui, { now: 20 }); assert.equal(f.layouts, 2);
  assert.equal(changed.sceneSurface.items.find(i => i.entity === 2).text.text, 'updated');
  const selected = new Set([2]); const selectedFrame = f.draw(ui, { selected, now: 30 }); assert.equal(f.layouts, 3);
  assert.equal(selectedFrame.uiItems.find(i => i.entity === 2).selected, true);
  assert.ok(selectedFrame.sceneSurface.items.every(i => !i.selected));
  const canvasSize = { w: 1920, h: 1080 };
  f.draw(ui, { selected, canvasSize, now: 40 }); assert.equal(f.layouts, 4);
  f.draw(ui, { selected, canvasSize, now: 289 }); assert.equal(f.layouts, 4);
  f.draw(ui, { selected, canvasSize, now: 290 }); assert.equal(f.layouts, 5);
  f.ref.current = null; f.draw(ui, { selected, canvasSize, now: 300 }); assert.equal(f.layouts, 6);
  f.draw(ui, { now: 310, native: false }); assert.equal(f.ref.current, null);
  assert.ok(f.draw(ui, { now: 320 }).sceneSurface); assert.equal(f.layouts, 7);
});

test('Play Scene preserves individual renderer fallback for custom graphics, masks and Canvas modes', () => {
  const base = initial().entities.slice(0, 2);
  const cases = [
    base.map(e => e.entity === 2 ? { ...e, components: { ...e.components, SpineSkeleton: {} } } : e),
    base.map(e => e.entity === 2 ? { ...e, components: { ...e.components, EffekseerEffect: {} } } : e),
    base.map(e => e.entity === 2 ? { ...e, components: { ...e.components, Dropdown: { expanded: true, options: ['A', 'B'] } } } : e),
    base.map(e => e.entity === 1 ? { ...e, components: { ...e.components, Image: { sprite: 'white' }, Mask: {} } } : e),
    base.map(e => e.entity === 1 ? { ...e, components: { ...e.components, Canvas: { render_mode: 'WorldSpace' } } } : e),
    base.map(e => e.entity === 1 ? { ...e, components: { ...e.components, Canvas: { render_mode: 'ScreenSpaceCamera' } } } : e),
    [...base, { entity: 4, components: { Canvas: { render_mode: 'ScreenSpaceOverlay' }, RectTransform: rect } }],
  ];
  for (const ui of cases) {
    const f = fixture(); assert.ok(f.draw(base).sceneSurface);
    assert.equal(f.draw(ui, { now: 10 }).sceneSurface, undefined);
    assert.ok(f.draw(base, { now: 20 }).sceneSurface, 'eligible content recovers after a fallback');
  }
});

test('cached Scene hit items retain the disabled SpriteSwap alpha source without individual painting', () => {
  const ui = initial().entities.slice(0, 2);
  ui[1] = { ...ui[1], components: { RectTransform: rect, Image: { sprite: 'normal', alpha_hit_test_minimum_threshold: .5 }, Button: { transition: 'SpriteSwap', interactable: false, disabled_sprite: 'disabled' } } };
  const f = fixture(), disabled = f.draw(ui);
  assert.equal(disabled.uiItems.find(i => i.entity === 2).image.alphaHitTestSprite, 'disabled');
  ui[1] = { ...ui[1], components: { ...ui[1].components, Button: { ...ui[1].components.Button, interactable: true } } };
  const enabled = f.draw([...ui], { now: 10 });
  assert.equal(enabled.uiItems.find(i => i.entity === 2).image.alphaHitTestSprite, 'normal');
});
