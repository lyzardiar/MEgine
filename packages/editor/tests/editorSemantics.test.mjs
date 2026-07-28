import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panel = (name) => fs.readFileSync(path.join(root, 'src', 'panels', name), 'utf8');

test('core editor navigation exposes named semantic controls', () => {
  const project = panel('Project.tsx');
  const hierarchy = panel('Hierarchy.tsx');
  const menu = panel('MenuBar.tsx');

  assert.match(project, /role="tree" aria-label="Project folders"/);
  assert.match(project, /role="treeitem"/);
  assert.match(project, /aria-label=\{f\}/);
  assert.match(project, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(project, /aria-label=\{`\$\{folder\} contents`\}/);

  assert.match(hierarchy, /role="tree"/);
  assert.match(hierarchy, /aria-label="Scene hierarchy"/);
  assert.match(hierarchy, /role="treeitem"/);
  assert.match(hierarchy, /aria-label=\{n\.entity\.name \?\? `Entity \$\{id\}`\}/);
  assert.match(hierarchy, /aria-level=\{n\.depth \+ 1\}/);
  assert.match(hierarchy, /if \(event\.target !== event\.currentTarget\) return/);
  assert.match(hierarchy, /event\.key === 'F2'/);

  assert.match(menu, /role="menubar" aria-label="Main menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open === name\}/);
});

test('complex authoring rows identify their selectable semantic regions', () => {
  const animator = panel('Animator.tsx');
  const sequencer = panel('Sequencer.tsx');

  assert.match(animator, /aria-label=\{`Animator state \$\{state\.name\}`\}/);
  assert.match(animator, /aria-label=\{`Blend tree for \$\{state\.name\}`\}/);
  assert.match(animator, /aria-label=\{`Transition \$\{transition\.from\} to \$\{transition\.to\}`\}/);
  assert.match(sequencer, /aria-label=\{`\$\{group\.name\} group lane`\}/);
  assert.match(sequencer, /aria-label=\{`\$\{track\.name\} \$\{track\.type\} lane`\}/);
});
