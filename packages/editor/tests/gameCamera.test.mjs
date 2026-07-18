import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCameraBackgroundColor,
  normalizeCameraClearFlags,
  primaryGameCamera,
} from '../src/gameCamera.ts';

const transform = (position = [0, 0, 10]) => ({
  position,
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});

test('primary 2D camera resolves to an orthographic Game camera', () => {
  const camera = primaryGameCamera([
    {
      entity: 7,
      components: {
        Transform: transform([2, 3, 10]),
        Camera2D: { size: 8, primary: true },
      },
    },
  ]);

  assert.equal(camera?.entity, 7);
  assert.equal(camera?.kind, '2d');
  assert.equal(camera?.projection, 'orthographic');
  assert.equal(camera?.orthographicSize, 8);
  assert.deepEqual(camera?.eye, [2, 3, 10]);
  assert.deepEqual(camera?.target, [2, 3, 9]);
  assert.equal(camera?.clearFlags, 'scene');
  assert.deepEqual(camera?.backgroundColor, [0.1, 0.1, 0.14, 1]);
});

test('Game camera resolves authored clear flags and clamps display background color', () => {
  const camera = primaryGameCamera([{
    entity: 1,
    components: {
      Transform: transform(),
      Camera2D: {
        size: 5,
        primary: true,
        clear_flags: 'solid_color',
        background_color: [2, -1, Number.NaN, 4],
      },
    },
  }]);
  assert.equal(camera?.clearFlags, 'solid_color');
  assert.deepEqual(camera?.backgroundColor, [1, 0, 0.14, 1]);
  assert.equal(normalizeCameraClearFlags('unsupported'), 'scene');
  assert.deepEqual(normalizeCameraBackgroundColor(null), [0.1, 0.1, 0.14, 1]);
});

test('primary 2D camera wins over a primary 3D camera', () => {
  const camera = primaryGameCamera([
    {
      entity: 1,
      components: {
        Transform: transform(),
        Camera3D: { primary: true, projection: 'perspective', fov_y_degrees: 75 },
      },
    },
    {
      entity: 2,
      components: {
        Transform: transform(),
        Camera2D: { size: 4, primary: true },
      },
    },
  ]);

  assert.equal(camera?.entity, 2);
  assert.equal(camera?.kind, '2d');
});

test('inactive 2D camera is skipped and 3D camera remains the fallback', () => {
  const camera = primaryGameCamera(
    [
      {
        entity: 1,
        components: { Transform: transform(), Camera2D: { size: 4, primary: true } },
      },
      {
        entity: 2,
        components: {
          Transform: transform(),
          Camera3D: {
            primary: true,
            projection: 'orthographic',
            orthographic_size: 6,
            fov_y_degrees: 60,
          },
        },
      },
    ],
    (id) => id !== 1,
  );

  assert.equal(camera?.entity, 2);
  assert.equal(camera?.projection, 'orthographic');
  assert.equal(camera?.orthographicSize, 6);
});

test('Game camera uses its parent world transform', () => {
  const camera = primaryGameCamera([
    {
      entity: 1,
      components: { Transform: transform([10, 0, 0]) },
    },
    {
      entity: 2,
      parent: 1,
      components: {
        Transform: transform([2, 3, 4]),
        Camera3D: { primary: true, projection: 'perspective', fov_y_degrees: 60 },
      },
    },
  ]);
  assert.deepEqual(camera?.eye, [12, 3, 4]);
});
