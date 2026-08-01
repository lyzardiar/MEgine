import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_TILED_IMAGE_QUADS, planTiledImage } from '../src/ui/tiledImage.ts';

test('Tiled Image preserves corners and repeats edges and center with partial UVs', () => {
  const regions = planTiledImage([40, 30], [75, 55], [5, 5, 5, 5]);
  assert.equal(regions.length, 25);
  assert.deepEqual(regions[0], {
    source: { x: 0, y: 0, w: 5, h: 5 },
    destination: { x: 0, y: 0, w: 5, h: 5 },
  });
  assert.ok(regions.some((region) => (
    region.destination.x === 65
    && region.destination.y === 45
    && region.destination.w === 5
    && region.destination.h === 5
    && region.source.w === 5
    && region.source.h === 5
  )));
});

test('Tiled Image Fill Center keeps borders while borderless sprites remain visible', () => {
  const hollow = planTiledImage([40, 30], [75, 55], [5, 5, 5, 5], undefined, 1, false);
  assert.equal(hollow.length, 16);
  assert.ok(hollow.every((region) => (
    region.destination.x < 5
    || region.destination.x + region.destination.w > 70
    || region.destination.y < 5
    || region.destination.y + region.destination.h > 50
  )));

  const borderless = planTiledImage([20, 20], [45, 35], [0, 0, 0, 0], undefined, 1, false);
  assert.equal(borderless.length, 6);
});

test('Image pixels-per-unit multiplier increases tiled density', () => {
  const baseline = planTiledImage(
    [40, 30],
    [75, 55],
    [5, 5, 5, 5],
    [5, 5, 5, 5],
    1,
    true,
  );
  const doubledPixelsPerUnit = planTiledImage(
    [40, 30],
    [75, 55],
    [5, 5, 5, 5],
    [2.5, 2.5, 2.5, 2.5],
    0.5,
    true,
  );
  assert.equal(baseline.length, 25);
  assert.equal(doubledPixelsPerUnit.length, 49);
  assert.deepEqual(doubledPixelsPerUnit[0].destination, { x: 0, y: 0, w: 2.5, h: 2.5 });
});

test('Tiled Image enlarges tiles instead of exceeding Unity mesh budget', () => {
  const regions = planTiledImage([1, 1], [1_000_000, 1_000_000], [0, 0, 0, 0]);
  assert.ok(regions.length <= MAX_TILED_IMAGE_QUADS);
  assert.ok(regions.length > 0);
  const totalArea = regions.reduce(
    (sum, region) => sum + region.destination.w * region.destination.h,
    0,
  );
  assert.ok(Math.abs(totalArea - 1_000_000_000_000) < 1);
});
