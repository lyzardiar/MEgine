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
  layoutUiScene3D,
  layoutUiWorldSpace,
  projectedQuadPoint,
  uiPixelToWorld,
  uiEntityWorldPivot,
} = await server.ssrLoadModule(
  '/src/ui/uiLayout.ts',
);
test.after(() => server.close());

test('projected quad interpolation preserves corners and perspective depth', () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 80, y: 80 },
    { x: 20, y: 80 },
  ];
  assert.deepEqual(projectedQuadPoint(corners, [1, 0.5, 0.5, 1], 0, 0), corners[0]);
  assert.deepEqual(projectedQuadPoint(corners, [1, 0.5, 0.5, 1], 1, 1), corners[2]);
  const center = projectedQuadPoint(corners, [1, 0.5, 0.5, 1], 0.5, 0.5);
  assert.ok(center);
  assert.ok(Math.abs(center.x - 36.6666666667) < 1e-6);
  assert.equal(center.y, 40);
});

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
  assert.equal(item.text.dynamicPixelsPerUnit, 1);
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

test('Scene screen Canvas uses logical resolution units and projects as a movable quad', () => {
  assert.deepEqual(uiPixelToWorld(0, 0, 1920, 1080), [-960, 540, 0]);
  assert.deepEqual(uiPixelToWorld(1920, 1080, 1920, 1080), [960, -540, 0]);

  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
      },
    },
  ];
  const viewport = { x: 0, y: 0, w: 800, h: 600 };
  const front = layoutUiScene3D(
    entities,
    { eye: [0, 0, 2400], target: [0, 0, 0], fovYDeg: 60 },
    viewport,
    new Set(),
    { w: 1920, h: 1080 },
  ).items[0];
  assert.equal(front.role, 'canvas');
  assert.equal(front.screenCorners.length, 4);
  assert.ok(
    front.screenCorners[0].y < front.screenCorners[3].y,
    'projected UI corners must start at top-left so Scene content is not flipped',
  );
  assert.equal(front.rect.x, Math.min(...front.screenCorners.map((point) => point.x)));
  assert.equal(front.rect.y, Math.min(...front.screenCorners.map((point) => point.y)));
  assert.ok(front.rect.w > 400, '1920-unit Canvas must not collapse to viewport-letterbox world size');

  const panned = layoutUiScene3D(
    entities,
    { eye: [400, 0, 2400], target: [400, 0, 0], fovYDeg: 60 },
    viewport,
    new Set(),
    { w: 1920, h: 1080 },
  ).items[0];
  assert.ok(
    Math.abs(panned.rect.x - front.rect.x) > 1,
    'Scene camera pan must move the Canvas quad',
  );

  const oblique = layoutUiScene3D(
    entities,
    { eye: [1800, 900, 2400], target: [0, 0, 0], fovYDeg: 60 },
    viewport,
    new Set(),
    { w: 1920, h: 1080 },
  ).items[0];
  const distinctRightEdges = Math.abs(oblique.screenCorners[1].x - oblique.screenCorners[2].x);
  assert.ok(distinctRightEdges > 1, 'oblique Scene projection must preserve a quad instead of an AABB overlay');
  assert.equal(oblique.rect.x, Math.min(...oblique.screenCorners.map((point) => point.x)));
  assert.equal(oblique.rect.y, Math.min(...oblique.screenCorners.map((point) => point.y)));
  assert.equal(
    oblique.rect.h,
    Math.max(...oblique.screenCorners.map((point) => point.y)) - oblique.rect.y,
    'Scene labels and grids must use the projected quad bounds instead of one arbitrary corner',
  );
});

test('Scene projects each override-sorting Canvas island exactly once', () => {
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
      components: { RectTransform: rect(), Panel: {} },
    },
    {
      entity: 3,
      parent: 1,
      components: {
        RectTransform: rect({ anchored_position: [200, 0] }),
        Canvas: { override_sorting: true, sorting_order: 10 },
      },
    },
    {
      entity: 4,
      parent: 3,
      components: { RectTransform: rect(), Image: {} },
    },
  ];
  const { items } = layoutUiScene3D(
    entities,
    { eye: [0, 0, 1200], target: [0, 0, 0], fovYDeg: 60 },
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
    { w: 800, h: 600 },
  );
  assert.deepEqual(items.map((item) => item.entity).sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.equal(items.filter((item) => item.entity === 3).length, 1);
  assert.equal(items.filter((item) => item.entity === 4).length, 1);
});

test('Editor LayoutGroup rebuilds alignment and excludes ignored LayoutElements', () => {
  const layoutGroup = {
    direction: 'Horizontal',
    padding: [0, 0, 0, 0],
    spacing: [10, 0],
    cell_size: [50, 20],
    child_alignment: 'MiddleCenter',
    child_control_width: true,
    child_control_height: true,
    child_force_expand: false,
    child_force_expand_width: true,
    child_force_expand_height: true,
  };
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
        RectTransform: rect({ size_delta: [300, 100] }),
        LayoutGroup: layoutGroup,
      },
    },
    {
      entity: 3,
      parent: 2,
      components: { RectTransform: rect(), Panel: {} },
    },
    {
      entity: 4,
      parent: 2,
      components: {
        RectTransform: rect(),
        LayoutElement: { ignore_layout: true },
        Panel: {},
      },
    },
    {
      entity: 5,
      parent: 2,
      components: { RectTransform: rect(), Panel: {} },
    },
  ];
  const first = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const firstChild = first.find((item) => item.entity === 3).rect;
  const ignored = first.find((item) => item.entity === 4).rect;
  const lastChild = first.find((item) => item.entity === 5).rect;
  assert.deepEqual(firstChild, { x: 345, y: 290, w: 50, h: 20 });
  assert.equal(lastChild.x - firstChild.x, 60);

  layoutGroup.child_alignment = 'MiddleRight';
  const rebuilt = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  assert.equal(rebuilt.find((item) => item.entity === 3).rect.x - firstChild.x, 95);
  assert.deepEqual(rebuilt.find((item) => item.entity === 4).rect, ignored);
});

test('Editor LayoutGroup consumes implicit Image and Text preferred sizes', () => {
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
        RectTransform: rect({ size_delta: [500, 100] }),
        LayoutGroup: {
          direction: 'Horizontal',
          padding: [0, 0, 0, 0],
          spacing: [10, 0],
          cell_size: [5, 5],
          child_alignment: 'UpperLeft',
          child_control_width: true,
          child_control_height: true,
          child_force_expand: false,
        },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect(),
        Image: { source_size: [80, 40], pixels_per_unit_multiplier: 2 },
      },
    },
    {
      entity: 4,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [100, 30] }),
        Text: {
          text: 'ABC',
          font_size: 14,
          font_style: 'Normal',
          support_rich_text: true,
          line_spacing: 1,
          horizontal_overflow: 'Overflow',
        },
      },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const image = items.find((item) => item.entity === 3).rect;
  const text = items.find((item) => item.entity === 4).rect;
  assert.deepEqual(image, { x: 150, y: 250, w: 40, h: 20 });
  assert.equal(text.x, 200);
  assert.ok(text.w > 30 && text.h >= 16, 'Text must use glyph metrics instead of the 5x5 cell fallback');

  entities[2].components.LayoutElement = { preferred_width: 25, preferred_height: 12 };
  const overridden = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((item) => item.entity === 3).rect;
  assert.deepEqual(overridden, { x: 150, y: 250, w: 25, h: 12 });
});

test('parent LayoutGroup ownership prevents child ContentSizeFitter feedback', () => {
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
        RectTransform: rect({ size_delta: [300, 100] }),
        LayoutGroup: {
          direction: 'Horizontal',
          padding: [0, 0, 0, 0],
          spacing: [0, 0],
          cell_size: [50, 10],
          child_alignment: 'UpperLeft',
          child_control_width: true,
          child_control_height: false,
          child_force_expand: false,
        },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [100, 100] }),
        LayoutElement: { preferred_width: 50 },
        Panel: {},
        LayoutGroup: {
          direction: 'Vertical',
          padding: [0, 0, 0, 0],
          spacing: [0, 0],
          cell_size: [200, 30],
          child_force_expand: false,
        },
        ContentSizeFitter: {
          horizontal_fit: 'PreferredSize',
          vertical_fit: 'PreferredSize',
        },
      },
    },
    {
      entity: 4,
      parent: 3,
      components: { RectTransform: rect(), Panel: {} },
    },
  ];
  const child = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((item) => item.entity === 3);
  assert.deepEqual(child.rect, { x: 250, y: 285, w: 50, h: 30 });
});

test('ContentSizeFitter axes are not overwritten by a same-entity AspectRatioFitter', () => {
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
        RectTransform: rect({ size_delta: [100, 100] }),
        Panel: {},
        LayoutGroup: {
          direction: 'Vertical',
          padding: [0, 0, 0, 0],
          spacing: [0, 0],
          cell_size: [80, 30],
          child_force_expand: false,
        },
        ContentSizeFitter: {
          horizontal_fit: 'PreferredSize',
          vertical_fit: 'PreferredSize',
        },
        AspectRatioFitter: {
          aspect_mode: 'WidthControlsHeight',
          aspect_ratio: 4,
        },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: { RectTransform: rect(), Panel: {} },
    },
  ];
  const fitted = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((item) => item.entity === 2);
  assert.deepEqual(fitted.rect, { x: 360, y: 285, w: 80, h: 30 });
});

test('Editor imported font metrics drive Text preferred layout size', () => {
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
        RectTransform: rect({ size_delta: [300, 100] }),
        LayoutGroup: {
          direction: 'Horizontal',
          padding: [0, 0, 0, 0],
          spacing: [0, 0],
          cell_size: [5, 5],
          child_force_expand: false,
        },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect(),
        Text: {
          text: 'AB',
          font: 'Assets/Fonts/Preferred.ttf',
          font_size: 16,
          horizontal_overflow: 'Overflow',
        },
      },
    },
  ];
  const item = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
    undefined,
    undefined,
    0,
    {
      measureGlyph: () => ({
        advance: 20,
        metricWidth: 18,
        lineHeight: 30,
        geometry: [0, 18],
      }),
      measurePairKerning: () => 0,
    },
  ).find((candidate) => candidate.entity === 3);
  assert.equal(item.rect.w, 38);
  assert.equal(item.rect.h, 30);
});

test('Editor LayoutGroup remeasures wrapped Text after assigning its width', () => {
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
        RectTransform: rect({ size_delta: [50, 100] }),
        LayoutGroup: {
          direction: 'Vertical',
          padding: [0, 0, 0, 0],
          spacing: [0, 0],
          cell_size: [5, 5],
          child_control_width: true,
          child_control_height: true,
          child_force_expand: false,
          child_force_expand_width: true,
        },
      },
    },
    {
      entity: 3,
      parent: 2,
      components: {
        RectTransform: rect({ size_delta: [200, 10] }),
        Text: {
          text: 'AAAA',
          font: 'Assets/Fonts/Wrapped.ttf',
          font_size: 10,
          horizontal_overflow: 'Wrap',
        },
      },
    },
  ];
  const item = layoutUiOverlay(
    entities,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
    undefined,
    undefined,
    0,
    {
      measureGlyph: () => ({
        advance: 20,
        metricWidth: 18,
        lineHeight: 30,
        geometry: [0, 18],
      }),
      measurePairKerning: () => 0,
    },
  ).find((candidate) => candidate.entity === 3);
  assert.equal(item.rect.w, 50);
  assert.equal(item.rect.h, 60);
});

test('nested LayoutGroups report recursive metrics with per-field LayoutElement overrides', () => {
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
        RectTransform: rect({ size_delta: [300, 100] }),
        LayoutGroup: {
          direction: 'Horizontal',
          padding: [0, 0, 0, 0],
          spacing: [10, 0],
          cell_size: [5, 5],
          child_force_expand: false,
        },
      },
    },
    {
      entity: 3,
      parent: 2,
      siblingIndex: 0,
      components: {
        RectTransform: rect({ size_delta: [10, 10] }),
        LayoutElement: { preferred_height: 75 },
        LayoutGroup: {
          direction: 'Vertical',
          padding: [5, 7, 5, 7],
          spacing: [0, 3],
          cell_size: [5, 5],
          child_force_expand: false,
        },
        Panel: {},
      },
    },
    {
      entity: 4,
      parent: 3,
      siblingIndex: 0,
      components: {
        RectTransform: rect(),
        LayoutElement: {
          min_width: 40,
          preferred_width: 100,
          flexible_width: 1,
          min_height: 10,
          preferred_height: 20,
          flexible_height: 2,
        },
        Panel: {},
      },
    },
    {
      entity: 5,
      parent: 3,
      siblingIndex: 1,
      components: {
        RectTransform: rect(),
        LayoutElement: {
          min_width: 60,
          preferred_width: 80,
          flexible_width: 3,
          min_height: 15,
          preferred_height: 30,
          flexible_height: 4,
        },
        Panel: {},
      },
    },
    {
      entity: 6,
      parent: 2,
      siblingIndex: 1,
      components: {
        RectTransform: rect(),
        LayoutElement: { preferred_width: 50, preferred_height: 20, flexible_width: 1 },
        Panel: {},
      },
    },
  ];
  const items = layoutUiOverlay(entities, { x: 0, y: 0, w: 800, h: 600 }, new Set());
  const nested = items.find((item) => item.entity === 3).rect;
  const sibling = items.find((item) => item.entity === 6).rect;
  assert.deepEqual(nested, { x: 250, y: 250, w: 207.5, h: 75 });
  assert.deepEqual(sibling, { x: 467.5, y: 250, w: 82.5, h: 20 });
});

test('Scene places Screen Space Camera Canvas on its assigned camera plane', () => {
  const makeEntities = (planeDistance) => [
    {
      entity: 10,
      components: {
        Transform: { position: [10, 0, 20], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        Camera3D: {
          projection: 'perspective',
          fov_y_degrees: 60,
          near: 0.1,
          far: 100,
        },
      },
    },
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: {
          render_mode: 'ScreenSpaceCamera',
          render_camera: '10',
          plane_distance: planeDistance,
        },
      },
    },
  ];
  const sceneCamera = { eye: [0, 0, 30], target: [0, 0, 0], fovYDeg: 60 };
  const viewport = { x: 0, y: 0, w: 800, h: 600 };
  const nearPlane = layoutUiScene3D(
    makeEntities(5),
    sceneCamera,
    viewport,
    new Set(),
    { w: 800, h: 600 },
  ).items[0];
  const farPlane = layoutUiScene3D(
    makeEntities(10),
    sceneCamera,
    viewport,
    new Set(),
    { w: 800, h: 600 },
  ).items[0];
  const centerX = nearPlane.screenCorners.reduce((sum, point) => sum + point.x / 4, 0);
  assert.ok(centerX > viewport.w / 2, 'assigned camera position must move the authoring Quad');
  assert.ok(
    farPlane.rect.w > nearPlane.rect.w * 1.4,
    'perspective camera plane size must grow with plane distance and Scene projection depth',
  );

  const framing = uiEntityWorldPivot(makeEntities(5), 1, { w: 800, h: 600 });
  assert.ok(framing);
  assert.ok(Math.abs(framing.position[0] - 10) < 1e-9);
  assert.ok(Math.abs(framing.position[1]) < 1e-9);
  assert.ok(Math.abs(framing.position[2] - 15) < 1e-9);
  assert.ok(Math.abs(framing.size - (10 * Math.tan(Math.PI / 6) * 4 / 3)) < 1e-9);
});

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

test('World Space Text exposes Dynamic Pixels Per Unit without changing layout geometry', () => {
  const makeEntities = (dynamicPixelsPerUnit) => [
    {
      entity: 1,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        RectTransform: rect({ size_delta: [200, 100] }),
        Canvas: { render_mode: 'WorldSpace' },
        CanvasScaler: {
          reference_pixels_per_unit: 100,
          reference_resolution: [200, 100],
          dynamic_pixels_per_unit: dynamicPixelsPerUnit,
        },
      },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        RectTransform: rect({ size_delta: [120, 40] }),
        Text: { text: 'Agent', font: 'Assets/Fonts/Interface.ttf', font_size: 16 },
      },
    },
  ];
  const layout = (density) => layoutUiWorldSpace(
    makeEntities(density),
    camera,
    { x: 0, y: 0, w: 800, h: 600 },
    new Set(),
  ).find((item) => item.entity === 2);
  const regular = layout(1);
  const dense = layout(3.5);
  const invalid = layout(-2);
  const bounded = layout(100);
  assert.equal(regular.text.dynamicPixelsPerUnit, 1);
  assert.equal(dense.text.dynamicPixelsPerUnit, 3.5);
  assert.equal(invalid.text.dynamicPixelsPerUnit, 1);
  assert.equal(bounded.text.dynamicPixelsPerUnit, 64);
  assert.equal(dense.text.fontSize, regular.text.fontSize);
  assert.deepEqual(dense.rect, regular.rect);
  assert.deepEqual(dense.unrotatedSize, regular.unrotatedSize);
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
