import assert from 'node:assert/strict';
import test from 'node:test';
import {
  componentRequirements,
  createComponentDefaults,
} from '../src/componentCatalog.ts';
import { getBuiltinInspectorField } from '../src/inspectorMetadata.ts';
import '../src/editorWindow/componentMenuItems.ts';
import { findMenuItem } from '../src/editorWindow/registry.ts';

test('Mask defaults, requirements, Inspector, and Component menu match Unity authoring', () => {
  assert.deepEqual(createComponentDefaults('Mask'), {
    enabled: true,
    show_mask_graphic: true,
  });
  assert.deepEqual(componentRequirements('Mask'), ['RectTransform', 'Transform']);
  assert.equal(
    getBuiltinInspectorField('Mask', 'show_mask_graphic')?.label,
    'Show Mask Graphic',
  );
  assert.ok(findMenuItem('Component/UI/Layout/Mask'));
});
