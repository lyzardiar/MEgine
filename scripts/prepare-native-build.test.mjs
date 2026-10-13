import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ensureJunction, inspectRuntime } from './prepare-native-build.mjs';

test('V8 build junction is reusable and never replaces an unrelated directory', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'mengine-v8-link-'));
  try {
    const source = join(root, 'registry');
    mkdirSync(source);
    writeFileSync(join(source, 'marker'), 'registry');
    const link = join(root, 'target', 'debug', 'gn_root');
    ensureJunction(link, source);
    ensureJunction(link, source);
    assert.equal(readFileSync(join(link, 'marker'), 'utf8'), 'registry');
    const unrelated = join(root, 'unrelated');
    mkdirSync(unrelated);
    writeFileSync(join(unrelated, 'keep'), 'keep');
    assert.throws(() => ensureJunction(unrelated, source), /another source/);
    assert.equal(readFileSync(join(unrelated, 'keep'), 'utf8'), 'keep');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('SDK rejects executables without the runtime identity command', () => {
  assert.throws(() => inspectRuntime(process.execPath), /failed/);
});
