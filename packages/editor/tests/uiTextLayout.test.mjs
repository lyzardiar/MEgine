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
  fontStyle: 'Normal',
  alignByGeometry: false,
  supportRichText: true,
  bestFit: false,
  minSize: 10,
  maxSize: 40,
  fontScale: 1,
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

test('Unity Text Best Fit selects the largest integer size that fully fits', () => {
  const maximum = layoutUiText('AB', options({
    width: 80,
    height: 80,
    bestFit: true,
    minSize: 7,
    maxSize: 14,
  }));
  assert.equal(maximum.fontSize, 14);

  const reduced = layoutUiText('AB', options({
    width: 17,
    height: 16,
    bestFit: true,
    minSize: 7,
    maxSize: 14,
    horizontalOverflow: 'Overflow',
  }));
  assert.equal(reduced.fontSize, 10);
  assert.equal(reduced.truncated, false);
});

test('Unity Text Best Fit measures full overflow and falls back to its minimum', () => {
  const horizontallyReduced = layoutUiText('ABCD', options({
    width: 29,
    height: 16,
    bestFit: true,
    minSize: 7,
    maxSize: 14,
    horizontalOverflow: 'Overflow',
    verticalOverflow: 'Overflow',
  }));
  assert.equal(horizontallyReduced.fontSize, 8);

  const minimumFallback = layoutUiText('A\nB\nC', options({
    width: 40,
    height: 4,
    bestFit: true,
    minSize: 7,
    maxSize: 14,
  }));
  assert.equal(minimumFallback.fontSize, 7);
  assert.equal(minimumFallback.truncated, true);
});

test('Unity Text Best Fit resolves authored integer sizes before Canvas scaling', () => {
  const layout = layoutUiText('A', options({
    width: 20,
    height: 20,
    bestFit: true,
    minSize: 10,
    maxSize: 10,
    fontScale: 0.55,
  }));
  assert.equal(layout.fontSize, 5.5);
  assert.equal(layoutUiText('A', options({ fontSize: -5 })).fontSize, 1);
  assert.equal(layoutUiText('A', options({
    bestFit: true,
    minSize: -10,
    maxSize: 0,
  })).fontSize, 1);
});

test('Unity Font Style overhang participates in wrapping and Best Fit', () => {
  const normal = layoutUiText('AB', options({
    width: 12,
    height: 24,
    horizontalOverflow: 'Overflow',
  }));
  const styled = layoutUiText('AB', options({
    width: 12,
    height: 24,
    fontStyle: 'BoldAndItalic',
    horizontalOverflow: 'Overflow',
  }));
  assert.equal(normal.lines[0].width, 11);
  assert.equal(styled.lines[0].width, 13);
  assert.deepEqual(layoutUiText('AB', options({
    width: 11,
    height: 24,
    fontStyle: 'BoldAndItalic',
  })).lines.map((line) => line.text), ['A', 'B']);

  const bestFit = layoutUiText('AB', options({
    width: 17,
    height: 20,
    bestFit: true,
    minSize: 7,
    maxSize: 14,
    fontStyle: 'BoldAndItalic',
    horizontalOverflow: 'Overflow',
  }));
  assert.equal(bestFit.fontSize, 9);
});

test('Unity Align By Geometry aligns visible glyph bounds instead of advance metrics', () => {
  const metric = layoutUiText('1', options({
    width: 20,
    horizontalOverflow: 'Overflow',
    alignment: 'Right',
  }));
  const geometry = layoutUiText('1', options({
    width: 20,
    horizontalOverflow: 'Overflow',
    alignment: 'Right',
    alignByGeometry: true,
  }));
  assert.equal(metric.lines[0].x, 15);
  assert.equal(geometry.lines[0].x, 16);

  const styledGeometry = layoutUiText('1', options({
    width: 20,
    fontStyle: 'BoldAndItalic',
    horizontalOverflow: 'Overflow',
    alignment: 'Right',
    alignByGeometry: true,
  }));
  assert.equal(styledGeometry.lines[0].x, 15);

  const leading = layoutUiText('  A', options({
    width: 20,
    horizontalOverflow: 'Overflow',
    alignment: 'Left',
    alignByGeometry: true,
  }));
  assert.equal(leading.lines[0].x, -12);
});

test('Unity Rich Text changes runs, variable line geometry, wrapping, and color', () => {
  const layout = layoutUiText(
    'A<b>B<i>C</i></b><size=14>D</size><color=#ff000080>E</color>',
    options({ width: 80, height: 30, horizontalOverflow: 'Overflow' }),
  );
  assert.equal(layout.lines[0].text, 'ABCDE');
  assert.deepEqual(layout.lines[0].runs.map((run) => ({
    text: run.text,
    x: run.x,
    y: run.y,
    fontSize: run.fontSize,
    fontStyle: run.fontStyle,
    color: run.color,
  })), [
    { text: 'A', x: 0, y: 8, fontSize: 7, fontStyle: 'Normal', color: null },
    { text: 'B', x: 6, y: 8, fontSize: 7, fontStyle: 'Bold', color: null },
    { text: 'C', x: 12, y: 8, fontSize: 7, fontStyle: 'BoldAndItalic', color: null },
    { text: 'D', x: 18, y: 0, fontSize: 14, fontStyle: 'Normal', color: null },
    { text: 'E', x: 30, y: 8, fontSize: 7, fontStyle: 'Normal', color: [1, 0, 0, 128 / 255] },
  ]);
  assert.equal(layout.lines[0].width, 35);
  assert.equal(layout.blockHeight, 16);

  const wrapped = layoutUiText('<size=14>A</size>B', options({ width: 16, height: 30 }));
  assert.deepEqual(wrapped.lines.map((line) => line.text), ['A', 'B']);
});

test('disabling Unity Rich Text renders markup as ordinary bounded text', () => {
  const source = '<b>A</b>';
  const rich = layoutUiText(source, options({ horizontalOverflow: 'Overflow' }));
  const plain = layoutUiText(source, options({
    horizontalOverflow: 'Overflow',
    supportRichText: false,
  }));
  assert.equal(rich.lines[0].text, 'A');
  assert.equal(plain.lines[0].text, source);
});

test('imported font measurements drive wrapping, line boxes, geometry, and Best Fit', () => {
  const measured = layoutUiText('WI', options({
    width: 10,
    height: 30,
    measureGlyph: ({ character }) => ({
      advance: character === 'W' ? 10 : 2,
      metricWidth: character === 'W' ? 10 : 1,
      lineHeight: 12,
      geometry: character === 'W' ? [1, 9] : [0, 1],
    }),
  }));
  assert.deepEqual(measured.lines.map(({ text, width, height }) => ({ text, width, height })), [
    { text: 'W', width: 10, height: 12 },
    { text: 'I', width: 1, height: 12 },
  ]);

  const geometry = layoutUiText('W', options({
    width: 20,
    height: 20,
    horizontalOverflow: 'Overflow',
    alignment: 'Right',
    alignByGeometry: true,
    measureGlyph: () => ({ advance: 10, metricWidth: 10, lineHeight: 12, geometry: [1, 9] }),
  }));
  assert.equal(geometry.lines[0].x, 11);

  const bestFit = layoutUiText('AB', options({
    width: 20,
    height: 20,
    horizontalOverflow: 'Overflow',
    verticalOverflow: 'Overflow',
    bestFit: true,
    minSize: 7,
    maxSize: 14,
    measureGlyph: ({ fontSize }) => ({
      advance: fontSize,
      metricWidth: fontSize,
      lineHeight: fontSize,
      geometry: [0, fontSize],
    }),
  }));
  assert.equal(bestFit.fontSize, 10);

  const bounded = layoutUiText('A', options({
    width: 20,
    height: 20,
    horizontalOverflow: 'Overflow',
    verticalOverflow: 'Overflow',
    alignByGeometry: true,
    measureGlyph: () => ({
      advance: 99_999,
      metricWidth: 99_999,
      lineHeight: 99_999,
      geometry: [3_000, 4_000],
    }),
  }));
  assert.equal(bounded.advance, 2_048);
  assert.equal(bounded.lineHeight, 2_048);
  assert.equal(bounded.lines[0].x, -2_048);
});

test('imported font pair kerning drives width, wrapping, runs, and Best Fit', () => {
  const measureGlyph = ({ fontSize }) => ({
    advance: fontSize,
    metricWidth: fontSize,
    lineHeight: fontSize,
    geometry: [0, fontSize],
  });
  const measurePairKerning = (left, right) => (
    left.character === 'A' && right.character === 'V' ? -left.fontSize * 0.3 : 0
  );
  const wrapped = layoutUiText('AVA', options({
    width: 17,
    height: 30,
    fontSize: 10,
    measureGlyph,
    measurePairKerning,
  }));
  assert.deepEqual(wrapped.lines.map(({ text, width }) => ({ text, width })), [
    { text: 'AV', width: 17 },
    { text: 'A', width: 10 },
  ]);

  const colored = layoutUiText('A<color=red>V</color>A', options({
    width: 40,
    height: 20,
    fontSize: 10,
    horizontalOverflow: 'Overflow',
    measureGlyph,
    measurePairKerning,
  }));
  assert.equal(colored.lines[0].width, 27);
  assert.deepEqual(colored.lines[0].runs.map(({ text, x }) => ({ text, x })), [
    { text: 'A', x: 0 },
    { text: 'V', x: 7 },
    { text: 'A', x: 17 },
  ]);

  const bestFit = layoutUiText('AV', options({
    width: 17,
    height: 20,
    bestFit: true,
    minSize: 7,
    maxSize: 10,
    horizontalOverflow: 'Overflow',
    verticalOverflow: 'Overflow',
    measureGlyph,
    measurePairKerning: (left, right) => (
      left.character === 'A' && right.character === 'V' ? -left.fontSize * 0.25 : 0
    ),
  }));
  assert.equal(bestFit.fontSize, 9);

  const bounded = layoutUiText('AV', options({
    width: 20,
    height: 20,
    fontSize: 10,
    horizontalOverflow: 'Overflow',
    measureGlyph,
    measurePairKerning: () => -99_999,
  }));
  assert.equal(bounded.lines[0].width, 10);
});
