import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponentDefaults } from '../src/componentCatalog.ts';
import { getBuiltinInspectorField } from '../src/inspectorMetadata.ts';
import {
  imageAlphaHitTest,
  mapImageAlphaPoint,
  projectedQuadUv,
} from '../src/ui/imageAlphaHitTest.ts';

const geometry = (overrides = {}) => ({
  imageType: 'Simple',
  sourceSize: [100, 100],
  sourceBorder: [10, 20, 30, 15],
  destinationBorder: [10, 20, 30, 15],
  pixelScale: 1,
  fillCenter: true,
  ...overrides,
});

test('Image exposes Unity alpha hit-test defaults and Inspector bounds', () => {
  assert.equal(createComponentDefaults('Image').alpha_hit_test_minimum_threshold, 0);
  assert.deepEqual(
    getBuiltinInspectorField('Image', 'alpha_hit_test_minimum_threshold'),
    {
      label: 'Alpha Hit Test Minimum Threshold',
      min: 0,
      max: 1,
      step: 0.01,
      visibleWhen: { field: 'raycast_target', equals: true },
    },
  );
});

test('Image alpha coordinates follow Simple and Sliced geometry', () => {
  assert.deepEqual(
    mapImageAlphaPoint({ x: 50, y: 25 }, [200, 100], geometry()),
    { x: 0.25, y: 0.25 },
  );
  const sliced = geometry({ imageType: 'Sliced' });
  assert.deepEqual(mapImageAlphaPoint({ x: 5, y: 7.5 }, [200, 200], sliced), {
    x: 0.05,
    y: 0.075,
  });
  const center = mapImageAlphaPoint({ x: 90, y: 100 }, [200, 200], sliced);
  assert.ok(Math.abs(center.x - 0.4) < 1e-6);
  assert.ok(Math.abs(center.y - 0.4848484848) < 1e-6);
});

test('Tiled alpha coordinates repeat the same center pixels as generated tiles', () => {
  const tiled = geometry({
    imageType: 'Tiled',
    sourceSize: [40, 30],
    sourceBorder: [5, 5, 5, 5],
    destinationBorder: [5, 5, 5, 5],
  });
  const first = mapImageAlphaPoint({ x: 12, y: 12 }, [100, 80], tiled);
  const repeated = mapImageAlphaPoint({ x: 42, y: 32 }, [100, 80], tiled);
  assert.ok(Math.abs(first.x - repeated.x) < 1e-6);
  assert.ok(Math.abs(first.y - repeated.y) < 1e-6);
});

test('alpha threshold rejects transparent samples and fails open for unreadable textures', () => {
  assert.equal(imageAlphaHitTest(
    { x: 20, y: 20 },
    [100, 100],
    geometry(),
    0.5,
    () => 0.49,
  ), false);
  assert.equal(imageAlphaHitTest(
    { x: 20, y: 20 },
    [100, 100],
    geometry(),
    0.5,
    () => 0.5,
  ), true);
  assert.equal(imageAlphaHitTest(
    { x: 20, y: 20 },
    [100, 100],
    geometry(),
    0.5,
    () => null,
  ), true);
});

test('World Space quad UV lookup is perspective-correct', () => {
  const uv = projectedQuadUv(
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    { x: 50, y: 50 },
    [1, 0.5, 0.5, 1],
  );
  assert.ok(Math.abs(uv.x - 1 / 3) < 1e-6);
  assert.ok(Math.abs(uv.y - 1 / 3) < 1e-6);
});
