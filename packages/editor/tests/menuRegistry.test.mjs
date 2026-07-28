import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMenuItem,
  registerMenuItem,
} from '../src/editorWindow/registry.ts';

test('menu registration fails closed for Agent invocation and replacement actions', () => {
  const path = 'Tests/Agent Safety Contract';
  const unregisterInitial = registerMenuItem(path, () => undefined);
  assert.equal(findMenuItem(path)?.agentInvokable, false);
  assert.equal(findMenuItem(path)?.agentAlternative, undefined);

  const unregisterSafe = registerMenuItem(path, () => undefined, {
    agentInvokable: true,
    agentAlternative: 'safe_tool',
  });
  assert.equal(findMenuItem(path)?.agentInvokable, true);
  assert.equal(findMenuItem(path)?.agentAlternative, 'safe_tool');

  const unregisterReplacement = registerMenuItem(path, () => undefined);
  assert.equal(findMenuItem(path)?.agentInvokable, false);
  assert.equal(findMenuItem(path)?.agentAlternative, undefined);

  unregisterReplacement();
  unregisterSafe();
  unregisterInitial();
});
