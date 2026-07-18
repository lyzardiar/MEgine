import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAnimatorController,
  normalizeAnimatorController,
  parseAnimatorController,
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
