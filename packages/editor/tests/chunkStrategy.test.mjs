import assert from 'node:assert/strict';
import test from 'node:test';
import { editorChunkName } from '../vite/chunkStrategy.ts';

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
