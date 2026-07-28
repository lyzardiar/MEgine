import assert from 'node:assert/strict';
import test from 'node:test';
import { dockPanelShouldMount } from '../src/dockPanelMounting.ts';
import { listMenuItems } from '../src/editorWindow/registry.ts';

await import('../src/editorWindow/assetMenuItems.ts');

test('Dock defers unseen panels and preserves panels after their first activation', () => {
  const visited = new Set(['project']);
  assert.equal(dockPanelShouldMount('project', 'project', visited), true);
  assert.equal(dockPanelShouldMount('timeline', 'project', visited), false);
  assert.equal(dockPanelShouldMount('timeline', 'timeline', visited), true);
  visited.add('timeline');
  assert.equal(dockPanelShouldMount('timeline', 'project', visited), true);
  assert.equal(dockPanelShouldMount('scene', 'game', new Set(['scene'])), false);
});

test('deferred asset editor modules keep every Assets/Create command registered', () => {
  const items = listMenuItems('Assets');
  for (const path of [
    'Assets/Create/Material',
    'Assets/Create/Material Instance',
    'Assets/Create/Surface Shader',
    'Assets/Create/Animation Clip',
    'Assets/Create/Animator Controller',
    'Assets/Create/Sprite Atlas',
    'Assets/Create/Avatar Mask',
    'Assets/Create/Timeline',
  ]) {
    const item = items.find((candidate) => candidate.path === path);
    assert.ok(item, `${path} is missing`);
    assert.equal(item.agentInvokable, false);
    assert.equal(item.agentAlternative, 'create_asset');
  }
});
