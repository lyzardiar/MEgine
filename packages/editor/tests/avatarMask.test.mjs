import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAvatarMask,
  parseAvatarMask,
  parseAvatarMaskDraft,
  serializeAvatarMask,
} from '../src/avatarMask.ts';

test('Avatar Mask normalizes reusable target paths and round trips', () => {
  const mask = parseAvatarMask(JSON.stringify({
    version: 0,
    name: ' Upper Body ',
    paths: [' Rig\\Spine ', 'Rig/Spine/', '.', 'Rig/Spine'],
  }));
  assert.deepEqual(mask, {
    version: 1,
    name: 'Upper Body',
    paths: ['Rig/Spine', '.'],
  });
  assert.deepEqual(JSON.parse(serializeAvatarMask(mask)), mask);
});

test('Avatar Mask rejects parent traversal', () => {
  assert.throws(() => parseAvatarMask('{"paths":["../Rig"]}'), /不能包含/);
  assert.deepEqual(parseAvatarMaskDraft('{"paths":["../Rig"]}').paths, ['../Rig']);
  assert.deepEqual(createAvatarMask('Hero'), { version: 1, name: 'Hero', paths: [] });
});
