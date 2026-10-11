// Author: MiYu. Font identities must follow asset refreshes without repeated large-library scans.
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
const { refreshProjectFiles, resetProjectAssetState, listProjectFiles } = await server.ssrLoadModule('/src/projectAssets.ts');

test('large asset libraries preserve stable font identities and invalidate on revision, deletion and project reset', async () => {
  const previousFetch = globalThis.fetch;
  let files = Array.from({ length: 20000 }, (_, i) => ({ relPath: `Assets/Models/${i}.glb`, kind: 'model', revision: '1' }));
  const font = { relPath: 'Assets/Fonts/Interface.ttf', kind: 'font', guid: '11111111-1111-1111-1111-111111111111', revision: '1' };
  files.push(font);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ assets: files }) });
  try {
    resetProjectAssetState(); resetUiFontFaceCacheForTests(); await refreshProjectFiles();
    let pathReads = 0;
    for (const asset of listProjectFiles()) { const path = asset.relPath; Object.defineProperty(asset, 'relPath', { get() { pathReads++; return path; }, enumerable: true }); }
    const first = uiFontFamily(font.relPath), indexedReads = pathReads;
    for (let i = 0; i < 1000; i++) assert.equal(uiFontFamily('Assets/Fonts/INTERFACE.ttf'), first);
    assert.equal(pathReads, indexedReads, 'repeated text measurement does not scan the project file list');
    files = [{ ...font, revision: '2' }]; await refreshProjectFiles();
    const changed = uiFontFamily(font.relPath); assert.notEqual(changed, first);
    files = []; await refreshProjectFiles(); const removed = uiFontFamily(font.relPath); assert.notEqual(removed, changed);
    files = [font]; await refreshProjectFiles(); assert.equal(uiFontFamily(font.relPath), first);
    resetProjectAssetState(); assert.equal(uiFontFamily(font.relPath), removed);
  } finally { globalThis.fetch = previousFetch; resetProjectAssetState(); resetUiFontFaceCacheForTests(); }
});

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
