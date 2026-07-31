import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EDITOR_JAVASCRIPT_CHUNK_BUDGET_BYTES,
  editorChunkBudgetViolations,
  editorChunkName,
} from '../vite/chunkStrategy.ts';

test('editor chunk strategy isolates stable runtimes on Windows and POSIX paths', () => {
  assert.equal(
    editorChunkName('G:\\repo\\node_modules\\.pnpm\\react@19.0.0\\node_modules\\react\\index.js'),
    'react-runtime',
  );
  assert.equal(
    editorChunkName('/repo/node_modules/.pnpm/@tauri-apps+api/node_modules/@tauri-apps/api/core.js'),
    'tauri-runtime',
  );
  assert.equal(
    editorChunkName('/repo/node_modules/@esotericsoftware/spine-canvas/dist/index.js'),
    'spine-runtime',
  );
  assert.equal(editorChunkName('/repo/packages/editor/src/App.tsx'), undefined);
});

test('editor chunk budget reports every oversized JavaScript chunk deterministically', () => {
  assert.equal(EDITOR_JAVASCRIPT_CHUNK_BUDGET_BYTES, 500_000);
  assert.deepEqual(editorChunkBudgetViolations([
    { fileName: 'small.js', bytes: 499_999 },
    { fileName: 'exact.js', bytes: 500_000 },
    { fileName: 'second.js', bytes: 500_001 },
    { fileName: 'largest.js', bytes: 700_000 },
  ]), [
    { fileName: 'largest.js', bytes: 700_000 },
    { fileName: 'second.js', bytes: 500_001 },
  ]);
  assert.deepEqual(editorChunkBudgetViolations([
    { fileName: 'invalid.js', bytes: Number.NaN },
    { fileName: 'one.js', bytes: 1 },
  ], Number.NaN), [
    { fileName: 'one.js', bytes: 1 },
  ]);
});
