import assert from 'node:assert/strict';
import test from 'node:test';
import { primaryGameCamera } from '../src/gameCamera.ts';

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
