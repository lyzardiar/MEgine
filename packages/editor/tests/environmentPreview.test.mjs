import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeRadianceHdr } from '../src/environmentPreview.ts';

function hdrBytes(width, height, pixels) {
  const header = new TextEncoder().encode(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`,
  );
  const bytes = new Uint8Array(header.length + pixels.length);
  bytes.set(header);
  bytes.set(pixels, header.length);
  return bytes;
}

test('Radiance HDR preview decoder preserves RGBE values above one', () => {
  const panorama = decodeRadianceHdr(
    hdrBytes(2, 1, [128, 64, 32, 130, 16, 32, 64, 128]),
  );
  assert.equal(panorama.width, 2);
  assert.equal(panorama.height, 1);
  assert.deepEqual(
    Array.from(panorama.pixels),
    [2, 1, 0.5, 0.0625, 0.125, 0.25],
  );
});

test('Radiance HDR preview decoder expands modern channel RLE scanlines', () => {
  const panorama = decodeRadianceHdr(hdrBytes(8, 1, [
    2, 2, 0, 8,
    136, 128,
    136, 64,
    136, 32,
    136, 130,
  ]));
  assert.equal(panorama.pixels.length, 24);
  for (let index = 0; index < panorama.pixels.length; index += 3) {
    assert.deepEqual(Array.from(panorama.pixels.slice(index, index + 3)), [2, 1, 0.5]);
  }
});

test('Radiance HDR preview decoder expands legacy RGBE repeat markers', () => {
  const panorama = decodeRadianceHdr(hdrBytes(3, 1, [
    128, 64, 32, 130,
    1, 1, 1, 2,
  ]));
  assert.deepEqual(Array.from(panorama.pixels), [
    2, 1, 0.5,
    2, 1, 0.5,
    2, 1, 0.5,
  ]);
});

test('Radiance HDR preview decoder rejects truncated and malformed files', () => {
  assert.throws(
    () => decodeRadianceHdr(new TextEncoder().encode('not hdr')),
    /signature|header/,
  );
  assert.throws(
    () => decodeRadianceHdr(hdrBytes(2, 1, [1, 2, 3])),
    /truncated Radiance HDR pixel data/,
  );
});
