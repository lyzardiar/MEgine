import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
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
  buildUiBatches,
  effectiveCanvasShaderChannels,
  hitTestUi,
  layoutUiOverlay,
  layoutUiWorldSpace,
  uiEntityWorldPivot,
} = await server.ssrLoadModule(
  '/src/ui/uiLayout.ts',
);
test.after(() => server.close());

test('Canvas shader channels match Unity masks and camera/world defaults', () => {
  assert.equal(effectiveCanvasShaderChannels(1 | 4 | 64, 'ScreenSpaceOverlay'), 1 | 4);
  assert.equal(effectiveCanvasShaderChannels(2, 'ScreenSpaceCamera'), 2 | 8 | 16);
  assert.equal(effectiveCanvasShaderChannels(0, 'WorldSpace'), 8 | 16);

  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: {
          render_mode: 'ScreenSpaceOverlay',
          additional_shader_channels: 1 | 2,
        },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: { RectTransform: rect(), Image: { sprite: 'white' } },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  assert.equal(items.find((item) => item.entity === 2).canvasShaderChannels, 1 | 2);
  assert.equal(
    buildUiBatches(items).find((batch) => batch.key === 'ui/image/white').shaderChannels,
    1 | 2,
  );
});

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

test('Graphic replacement materials remain visible in Editor batch metadata', () => {
  const entities = [
    {
      entity: 1,
      parent: null,
      components: {
        RectTransform: rect({ size_delta: [800, 600] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      siblingIndex: 0,
      components: {
        RectTransform: rect({ anchored_position: [-100, 0] }),
        Image: { sprite: 'white', material: 'Assets\\Materials\\GlowUi.mmat' },
      },
    },
    {
      entity: 3,
      parent: 1,
      siblingIndex: 1,
      components: {
        RectTransform: rect({ anchored_position: [100, 0] }),
        Image: { sprite: 'white', material: 'Assets/Materials/MaskUi.mmat' },
      },
    },
  ];
  const batches = buildUiBatches(
    layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set()),
  );
  assert.deepEqual(batches.slice(1).map((batch) => batch.key), [
    'ui/image/white|material=Assets/Materials/GlowUi.mmat',
    'ui/image/white|material=Assets/Materials/MaskUi.mmat',
  ]);
});

test('Text paragraph settings reach the background-readable Canvas draw plan', () => {
  const entities = [
    {
      entity: 1,
      parent: null,
      components: {
        RectTransform: rect({ size_delta: [800, 600] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [120, 48] }),
        Text: {
          text: 'alpha beta gamma',
          font: 'Assets\\Fonts\\Interface.ttf',
          font_style: 'BoldAndItalic',
          align_by_geometry: true,
          support_rich_text: false,
          line_spacing: 1.25,
          resize_text_for_best_fit: true,
          resize_text_min_size: 9,
          resize_text_max_size: 31,
          horizontal_overflow: 'Overflow',
          vertical_overflow: 'Overflow',
        },
      },
    },
  ];
  const item = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((candidate) => candidate.entity === 2);
  assert.equal(item.text.lineSpacing, 1.25);
  assert.equal(item.text.font, 'Assets/Fonts/Interface.ttf');
  assert.equal(item.text.fontStyle, 'BoldAndItalic');
  assert.equal(item.text.alignByGeometry, true);
  assert.equal(item.text.supportRichText, false);
  assert.equal(item.text.bestFit, true);
  assert.equal(item.text.minSize, 9);
  assert.equal(item.text.maxSize, 31);
  assert.equal(item.text.fontScale, 1);
  assert.equal(item.text.horizontalOverflow, 'Overflow');
  assert.equal(item.text.verticalOverflow, 'Overflow');
});

const camera = {
  eye: [0, 0, 10],
  target: [0, 0, 0],
  fovYDeg: 60,
  projection: 'orthographic',
  orthographicSize: 5,
};

test('screen Canvas RectTransform is solved once at its render root', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchored_position: [25, 0], size_delta: [200, 100] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: { RectTransform: rect({ size_delta: [20, 10] }), Image: {} },
    },
  ];

  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  assert.equal(items.find((item) => item.entity === 1).rect.x, 325);
  assert.equal(items.find((item) => item.entity === 2).rect.x, 415);
});

test('nested Canvases remain independent batching islands without changing draw order', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      siblingIndex: 0,
      components: { RectTransform: rect(), Image: { sprite: 'white' } },
    },
    {
      entity: 3,
      parent: 1,
      siblingIndex: 1,
      components: { RectTransform: rect(), Canvas: { override_sorting: false } },
    },
    {
      entity: 4,
      parent: 3,
      components: { RectTransform: rect(), Image: { sprite: 'white' } },
    },
    {
      entity: 5,
      parent: 1,
      siblingIndex: 2,
      components: { RectTransform: rect(), Image: { sprite: 'white' } },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  assert.deepEqual(items.map((item) => item.entity), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    buildUiBatches(items)
      .filter((batch) => batch.key === 'ui/image/white')
      .map((batch) => batch.canvasBatchRoot),
    [1, 3, 1],
  );
});

test('Canvas sorting grid safely batches non-overlapping materials across hierarchy order', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay', normalized_sorting_grid_size: 0.25 },
      },
    },
    {
      entity: 2,
      parent: 1,
      siblingIndex: 0,
      components: { RectTransform: rect({ anchored_position: [-200, 0] }), Image: { sprite: 'atlas' } },
    },
    {
      entity: 3,
      parent: 1,
      siblingIndex: 1,
      components: { RectTransform: rect({ anchored_position: [0, 0] }), Image: { sprite: 'other' } },
    },
    {
      entity: 4,
      parent: 1,
      siblingIndex: 2,
      components: { RectTransform: rect({ anchored_position: [200, 0] }), Image: { sprite: 'atlas' } },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  assert.equal(items.find((item) => item.entity === 2).canvasSortingGridSize, 0.25);
  const batches = buildUiBatches(items);
  assert.deepEqual(batches.flatMap((batch) => batch.items.map((item) => item.entity)), [1, 2, 4, 3]);
  assert.deepEqual(batches.map((batch) => batch.key), [
    'editor/canvas',
    'ui/image/atlas',
    'ui/image/other',
  ]);
});

test('Canvas sorting grid preserves hierarchy order for overlapping transparent graphics', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay', normalized_sorting_grid_size: 0 },
      },
    },
    ...['atlas', 'other', 'atlas'].map((sprite, index) => ({
      entity: index + 2,
      parent: 1,
      siblingIndex: index,
      components: { RectTransform: rect(), Image: { sprite } },
    })),
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const batches = buildUiBatches(items);
  assert.deepEqual(batches.flatMap((batch) => batch.items.map((item) => item.entity)), [1, 2, 3, 4]);
  assert.deepEqual(batches.map((batch) => batch.key), [
    'editor/canvas',
    'ui/image/atlas',
    'ui/image/other',
    'ui/image/atlas',
  ]);
});

test('Canvas batching can move an unconstrained prefix around a later overlap edge', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    ...[
      [2, -200, 'atlas'],
      [3, 0, 'other'],
      [4, 50, 'atlas'],
    ].map(([entity, x, sprite], index) => ({
      entity,
      parent: 1,
      siblingIndex: index,
      components: {
        RectTransform: rect({ anchored_position: [x, 0] }),
        Image: { sprite },
      },
    })),
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const batches = buildUiBatches(items);
  assert.deepEqual(batches.flatMap((batch) => batch.items.map((item) => item.entity)), [1, 3, 2, 4]);
  assert.deepEqual(batches.map((batch) => batch.key), [
    'editor/canvas',
    'ui/image/other',
    'ui/image/atlas',
  ]);
});

test('Tiled Image authoring data reaches the Canvas draw plan', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect(),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect(),
        Image: {
          sprite: 'white',
          image_type: 'Tiled',
          fill_center: false,
          pixels_per_unit_multiplier: 2,
          border: [5, 5, 5, 5],
          source_size: [40, 30],
        },
      },
    },
  ];
  const item = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((candidate) => candidate.entity === 2);
  assert.equal(item?.image?.imageType, 'Tiled');
  assert.equal(item?.image?.fillCenter, false);
  assert.equal(item?.image?.spritePixelScale, 0.5);
  assert.deepEqual(item?.image?.displayBorder, [2.5, 2.5, 2.5, 2.5]);
  assert.deepEqual(item?.image?.alphaHitTestBorder, [2.5, 2.5, 2.5, 2.5]);
});

test('Filled Image authoring data reaches the Canvas draw plan', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect(),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect(),
        Image: {
          image_type: 'Filled',
          preserve_aspect: true,
          fill_method: 'Radial180',
          fill_amount: 0.35,
          fill_clockwise: false,
          fill_origin: 3,
        },
      },
    },
  ];
  const item = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((candidate) => candidate.entity === 2);
  assert.equal(item?.image?.imageType, 'Filled');
  assert.equal(item?.image?.preserveAspect, true);
  assert.equal(item?.image?.fillMethod, 'Radial180');
  assert.equal(item?.image?.fillAmount, 0.35);
  assert.equal(item?.image?.fillClockwise, false);
  assert.equal(item?.image?.fillOrigin, 3);
});

test('Unity Mask propagates nested alpha-mask stacks and rectangle raycast filters', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [120, 120] }),
        Image: { image_type: 'Filled', fill_amount: 0.5 },
        Mask: { enabled: true, show_mask_graphic: false },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [100, 100] }),
        Image: {},
        Mask: { enabled: true, show_mask_graphic: true },
      },
    },
    {
      entity: 4,
      parent: 3,
      components: {
        RectTransform: rect({ size_delta: [240, 240] }),
        Image: { raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const outer = items.find((item) => item.entity === 2);
  const child = items.find((item) => item.entity === 4);
  assert.deepEqual(outer.mask, { showGraphic: false });
  assert.deepEqual(child.maskStack, [2, 3]);
  assert.equal(child.maskRegions.length, 2);
  assert.equal(hitTestUi(items, 400, 300)?.entity, 4);
  assert.equal(hitTestUi(items, 475, 300), null);
});

test('disabled Mask does not alter child rendering or raycasts', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect(),
        Image: {},
        Mask: { enabled: false, show_mask_graphic: false },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [240, 240] }),
        Image: { raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const child = items.find((item) => item.entity === 3);
  assert.deepEqual(child.maskStack, []);
  assert.deepEqual(child.maskRegions, []);
  assert.equal(hitTestUi(items, 475, 300)?.entity, 3);
});

test('Mask without a Graphic is inactive for rendering and raycasts', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 100] }),
        Mask: { enabled: true, show_mask_graphic: false },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: { raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const child = items.find((item) => item.entity === 3);
  assert.deepEqual(child.maskStack, []);
  assert.deepEqual(child.maskRegions, []);
  assert.equal(hitTestUi(items, 475, 300)?.entity, 3);
});

test('Mask keeps its stencil depth when its associated Graphic is disabled', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 100] }),
        Image: { enabled: false },
        Mask: { enabled: true, show_mask_graphic: false },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: { raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const child = items.find((item) => item.entity === 3);
  assert.deepEqual(child.maskStack, [2]);
  assert.equal(child.maskRegions.length, 1);
  assert.equal(hitTestUi(items, 475, 300), null);
});

test('RectMask2D uses Unity left, bottom, right, top padding order', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 80] }),
        RectMask2D: { padding: [10, 20, 30, 5], softness: [4, 6] },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: {},
      },
    },
  ];
  const child = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((item) => item.entity === 3);
  assert.deepEqual(child.clip, { x: 360, y: 265, w: 60, h: 55 });
  assert.deepEqual(child.softClips, [{
    rect: { x: 360, y: 265, w: 60, h: 55 },
    softness: [4, 6],
  }]);
});

test('MaskableGraphic can ignore parent masks without escaping non-mask viewports', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 100] }),
        Image: { raycast_target: false },
        RectMask2D: { softness: [4, 6] },
        Mask: { enabled: true, show_mask_graphic: false },
        CanvasGroup: { alpha: 0.5 },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: { maskable: true, raycast_target: true },
      },
    },
    {
      entity: 4,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: { maskable: false, raycast_target: true },
      },
    },
    {
      entity: 5,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [200, 0], size_delta: [80, 80] }),
        ScrollView: { horizontal: false, vertical: true },
      },
    },
    {
      entity: 6,
      parent: 5,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: { maskable: false, raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const masked = items.find((item) => item.entity === 3);
  const unmasked = items.find((item) => item.entity === 4);
  const scrollChild = items.find((item) => item.entity === 6);
  assert.deepEqual(masked.clip, { x: 350, y: 250, w: 100, h: 100 });
  assert.deepEqual(masked.maskStack, [2]);
  assert.equal(masked.maskRegions.length, 1);
  assert.deepEqual(masked.softClips.map((clip) => clip.softness), [[4, 6]]);
  assert.deepEqual(unmasked.clip, { x: 0, y: 0, w: 800, h: 600 });
  assert.deepEqual(unmasked.maskStack, []);
  assert.deepEqual(unmasked.maskRegions, []);
  assert.deepEqual(unmasked.softClips, []);
  assert.equal(unmasked.opacity, 0.5);
  assert.equal(hitTestUi(items, 475, 300)?.entity, 4);
  assert.deepEqual(scrollChild.clip, { x: 560, y: 260, w: 80, h: 80 });
});

test('Game View filters Overlay and Camera canvases by their effective target display', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect(),
        Canvas: { render_mode: 'ScreenSpaceOverlay', target_display: 0 },
      },
    },
    { entity: 2, parent: 1, components: { RectTransform: rect(), Image: {} } },
    {
      entity: 3,
      components: {
        RectTransform: rect(),
        Canvas: { render_mode: 'ScreenSpaceOverlay', target_display: 1 },
      },
    },
    { entity: 4, parent: 3, components: { RectTransform: rect(), Image: {} } },
    {
      entity: 5,
      components: {
        Transform: { position: [0, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        Camera3D: { primary: true, target_display: 1 },
      },
    },
    {
      entity: 6,
      components: {
        RectTransform: rect(),
        Canvas: { render_mode: 'ScreenSpaceCamera', render_camera: '5' },
      },
    },
    { entity: 7, parent: 6, components: { RectTransform: rect(), Image: {} } },
  ];
  const display0 = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
    undefined,
    { ...camera, targetDisplay: 0 },
    0,
  );
  const display1 = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
    undefined,
    { ...camera, targetDisplay: 1 },
    1,
  );
  assert.deepEqual(new Set(display0.map((item) => item.entity)), new Set([1, 2]));
  assert.deepEqual(new Set(display1.map((item) => item.entity)), new Set([3, 4, 6, 7]));
});

test('nested Canvas pixel-perfect settings inherit until explicitly overridden', () => {
  const stretch = rect({
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    size_delta: [0, 0],
  });
  const fractional = rect({ anchored_position: [0.25, 0.75], size_delta: [100.4, 50.6] });
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: stretch,
        Canvas: { render_mode: 'ScreenSpaceOverlay', pixel_perfect: false },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: stretch,
        Canvas: { pixel_perfect: true, override_pixel_perfect: false },
      },
    },
    { entity: 3, parent: 2, components: { RectTransform: fractional, Image: {} } },
    {
      entity: 4,
      parent: 1,
      components: {
        RectTransform: stretch,
        Canvas: { pixel_perfect: true, override_pixel_perfect: true },
      },
    },
    { entity: 5, parent: 4, components: { RectTransform: fractional, Image: {} } },
  ];

  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const inherited = items.find((item) => item.entity === 3).rect;
  const overridden = items.find((item) => item.entity === 5).rect;
  assert.ok(Object.values(inherited).some((value) => value % 1 !== 0));
  assert.ok(Object.values(overridden).every((value) => value % 1 === 0));
});

test('nested Canvas can disable inherited pixel-perfect snapping', () => {
  const stretch = rect({
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    size_delta: [0, 0],
  });
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: stretch,
        Canvas: { render_mode: 'ScreenSpaceOverlay', pixel_perfect: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: stretch,
        Canvas: { pixel_perfect: false, override_pixel_perfect: true },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ anchored_position: [0.25, 0.75], size_delta: [100.4, 50.6] }),
        Image: {},
      },
    },
  ];

  const item = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((candidate) => candidate.entity === 3);
  assert.ok(Object.values(item.rect).some((value) => value % 1 !== 0));
});

test('CanvasGroup ignore parent groups resets inherited alpha, interaction, and raycasts', () => {
  const stretch = rect({
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    size_delta: [0, 0],
  });
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: stretch,
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: stretch,
        CanvasGroup: { alpha: 0.25, interactable: false, blocks_raycasts: false },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ anchored_position: [-100, 0] }),
        Button: {},
      },
    },
    {
      entity: 4,
      parent: 2,
      components: {
        RectTransform: stretch,
        CanvasGroup: {
          alpha: 0.5,
          interactable: true,
          blocks_raycasts: true,
          ignore_parent_groups: true,
        },
      },
    },
    {
      entity: 5,
      parent: 4,
      components: {
        RectTransform: rect({ anchored_position: [100, 0] }),
        Button: {},
      },
    },
  ];

  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const inherited = items.find((item) => item.entity === 3);
  const independent = items.find((item) => item.entity === 5);
  assert.equal(inherited.opacity, 0.25);
  assert.equal(inherited.button.interactable, false);
  assert.equal(inherited.blocksRaycasts, false);
  assert.equal(independent.opacity, 0.5);
  assert.equal(independent.button.interactable, true);
  assert.equal(independent.blocksRaycasts, true);
  assert.equal(hitTestUi(items, inherited.rect.x + 1, inherited.rect.y + 1), null);
  assert.equal(
    hitTestUi(items, independent.rect.x + 1, independent.rect.y + 1)?.entity,
    independent.entity,
  );
});

test('Text raycast targets participate in editor Graphic hit testing', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({
          anchor_min: [0, 0],
          anchor_max: [1, 1],
          size_delta: [0, 0],
        }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect(),
        Text: { text: 'Raycast target', raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const text = items.find((item) => item.entity === 2);
  assert.equal(hitTestUi(items, text.rect.x + 1, text.rect.y + 1)?.entity, text.entity);
});

test('Graphic raycast padding shrinks and expands the screen-space hit region', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 80] }),
        Image: { raycast_target: true, raycast_padding: [10, 20, 30, 5] },
      },
    },
  ];
  let items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  let image = items.find((item) => item.entity === 2);
  const centerY = image.rect.y + image.rect.h / 2;
  assert.deepEqual(image.raycastPadding, [10, 20, 30, 5]);
  assert.equal(hitTestUi(items, image.rect.x + 9, centerY), null);
  assert.equal(hitTestUi(items, image.rect.x + 11, centerY)?.entity, 2);
  assert.equal(hitTestUi(items, image.rect.x + image.rect.w - 29, centerY), null);
  assert.equal(hitTestUi(items, image.rect.x + image.rect.w - 31, centerY)?.entity, 2);
  assert.equal(hitTestUi(items, image.rect.x + 50, image.rect.y + 4), null);
  assert.equal(hitTestUi(items, image.rect.x + 50, image.rect.y + 6)?.entity, 2);
  assert.equal(hitTestUi(items, image.rect.x + 50, image.rect.y + image.rect.h - 19), null);
  assert.equal(hitTestUi(items, image.rect.x + 50, image.rect.y + image.rect.h - 21)?.entity, 2);

  entities[1].components.Image.raycast_padding = [-10, -5, -20, -15];
  items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  image = items.find((item) => item.entity === 2);
  assert.equal(hitTestUi(items, image.rect.x - 5, centerY)?.entity, 2);
  assert.equal(hitTestUi(items, image.rect.x + image.rect.w + 10, centerY)?.entity, 2);
});

test('Image alpha hit threshold filters the same-entity Graphic raycast', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect(),
        Image: {
          sprite: 'white',
          raycast_target: true,
          alpha_hit_test_minimum_threshold: 0.5,
        },
        Button: { interactable: true },
      },
    },
  ];
  let items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  let image = items.find((item) => item.entity === 2);
  assert.equal(hitTestUi(items, image.rect.x + 50, image.rect.y + 50)?.entity, 2);

  entities[1].components.Image.alpha_hit_test_minimum_threshold = 1.01;
  items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  image = items.find((item) => item.entity === 2);
  assert.equal(hitTestUi(items, image.rect.x + 50, image.rect.y + 50), null);
});

test('GraphicRaycaster removal or disablement preserves rendering while disabling hits', () => {
  const makeEntities = (raycaster) => [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        ...(raycaster == null ? {} : { GraphicRaycaster: raycaster }),
      },
    },
    {
      entity: 2,
      parent: 1,
      components: { RectTransform: rect(), Image: { raycast_target: true } },
    },
  ];
  for (const raycaster of [null, { enabled: false }]) {
    const items = layoutUiOverlay(makeEntities(raycaster), { x: 0, y: 0, w: 800, h: 600 }, new Set());
    const image = items.find((item) => item.entity === 2);
    assert.ok(image);
    assert.equal(image.blocksRaycasts, false);
    assert.equal(hitTestUi(items, image.rect.x + 1, image.rect.y + 1), null);
  }
});

test('disabled Graphics stop rendering and raycasts while legacy Text remains a target', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    ...[
      ['Image', -180],
      ['RawImage', -60],
      ['Text', 60],
      ['Panel', 180],
    ].map(([type, x], index) => ({
      entity: index + 2,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [x, 0] }),
        [type]: { enabled: false, raycast_target: true },
      },
    })),
    {
      entity: 6,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [0, 180] }),
        Text: { text: 'Legacy' },
      },
    },
  ];
  const items = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set([2, 3, 4, 5]),
  );
  for (const entity of entities.slice(1, 5)) {
    const item = items.find((candidate) => candidate.entity === entity.entity);
    assert.ok(item, 'disabled Graphic RectTransforms stay authorable in Scene view');
    assert.equal(item.image ?? item.rawImage ?? item.text ?? item.panel, undefined);
    assert.equal(hitTestUi(items, item.rect.x + 50, item.rect.y + 50), null);
  }
  const legacyText = items.find((item) => item.entity === 6);
  assert.equal(legacyText.text.raycastTarget, true);
  assert.equal(hitTestUi(items, legacyText.rect.x + 50, legacyText.rect.y + 50)?.entity, 6);
});

test('Selectables use an enabled same-entity Graphic raycast target when authored', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [-150, 0] }),
        Image: { enabled: false, raycast_target: true },
        Button: { interactable: true },
      },
    },
    {
      entity: 3,
      parent: 1,
      components: {
        RectTransform: rect(),
        Image: { raycast_target: false },
        Button: { interactable: true },
      },
    },
    {
      entity: 4,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [150, 0] }),
        Button: { interactable: true },
      },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  for (const entity of [2, 3]) {
    const item = items.find((candidate) => candidate.entity === entity);
    assert.equal(hitTestUi(items, item.rect.x + 50, item.rect.y + 50), null);
  }
  const standalone = items.find((item) => item.entity === 4);
  assert.equal(hitTestUi(items, standalone.rect.x + 50, standalone.rect.y + 50)?.entity, 4);
});

test('disabled Canvas and inactive ancestors suppress override-sorting subtrees', () => {
  const disabledCanvas = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { enabled: false, render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect(),
        Canvas: { enabled: true, override_sorting: true, sorting_order: 5 },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: { RectTransform: rect(), Image: { raycast_target: true } },
    },
  ];
  const inactiveNonCanvasAncestor = [
    { entity: 10, active: false, components: {} },
    {
      entity: 11,
      parent: 10,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { enabled: true, render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 12,
      parent: 11,
      components: {
        RectTransform: rect(),
        Canvas: { enabled: true, override_sorting: true, sorting_order: 5 },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 13,
      parent: 12,
      components: { RectTransform: rect(), Image: { raycast_target: true } },
    },
  ];

  for (const entities of [disabledCanvas, inactiveNonCanvasAncestor]) {
    const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
    assert.deepEqual(items, []);
  }
});

test('World Space override-sorting Canvas subtrees are projected exactly once', () => {
  const entities = [
    {
      entity: 1,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        RectTransform: rect({ size_delta: [200, 100] }),
        Canvas: { render_mode: 'WorldSpace' },
        CanvasScaler: { reference_pixels_per_unit: 100, reference_resolution: [200, 100] },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: { RectTransform: rect({ size_delta: [40, 20] }), Image: {} },
    },
    {
      entity: 3,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [40, 0], size_delta: [80, 40] }),
        Canvas: { override_sorting: true, sorting_order: 5 },
      },
    },
    {
      entity: 4,
      parent: 3,
      components: { RectTransform: rect({ size_delta: [20, 10] }), Image: {} },
    },
  ];

  const items = layoutUiWorldSpace(
    entities,
    camera,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  assert.equal(items.filter((item) => item.entity === 2).length, 1);
  assert.equal(items.filter((item) => item.entity === 3).length, 1);
  assert.equal(items.filter((item) => item.entity === 4).length, 1);
});

test('World Space raycast padding projects independently from visible Graphic corners', () => {
  const entities = [
    {
      entity: 1,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        RectTransform: rect({ size_delta: [200, 100], local_rotation: 12 }),
        Canvas: { render_mode: 'WorldSpace' },
        CanvasScaler: { reference_pixels_per_unit: 100, reference_resolution: [200, 100] },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 60], local_rotation: 18 }),
        Image: { raycast_target: true, raycast_padding: [20, 10, 20, 10] },
      },
    },
  ];
  let items = layoutUiWorldSpace(entities, camera, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  let image = items.find((item) => item.entity === 2);
  assert.equal(image.screenCorners.length, 4);
  assert.equal(image.raycastScreenCorners.length, 4);
  const center = image.raycastScreenCorners.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  assert.equal(hitTestUi(items, center.x, center.y)?.entity, 2);
  assert.equal(hitTestUi(items, image.screenCorners[0].x, image.screenCorners[0].y), null);

  entities[1].components.Image.raycast_padding = [-20, -10, -20, -10];
  items = layoutUiWorldSpace(entities, camera, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  image = items.find((item) => item.entity === 2);
  const expandedOnly = {
    x: (image.raycastScreenCorners[0].x + image.screenCorners[0].x) / 2,
    y: (image.raycastScreenCorners[0].y + image.screenCorners[0].y) / 2,
  };
  assert.equal(hitTestUi(items, expandedOnly.x, expandedOnly.y)?.entity, 2);
});

test('World Space Mask keeps projected visual and raycast regions aligned', () => {
  const entities = [
    {
      entity: 1,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        RectTransform: rect({ size_delta: [200, 200] }),
        Canvas: { render_mode: 'WorldSpace' },
        CanvasScaler: { reference_pixels_per_unit: 100, reference_resolution: [200, 200] },
        GraphicRaycaster: { enabled: true },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [100, 100], local_rotation: 20 }),
        Image: {},
        Mask: { enabled: true, show_mask_graphic: false },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 200] }),
        Image: { raycast_target: true },
      },
    },
  ];
  const items = layoutUiWorldSpace(
    entities,
    camera,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const child = items.find((item) => item.entity === 3);
  assert.deepEqual(child.maskStack, [2]);
  assert.equal(child.maskRegions[0].screenCorners.length, 4);
  const mask = child.maskRegions[0];
  const center = mask.screenCorners.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  assert.equal(hitTestUi(items, center.x, center.y)?.entity, 3);
  assert.equal(hitTestUi(items, mask.rect.x + mask.rect.w + 2, center.y), null);
});

test('World Space GraphicRaycaster ignores reversed graphics unless opted out', () => {
  const makeEntities = (ignoreReversedGraphics) => [
    {
      entity: 1,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 1, 0, 0], scale: [1, 1, 1] },
        RectTransform: rect({ size_delta: [200, 100] }),
        Canvas: { render_mode: 'WorldSpace' },
        CanvasScaler: { reference_pixels_per_unit: 100, reference_resolution: [200, 100] },
        GraphicRaycaster: {
          enabled: true,
          ...(ignoreReversedGraphics === false ? { ignore_reversed_graphics: false } : {}),
        },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: { RectTransform: rect({ size_delta: [200, 100] }), Image: { raycast_target: true } },
    },
  ];

  const filtered = layoutUiWorldSpace(
    makeEntities(true),
    camera,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const reversed = filtered.find((item) => item.entity === 2);
  assert.ok(reversed);
  assert.equal(reversed.blocksRaycasts, false);

  const allowed = layoutUiWorldSpace(
    makeEntities(false),
    camera,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  );
  const image = allowed.find((item) => item.entity === 2);
  assert.ok(image);
  assert.equal(image.blocksRaycasts, true);
  const center = image.screenCorners.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  assert.equal(hitTestUi(allowed, center.x, center.y)?.entity, 2);
});

test('Canvas root groups apply while override-sorting Canvas starts a new group boundary', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
        GraphicRaycaster: { enabled: true },
        CanvasGroup: { alpha: 0.25, interactable: false, blocks_raycasts: false },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [-150, 0] }),
        Image: { raycast_target: true },
      },
    },
    {
      entity: 3,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [150, 0] }),
        Canvas: { override_sorting: true, sorting_order: 1 },
        GraphicRaycaster: { enabled: true },
        CanvasGroup: { alpha: 0.5, interactable: true, blocks_raycasts: true },
      },
    },
    {
      entity: 4,
      parent: 3,
      components: {
        RectTransform: rect(),
        Image: { raycast_target: true },
      },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const blocked = items.find((item) => item.entity === 2);
  const independent = items.find((item) => item.entity === 4);
  assert.equal(blocked.opacity, 0.25);
  assert.equal(blocked.blocksRaycasts, false);
  assert.equal(independent.opacity, 0.5);
  assert.equal(independent.blocksRaycasts, true);
});

test('Scene framing uses the transformed World Space Canvas coordinates', () => {
  const entities = [
    {
      entity: 1,
      components: {
        Transform: { position: [3, 4, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        RectTransform: rect({ size_delta: [200, 100], local_rotation: 90, local_scale: [2, 1] }),
        Canvas: { render_mode: 'WorldSpace' },
        CanvasScaler: { reference_pixels_per_unit: 100, reference_resolution: [200, 100] },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: { RectTransform: rect({ anchored_position: [50, 0], size_delta: [100, 100] }), Image: {} },
    },
  ];

  const framing = uiEntityWorldPivot(entities, 2);
  assert.ok(framing);
  assert.ok(Math.abs(framing.position[0] - 3) < 1e-9);
  assert.ok(Math.abs(framing.position[1] - 5) < 1e-9);
  assert.ok(Math.abs(framing.position[2] - 5) < 1e-9);
  assert.ok(Math.abs(framing.size - 2) < 1e-9);
});
