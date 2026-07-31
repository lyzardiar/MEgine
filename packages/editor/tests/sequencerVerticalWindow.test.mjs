import assert from 'node:assert/strict';
import test from 'node:test';
import { sequencerVerticalWindow } from '../src/sequencerVerticalWindow.ts';

test('Sequencer vertical window renders a bounded block range with overscan', () => {
  const result = sequencerVerticalWindow(Array(100).fill(42), 1_712, 452, 32, 0.5);
  assert.deepEqual(result, {
    visibleStart: 1_680,
    visibleEnd: 2_132,
    renderStart: 1_470,
    renderEnd: 2_342,
    firstBlock: 35,
    lastBlockExclusive: 56,
    paddingTop: 1_470,
    paddingBottom: 1_848,
    totalHeight: 4_200,
  });
});

test('Sequencer vertical window preserves variable group and child row heights', () => {
  const result = sequencerVerticalWindow([30, 42, 132, 0, 42, 30], 86, 100, 32, 0);
  assert.equal(result.visibleStart, 54);
  assert.equal(result.visibleEnd, 154);
  assert.equal(result.firstBlock, 1);
  assert.equal(result.lastBlockExclusive, 3);
  assert.equal(result.paddingTop, 30);
  assert.equal(result.paddingBottom, 72);
  assert.equal(result.totalHeight, 276);
});

test('Sequencer vertical window clamps invalid geometry and empty assets', () => {
  assert.deepEqual(sequencerVerticalWindow([], Number.POSITIVE_INFINITY, -1), {
    visibleStart: 0,
    visibleEnd: 0,
    renderStart: 0,
    renderEnd: 0,
    firstBlock: 0,
    lastBlockExclusive: 0,
    paddingTop: 0,
    paddingBottom: 0,
    totalHeight: 0,
  });
  const result = sequencerVerticalWindow([Number.NaN, -4, 10], 999, 50, 0, 99);
  assert.equal(result.totalHeight, 10);
  assert.equal(result.firstBlock, 2);
  assert.equal(result.lastBlockExclusive, 3);
  assert.equal(result.paddingTop, 0);
  assert.equal(result.paddingBottom, 0);
});
