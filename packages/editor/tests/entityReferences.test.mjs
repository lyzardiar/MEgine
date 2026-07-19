import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_REFERENCE_FIELDS_KEY,
  ENTITY_REFERENCE_TOKEN,
  localizePrefabEntityReferences,
  parseSerializedEntityReference,
  remapComponentEntityReferences,
  resolvePrefabEntityReferences,
  validatePrefabEntityReferences,
} from '../src/entityReferences.ts';

const calls = () => ({
  Button: { on_click: { target: 2, component: 'Menu', method: 'Open' } },
  Toggle: { on_value_changed: { target: 99, component: 'Menu', method: 'Toggle' } },
  InputField: {
    on_submit: [
      { target: '2', component: 'Menu', method: 'Submit' },
      { target: null, component: '', method: '' },
    ],
  },
  OpenDoorBehaviour: {
    [ENTITY_REFERENCE_FIELDS_KEY]: ['door'],
    door: 99,
    speed: 2,
  },
});

test('clone remapping changes internal UI event references and preserves external ones', () => {
  const remapped = remapComponentEntityReferences(calls(), new Map([[2, 20]]));
  assert.equal(remapped.Button.on_click.target, 20);
  assert.equal(remapped.Toggle.on_value_changed.target, 99);
  assert.equal(remapped.InputField.on_submit[0].target, 20);
  assert.equal(remapped.OpenDoorBehaviour.door, 99);

  const multiRoot = remapComponentEntityReferences(calls(), new Map([[2, 20], [99, 990]]));
  assert.equal(multiRoot.Button.on_click.target, 20);
  assert.equal(multiRoot.OpenDoorBehaviour.door, 990);
});

test('Prefab references use stable node tokens and external scene ids become explicit missing refs', () => {
  const localized = localizePrefabEntityReferences(calls(), new Map([[2, 'child']]));
  assert.deepEqual(localized.Button.on_click.target, {
    [ENTITY_REFERENCE_TOKEN]: { kind: 'prefab_node', node: 'child' },
  });
  assert.deepEqual(localized.Toggle.on_value_changed.target, {
    [ENTITY_REFERENCE_TOKEN]: { kind: 'missing', entity: '99' },
  });
  assert.deepEqual(localized.OpenDoorBehaviour.door, {
    [ENTITY_REFERENCE_TOKEN]: { kind: 'missing', entity: '99' },
  });

  validatePrefabEntityReferences(localized, new Set(['root', 'child']));
  const resolved = resolvePrefabEntityReferences(localized, new Map([['child', 42]]));
  assert.equal(resolved.Button.on_click.target, 42);
  assert.deepEqual(parseSerializedEntityReference(resolved.Toggle.on_value_changed.target), {
    entity: null,
    missing: '99',
  });
});

test('Prefab validation rejects dangling node tokens and legacy raw ids cannot bind by collision', () => {
  const dangling = localizePrefabEntityReferences(calls(), new Map([[2, 'gone']]));
  assert.throws(
    () => validatePrefabEntityReferences(dangling, new Set(['root'])),
    /missing prefab node 'gone'/,
  );
  const legacy = resolvePrefabEntityReferences(calls(), new Map());
  assert.deepEqual(parseSerializedEntityReference(legacy.Button.on_click.target), {
    entity: null,
    missing: '2',
  });
  const malformed = calls();
  malformed.Button.on_click.target = {
    [ENTITY_REFERENCE_TOKEN]: { kind: 'prefab_node', node: '' },
  };
  assert.throws(
    () => validatePrefabEntityReferences(malformed, new Set(['root'])),
    /invalid serialized entity reference/,
  );
  const invalidMetadata = calls();
  invalidMetadata.OpenDoorBehaviour[ENTITY_REFERENCE_FIELDS_KEY] = ['door', 7];
  assert.throws(
    () => validatePrefabEntityReferences(invalidMetadata, new Set(['root'])),
    /contains an invalid field/,
  );
});
