import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = fs.readFileSync(path.join(root, 'src', 'store.ts'), 'utf8');
const commands = fs.readFileSync(path.join(root, 'src', 'agent', 'commands.ts'), 'utf8');

test('playback blocks scene history without blocking resource-document history', () => {
  assert.match(
    store,
    /return undoService\.canUndo && \(mode === 'edit' \|\| undoService\.undoScope !== 'scene'\)/,
  );
  assert.match(
    store,
    /return undoService\.canRedo && \(mode === 'edit' \|\| undoService\.redoScope !== 'scene'\)/,
  );
  assert.match(
    store,
    /undo\(\) \{\s*if \(!this\.canUndo\) return false;\s*return undoService\.undo\(\);/,
  );
  assert.match(
    store,
    /redo\(\) \{\s*if \(!this\.canRedo\) return false;\s*return undoService\.redo\(\);/,
  );
});

test('Agent history commands report scene playback restores as read-only', () => {
  assert.match(
    commands,
    /'history\.undo': \(ctx\) => \{\s*if \(ctx\.store\.mode !== 'edit' && ctx\.store\.undoScope === 'scene'\) \{\s*throw new BridgeError\('READONLY', 'Stop playback before undoing a scene edit'\);/,
  );
  assert.match(
    commands,
    /'history\.redo': \(ctx\) => \{\s*if \(ctx\.store\.mode !== 'edit' && ctx\.store\.redoScope === 'scene'\) \{\s*throw new BridgeError\('READONLY', 'Stop playback before redoing a scene edit'\);/,
  );
});
