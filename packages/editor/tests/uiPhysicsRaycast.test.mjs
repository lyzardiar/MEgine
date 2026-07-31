import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withModules(run) {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    await run({
      raycast: await server.ssrLoadModule('/src/ui/uiPhysicsRaycast.ts'),
      layout: await server.ssrLoadModule('/src/ui/uiLayout.ts'),
      math: await server.ssrLoadModule('/src/math3d.ts'),
    });
  } finally {
    await server.close();
  }
}

const camera = {
  eye: [0, 0, 5],
  target: [0, 0, 0],
  fovYDeg: 60,
  near: 0.1,
  far: 100,
};
const viewport = { x: 0, y: 0, w: 800, h: 600 };

test('camera screen rays support perspective and orthographic projections', async () => {
  await withModules(async ({ math }) => {
    const perspective = math.screenPointRay(400, 300, camera, viewport);
    assert.deepEqual(perspective.dir.map((value) => Math.round(value * 1000) / 1000), [0, 0, -1]);
    const orthographic = math.screenPointRay(800, 300, {
      ...camera,
      projection: 'orthographic',
      orthographicSize: 3,
    }, viewport);
    assert.equal(Math.round(orthographic.origin[0] * 1000) / 1000, 4);
    assert.deepEqual(orthographic.dir.map((value) => Math.round(value * 1000) / 1000), [0, 0, -1]);
  });
});

test('Game View GraphicRaycaster blocks UI behind matching 2D and 3D layers', async () => {
  await withModules(async ({ layout }) => {
    const canvas = {
      entity: 1,
      active: true,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        Canvas: { enabled: true, render_mode: 'ScreenSpaceCamera', plane_distance: 4 },
        GraphicRaycaster: {
          enabled: true,
          ignore_reversed_graphics: true,
          blocking_objects: 'All',
          blocking_mask: -1,
        },
        RectTransform: {
          anchor_min: [0, 0], anchor_max: [1, 1], pivot: [0.5, 0.5],
          anchored_position: [0, 0], size_delta: [0, 0], local_rotation: 0, local_scale: [1, 1],
        },
      },
    };
    const button = {
      entity: 2,
      parent: 1,
      active: true,
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        RectTransform: {
          anchor_min: [0.5, 0.5], anchor_max: [0.5, 0.5], pivot: [0.5, 0.5],
          anchored_position: [0, 0], size_delta: [100, 100], local_rotation: 0, local_scale: [1, 1],
        },
        Button: { interactable: true, label: 'Blocked' },
      },
    };
    const blocker3d = {
      entity: 3,
      active: true,
      components: {
        Transform: { position: [0, 0, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        BoxCollider3D: { size: [1, 1, 1], center: [0, 0, 0] },
        Layer: { value: 2 },
      },
    };
    const entities = [canvas, button, blocker3d];
    const items = layout.layoutUiOverlay(entities, viewport, new Set(), undefined, camera);
    const buttonItem = items.find((item) => item.entity === button.entity && item.role === 'graphic');
    assert.equal(buttonItem.blockingObjects, 'All');
    assert.equal(buttonItem.blockingMask, -1);
    assert.ok(buttonItem.raycastPlane);
    assert.ok(buttonItem.raycastCamera);
    assert.equal(layout.hitTestUi(items, 400, 300)?.entity, button.entity);
    assert.equal(layout.hitTestUi(items, 400, 300, { entities, viewport }), null);

    buttonItem.blockingMask = 1 << 1;
    assert.equal(layout.hitTestUi(items, 400, 300, { entities, viewport })?.entity, button.entity);

    delete blocker3d.components.BoxCollider3D;
    blocker3d.components.CircleCollider2D = { radius: 0.5, offset: [0, 0] };
    buttonItem.blockingMask = -1;
    assert.equal(layout.hitTestUi(items, 400, 300, { entities, viewport }), null);

    canvas.components.Canvas.render_camera = '4';
    const assignedCamera = {
      entity: 4,
      active: true,
      components: {
        Transform: { position: [0, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        Camera3D: {
          projection: 'perspective', fov_y_degrees: 45, near: 0.2, far: 200,
        },
      },
    };
    const assignedItems = layout.layoutUiOverlay(
      [...entities, assignedCamera], viewport, new Set(), undefined, camera,
    );
    const assignedButton = assignedItems.find((item) => item.entity === button.entity && item.role === 'graphic');
    assert.deepEqual(assignedButton.raycastCamera.eye, [0, 0, 10]);
    assert.deepEqual(assignedButton.raycastPlane.point, [0, 0, 6]);
  });
});

test('Overlay canvases ignore physics blocking like Unity', async () => {
  await withModules(async ({ raycast }) => {
    assert.equal(raycast.uiGraphicPhysicallyBlocked({
      blockingObjects: 'All',
      blockingMask: -1,
    }, 400, 300, [], viewport), false);
  });
});
