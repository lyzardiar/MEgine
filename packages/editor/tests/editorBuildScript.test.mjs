import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('editor EXE packaging keeps release compilation parallel and incremental', () => {
  const script = fs.readFileSync(path.join(repoRoot, 'scripts', 'build-editor-exe.cmd'), 'utf8');

  assert.match(script, /CARGO_BUILD_JOBS=!MENGINE_BUILD_JOBS!/);
  assert.match(script, /CARGO_INCREMENTAL=1/);
  assert.match(script, /CARGO_PROFILE_RELEASE_LTO=thin/);
  assert.match(script, /CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16/);
});
