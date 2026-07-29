import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

test('Edit menu exposes the complete scene editing command set', () => {
  const menu = source(path.join('panels', 'MenuBar.tsx'));

  assert.match(menu, /Cut <span className="hint">Ctrl\+X<\/span>/);
  assert.match(menu, /Copy <span className="hint">Ctrl\+C<\/span>/);
  assert.match(menu, /Paste <span className="hint">Ctrl\+V<\/span>/);
  assert.match(menu, /Duplicate <span className="hint">Ctrl\+D<\/span>/);
  assert.match(menu, /Delete <span className="hint">Del<\/span>/);
  assert.match(menu, /Select All <span className="hint">Ctrl\+A<\/span>/);
  assert.match(menu, /disabled=\{!props\.store\.canPaste\}/);
  assert.equal(menu.match(/disabled=\{!canEditSelection\}/g)?.length, 3);
});

test('scene clipboard capabilities reject empty and play-mode mutations', () => {
  const store = source('store.ts');
  const hierarchyMenu = source(path.join('panels', 'HierarchyContextMenu.tsx'));

  assert.match(
    store,
    /get canPaste\(\) \{\s*return mode === 'edit' && \(clipboard\?\.roots\.length \?\? 0\) > 0;/,
  );
  assert.match(
    store,
    /copySelection\(\) \{[\s\S]*?if \(!roots\.length\) return false;[\s\S]*?clipboard = \{ roots: payload, cut: false \};[\s\S]*?return true;/,
  );
  assert.match(
    store,
    /cutSelection\(\) \{\s*if \(mode !== 'edit' \|\| !this\.copySelection\(\) \|\| !clipboard\) return false;/,
  );
  assert.match(
    store,
    /paste\(\) \{\s*if \(!clipboard\?\.roots\.length \|\| mode !== 'edit'\) return false;/,
  );
  assert.match(
    hierarchyMenu,
    /disabled=\{!props\.menuContext\.store\.canPaste\}/,
  );
  assert.equal(hierarchyMenu.match(/disabled=\{!canEditSelection\}/g)?.length, 3);
});
