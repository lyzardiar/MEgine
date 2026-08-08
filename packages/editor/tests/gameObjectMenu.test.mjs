import assert from 'node:assert/strict';
import test from 'node:test';
import '../src/editorWindow/gameObjectMenuItems.ts';
import { listMenuItems } from '../src/editorWindow/registry.ts';

function menuContext(mode) {
  return {
    source: 'agent',
    store: { mode },
    selectedIds: [],
    contextEntity: null,
    refresh: () => undefined,
    log: () => undefined,
  };
}

test('GameObject creation menus are Edit Mode only and route Agents to result-bearing tools', () => {
  const items = listMenuItems('GameObject');
  assert.ok(items.length > 20);

  for (const item of items) {
    if (!item.path.startsWith('GameObject/')) continue;
    assert.equal(item.validate?.(menuContext('edit')), true, `${item.path} should work in Edit Mode`);
    assert.equal(item.validate?.(menuContext('play')), false, `${item.path} should stop in Play Mode`);
    assert.equal(item.agentInvokable, false, `${item.path} should not return generic menu success`);
    assert.equal(
      item.agentAlternative,
      item.path === 'GameObject/Create Empty Child' ? 'create_gameobject' : 'create_typed',
    );
  }

  const paths = new Set(items.map((item) => item.path));
  for (const path of [
    'GameObject/UI/Spine Skeleton',
    'GameObject/UI/Effekseer Effect',
    'GameObject/UI/Layout/Horizontal Layout Group',
    'GameObject/UI/Layout/Vertical Layout Group',
    'GameObject/UI/Layout/Grid Layout Group',
    'GameObject/UI/Templates/Inventory',
    'GameObject/UI/Templates/Leaderboard',
    'GameObject/UI/Templates/Shop',
  ]) assert.equal(paths.has(path), true, `${path} should be registered`);
});
