import assert from 'node:assert/strict';
import test from 'node:test';
import { graphicEffectFilter } from '../src/ui/graphicEffect.ts';

test('shadow and four outline directions compose without changing source material state', () => {
  const filter = graphicEffectFilter(
    { color: [0, 0, 0, 0.5], distance: [2, 3], useGraphicAlpha: true },
    { color: [1, 0.5, 0, 0.75], distance: [1, -2], useGraphicAlpha: false },
  );
  assert.match(filter, /drop-shadow\(2px 3px 0 rgba\(0,0,0,0.5\)\)/);
  assert.match(filter, /drop-shadow\(1px 2px 0 rgba\(255,128,0,0.75\)\)/);
  assert.match(filter, /drop-shadow\(-1px -2px 0 rgba\(255,128,0,0.75\)\)/);
  assert.equal(filter.match(/drop-shadow/g)?.length, 5);
});

test('transparent or absent effects produce no Canvas filter', () => {
  assert.equal(graphicEffectFilter(), 'none');
  assert.equal(
    graphicEffectFilter({ color: [0, 0, 0, 0], distance: [1, 1], useGraphicAlpha: true }),
    'none',
  );
});
