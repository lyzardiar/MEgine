import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_CREATABLE_ASSET_KINDS,
  animatorDocumentKind,
  instantiableAssetTarget,
  isAgentCreatableAssetKind,
  materialDocumentKind,
  resourceEditorTarget,
} from '../src/agent/resourceTargets.ts';

function asset(relPath, kind) {
  return {
    id: relPath,
    guid: '01234567-89ab-cdef-0123-456789abcdef',
    name: relPath.split('/').pop(),
    folder: 'Assets',
    relPath,
    kind,
    revision: 'revision',
    size: 1,
    metaStatus: 'ready',
    metaError: null,
  };
}

test('resource targets preserve logical subtypes hosted by shared editor panels', () => {
  assert.deepEqual(
    resourceEditorTarget(asset('Assets/Movement.mavatar', 'avatar-mask')),
    { kind: 'avatar-mask', panel: 'animator', path: 'Assets/Movement.mavatar' },
  );
  assert.deepEqual(
    resourceEditorTarget(asset('Assets/Metal.minst', 'material')),
    { kind: 'material-instance', panel: 'material', path: 'Assets/Metal.minst' },
  );
  assert.equal(animatorDocumentKind('Assets/Movement.mavatar'), 'avatar-mask');
  assert.equal(animatorDocumentKind('Assets/Movement.mcontroller'), 'animator');
  assert.equal(materialDocumentKind('Assets/Metal.minst'), 'material-instance');
  assert.equal(materialDocumentKind('Assets/Metal.mmat'), 'material');
});

test('creatable authored resource kinds are stable and self-validating', () => {
  assert.deepEqual(
    AGENT_CREATABLE_ASSET_KINDS,
    [
      'animation',
      'animator',
      'avatar-mask',
      'material',
      'material-instance',
      'shader',
      'sprite-atlas',
      'timeline',
    ],
  );
  for (const kind of AGENT_CREATABLE_ASSET_KINDS) {
    assert.equal(isAgentCreatableAssetKind(kind), true);
  }
  assert.equal(isAgentCreatableAssetKind('texture'), false);
});

test('sprite workflows accept only the texture formats supported by the sprite index', () => {
  for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
    const texture = asset(`Assets/Icon.${extension}`, 'texture');
    assert.equal(resourceEditorTarget(texture)?.kind, 'sprite');
    assert.deepEqual(
      instantiableAssetTarget(texture),
      { kind: 'sprite', path: `Assets/Icon.${extension}` },
    );
  }
  for (const extension of ['bmp', 'tga', 'tif', 'tiff', 'hdr', 'exr']) {
    const texture = asset(`Assets/Image.${extension}`, 'texture');
    assert.equal(resourceEditorTarget(texture), null);
    assert.equal(instantiableAssetTarget(texture), null);
  }
});

test('scene asset instantiation is limited to prefab, model, and sprite assets', () => {
  assert.deepEqual(
    instantiableAssetTarget(asset('Assets/Player.prefab', 'prefab')),
    { kind: 'prefab', path: 'Assets/Player.prefab' },
  );
  assert.deepEqual(
    instantiableAssetTarget(asset('Assets/Player.glb', 'model')),
    { kind: 'model', path: 'Assets/Player.glb' },
  );
  assert.equal(instantiableAssetTarget(asset('Assets/Metal.mmat', 'material')), null);
});
