import assert from 'node:assert/strict';
import test from 'node:test';

import { assignMaterialToComponents } from '../src/materialAssignment.ts';

test('material assignment atomically removes the per-renderer PBR override', () => {
  const components = {
    Transform: { position: [0, 0, 0] },
    MeshRenderer: { mesh: 'cube', material: 'default' },
    PbrMaterial: { metallic: 1 },
    MaterialPropertyBlock: { override_metallic: true, metallic: 0.25 },
  };
  const result = assignMaterialToComponents(components, 'Assets/Materials/Metal.mmat');

  assert.equal(result?.changed, true);
  assert.equal(result?.removedOverride, true);
  assert.deepEqual(result?.components.MeshRenderer, {
    mesh: 'cube',
    material: 'Assets/Materials/Metal.mmat',
  });
  assert.equal(Object.hasOwn(result?.components ?? {}, 'PbrMaterial'), false);
  assert.deepEqual(result?.components.MaterialPropertyBlock, {
    override_metallic: true,
    metallic: 0.25,
  });
  assert.equal(Object.hasOwn(components, 'PbrMaterial'), true);
});

test('material assignment can preserve the complete renderer edit in one undo step', () => {
  const result = assignMaterialToComponents(
    { MeshRenderer: { mesh: 'cube', material: 'default' } },
    'Assets/Materials/Paint.mmat',
    { mesh: 'sphere', material: 'Assets/Materials/Paint.mmat' },
  );
  assert.deepEqual(result?.components.MeshRenderer, {
    mesh: 'sphere',
    material: 'Assets/Materials/Paint.mmat',
  });
});

test('material assignment rejects entities without a MeshRenderer and detects no-ops', () => {
  assert.equal(assignMaterialToComponents({}, 'Assets/Materials/Paint.mmat'), null);
  const components = {
    MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Paint.mmat' },
  };
  const result = assignMaterialToComponents(components, 'Assets/Materials/Paint.mmat');
  assert.equal(result?.changed, false);
  assert.equal(result?.components, components);
});
