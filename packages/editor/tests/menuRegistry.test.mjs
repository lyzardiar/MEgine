import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMenuItem,
  registerMenuItem,
  registerMenuItemValidator,
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

test('menu replacement disposal restores only registrations that are still active', () => {
  const path = 'Tests/Replacement Stack';
  const calls = [];
  const unregisterBase = registerMenuItem(path, () => calls.push('base'));
  const unregisterMiddle = registerMenuItem(path, () => calls.push('middle'));
  const unregisterTop = registerMenuItem(path, () => calls.push('top'));

  findMenuItem(path)?.action({});
  unregisterMiddle();
  unregisterTop();
  findMenuItem(path)?.action({});
  unregisterBase();

  assert.deepEqual(calls, ['top', 'base']);
  assert.equal(findMenuItem(path), null);
});

test('independent menu validators compose as a stack and restore declared validation', () => {
  const path = 'Tests/Validator Stack';
  const declared = () => true;
  const first = () => false;
  const second = () => true;
  const unregisterMenu = registerMenuItem(path, () => undefined, { validate: declared });
  const unregisterFirst = registerMenuItemValidator(path, first);
  const unregisterSecond = registerMenuItemValidator(path, second);

  assert.equal(findMenuItem(path)?.validate, second);
  unregisterFirst();
  assert.equal(findMenuItem(path)?.validate, second);
  unregisterSecond();
  assert.equal(findMenuItem(path)?.validate, declared);

  unregisterMenu();
});
