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
const { layoutUiOverlay, layoutUiWorldSpace, uiEntityWorldPivot } = await server.ssrLoadModule(
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
