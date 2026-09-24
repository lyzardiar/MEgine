// Author: MiYu
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { playbackShortcut } from '../src/editorPlayback.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('playback shortcuts distinguish play, pause, and step without repeats or IME', () => {
  const event = { key: 'p', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, repeat: false, isComposing: false };
  assert.equal(playbackShortcut(event), 'toggle');
  assert.equal(playbackShortcut({ ...event, ctrlKey: false, metaKey: true, key: 'P' }), 'toggle');
  assert.equal(playbackShortcut({ ...event, shiftKey: true }), 'pause');
  assert.equal(playbackShortcut({ ...event, altKey: true }), 'step');
  for (const overrides of [{ repeat: true }, { isComposing: true }, { ctrlKey: false }, { key: 'w' }, { shiftKey: true, altKey: true }]) {
    assert.equal(playbackShortcut({ ...event, ...overrides }), null);
  }
});

test('toolbar and shortcuts share tested store transitions and restore authored state', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const { applyPlaybackAction } = await server.ssrLoadModule('/src/editorPlayback.ts');
    const { ToolBar } = await server.ssrLoadModule('/src/panels/ToolBar.tsx');
    const store = createEditorStore();
    const original = structuredClone(store.authoredEntities());
    const markup = () => renderToStaticMarkup(createElement(ToolBar, { mode: store.mode, gizmo: 'translate', pivotMode: 'pivot', handleOrientation: 'global' }));
    assert.match(markup(), /aria-label="Enter Play Mode" aria-pressed="false"/);
    assert.match(markup(), /aria-label="Step one frame"[^>]*disabled=""/);
    assert.equal(applyPlaybackAction(store, 'step'), false);
    assert.equal(applyPlaybackAction(store, 'pause'), false);
    assert.equal(applyPlaybackAction(store, 'toggle'), true);
    assert.equal(store.mode, 'play');
    assert.match(markup(), /aria-label="Exit Play Mode" aria-pressed="true"/);
    assert.doesNotMatch(markup(), /aria-label="Step one frame"[^>]*disabled/);
    const frame = store.snapshot().frame;
    assert.equal(applyPlaybackAction(store, 'step'), true);
    assert.equal(store.mode, 'pause');
    assert.equal(store.snapshot().frame, frame + 1);
    assert.match(markup(), /aria-label="Resume Play Mode"/);
    assert.equal(applyPlaybackAction(store, 'step'), true);
    assert.equal(store.snapshot().frame, frame + 2);
    applyPlaybackAction(store, 'pause');
    assert.equal(store.mode, 'play');
    applyPlaybackAction(store, 'pause');
    assert.equal(store.mode, 'pause');
    applyPlaybackAction(store, 'toggle');
    assert.equal(store.mode, 'edit');
    assert.deepEqual(store.snapshot().entities, original);
  } finally {
    await server.close();
  }
});
