import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  desktopScriptAssets,
  vscodeFileUri,
} from '../src/scriptLibraryModel.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('desktop scripts come only from the active native project index', () => {
  const scripts = desktopScriptAssets('D:\\Games\\Current Project', [
    {
      name: 'Nested.ts',
      folder: 'Assets\\Scripts\\Gameplay',
      relPath: 'Assets\\Scripts\\Gameplay\\Nested.ts',
      kind: 'script',
    },
    {
      name: 'Main.ts',
      folder: 'Assets/Scripts',
      relPath: 'Assets/Scripts/Main.ts',
      kind: 'script',
    },
    {
      name: 'mengine.d.ts',
      folder: 'Assets/Scripts',
      relPath: 'Assets/Scripts/mengine.d.ts',
      kind: 'script',
    },
    {
      name: 'index.ts',
      folder: 'Assets/Scripts',
      relPath: 'Assets/Scripts/index.ts',
      kind: 'script',
    },
    {
      name: 'Other.ts',
      folder: 'Assets/Scripts',
      relPath: '../Other.ts',
      kind: 'script',
    },
    {
      name: 'Texture.png',
      folder: 'Assets/Sprites',
      relPath: 'Assets/Sprites/Texture.png',
      kind: 'texture',
    },
  ]);

  assert.deepEqual(scripts, [
    {
      id: 'project/Assets/Scripts/Main.ts',
      name: 'Main.ts',
      folder: 'Assets/Scripts',
      absPath: 'D:\\Games\\Current Project\\Assets\\Scripts\\Main.ts',
    },
    {
      id: 'project/Assets/Scripts/Gameplay/Nested.ts',
      name: 'Nested.ts',
      folder: 'Assets/Scripts/Gameplay',
      absPath: 'D:\\Games\\Current Project\\Assets\\Scripts\\Gameplay\\Nested.ts',
    },
  ]);
});

test('script IDE URIs preserve drive roots and encode reserved path characters', () => {
  assert.equal(
    vscodeFileUri('D:\\Games\\Current Project\\Assets\\Scripts\\Agent#One.ts'),
    'vscode://file/D:/Games/Current%20Project/Assets/Scripts/Agent%23One.ts:1',
  );
  assert.equal(vscodeFileUri('Assets/Scripts/Main.ts'), null);
});

test('desktop script refresh is wired to the active native project', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'scriptLibrary.ts'), 'utf8');
  assert.match(source, /if \(isDesktopEditor\(\)\)/);
  assert.match(source, /invoke<ProjectSnapshot>\('get_project_snapshot'\)/);
  assert.match(source, /invoke<IndexedScriptAsset\[]>\('list_project_assets'\)/);
  assert.match(source, /desktopScriptAssets\(project\.projectRoot, assets\)/);
  assert.match(source, /candidate\.id === script\.id/);
  assert.match(source, /const res = await fetch\(`\$\{API\}\/scripts`\)/);
});
