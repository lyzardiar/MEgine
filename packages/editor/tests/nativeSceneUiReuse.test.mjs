// Author: MiYu. Retain owned UI inputs across unrelated native revisions without retaining stale layout or pixels.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createNativeViewportPresentationReader } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const { retainPlayWorld, retainPlayWorldPatch } = await server.ssrLoadModule('/src/playWorldSync.ts');
const { sceneUiEntities, layoutUiScene3D, layoutUiWorldSpace } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(() => server.close());
const transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
const rect = { anchor_min: [0, 0], anchor_max: [0, 0], pivot: [.5, .5], anchored_position: [40, 40], size_delta: [20, 20] };
const initial = () => retainPlayWorld({ clearColor: [0, 0, 0, 1], simulationTime: 0, entities: [
  { entity: 1, components: { Transform: transform } },
  { entity: 2, parent: 1, components: { Canvas: { render_mode: 'ScreenSpaceOverlay' }, RectTransform: rect } },
  { entity: 3, parent: 2, components: { RectTransform: rect, Text: { text: 'old' } } },
  { entity: 4, components: { Transform: transform, MeshRenderer: { mesh: 'cube' } } },
  { entity: 5, components: { Transform: { ...transform, position: [0, 2, 8] }, Camera3D: {} } },
] });
const frame = owned => ({ ...owned, sourceEntities: owned.entities });

test('native delta revisions reuse an unchanged UI subset and keep old frame ownership', () => {
  const read = createNativeViewportPresentationReader(), old = initial(), first = read(frame(old)), ui = first.sceneUiEntities();
  let current = old;
  for (let i = 0; i < 40; i++) {
    current = retainPlayWorldPatch(current, { ...current, simulationTime: i / 60, entities: [{ ...old.entities[3], components: { Transform: { ...transform, position: [i, 0, 0] }, MeshRenderer: { mesh: 'cube' } } }] });
    assert.notEqual(current.entities, old.entities); assert.equal(read(frame(current)).sceneUiEntities(), ui);
    assert.deepEqual(ui, sceneUiEntities(current.entities));
  }
  const next = retainPlayWorldPatch(current, { ...current, entities: [{ ...old.entities[2], components: { RectTransform: rect, Text: { text: 'new' } } }] });
  const nextUi = read(frame(next)).sceneUiEntities(); assert.notEqual(nextUi, ui); assert.equal(nextUi.find(e => e.entity === 3).components.Text.text, 'new');
  assert.equal(first.sceneUiEntities(), ui); assert.equal(ui.find(e => e.entity === 3).components.Text.text, 'old');
  assert.equal(read(frame(next)).sceneUiEntities(), nextUi); assert.equal(read(frame(old)).sceneUiEntities()[2], ui[2]);
});

test('retained parent, camera, hierarchy and root changes invalidate UI identity and preserve full layout', () => {
  const read = createNativeViewportPresentationReader(); let current = initial(), last = read(frame(current)).sceneUiEntities();
  const camera = { eye: [0, 2, 8], target: [0, 0, 0], up: [0, 1, 0], fovYDeg: 60 }, viewport = { x: 0, y: 0, w: 800, h: 600 }, size = { w: 800, h: 600 };
  const check = entities => {
    current = retainPlayWorld({ ...current, entities }); const ui = read(frame(current)).sceneUiEntities();
    assert.notEqual(ui, last); assert.deepEqual(ui, sceneUiEntities(current.entities));
    for (const selected of [new Set(), new Set([3])]) {
      assert.deepEqual(layoutUiScene3D(ui, camera, viewport, selected, size), layoutUiScene3D(current.entities, camera, viewport, selected, size));
      assert.deepEqual(layoutUiWorldSpace(ui, camera, viewport, selected), layoutUiWorldSpace(current.entities, camera, viewport, selected));
    }
    last = ui;
  };
  check(current.entities.map(e => e.entity === 1 ? { ...e, active: false } : e));
  check(current.entities.map(e => e.entity === 5 ? { ...e, components: { ...e.components, Camera3D: { fov_y_degrees: 45 } } } : e));
  check(current.entities.map(e => e.entity === 3 ? { ...e, parent: 4 } : e));
  check(current.entities.map(e => e.entity === 4 ? { ...e, components: { ...e.components, Canvas: { render_mode: 'WorldSpace' }, RectTransform: rect } } : e));
  check([...current.entities].reverse());
  check(current.entities.filter(e => e.entity !== 2));
  const empty = read(frame(retainPlayWorld({ ...current, entities: [] }))).sceneUiEntities(); assert.deepEqual(empty, []);
  assert.equal(read(frame(retainPlayWorld({ ...current, entities: [{ entity: 8, components: {} }] }))).sceneUiEntities(), empty);
});

test('production Scene surface reuses pixels across unrelated worlds and redraws for UI, bounds, refresh and resource invalidation', () => {
  const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const key = JSON.stringify([sceneSurface.bounds,');
  const end = source.indexOf('stats = cached.stats;', start) + 'stats = cached.stats;'.length;
  assert.ok(start >= 0 && end > start);
  const body = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let raster = 0, project = 0, select = 0, labels = 0;
  const draw = new Function('p', 'uiSource', 'sceneSurface', 'now', 'sceneCanvasSurfaceRef', 'document', 'drawUiItems', 'drawSceneCanvasSurface', 'drawSceneUiSelection', 'ctx', 'uiItems', 'let stats;\n' + body + '\nreturn stats;');
  const document = { createElement: () => ({ getContext: () => ({ translate() {} }) }) }, ref = { current: null };
  const ui = [{ entity: 1, role: 'canvas' }, { entity: 2, role: 'graphic', text: { text: 'old' } }], uiSource = [{ entity: 1, components: {} }];
  const surface = { bounds: { x: 0, y: 0, w: 800, h: 600 }, items: ui };
  const paint = (p, source, s, now) => draw(p, source, s, now, ref, document, (_ctx, items, _a, _b, options) => { if (options?.sceneLabel) labels++; else { raster++; assert.ok(items.every(item => item.role !== 'canvas')); } return { primitives: items.length, batches: 1 }; }, () => project++, () => select++, {}, ui);
  const stats = paint({ entities: [] }, uiSource, surface, 0);
  assert.equal(paint({ entities: [{}] }, uiSource, surface, 100), stats); assert.equal(raster, 1);
  assert.equal(project, 2); assert.equal(select, 2); assert.equal(labels, 2, 'projection, selection and labels still draw every frame');
  paint({}, [...uiSource], surface, 110); assert.equal(raster, 2);
  paint({}, ref.current.source, { ...surface, bounds: { ...surface.bounds, w: 640 } }, 120); assert.equal(raster, 3);
  paint({}, ref.current.source, { ...surface, bounds: { ...surface.bounds, w: 640 } }, 370); assert.equal(raster, 4, 'periodic async resource refresh remains');
  ref.current = null; paint({}, uiSource, surface, 380); assert.equal(raster, 5, 'resource event cache invalidation remains effective');
});
