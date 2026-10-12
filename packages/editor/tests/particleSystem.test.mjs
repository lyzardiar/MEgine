import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectParticleDrawItems,
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

test('2D bursts and drag match the deterministic fixed-step preview contract', () => {
  const burst = {
    ...emitter,
    rate_over_time: 0,
    burst_count: 3,
    burst_interval: 0.1,
    drag: 4,
    gravity: [0, 0],
  };
  const state = createParticleEmitterState();
  stepParticleEmitter(2, burst, state, 0.01);
  assert.equal(state.particles.length, 3);
  const initialSpeed = Math.hypot(...state.particles[0].velocity);
  stepParticleEmitter(2, burst, state, 0.1);
  assert.equal(state.particles.length, 6);
  assert.ok(Math.hypot(...state.particles[0].velocity) < initialSpeed);
});

test('particle draw items preserve the authored texture with a white fallback', () => {
  const state = createParticleEmitterState();
  seekParticleEmitter(2, emitter, state, 0.1);
  assert.equal(collectParticleDrawItems(state, [0, 0, 0], 'world', 'Assets/Sprites/fire.png#spark')[0].texture,
    'Assets/Sprites/fire.png#spark');
  assert.equal(collectParticleDrawItems(state, [0, 0, 0], 'world', '')[0].texture, 'white');
});

test('expiration preserves survivor order and allows emission to refill capacity', () => {
  const state = createParticleEmitterState();
  stepParticleEmitter(2, { ...emitter, rate_over_time: 0, burst_count: 4, max_particles: 4 }, state, 0.01);
  const original = [...state.particles];
  original[0].lifetime = original[2].lifetime = 0.015;
  stepParticleEmitter(2, { ...emitter, rate_over_time: 0 }, state, 0.02);
  assert.deepEqual(state.particles, [original[1], original[3]]);
  stepParticleEmitter(2, { ...emitter, rate_over_time: 100, max_particles: 4 }, state, 0.02);
  assert.equal(state.particles.length, 4);
  assert.equal(state.particles[0], original[1]);
  assert.equal(state.particles[1], original[3]);
});

test('3D particle vectors and colors retain numeric coercion and invalid-value fallbacks', () => {
  const state = createParticleEmitterState();
  stepParticleEmitter(3, { ...emitter, direction: ['0', '1'], gravity: [0, 0, 0], rate_over_time: 100, color_start: ['0.2', NaN, Infinity, '0.5'], color_end: { 3: '0.25' } }, state, 0.01);
  const particle = state.particles[0];
  assert.deepEqual(particle.velocity, [0, 2, 0]);
  assert.deepEqual(particle.colorStart, [0.2, 1, 1, 0.5]);
  assert.deepEqual(particle.colorEnd, [1, 1, 1, 0.25]);
});

test('new particles observe edited colors without changing already emitted particles', () => {
  const state = createParticleEmitterState();
  const component = { ...emitter, rate_over_time: 100, color_start: [1, 0, 0, 1] };
  stepParticleEmitter(2, component, state, 0.01);
  component.color_start[0] = 0;
  component.color_start[1] = 1;
  stepParticleEmitter(2, component, state, 0.01);
  assert.deepEqual(state.particles[0].colorStart, [1, 0, 0, 1]);
  assert.deepEqual(state.particles[1].colorStart, [0, 1, 0, 1]);
});
