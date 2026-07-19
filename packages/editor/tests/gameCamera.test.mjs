import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCameraBackgroundColor,
  normalizeCameraClearFlags,
  primaryGameCamera,
  timelineGameCamera,
} from '../src/gameCamera.ts';
import { project } from '../src/math3d.ts';

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
  assert.equal(camera?.near, 0.01);
  assert.equal(camera?.far, 1000);
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
  assert.equal(normalizeCameraClearFlags('SolidColor'), 'solid_color');
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

test('Game camera matches runtime projection clamps and clipping planes', () => {
  const camera = primaryGameCamera([{
    entity: 1,
    components: {
      Transform: transform(),
      Camera3D: {
        primary: true,
        projection: 'perspective',
        fov_y_degrees: 0,
        near: 0,
        far: 0,
      },
    },
  }]);
  assert.equal(camera?.fovYDeg, 1);
  assert.equal(camera?.near, 0.001);
  assert.equal(camera?.far, 0.002);
  assert.equal(project([0, 0, 0], camera, { x: 0, y: 0, w: 100, h: 100 }), null);
});

test('Timeline camera preview blends compatible virtual cameras without changing components', () => {
  const entities = [
    {
      entity: 1,
      components: {
        Transform: transform([0, 0, 5]),
        Camera3D: {
          primary: true,
          projection: 'perspective',
          fov_y_degrees: 60,
          clear_flags: 'solid_color',
          background_color: [0, 0, 0, 1],
        },
      },
    },
    {
      entity: 2,
      components: {
        Transform: transform([10, 0, 5]),
        Camera3D: {
          primary: false,
          projection: 'perspective',
          fov_y_degrees: 100,
          clear_flags: 'skybox',
          background_color: [1, 0.5, 0.25, 1],
        },
      },
    },
  ];
  const blended = timelineGameCamera(entities, { source: null, target: 2, weight: 0.5 });
  assert.equal(blended?.entity, 2);
  assert.deepEqual(blended?.eye, [5, 0, 5]);
  assert.equal(blended?.fovYDeg, 80);
  assert.equal(blended?.near, 0.1);
  assert.equal(blended?.far, 1000);
  assert.equal(blended?.clearFlags, 'skybox');
  assert.deepEqual(blended?.backgroundColor, [0.5, 0.25, 0.125, 1]);
  assert.deepEqual(entities[0].components.Transform.position, [0, 0, 5]);
  assert.deepEqual(entities[1].components.Transform.position, [10, 0, 5]);
});

test('Timeline camera switches incompatible projections at the runtime midpoint', () => {
  const entities = [
    {
      entity: 1,
      components: { Transform: transform(), Camera2D: { primary: true, size: 4 } },
    },
    {
      entity: 2,
      components: {
        Transform: transform(),
        Camera3D: { primary: false, projection: 'perspective', fov_y_degrees: 75 },
      },
    },
  ];
  assert.equal(timelineGameCamera(entities, { source: null, target: 2, weight: 0.49 })?.projection, 'orthographic');
  assert.equal(timelineGameCamera(entities, { source: null, target: 2, weight: 0.5 })?.projection, 'perspective');
});

test('Timeline camera blend preserves roll through quaternion slerp', () => {
  const entities = [
    {
      entity: 1,
      components: { Transform: transform(), Camera3D: { primary: true } },
    },
    {
      entity: 2,
      components: {
        Transform: { ...transform(), rotation: [0, 0, 1, 0] },
        Camera3D: { primary: false },
      },
    },
  ];
  const camera = timelineGameCamera(entities, { source: null, target: 2, weight: 0.5 });
  assert.ok(Math.abs(camera.up[0] + 1) < 1e-6);
  assert.ok(Math.abs(camera.up[1]) < 1e-6);
});
