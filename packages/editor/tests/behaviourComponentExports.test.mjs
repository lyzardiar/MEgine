import assert from 'node:assert/strict';
import test from 'node:test';
import * as behaviour from '@mengine/behaviour';

const publicComponentTypes = {
  Transform: 'Transform',
  Camera3D: 'Camera3D',
  Camera2D: 'Camera2D',
  MeshRenderer: 'MeshRenderer',
  DirectionalLight: 'DirectionalLight',
  Light2D: 'Light2D',
  Transform2D: 'Transform2D',
  SpriteRenderer: 'SpriteRenderer',
  AnimatedSprite2D: 'AnimatedSprite2D',
  Line2D: 'Line2D',
  AnimationPlayer: 'AnimationPlayer',
  Animator: 'Animator',
  AudioListener: 'AudioListener',
  AudioSource: 'AudioSource',
  AudioMixer: 'AudioMixer',
  Canvas: 'Canvas',
  CanvasScaler: 'CanvasScaler',
  GraphicRaycaster: 'GraphicRaycaster',
  RectTransform: 'RectTransform',
  AspectRatioFitter: 'AspectRatioFitter',
  ContentSizeFitter: 'ContentSizeFitter',
  RectMask2D: 'RectMask2D',
  Mask: 'Mask',
  Image: 'Image',
  RawImage: 'RawImage',
  Shadow: 'Shadow',
  Outline: 'Outline',
  UIButton: 'Button',
  ToggleGroup: 'ToggleGroup',
};

test('Behaviour SDK publicly exports every built-in component token', () => {
  for (const [exportName, typeName] of Object.entries(publicComponentTypes)) {
    const componentType = behaviour[exportName];
    assert.equal(
      typeof componentType,
      'function',
      `${exportName} must be importable from @mengine/behaviour`,
    );
    assert.equal(componentType.typeName, typeName);
    assert.equal(behaviour.componentTypeName(componentType), typeName);
  }
});

test('the Button decorator remains distinct from the UIButton component token', () => {
  assert.equal(typeof behaviour.Button, 'function');
  assert.equal(behaviour.UIButton.typeName, 'Button');
  assert.notEqual(behaviour.Button, behaviour.UIButton);
});
