import assert from 'node:assert/strict';
import test from 'node:test';
import { copyComponentValue, pasteComponentValue } from '../src/componentClipboard.ts';

test('component clipboard isolates copied and pasted values', () => {
  const source = { position: [1, 2, 3], nested: { enabled: true } };
  const clipboard = copyComponentValue('Transform', source);
  source.position[0] = 99;
  const pasted = pasteComponentValue(clipboard, 'Transform');
  assert.deepEqual(pasted, { position: [1, 2, 3], nested: { enabled: true } });
  pasted.position[1] = 77;
  assert.equal(clipboard.value.position[1], 2);
});

test('component clipboard rejects values copied from another component type', () => {
  const clipboard = copyComponentValue('Image', { color: [1, 1, 1, 1] });
  assert.equal(pasteComponentValue(clipboard, 'Text'), null);
});
