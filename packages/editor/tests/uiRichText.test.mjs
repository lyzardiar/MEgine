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
const { parseUiRichText } = await server.ssrLoadModule('/src/ui/uiRichText.ts');
test.after(() => server.close());

const options = (overrides = {}) => ({
  enabled: true,
  fontSize: 14,
  fontScale: 1,
  fontStyle: 'Normal',
  ...overrides,
});

test('legacy Unity rich text parses nested style size and color tags', () => {
  const glyphs = parseUiRichText(
    'A<b>B<i>C</i></b><size=21>D</size><color=#ff000080>E</color>',
    options(),
  );
  assert.equal(glyphs.map((glyph) => glyph.character).join(''), 'ABCDE');
  assert.deepEqual(glyphs.map((glyph) => glyph.fontStyle), [
    'Normal', 'Bold', 'BoldAndItalic', 'Normal', 'Normal',
  ]);
  assert.equal(glyphs[3].fontSize, 21);
  assert.deepEqual(glyphs[4].color, [1, 0, 0, 128 / 255]);
});

test('legacy Unity rich text preserves disabled unknown invalid and unclosed markup', () => {
  const source = '<b>Bold</b> <size = 20>x</size> <unknown>y</unknown> <i>open';
  assert.equal(
    parseUiRichText(source, options({ enabled: false }))
      .map((glyph) => glyph.character).join(''),
    source,
  );
  const enabled = parseUiRichText(source, options());
  assert.equal(enabled.map((glyph) => glyph.character).join(''),
    'Bold <size = 20>x</size> <unknown>y</unknown> <i>open');
  assert.equal(enabled.slice(-7).every((glyph) => glyph.fontStyle === 'Normal'), true);

  const mismatched = '<b><i>wrong</b></i>';
  const mismatchGlyphs = parseUiRichText(mismatched, options());
  assert.equal(mismatchGlyphs.map((glyph) => glyph.character).join(''), mismatched);
  assert.equal(mismatchGlyphs.every((glyph) => glyph.fontStyle === 'Normal'), true);
});

test('legacy Unity rich text accepts named colors and scales authored size tags', () => {
  const glyphs = parseUiRichText(
    '<color=cyan>C</color><size="20">S</size>',
    options({ fontScale: 0.5, fontStyle: 'Italic' }),
  );
  assert.deepEqual(glyphs[0].color, [0, 1, 1, 1]);
  assert.equal(glyphs[0].fontStyle, 'Italic');
  assert.equal(glyphs[1].fontSize, 10);
});
