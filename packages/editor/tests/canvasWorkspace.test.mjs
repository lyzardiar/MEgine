import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const {
  MAX_CANVAS_ARTBOARDS,
  normalizeCanvasArtboards,
  normalizeCanvasWorkspacePreferences,
} = await server.ssrLoadModule('/src/canvasWorkspace.ts');
const {
  buildCanvasArtboardPlan,
  buildCanvasPlanPage,
  resolveCanvasPlanEntity,
} = await server.ssrLoadModule('/src/ui/canvasPlan.ts');
const {
  artboardFrameAt,
  layoutCanvasArtboards,
} = await server.ssrLoadModule('/src/ui/canvasArtboardLayout.ts');
test.after(() => server.close());

const rect = (overrides = {}) => ({
  anchor_min: [0.5, 0.5],
  anchor_max: [0.5, 0.5],
  pivot: [0.5, 0.5],
  anchored_position: [0, 0],
  size_delta: [100, 100],
  local_rotation: 0,
  local_scale: [1, 1],
  ...overrides,
});

function diagnosticEntities() {
  return [
    {
      entity: 1,
      name: 'Canvas',
      parent: null,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay', target_display: 1 },
        CanvasScaler: {
          ui_scale_mode: 'ScaleWithScreenSize',
          reference_resolution: [800, 600],
        },
      },
    },
    {
      entity: 2,
      name: 'Outside',
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [390, 0] }),
        Image: { material: 'ui.mat', raycast_target: true },
      },
    },
    {
      entity: 3,
      name: 'Zero',
      parent: 1,
      components: { RectTransform: rect({ size_delta: [0, 0] }), Image: {} },
    },
    {
      entity: 4,
      name: 'Scaled',
      parent: 1,
      components: { RectTransform: rect({ local_scale: [2, 1] }), Image: {} },
    },
    {
      entity: 5,
      name: 'Mask',
      parent: 1,
      components: { RectTransform: rect(), RectMask2D: {} },
    },
    {
      entity: 6,
      name: 'Clipped',
      parent: 5,
      components: { RectTransform: rect({ size_delta: [200, 200] }), Image: {} },
    },
    {
      entity: 7,
      name: 'Overflow',
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [20, 10] }),
        Text: {
          text: 'This text cannot fit',
          font_size: 16,
          horizontal_overflow: 'Overflow',
          vertical_overflow: 'Truncate',
        },
      },
    },
    {
      entity: 8,
      name: 'Unsafe Button',
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [-350, 0] }),
        Button: { on_click: () => 'must not escape' },
      },
    },
  ];
}

test('Canvas artboards normalize legacy input, update Game Resolution, dedupe, and stay bounded', () => {
  assert.equal(normalizeCanvasArtboards('broken', { width: 800, height: 600 })[0].key, 'game');
  const artboards = normalizeCanvasArtboards([
    { key: 'game', label: 'Old Game', width: 320, height: 200 },
    { key: 'duplicate', label: 'Duplicate', width: 1280, height: 720 },
    { key: 'bad', label: 'Bad', width: 0, height: 720 },
    ...Array.from({ length: 8 }, (_, index) => ({
      key: `custom-${index}`,
      label: `Custom ${index}`,
      width: 700 + index,
      height: 500,
    })),
  ], { width: 1280, height: 720 });
  assert.equal(artboards[0].key, 'game');
  assert.deepEqual([artboards[0].width, artboards[0].height], [1280, 720]);
  assert.equal(artboards.some((entry) => entry.key === 'duplicate'), false);
  assert.equal(artboards.length, MAX_CANVAS_ARTBOARDS);

  const preferences = normalizeCanvasWorkspacePreferences({
    activeKey: 'missing',
    zoom: 99,
    pan: [12, -4],
    artboards: [{
      key: 'phone',
      label: 'Phone',
      width: 1080,
      height: 1920,
      safeArea: { x: -10, y: 80, width: 2000, height: 1900 },
    }],
  }, { width: 1920, height: 1080 });
  assert.equal(preferences.activeKey, 'game');
  assert.equal(preferences.zoom, 8);
  assert.deepEqual(preferences.pan, [12, -4]);
  assert.deepEqual(
    preferences.artboards.find((entry) => entry.key === 'phone')?.safeArea,
    { x: 0, y: 80, width: 1080, height: 1840 },
  );
  const phoneActive = normalizeCanvasWorkspacePreferences({
    activeKey: 'phone',
    artboards: [
      { key: 'game', label: 'Game', width: 1920, height: 1080 },
      { key: 'phone', label: 'Phone', width: 1080, height: 1920 },
    ],
  }, { width: 1080, height: 1920 });
  assert.equal(phoneActive.activeKey, 'phone');
  assert.equal(phoneActive.artboards.length, 2);
});

test('Canvas plan derives all deterministic diagnostics from the shared layout result', () => {
  const artboard = {
    key: 'test',
    label: 'Test',
    width: 800,
    height: 600,
    safeArea: { x: 50, y: 50, width: 700, height: 500 },
  };
  const plan = buildCanvasArtboardPlan(diagnosticEntities(), 1, artboard, 0);
  const codes = new Set(plan.diagnostics.map((entry) => entry.code));
  assert.deepEqual(codes, new Set([
    'TARGET_DISPLAY_MISMATCH',
    'OUTSIDE_ARTBOARD',
    'ZERO_SIZE',
    'NON_UNIT_RECT_SCALE',
    'CLIPPED_BY_MASK',
    'TEXT_OVERFLOW',
    'SAFE_AREA_OVERFLOW',
  ]));
  assert.equal(plan.canvasScale, 1);
  assert.equal(plan.items.find((item) => item.entity === 2).material, 'ui.mat');
  assert.equal(plan.items.find((item) => item.entity === 7).text.overflow, true);
  assert.equal('onClick' in plan.items.find((item) => item.entity === 8), false);
  assert.doesNotThrow(() => structuredClone(plan));
});

test('Canvas plan keeps clean edge-aligned content diagnostic-free', () => {
  const entities = [
    {
      entity: 10,
      name: 'Canvas',
      parent: null,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay', target_display: 0 },
      },
    },
    {
      entity: 11,
      name: 'Exact Edge',
      parent: 10,
      components: {
        RectTransform: rect({
          anchor_min: [0, 0],
          anchor_max: [0, 0],
          pivot: [0, 0],
          size_delta: [100, 100],
        }),
        Image: {},
      },
    },
  ];
  const plan = buildCanvasArtboardPlan(entities, 10, {
    key: 'clean',
    label: 'Clean',
    width: 800,
    height: 600,
  }, 0);
  assert.deepEqual(plan.diagnostics, []);
});

test('Canvas plan exposes Spine and Effekseer as RectTransform graphics', () => {
  const entities = [
    {
      entity: 20,
      name: 'Canvas',
      parent: null,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay', target_display: 0 },
      },
    },
    {
      entity: 21,
      name: 'Hero Spine',
      parent: 20,
      components: {
        RectTransform: rect({ size_delta: [320, 320] }),
        SpineSkeleton: { skeleton: 'hero.json', atlas: 'hero.atlas' },
      },
    },
    {
      entity: 22,
      name: 'Hit Effect',
      parent: 20,
      components: {
        RectTransform: rect({ size_delta: [256, 256] }),
        EffekseerEffect: { effect: 'hit.efkefc', render_mode: 'screen' },
      },
    },
  ];
  const plan = buildCanvasArtboardPlan(entities, 20, {
    key: 'game',
    label: 'Game',
    width: 800,
    height: 600,
  }, 0);
  assert.equal(plan.items.find((item) => item.entity === 21)?.graphicType, 'SpineSkeleton');
  assert.equal(plan.items.find((item) => item.entity === 22)?.graphicType, 'EffekseerEffect');
  assert.equal(plan.items.find((item) => item.entity === 21)?.interaction.raycastTarget, false);
  assert.equal(plan.items.find((item) => item.entity === 22)?.interaction.raycastTarget, false);
});

test('Canvas plan paging is bounded, revisioned, and follows the selected Canvas', () => {
  const entities = diagnosticEntities();
  assert.equal(resolveCanvasPlanEntity(entities, undefined, [7]), 1);
  const preferences = normalizeCanvasWorkspacePreferences(null, { width: 800, height: 600 });
  const first = buildCanvasPlanPage({
    entities,
    selectedIds: [7],
    sceneRevision: 12,
    gameResolution: { width: 800, height: 600 },
    gameDisplay: 0,
    preferences,
    offset: 0,
    limit: 2,
  });
  const second = buildCanvasPlanPage({
    entities,
    selectedIds: [7],
    sceneRevision: 12,
    gameResolution: { width: 800, height: 600 },
    gameDisplay: 0,
    preferences,
    offset: first.nextOffset,
    limit: 2,
  });
  assert.equal(first.items.length, 2);
  assert.equal(first.nextOffset, 2);
  assert.equal(second.planRevision, first.planRevision);
  assert.match(first.planRevision, /^canvas-plan-v1-12-[0-9a-f]{16}$/);
  assert.ok(first.artboards.length >= 3);
});

test('Canvas artboard camera fits all, frames active, and supports exact 1:1 layout', () => {
  const artboards = [
    { key: 'desktop', label: 'Desktop', width: 1920, height: 1080 },
    { key: 'tablet', label: 'Tablet', width: 1024, height: 768 },
    { key: 'phone', label: 'Phone', width: 1080, height: 1920 },
  ];
  const fitAll = layoutCanvasArtboards({
    viewportWidth: 1200,
    viewportHeight: 700,
    artboards,
    activeKey: 'desktop',
    fitMode: 'all',
    customScale: 1,
    pan: [0, 0],
  });
  assert.ok(fitAll.scale < 1);
  assert.ok(fitAll.frames.every((frame) => (
    frame.x >= -0.01
    && frame.y >= -0.01
    && frame.x + frame.w <= 1200.01
    && frame.y + frame.h <= 700.01
  )));

  const fitActive = layoutCanvasArtboards({
    viewportWidth: 1200,
    viewportHeight: 700,
    artboards,
    activeKey: 'phone',
    fitMode: 'active',
    customScale: 1,
    pan: [0, 0],
  });
  const phone = fitActive.frames.find((frame) => frame.active);
  assert.ok(Math.abs(phone.x + phone.w * 0.5 - 600) < 0.01);
  assert.ok(Math.abs(phone.y + phone.h * 0.5 - 350) < 0.01);

  const oneToOne = layoutCanvasArtboards({
    viewportWidth: 1200,
    viewportHeight: 700,
    artboards,
    activeKey: 'tablet',
    fitMode: 'custom',
    customScale: 1,
    pan: [20, -10],
  });
  const tablet = oneToOne.frames.find((frame) => frame.active);
  assert.equal(tablet.w, 1024);
  assert.equal(tablet.h, 768);
  assert.equal(artboardFrameAt(oneToOne.frames, tablet.x + 1, tablet.y + 1).key, 'tablet');
});
