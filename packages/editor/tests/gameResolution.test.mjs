import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gameResolutionAspect,
  gameResolutionKey,
  gameResolutionOrientation,
  legacyGameResolution,
  normalizeGameResolution,
} from '../src/gameResolution.ts';

test('Game orientation is derived only from the configured resolution', () => {
  assert.equal(gameResolutionOrientation({ width: 1920, height: 1080 }), 'landscape');
  assert.equal(gameResolutionOrientation({ width: 1080, height: 1920 }), 'portrait');
  assert.equal(gameResolutionOrientation({ width: 1080, height: 1080 }), 'square');
  assert.equal(gameResolutionOrientation(null), 'free');
  assert.equal(gameResolutionAspect({ width: 720, height: 1280 }), 720 / 1280);
});

test('Game resolutions normalize persisted and editable forms safely', () => {
  assert.deepEqual(normalizeGameResolution(' 720 × 1280 '), { width: 720, height: 1280 });
  assert.deepEqual(normalizeGameResolution([1920, 1080]), { width: 1920, height: 1080 });
  assert.deepEqual(normalizeGameResolution({ width: 99_999, height: 0 }), null);
  assert.deepEqual(normalizeGameResolution({ width: 99_999, height: 720 }), {
    width: 16_384,
    height: 720,
  });
  assert.equal(gameResolutionKey({ width: 1024, height: 768 }), '1024x768');
});

test('Legacy aspect and orientation settings migrate to concrete resolutions', () => {
  assert.deepEqual(legacyGameResolution('16:9', 'landscape'), { width: 1920, height: 1080 });
  assert.deepEqual(legacyGameResolution('16:9', 'portrait'), { width: 1080, height: 1920 });
  assert.deepEqual(legacyGameResolution('4:3', 'portrait'), { width: 768, height: 1024 });
  assert.equal(legacyGameResolution('free', 'portrait'), null);
});
