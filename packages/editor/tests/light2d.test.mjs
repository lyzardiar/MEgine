import assert from 'node:assert/strict';
import test from 'node:test';

import {
  modulateLight2DColor,
  prepareLight2DLights,
  sampleLight2D,
} from '../src/light2d.ts';

test('no 2D lights preserve the authored unlit color', () => {
  assert.deepEqual(modulateLight2DColor([0.8, 0.6, 0.4, 0.5], [0, 0], 'default', []), [
    0.8, 0.6, 0.4, 0.5,
  ]);
});

test('global and point lights sum with inner radius and falloff', () => {
  const lights = prepareLight2DLights([
    {
      position: [0, 0],
      component: { light_type: 'global', color: [0.2, 0.4, 0.6, 1], intensity: 0.5 },
    },
    {
      position: [0, 0],
      component: {
        light_type: 'point',
        color: [1, 0, 0, 1],
        intensity: 1,
        radius: 10,
        inner_radius: 0,
        falloff: 1,
      },
    },
  ]);
  assert.deepEqual(sampleLight2D([5, 0], 'default', lights), [0.6, 0.2, 0.3]);
  assert.deepEqual(modulateLight2DColor([0.5, 1, 1, 0.35], [5, 0], 'default', lights), [
    0.3, 0.2, 0.3, 0.35,
  ]);
});

test('sorting layer masks affect only matching 2D renderers', () => {
  const lights = prepareLight2DLights([{
    position: [0, 0],
    component: {
      light_type: 'global',
      color: [0.5, 1, 0.25, 1],
      sorting_layers: ['characters'],
    },
  }]);
  assert.deepEqual(sampleLight2D([0, 0], 'characters', lights), [0.5, 1, 0.25]);
  assert.deepEqual(sampleLight2D([0, 0], 'background', lights), [0, 0, 0]);
});
