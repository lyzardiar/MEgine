import assert from 'node:assert/strict';
import test from 'node:test';
import {
  animatorParameterValues,
  createAnimatorController,
  normalizeAnimatorController,
  parseAnimatorController,
  setAnimatorParameterOverride,
  serializeAnimatorController,
} from '../src/animatorController.ts';

test('animator controller normalizes graph values', () => {
  const controller = normalizeAnimatorController({
    default_state: 'Idle',
    parameters: [{ name: 'Speed', kind: 'float', default_float: '2' }],
    states: [{ name: 'Idle', clip: 'Assets\\Animations\\idle.manim', speed: '1.5' }],
  });
  assert.equal(controller.states[0].clip, 'Assets/Animations/idle.manim');
  assert.equal(controller.states[0].speed, 1.5);
  assert.deepEqual(controller.states[0].position, [100, 90]);
  assert.equal(controller.parameters[0].default_float, 2);
});

test('animator controller rejects broken transition references', () => {
  assert.throws(() => parseAnimatorController(JSON.stringify({
    default_state: 'Idle',
    states: [{ name: 'Idle', clip: 'Assets/Animations/idle.manim' }],
    transitions: [{ from: 'Idle', to: 'Missing' }],
  })), /Missing/);
});

test('new animator controller round trips', () => {
  const controller = createAnimatorController('Hero', 'Assets/Animations/idle.manim');
  assert.deepEqual(normalizeAnimatorController(JSON.parse(serializeAnimatorController(controller))), controller);
});

test('animator instance parameter overrides preserve typed controller defaults', () => {
  const controller = normalizeAnimatorController({
    default_state: 'Idle',
    parameters: [
      { name: 'Grounded', kind: 'bool', default_bool: true },
      { name: 'Speed', kind: 'float', default_float: 1.5 },
      { name: 'Direction', kind: 'int', default_int: -1 },
      { name: 'Jump', kind: 'trigger' },
    ],
    states: [{ name: 'Idle', clip: 'Assets/Animations/idle.manim' }],
  });
  assert.deepEqual(animatorParameterValues(controller, '{"Grounded":false,"Speed":2,"Direction":3.8,"Jump":true}'), {
    Grounded: false,
    Speed: 2,
    Direction: 3,
    Jump: true,
  });
  assert.deepEqual(animatorParameterValues(controller, '{"Speed":"fast","Jump":1}'), {
    Grounded: true,
    Speed: 1.5,
    Direction: -1,
    Jump: false,
  });
  const updated = setAnimatorParameterOverride(controller, '{"Grounded":false}', 'Speed', 4.25);
  assert.deepEqual(JSON.parse(updated), { Grounded: false, Speed: 4.25 });
  assert.equal(setAnimatorParameterOverride(controller, updated, 'Missing', 1), updated);
});

test('animator controller upgrades and validates synchronized layers with target masks', () => {
  const controller = normalizeAnimatorController({
    version: 1,
    default_state: 'Idle',
    states: [
      { name: 'Idle', clip: 'Assets/Animations/idle.manim' },
      { name: 'Run', clip: 'Assets/Animations/run.manim' },
    ],
    layers: [{
      name: ' Upper Body ',
      enabled: true,
      weight: 4,
      blend_mode: 'additive',
      mask_paths: [' Rig\\Spine ', 'Rig/Spine/', 'Rig/Spine'],
      motions: [{ state: 'Run', clip: 'Assets\\Animations\\wave.manim' }],
    }],
  });
  assert.equal(controller.version, 2);
  assert.deepEqual(controller.layers[0], {
    name: 'Upper Body',
    enabled: true,
    weight: 1,
    blend_mode: 'additive',
    mask_paths: ['Rig/Spine'],
    motions: [{ state: 'Run', clip: 'Assets/Animations/wave.manim' }],
  });
  assert.doesNotThrow(() => serializeAnimatorController(controller));

  controller.layers[0].motions[0].state = 'Missing';
  assert.throws(() => serializeAnimatorController(controller), /Missing/);
  controller.layers[0].motions[0].state = 'Run';
  controller.layers[0].mask_paths = ['../Rig'];
  assert.throws(() => serializeAnimatorController(controller), /Avatar Mask/);
});
