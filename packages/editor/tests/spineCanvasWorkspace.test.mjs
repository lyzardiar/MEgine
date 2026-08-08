import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewport = readFileSync(join(root, 'src', 'panels', 'Viewport.tsx'), 'utf8');

test('secondary Canvas artboards do not cache an asynchronous Spine loading frame', () => {
  assert.match(viewport, /if \(result === 'loading'\) ready = false/);
  assert.match(viewport, /let customRenderersReady = true/);
  assert.match(
    viewport,
    /if \(customRenderersReady\) \{\s*secondaryArtboardCacheRef\.current\.set\(frame\.key, drawable\)/,
  );
});
