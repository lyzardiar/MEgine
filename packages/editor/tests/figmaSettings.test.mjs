import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root: editorRoot,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const { normalizeFigmaBridgePreferences } = await server.ssrLoadModule('/src/figmaSettings.ts');
test.after(() => server.close());

test('Figma settings normalize bounded import defaults without accepting secrets or traversal', () => {
  assert.deepEqual(normalizeFigmaBridgePreferences({
    assetFolder: 'Assets/UI Imports',
    maxNodes: 400,
    imageScale: 3,
    componentMappings: {
      '20:30': 'button',
      'bad id': 'toggle',
      '40:50': 'unknown',
    },
  }), {
    assetFolder: 'Assets/UI Imports',
    maxNodes: 400,
    imageScale: 3,
    componentMappings: { '20:30': 'button' },
  });
  assert.deepEqual(normalizeFigmaBridgePreferences({
    assetFolder: 'Assets/../Secrets',
    maxNodes: 10_000,
    imageScale: 9,
  }), {
    assetFolder: 'Assets/Figma',
    maxNodes: 1000,
    imageScale: 1,
    componentMappings: {},
  });
});

test('Figma settings are a registered top-menu window and never render a token input', () => {
  const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'editorWindow', 'windows', 'FigmaSettingsWindow.tsx'),
    'utf8',
  );
  const index = fs.readFileSync(
    path.join(editorRoot, 'src', 'editorWindow', 'index.ts'),
    'utf8',
  );
  assert.match(source, /registerMenuItem\('Window\/Figma Settings'/u);
  assert.match(source, /registerEditorWindowType\('EditorWindow\.FigmaSettingsWindow'/u);
  assert.match(source, /requiresProject: false/u);
  assert.doesNotMatch(source, /type=["']password["']/u);
  assert.match(source, /FIGMA_ACCESS_TOKEN/u);
  assert.match(index, /windows\/FigmaSettingsWindow/u);
});
