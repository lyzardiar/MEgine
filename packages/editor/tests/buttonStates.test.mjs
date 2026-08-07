import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (name) => fs.readFileSync(path.join(root, 'src', 'panels', name), 'utf8');

test('shared button states preserve authored colors and expose active workbench modes', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const hover = styles.match(/button:hover:not\(:disabled\) \{([^}]*)\}/s)?.[1] ?? '';
  const active = styles.match(/button:active:not\(:disabled\) \{([^}]*)\}/s)?.[1] ?? '';
  assert.match(hover, /filter: brightness\(1\.12\)/);
  assert.doesNotMatch(hover, /background:|border-color:/);
  assert.match(active, /filter: brightness\(0\.88\)/);
  assert.doesNotMatch(active, /background:/);

  const toolbar = source('ToolBar.tsx');
  assert.match(toolbar, /role="toolbar" aria-label="Scene tools"/);
  assert.equal(toolbar.match(/aria-pressed=\{props\.gizmo ===/g)?.length, 4);

  const project = source('Project.tsx');
  assert.match(project, /aria-pressed=\{viewMode === 'grid'\}/);
  assert.match(project, /aria-pressed=\{viewMode === 'list'\}/);

  const profiler = source('Profiler.tsx');
  assert.match(profiler, /aria-pressed=\{frozen\}/);
  assert.match(profiler, /aria-pressed=\{!frozen && selectedTimestamp == null\}/);
});
