// Author: MiYu
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConsoleRows } from '../src/consoleModel.ts';

const all = new Set(['info', 'warn', 'error']);
const lines = ['Ready', '[Warn] Missing texture\n  at scene.ts:12', 'Ready', '[Error] Missing texture', '[Warn] Missing texture\n  at scene.ts:12'];

test('Console collapses identical full messages without merging levels or losing stacks', () => {
  const { rows, counts } = buildConsoleRows(lines, all, '', true);
  assert.deepEqual(counts, { info: 2, warn: 2, error: 1 });
  assert.deepEqual(rows.map(({ count }) => count), [2, 2, 1]);
  assert.equal(rows[1].message, 'Missing texture\n  at scene.ts:12');
  assert.equal(buildConsoleRows([...lines, '[Warn] Missing texture\n  at other.ts:1'], all, '', true).rows.length, 4);
});

test('Console filters levels independently, searches stacks, and retains total counts', () => {
  const { rows, counts } = buildConsoleRows(lines, new Set(['warn', 'error']), ' SCENE.TS ', true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
  assert.deepEqual(counts, { info: 2, warn: 2, error: 1 });
  assert.equal(buildConsoleRows(lines, new Set(), '', false).rows.length, 0);
});

test('Console rows have stable unique keys across unrelated log eviction and filtering', () => {
  const { rows } = buildConsoleRows(lines, all, '', false);
  assert.equal(new Set(rows.map((row) => row.key)).size, lines.length);
  assert.equal(buildConsoleRows(lines.slice(1), all, '', false).rows[0].key, rows[1].key);
  assert.equal(buildConsoleRows(lines, new Set(['warn']), '', false).rows[0].key, rows[1].key);
  assert.deepEqual(buildConsoleRows([], all, '', true), { rows: [], counts: { info: 0, warn: 0, error: 0 } });
});
