import assert from 'node:assert/strict';
import test from 'node:test';
import { planNineSlice } from '../src/ui/nineSlice.ts';

test('plans nine source and destination regions with Unity border ordering', () => {
  const regions = planNineSlice([100, 80], [240, 160], [10, 20, 30, 15]);
  assert.equal(regions.length, 9);
  assert.deepEqual(regions[0], {
    source: { x: 0, y: 0, w: 10, h: 15 },
    destination: { x: 0, y: 0, w: 10, h: 15 },
  });
  assert.deepEqual(regions[8], {
    source: { x: 70, y: 60, w: 30, h: 20 },
    destination: { x: 210, y: 140, w: 30, h: 20 },
  });
});

test('proportionally clamps borders when destination is smaller than their sum', () => {
  const regions = planNineSlice([100, 100], [20, 10], [30, 40, 30, 40]);
  assert.equal(regions.length, 4);
  assert.deepEqual(regions.map((region) => region.destination), [
    { x: 0, y: 0, w: 10, h: 5 },
    { x: 10, y: 0, w: 10, h: 5 },
    { x: 0, y: 5, w: 10, h: 5 },
    { x: 10, y: 5, w: 10, h: 5 },
  ]);
});

test('invalid or empty source sizes do not emit degenerate regions', () => {
  assert.deepEqual(planNineSlice([0, 100], [100, 100], [10, 10, 10, 10]), []);
});
