import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolbar = fs.readFileSync(path.join(root, 'src', 'panels', 'ToolBar.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');

test('playback toolbar exposes only valid state transitions', () => {
  assert.match(
    toolbar,
    /aria-label="Enter Play Mode"[\s\S]*?aria-pressed=\{props\.mode !== 'edit'\}[\s\S]*?disabled=\{props\.mode !== 'edit'\}/,
  );
  assert.match(
    toolbar,
    /aria-label=\{props\.mode === 'pause' \? 'Resume Play Mode' : 'Pause Play Mode'\}[\s\S]*?aria-pressed=\{props\.mode === 'pause'\}[\s\S]*?disabled=\{props\.mode === 'edit'\}/,
  );
  assert.match(
    toolbar,
    /aria-label="Exit Play Mode"[\s\S]*?disabled=\{props\.mode === 'edit'\}/,
  );
  assert.match(
    toolbar,
    /aria-label="Step one frame"[\s\S]*?disabled=\{props\.mode !== 'pause'\}/,
  );
});

test('playback callbacks reject stale or impossible toolbar actions', () => {
  assert.match(
    app,
    /onPlay=\{\(\) => \{\s*if \(store\.mode !== 'edit'\) return;\s*store\.play\(\);/,
  );
  assert.match(
    app,
    /onPause=\{\(\) => \{\s*if \(store\.mode === 'edit'\) return;\s*store\.pause\(\);/,
  );
  assert.match(
    app,
    /onStop=\{\(\) => \{\s*if \(store\.mode === 'edit'\) return;\s*store\.stop\(\);/,
  );
});
