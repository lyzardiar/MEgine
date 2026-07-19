import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createParticleEmitterState,
  seekParticleEmitter,
  stepParticleEmitter,
} from '../src/particles/particleSystem.ts';

const emitter = {
  playing: true,
  looping: true,
  duration: 5,
  start_delay: 0,
  rate_over_time: 10,
  max_particles: 100,
  lifetime_min: 2,
  lifetime_max: 2,
  speed_min: 2,
  speed_max: 1,
  size_start: 1,
  size_end: 0,
  color_start: [1, 1, 1, 1],
  color_end: [1, 1, 1, 0],
  gravity: [0, -1],
  shape: 'point',
  shape_radius: 0,
  shape_size: [1, 1],
  direction: [0, 1],
  spread_degrees: 0,
  simulation_space: 'world',
  seed: 17,
};

function roundedState(state) {
  return JSON.parse(JSON.stringify(state, (_key, value) => (
    typeof value === 'number' ? Math.round(value * 1e10) / 1e10 : value
  )));
}

test('particle seek is deterministic across forward and backward Timeline scrubs', () => {
  const first = createParticleEmitterState();
  const second = createParticleEmitterState();
  assert.equal(seekParticleEmitter(2, emitter, first, 1, [3, 4, 0]), true);
  assert.equal(seekParticleEmitter(2, emitter, second, 1, [3, 4, 0]), true);
  assert.deepEqual(first, second);

  const backward = createParticleEmitterState();
  assert.equal(seekParticleEmitter(2, emitter, first, 0.25, [3, 4, 0]), true);
  assert.equal(seekParticleEmitter(2, emitter, backward, 0.25, [3, 4, 0]), true);
  assert.deepEqual(first, backward);
});

test('particle incremental stepping matches a fixed-step seek and clamps speed ranges', () => {
  const incremental = createParticleEmitterState();
  const rebuilt = createParticleEmitterState();
  seekParticleEmitter(2, emitter, incremental, 0.5);
  stepParticleEmitter(2, emitter, incremental, 0.2);
  seekParticleEmitter(2, emitter, rebuilt, 0.7);
  assert.deepEqual(roundedState(incremental), roundedState(rebuilt));
  const first = rebuilt.particles[0];
  const launchSpeed = first.velocity[1] + first.age;
  assert.ok(Math.abs(launchSpeed - 2) < 1e-6);
});

test('particle seek ignores authored playing and preserves state on invalid requests', () => {
  const state = createParticleEmitterState(99);
  assert.equal(seekParticleEmitter(2, { ...emitter, playing: false }, state, 0.1), true);
  assert.equal(state.particles.length, 1);
  const snapshot = structuredClone(state);
  assert.equal(seekParticleEmitter(2, emitter, state, 300.01), false);
  assert.deepEqual(state, snapshot);
});
