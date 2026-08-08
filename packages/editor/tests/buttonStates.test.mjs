import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (name) => fs.readFileSync(path.join(root, 'src', 'panels', name), 'utf8');

test('shared button states preserve authored colors and expose active workbench modes', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const base = styles.match(/button \{([^}]*)\}/s)?.[1] ?? '';
  const hover = styles.match(/button:hover:not\(:disabled\) \{([^}]*)\}/s)?.[1] ?? '';
  const active = styles.match(/button:active:not\(:disabled\) \{([^}]*)\}/s)?.[1] ?? '';
  assert.match(base, /background: #3b3b3b/);
  assert.doesNotMatch(base, /linear-gradient/);
  assert.doesNotMatch(hover, /filter:/);
  assert.match(hover, /box-shadow: inset 0 0 0 999px/);
  assert.match(hover, /border-color:/);
  assert.doesNotMatch(active, /filter:/);
  assert.doesNotMatch(active, /background:/);

  const toolbar = source('ToolBar.tsx');
  assert.match(toolbar, /role="toolbar" aria-label="Scene tools"/);
  assert.equal(toolbar.match(/aria-pressed=\{props\.gizmo ===/g)?.length, 4);

  const project = source('Project.tsx');
  assert.match(project, /aria-pressed=\{viewMode === 'grid'\}/);
  assert.match(project, /aria-pressed=\{viewMode === 'list'\}/);
  assert.match(project, /Drag Hierarchy objects here to create Prefabs/);

  const hierarchy = source('Hierarchy.tsx');
  assert.match(hierarchy, /drag the icon to Project to create a Prefab/);

  const profiler = source('Profiler.tsx');
  assert.match(profiler, /aria-pressed=\{frozen\}/);
  assert.match(profiler, /aria-pressed=\{!frozen && selectedTimestamp == null\}/);

  const hierarchyControls = styles.match(/\.hier-scene-control \{([^}]*)\}/s)?.[1] ?? '';
  assert.match(hierarchyControls, /opacity: 0;/);
  assert.match(styles, /\.hier-row:hover \.hier-scene-control,\s*\.hier-row:focus-within \.hier-scene-control,\s*\.hier-scene-control\.active \{\s*opacity: 1;/s);
});
