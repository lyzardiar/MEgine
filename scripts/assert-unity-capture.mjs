import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** Verify the authored Gamma background through native rendering and readback. */
export function assertUnityGammaCapture(path) {
  const color = JSON.parse(execFileSync('python', ['-c', 'from PIL import Image; import sys,json; im=Image.open(sys.argv[1]).convert("RGBA"); print(json.dumps(im.getpixel((20,im.height//2))))', path], { encoding: 'utf8' }));
  const expected = [49, 77, 121, 255];
  assert.ok(color.every((value, i) => Math.abs(value - expected[i]) <= 1), `Native Gamma background ${color} should match ${expected}`);
  return color;
}
