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
const { layoutUiText } = await server.ssrLoadModule('/src/ui/uiTextLayout.ts');
test.after(() => server.close());

const options = (overrides = {}) => ({
  width: 29,
  height: 16,
  fontSize: 7,
  lineSpacing: 1,
  horizontalOverflow: 'Wrap',
  verticalOverflow: 'Truncate',
  alignment: 'Left',
  verticalAlign: 'Top',
  ...overrides,
});

test('Unity Text word wrapping and explicit newlines share deterministic bitmap metrics', () => {
  const wrapped = layoutUiText('alpha beta', options());
  assert.deepEqual(wrapped.lines.map(({ text, x, y, width }) => ({ text, x, y, width })), [
    { text: 'alpha', x: 0, y: 0, width: 29 },
    { text: 'beta', x: 0, y: 8, width: 23 },
  ]);
  assert.equal(wrapped.truncated, false);

  const explicit = layoutUiText('one\r\ntwo', options({ horizontalOverflow: 'Overflow' }));
  assert.deepEqual(explicit.lines.map((line) => line.text), ['one', 'two']);
});

test('Unity Text vertical overflow truncates complete lines while Overflow preserves them', () => {
  const truncated = layoutUiText('one\ntwo\nthree', options({ height: 15 }));
  assert.deepEqual(truncated.lines.map((line) => line.text), ['one']);
  assert.equal(truncated.truncated, true);

  const overflow = layoutUiText('one\ntwo\nthree', options({
    height: 15,
    horizontalOverflow: 'Overflow',
    verticalOverflow: 'Overflow',
  }));
  assert.deepEqual(overflow.lines.map((line) => line.text), ['one', 'two', 'three']);
  assert.equal(overflow.truncated, false);
});

test('Unity Text line spacing and block alignment are applied after wrapping', () => {
  const layout = layoutUiText('A\nBB', options({
    width: 40,
    height: 30,
    lineSpacing: 1.5,
    horizontalOverflow: 'Overflow',
    alignment: 'Right',
    verticalAlign: 'Bottom',
  }));
  assert.equal(layout.lineAdvance, 12);
  assert.deepEqual(layout.lines.map(({ text, x, y }) => ({ text, x, y })), [
    { text: 'A', x: 35, y: 10 },
    { text: 'BB', x: 29, y: 22 },
  ]);
});

test('Unity Text wrapping splits an overlong word without losing Unicode characters', () => {
  const layout = layoutUiText('ABCDEF🙂', options({ width: 17, height: 40 }));
  assert.deepEqual(layout.lines.map((line) => line.text), ['ABC', 'DEF', '🙂']);
});

test('Text layout bounds hostile Agent-authored content deterministically', () => {
  const layout = layoutUiText('A'.repeat(20_000), options({
    horizontalOverflow: 'Overflow',
    verticalOverflow: 'Overflow',
  }));
  assert.equal(Array.from(layout.lines[0].text).length, 16_384);
  assert.equal(layout.truncated, true);
});
