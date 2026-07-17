import assert from 'node:assert/strict';
import test from 'node:test';
import { animatedSpriteFrameIndex, resolveAnimatedSpriteFrame } from '../src/animatedSprite.ts';

test('animated sprite advances, loops and clamps from its authored base frame', () => {
  assert.equal(animatedSpriteFrameIndex(3, 0, 4, true, true, 0.26), 1);
  assert.equal(animatedSpriteFrameIndex(3, 0, 4, true, true, 0.76), 0);
  assert.equal(animatedSpriteFrameIndex(3, 1, 4, true, false, 9), 2);
});

test('paused and zero-fps sprites stay on the selected frame', () => {
  assert.equal(animatedSpriteFrameIndex(3, 2, 12, false, true, 10), 2);
  assert.equal(animatedSpriteFrameIndex(3, 1, 0, true, true, 10), 1);
  assert.equal(animatedSpriteFrameIndex(0, 0, 12, true, true, 10), null);
});

test('frame resolution sanitizes lists and falls back to the white texture', () => {
  assert.equal(
    resolveAnimatedSpriteFrame({ frames: ['a.png', 'b.png'], fps: 2, frame: 0 }, 0.6),
    'b.png',
  );
  assert.equal(resolveAnimatedSpriteFrame({ frames: [] }, 1), 'white');
});
