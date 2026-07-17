import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGltfPreview } from '../src/modelPreview.ts';

function triangleBuffer() {
  const bytes = new Uint8Array(42);
  const view = new DataView(bytes.buffer);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  [0, 1, 2].forEach((value, index) => view.setUint16(36 + index * 2, value, true));
  return bytes;
}

test('glTF preview combines triangle primitives with accessor offsets', () => {
  const mesh = parseGltfPreview({
    buffers: [{ byteLength: 42 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [
      { attributes: { POSITION: 0 }, indices: 1 },
      { attributes: { POSITION: 0 }, indices: 1 },
    ] }],
  }, [triangleBuffer()]);
  assert.deepEqual(mesh.positions, [
    [0, 0, 0], [1, 0, 0], [0, 1, 0],
    [0, 0, 0], [1, 0, 0], [0, 1, 0],
  ]);
  assert.deepEqual(mesh.indices, [0, 1, 2, 3, 4, 5]);
});

test('glTF preview rejects unsupported primitive topology', () => {
  assert.throws(() => parseGltfPreview({
    meshes: [{ primitives: [{ mode: 1, attributes: { POSITION: 0 } }] }],
  }, []), /triangle/);
});
