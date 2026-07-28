import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProjectTextAssetPath,
  readProjectAssetBytesWithRevision,
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
