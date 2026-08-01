import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENT_NAMES } from '@mengine/api';
import * as behaviour from '@mengine/behaviour';

test('Behaviour SDK publicly exports every built-in component token', () => {
  assert.deepEqual(Object.keys(behaviour.BUILTIN_COMPONENT_TYPES), COMPONENT_NAMES);
  for (const typeName of COMPONENT_NAMES) {
    const exportName =
      typeName === 'Button'
        ? 'UIButton'
        : typeName === 'ProgressBar'
          ? 'UIProgressBar'
          : typeName;
    const componentType = behaviour[exportName];
    assert.equal(
      typeof componentType,
      'function',
      `${exportName} must be importable from @mengine/behaviour`,
    );
    assert.equal(componentType.typeName, typeName);
    assert.equal(behaviour.componentTypeName(componentType), typeName);
    assert.equal(behaviour.BUILTIN_COMPONENT_TYPES[typeName], componentType);
  }
});

test('the Button decorator remains distinct from the UIButton component token', () => {
  assert.equal(typeof behaviour.Button, 'function');
  assert.equal(behaviour.UIButton.typeName, 'Button');
  assert.notEqual(behaviour.Button, behaviour.UIButton);
  assert.equal(typeof behaviour.ProgressBar, 'function');
  assert.equal(behaviour.UIProgressBar.typeName, 'ProgressBar');
  assert.notEqual(behaviour.ProgressBar, behaviour.UIProgressBar);
});
