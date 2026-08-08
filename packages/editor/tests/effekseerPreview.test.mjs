import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = fs.readFileSync(path.join(root, 'src', 'panels', 'EffekseerPreview.tsx'), 'utf8');

test('Effekseer preview uses visible, back-pressured 60 FPS polling', () => {
  assert.match(preview, /const PLAYING_FRAME_INTERVAL_MS = 16/);
  assert.match(preview, /if \(cancelled \|\| request\.inFlight\) return/);
  assert.match(preview, /stage\.clientWidth < 2 \|\| stage\.clientHeight < 2/);
  assert.match(preview, /playing \? PLAYING_FRAME_INTERVAL_MS : IDLE_FRAME_INTERVAL_MS/);
  assert.doesNotMatch(preview, /playing \? 80 : 300/);
});
