import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProjectTextAssetPath,
  projectAssetHasExternalWriteConflict,
  readProjectAssetBytesWithRevision,
  refreshProjectFiles,
  resetProjectAssetState,
  writeProjectAssetText,
} from '../src/projectAssets.ts';

test('agent text I/O accepts source assets and rejects binary formats', () => {
  assert.equal(isProjectTextAssetPath('Assets/Scripts/example.ts'), true);
  assert.equal(isProjectTextAssetPath('Assets/Models/example.gltf'), true);
  assert.equal(isProjectTextAssetPath('Assets/Models/example.glb'), false);
  assert.equal(isProjectTextAssetPath('Assets/Textures/example.png'), false);
});

test('agent text reads return the revision captured with the response body', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('same-read', {
    status: 200,
    headers: { 'X-MEngine-Asset-Revision': 'read-revision' },
  });

  try {
    const result = await readProjectAssetBytesWithRevision('Assets/Scripts/example.ts');
    assert.equal(new TextDecoder().decode(result.contents), 'same-read');
    assert.equal(result.revision, 'read-revision');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('agent text writes forward an explicit optimistic-lock revision', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ revision: 'next-revision', asset: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await writeProjectAssetText('Assets/Scripts/example.ts', 'export {};\n', 'current-revision');
    await writeProjectAssetText('Assets/Scripts/new.ts', '', null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].init.headers['X-MEngine-Expected-Revision'],
    'current-revision',
  );
  assert.equal(
    requests[1].init.headers['X-MEngine-Expected-Revision'],
    '__missing__',
  );
});

test('explicit agent writes do not advance an open editor implicit write baseline', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let writeCount = 0;
  resetProjectAssetState();
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (!init.method) {
      return new Response('editor-opened', {
        status: 200,
        headers: { 'X-MEngine-Asset-Revision': 'editor-revision' },
      });
    }
    writeCount += 1;
    return new Response(JSON.stringify({
      revision: `write-revision-${writeCount}`,
      asset: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await readProjectAssetBytesWithRevision('Assets/Scripts/example.ts');
    await writeProjectAssetText(
      'Assets/Scripts/example.ts',
      'agent update\n',
      'editor-revision',
    );
    await writeProjectAssetText('Assets/Scripts/example.ts', 'stale editor update\n');
  } finally {
    globalThis.fetch = originalFetch;
    resetProjectAssetState();
  }

  assert.equal(
    requests[1].init.headers['X-MEngine-Expected-Revision'],
    'editor-revision',
  );
  assert.equal(
    requests[2].init.headers['X-MEngine-Expected-Revision'],
    'editor-revision',
  );
});

test('incidental reads preserve an editor baseline until an intentional reload', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  let revision = 'editor-revision';
  resetProjectAssetState();
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/__mengine/assets')) {
      return new Response(JSON.stringify({
        assets: [{
          id: 'Assets/Scripts/example.ts',
          guid: '0123456789abcdef0123456789abcdef',
          name: 'example.ts',
          folder: 'Assets/Scripts',
          relPath: 'Assets/Scripts/example.ts',
          kind: 'script',
          revision,
          size: 1,
          metaStatus: 'ready',
          metaError: null,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!init.method) {
      return new Response(revision, {
        status: 200,
        headers: { 'X-MEngine-Asset-Revision': revision },
      });
    }
    writes.push(init.headers['X-MEngine-Expected-Revision']);
    return new Response(JSON.stringify({ revision: 'saved-revision', asset: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await readProjectAssetBytesWithRevision(
      'Assets/Scripts/example.ts',
      { replaceWriteBaseline: true },
    );
    await refreshProjectFiles();
    assert.equal(
      projectAssetHasExternalWriteConflict('Assets/Scripts/example.ts'),
      false,
    );

    revision = 'external-revision';
    await refreshProjectFiles();
    assert.equal(
      projectAssetHasExternalWriteConflict('Assets/Scripts/example.ts'),
      true,
    );

    await readProjectAssetBytesWithRevision('Assets/Scripts/example.ts');
    await writeProjectAssetText('Assets/Scripts/example.ts', 'stale editor contents');
    assert.equal(writes[0], 'editor-revision');
    assert.equal(
      projectAssetHasExternalWriteConflict('Assets/Scripts/example.ts'),
      true,
    );

    await readProjectAssetBytesWithRevision(
      'Assets/Scripts/example.ts',
      { replaceWriteBaseline: true },
    );
    await writeProjectAssetText('Assets/Scripts/example.ts', 'reloaded editor contents');
    assert.equal(writes[1], 'external-revision');
  } finally {
    globalThis.fetch = originalFetch;
    resetProjectAssetState();
  }
});
