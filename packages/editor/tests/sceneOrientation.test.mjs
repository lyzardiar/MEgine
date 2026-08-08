import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  activeSceneOrientation,
  sceneOrientationCamera,
  sceneOrientationCubeFaces,
  sceneOrientationHandles,
  sceneOrientationLabel,
} from '../src/sceneOrientation.ts';

test('maps Unity-style Scene orientation views to the existing orbit camera', () => {
  assert.deepEqual(sceneOrientationCamera('front'), { yaw: 0, pitch: 0 });
  assert.deepEqual(sceneOrientationCamera('back'), { yaw: 180, pitch: 0 });
  assert.deepEqual(sceneOrientationCamera('right'), { yaw: 90, pitch: 0 });
  assert.deepEqual(sceneOrientationCamera('left'), { yaw: -90, pitch: 0 });
  assert.deepEqual(sceneOrientationCamera('top'), { yaw: 0, pitch: 89 });
  assert.deepEqual(sceneOrientationCamera('bottom'), { yaw: 0, pitch: -89 });
  assert.deepEqual(sceneOrientationCamera('perspective'), { yaw: 35, pitch: 25 });
});

test('orientation cube follows the orbit camera instead of staying as a static icon', () => {
  const perspective = sceneOrientationCubeFaces(35, 25);
  assert.equal(perspective.length, 3);
  assert.deepEqual(new Set(perspective.map((face) => face.view)), new Set(['right', 'top', 'front']));
  assert.ok(perspective.every((face) => face.points.length === 4));
  assert.notDeepEqual(sceneOrientationCubeFaces(35, 25), sceneOrientationCubeFaces(-35, 25));

  const front = sceneOrientationCubeFaces(0, 0);
  assert.equal(front.length, 1);
  assert.equal(front[0].view, 'front');
});

test('projects all six axis handles with opposite endpoints and camera depth', () => {
  const handles = sceneOrientationHandles(0, 0, 31);
  assert.equal(handles.length, 6);
  for (const axis of ['x', 'y', 'z']) {
    const positive = handles.find((handle) => handle.axis === axis && handle.sign === 1);
    const negative = handles.find((handle) => handle.axis === axis && handle.sign === -1);
    assert.ok(positive);
    assert.ok(negative);
    assert.ok(Math.abs(positive.x + negative.x) < 1e-9);
    assert.ok(Math.abs(positive.y + negative.y) < 1e-9);
    assert.ok(Math.abs(positive.depth + negative.depth) < 1e-9);
  }
  assert.ok(handles.find((handle) => handle.view === 'right').x > 0);
  assert.ok(handles.find((handle) => handle.view === 'top').y < 0);
  assert.ok(handles.find((handle) => handle.view === 'front').depth > 0);
});

test('recognizes snapped views across wrapped yaw while leaving free orbit as Perspective', () => {
  assert.equal(activeSceneOrientation(360, 0), 'front');
  assert.equal(activeSceneOrientation(-180, 0), 'back');
  assert.equal(activeSceneOrientation(89.5, 0.5), 'right');
  assert.equal(activeSceneOrientation(35, 25), null);
  assert.equal(sceneOrientationLabel(35, 25), 'Perspective');
});

test('Viewport exposes the compass only in 3D and routes it through the scene camera', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const viewport = fs.readFileSync(path.join(root, 'src', 'panels', 'Viewport.tsx'), 'utf8');
  assert.match(viewport, /props\.tab === 'scene' && !scene2D/);
  assert.match(viewport, /role="group" aria-label="Scene orientation"/);
  assert.match(viewport, /aria-label="Return to Perspective view"/);
  assert.match(viewport, /onClick=\{\(\) => applySceneOrientation\(handle\.view\)\}/);
  assert.match(viewport, /sceneOrientationCubeFaces/);
  assert.doesNotMatch(viewport, /handle\.depth < 0 \? ' rear'/);
  assert.match(viewport, /syncCamToStore\(\)/);
});
