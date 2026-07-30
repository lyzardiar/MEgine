import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const menu = fs.readFileSync(path.join(root, 'src', 'panels', 'MenuBar.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');

test('scene and project file actions are unavailable during playback', () => {
  assert.match(menu, /const canUseFileActions = props\.store\.mode === 'edit'/);
  assert.equal(
    [...menu.matchAll(/disabled=\{!canUseFileActions\}/g)].length,
    6,
  );
  for (const label of [
    'New Scene',
    'Save Scene',
    'Save All',
    'Save Scene As',
    'Open Scene',
    'Close Project',
  ]) {
    assert.match(menu, new RegExp(`disabled=\\{!canUseFileActions\\}[\\s\\S]*?${label}`));
  }
});

test('stale callbacks and shortcuts cannot bypass the playback file-action guard', () => {
  assert.match(
    app,
    /const ensureEditModeForFileAction = \(action: string\): boolean => \{\s*if \(store\.mode === 'edit'\) return true;/,
  );
  for (const [functionName, action] of [
    ['saveSceneForBuild', 'saving a scene for a build'],
    ['saveScene', 'saving a scene'],
    ['saveEverything', 'saving the workspace'],
    ['saveSceneAs', 'saving a scene'],
    ['newScene', 'creating a scene'],
    ['requestProjectClose', 'closing the project'],
    ['openSceneDialog', 'opening a scene'],
  ]) {
    assert.match(
      app,
      new RegExp(
        `const ${functionName} = async[\\s\\S]*?if \\(!ensureEditModeForFileAction\\('${action}'\\)\\) return`,
      ),
    );
  }
});
