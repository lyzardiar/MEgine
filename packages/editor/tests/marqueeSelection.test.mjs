import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combineMarqueeSelection,
  marqueeHitIds,
  normalizeMarquee,
} from '../src/marqueeSelection.ts';

test('normalizes reverse drag direction and ignores Canvas roots', () => {
  const marquee = normalizeMarquee(80, 80, 0, 0);
  const hits = marqueeHitIds([
    { entity: 1, role: 'canvas', rect: { x: 0, y: 0, w: 100, h: 100 } },
    { entity: 2, role: 'graphic', rect: { x: 10, y: 10, w: 20, h: 20 } },
    { entity: 3, role: 'graphic', rect: { x: 90, y: 90, w: 20, h: 20 } },
  ], marquee);
  assert.deepEqual(marquee, { x: 0, y: 0, w: 80, h: 80 });
  assert.deepEqual(hits, [2]);
});

test('rotated item bounds participate in marquee intersection', () => {
  const hits = marqueeHitIds([
    {
      entity: 4,
      role: 'graphic',
      rect: { x: 40, y: 40, w: 20, h: 20 },
      rotation: 45,
      pivot: [0.5, 0.5],
    },
  ], { x: 32, y: 48, w: 5, h: 5 });
  assert.deepEqual(hits, [4]);
});

test('replace add and toggle selection modes are deterministic', () => {
  assert.deepEqual(combineMarqueeSelection([1, 2], [2, 3], 'replace'), [2, 3]);
  assert.deepEqual(combineMarqueeSelection([1, 2], [2, 3], 'add'), [1, 2, 3]);
  assert.deepEqual(combineMarqueeSelection([1, 2], [2, 3], 'toggle'), [1, 3]);
});
