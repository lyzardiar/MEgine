import assert from 'node:assert/strict';
import test from 'node:test';

import { drawCamera2DGizmo, drawCameraGizmo } from '../src/editorGizmos.ts';

const viewport = { x: 0, y: 0, w: 800, h: 600 };
const sceneCamera = { eye: [6, 5, 8], target: [0, 0, 0], fovYDeg: 60 };
const transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

function recordingContext() {
  const calls = [];
  return new Proxy({}, {
    get(target, key) {
      if (key === 'calls') return calls;
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) {
      calls.push(['set', key, value]);
      target[key] = value;
      return true;
    },
  });
}

test('unselected 3D cameras keep a selectable icon without flooding Scene with a frustum', () => {
  const compact = recordingContext();
  const selected = recordingContext();
  const camera = { projection: 'perspective', fov_y_degrees: 60, near: 0.1, far: 100 };
  assert.ok(drawCameraGizmo(compact, sceneCamera, viewport, transform, camera, false));
  assert.ok(drawCameraGizmo(selected, sceneCamera, viewport, transform, camera, true));
  assert.ok(
    selected.calls.filter(([method]) => method === 'lineTo').length
      > compact.calls.filter(([method]) => method === 'lineTo').length,
  );
  assert.equal(compact.calls.filter(([method]) => method === 'fillText').length, 0);
  assert.equal(selected.calls.filter(([method]) => method === 'fillText').length, 2);
});

test('unselected 2D cameras hide their viewport rectangle but remain selectable', () => {
  const compact = recordingContext();
  const selected = recordingContext();
  const camera = { size: 5 };
  assert.ok(drawCamera2DGizmo(compact, sceneCamera, viewport, transform, camera, 16 / 9, false));
  assert.ok(drawCamera2DGizmo(selected, sceneCamera, viewport, transform, camera, 16 / 9, true));
  assert.ok(
    selected.calls.filter(([method]) => method === 'lineTo').length
      > compact.calls.filter(([method]) => method === 'lineTo').length,
  );
  assert.equal(compact.calls.filter(([method]) => method === 'fillText').length, 1);
  assert.equal(selected.calls.filter(([method]) => method === 'fillText').length, 2);
});
