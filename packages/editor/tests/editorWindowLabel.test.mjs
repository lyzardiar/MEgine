import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editorWindowLabelFor,
  editorWindowUrlFor,
} from '../src/editorWindow/editorWindowLabel.ts';

function legacyHashedLabel(typeId) {
  let hash = 2166136261;
  for (let index = 0; index < typeId.length; index += 1) {
    hash ^= typeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `editor-${(hash >>> 0).toString(16)}`;
}

test('native editor window labels preserve distinct extension type ids', () => {
  const first = 'EditorWindow.190e8mmm058z939ziq8';
  const second = 'EditorWindow.4srcmsnzshvn5rwv0m';

  assert.equal(legacyHashedLabel(first), legacyHashedLabel(second));
  assert.notEqual(editorWindowLabelFor(first), editorWindowLabelFor(second));
});

test('native editor window routes persist Agent ownership only when requested', () => {
  const typeId = 'EditorWindow.检查器';
  const foreground = new URL(editorWindowUrlFor(typeId), 'http://tauri.localhost');
  const agent = new URL(editorWindowUrlFor(typeId, true), 'http://tauri.localhost');

  assert.equal(foreground.searchParams.get('editorWindow'), typeId);
  assert.equal(foreground.searchParams.has('agentOwned'), false);
  assert.equal(agent.searchParams.get('editorWindow'), typeId);
  assert.equal(agent.searchParams.get('agentOwned'), 'true');
});

test('native editor window labels preserve UTF-8 identity with Tauri-safe characters', () => {
  const labels = [
    editorWindowLabelFor('EditorWindow.检查器'),
    editorWindowLabelFor('EditorWindow.e\u0301'),
    editorWindowLabelFor('EditorWindow.é'),
  ];

  assert.equal(new Set(labels).size, labels.length);
  for (const label of labels) {
    assert.match(label, /^editor-[A-Za-z0-9_-]+$/u);
  }
});
