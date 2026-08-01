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
const { resetUiFontFaceCacheForTests, uiFontFamily, uiTextFontCss } = await server.ssrLoadModule(
  '/src/ui/uiFontAssets.ts',
);
test.after(() => server.close());

test('font families are stable, project-confined, and retain a safe fallback', () => {
  resetUiFontFaceCacheForTests();
  const first = uiFontFamily('Assets\\Fonts\\Interface.ttf');
  assert.match(first, /^"MEngineFont_[0-9a-f]{8}", system-ui, sans-serif$/);
  assert.equal(uiFontFamily('assets/fonts/interface.ttf'), 'system-ui, sans-serif');
  assert.equal(uiFontFamily('../outside.ttf'), 'system-ui, sans-serif');
  assert.equal(uiFontFamily('Assets/Fonts/readme.txt'), 'system-ui, sans-serif');
  assert.equal(uiFontFamily('Assets/Fonts/Interface.ttf'), first);
});

test('font CSS bounds hostile sizes and preserves synthetic Unity styles', () => {
  assert.match(
    uiTextFontCss(Number.NaN, 'BoldAndItalic', 'Assets/Fonts/Interface.otf'),
    /^italic 700 16px "MEngineFont_[0-9a-f]{8}", system-ui, sans-serif$/,
  );
  assert.equal(uiTextFontCss(9_999, 'Normal', ''), '512px system-ui, sans-serif');
});
