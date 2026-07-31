import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const dock = readFileSync(new URL('../src/panels/DockWorkspace.tsx', import.meta.url), 'utf8');

test('desktop entry defers the project workspace without deferring Agent transport', () => {
  assert.doesNotMatch(main, /import\s+\{\s*App\s*\}\s+from\s+['"]\.\/App['"]/);
  assert.match(main, /const App = lazy\(async \(\) => \(\{ default: \(await import\('\.\/App'\)\)\.App \}\)\);/);
  const attach = main.indexOf('void attachBridgeTransport()');
  const render = main.indexOf('createRoot(document.getElementById');
  assert.ok(attach >= 0 && render > attach, 'Agent transport must attach before React renders the project gate');
  assert.match(main, /<Suspense fallback=\{<div className="editor-app-loading" role="status">/);
});

test('base Dock panels load through the existing per-panel Suspense boundary', () => {
  for (const panel of ['Hierarchy', 'Inspector', 'Console', 'Viewport']) {
    assert.doesNotMatch(app, new RegExp(`import\\s+\\{\\s*${panel}\\s*\\}\\s+from\\s+['"]\\.\\/panels\\/${panel}['"]`));
    assert.match(app, new RegExp(`const ${panel} = lazy\\(async \\(\\) =>`));
  }
  assert.match(dock, /<Suspense fallback=\{<div className="dock-panel-loading">/);
});
