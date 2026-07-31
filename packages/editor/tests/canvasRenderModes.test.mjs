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
const { hitTestUi, layoutUiOverlay, layoutUiWorldSpace, uiEntityWorldPivot } = await server.ssrLoadModule(
  '/src/ui/uiLayout.ts',
);
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

test('Canvas root groups apply while override-sorting Canvas starts a new group boundary', () => {
  const entities = [
    {
      entity: 1,
      components: {
        RectTransform: rect({ anchor_min: [0, 0], anchor_max: [1, 1], size_delta: [0, 0] }),
        Canvas: { render_mode: 'ScreenSpaceOverlay' },
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
