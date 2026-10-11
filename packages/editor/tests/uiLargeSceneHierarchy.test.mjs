// Author: MiYu. Canvas layout must remain correct in large scenes and observe live hierarchy edits.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { layoutUiOverlay, layoutUiScene3D, uiEntityWorldPivot, sceneUiEntities, layoutUiWorldSpace } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(() => server.close());
const rect = { anchor_min: [0, 0], anchor_max: [0, 0], pivot: [0.5, 0.5], anchored_position: [40, 40], size_delta: [20, 20] };
const viewport = { x: 0, y: 0, w: 800, h: 600 }, camera = { eye: [0, 2, 8], target: [0, 0, 0], fovYDeg: 60 };
const selected = new Set(), size = { w: 800, h: 600 };

test('unrelated model nodes do not change Canvas layout or multiply ancestor scans', () => {
  const ui = [{ entity: 1, components: { Canvas: { render_mode: 'ScreenSpaceOverlay' } } }, { entity: 2, parent: 1, components: { RectTransform: rect } }, ...Array.from({ length: 300 }, (_, i) => ({ entity: i + 3, parent: 2, components: { RectTransform: rect, Image: { color: [1, 1, 1, 1] } } }))];
  const large = [...Array.from({ length: 20000 }, (_, i) => ({ entity: i + 1000, components: { MeshRenderer: { mesh: 'cube' } } })), ...ui];
  let scans = 0; large.find = function(predicate) { scans++; return Array.prototype.find.call(this, predicate); };
  assert.deepEqual(layoutUiScene3D(large, camera, viewport, selected, size), layoutUiScene3D(ui, camera, viewport, selected, size));
  assert.deepEqual(layoutUiOverlay(large, viewport, selected), layoutUiOverlay(ui, viewport, selected));
  assert.deepEqual(uiEntityWorldPivot(large, 3, size), uiEntityWorldPivot(ui, 3, size));
  assert.ok(scans < 10, 'layout does not scan all models for each UI ancestor');
  ui[1].active = false; assert.equal(layoutUiOverlay(large, viewport, selected).filter(item => item.role === 'graphic').length, 0);
  ui[1].active = true; ui[1].parent = 2; assert.equal(layoutUiOverlay(large, viewport, selected).filter(item => item.role === 'graphic').length, 0);
  ui[1].parent = 999999; assert.equal(layoutUiOverlay(large, viewport, selected).filter(item => item.role === 'graphic').length, 0);
  ui[1].parent = 1; assert.equal(layoutUiOverlay(large, viewport, selected).filter(item => item.role === 'graphic').length, 300);
});

test('Scene UI subset preserves Canvas children without RectTransform, inactive ancestors and camera rigs', () => {
  const entities = [{ entity: 1, active: false, components: { Transform: { position: [2, 0, 0] } } }, { entity: 2, parent: 1, components: { Canvas: { render_mode: 'WorldSpace' }, RectTransform: rect } }, { entity: 3, parent: 2, components: { Image: { sprite: 'white' } } }, { entity: 4, parent: 3, components: { RectTransform: rect, Text: { text: 'child' } } }, { entity: 5, components: { Transform: { position: [0, 0, 10] } } }, { entity: 6, parent: 5, components: { Camera3D: {} } }, { entity: 7, components: { MeshRenderer: {} } }];
  const filtered = sceneUiEntities(entities);
  assert.deepEqual(filtered.map(e => e.entity), [1, 2, 3, 4, 5, 6]);
  assert.equal(filtered[2], entities[2]);
  assert.deepEqual(layoutUiOverlay(filtered, viewport, selected), layoutUiOverlay(entities, viewport, selected));
  entities[0].active = true;
  assert.deepEqual(layoutUiWorldSpace(filtered, camera, viewport, selected), layoutUiWorldSpace(entities, camera, viewport, selected));
  assert.deepEqual(layoutUiScene3D(filtered, camera, viewport, selected, size), layoutUiScene3D(entities, camera, viewport, selected, size));
  entities[6].components.Canvas = { render_mode: 'ScreenSpaceOverlay' };
  assert.equal(sceneUiEntities(entities).length, 7);
});

test('Scene UI subset retains both authored camera types and designated camera projection', () => {
  const entities = [{ entity: 1, components: { Canvas: { render_mode: 'ScreenSpaceCamera', render_camera: '10', plane_distance: 3 }, RectTransform: rect } }, { entity: 2, parent: 1, components: { RectTransform: rect, Image: { sprite: 'white' } } }, { entity: 9, components: { Transform: { position: [0, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } }, { entity: 10, parent: 9, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, Camera3D: { fov: 45 } } }, { entity: 11, components: { Transform: { position: [1, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, Camera2D: { size: 4 } } }, { entity: 12, components: { MeshRenderer: {} } }];
  const filtered = sceneUiEntities(entities);
  assert.deepEqual(filtered.map(e => e.entity), [1, 2, 9, 10, 11]);
  assert.deepEqual(layoutUiScene3D(filtered, camera, viewport, selected, size), layoutUiScene3D(entities, camera, viewport, selected, size));
  entities[0].components.Canvas.render_camera = '11';
  assert.deepEqual(layoutUiScene3D(filtered, camera, viewport, selected, size), layoutUiScene3D(entities, camera, viewport, selected, size));
});
