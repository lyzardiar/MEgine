import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

test('Play mode creation APIs leave both live and authored scenes unchanged', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const store = createEditorStore();
    const authoredBefore = store.saveSceneJson('Creation Guard');
    const liveCount = store.snapshot().entities.length;

    store.play();
    assert.equal(store.createEmpty(null), null);
    assert.equal(store.createGameObject('Blocked', {}, null), null);
    assert.equal(store.createUiControl('Blocked UI', {}), null);
    assert.equal(store.ensureUiCanvas(), null);
    assert.equal(store.spawnUiCanvas(), null);
    assert.equal(store.spawnUiButton(), null);
    assert.equal(store.spawnSpriteAsset('white'), null);
    assert.equal(store.spawnGrid(), null);
    assert.equal(store.spawnTilemap(), null);
    assert.equal(store.spawnModel('Assets/Models/blocked.glb'), null);
    store.spawnPrefab('Cube');
    store.spawnCamera();
    store.spawnDirectionalLight();
    store.spawnParticleEmitter2D();
    assert.equal(store.newScene(), false);
    assert.equal(store.loadSceneJson('{"world":{"entities":[]}}'), false);
    assert.equal(store.replaceSceneWorldJson('{"world":{"entities":[]}}'), false);
    assert.equal(store.mode, 'play');
    assert.equal(store.snapshot().entities.length, liveCount);

    store.stop();
    assert.equal(store.saveSceneJson('Creation Guard'), authoredBefore);
    assert.equal(store.snapshot().entities.length, liveCount);
    assert.equal(store.canUndo, false);
  } finally {
    await server.close();
  }
});

test('all low-level GameObject creation stops before touching authored state in Play mode', () => {
  const store = source('store.ts');

  assert.match(
    store,
    /const spawnAt = \([\s\S]*?\): number \| null => \{\s*if \(mode !== 'edit'\) return null;/,
  );
  assert.match(
    store,
    /const instantiatePrefabInternal = \([\s\S]*?\): number \| null => \{\s*if \(mode !== 'edit'\) return null;/,
  );
  assert.match(
    store,
    /const ensureUiCanvasInternal = \(withUndo: boolean\): number \| null => \{\s*if \(mode !== 'edit'\) return null;/,
  );
  assert.match(
    store,
    /const spawnUiControl = \([\s\S]*?\): number \| null => \{\s*if \(mode !== 'edit'\) return null;/,
  );
});

test('sprite instantiation reports a rejected Play-mode creation instead of a fake entity id', () => {
  const app = source('App.tsx');

  assert.match(
    app,
    /const id = store\.spawnSpriteAsset\([\s\S]*?if \(id == null\) throw new Error\('Sprites can only be created in Edit mode'\);/,
  );
});
