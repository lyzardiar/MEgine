export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Color = [number, number, number, number];

export type Particle = {
  position: Vec3;
  velocity: Vec3;
  age: number;
  lifetime: number;
  sizeStart: number;
  sizeEnd: number;
  colorStart: Color;
  colorEnd: Color;
};

export type ParticleEmitterState = {
  particles: Particle[];
  elapsed: number;
  emissionRemainder: number;
  randomState: number;
  configuredSeed: number;
};

export type ParticleDrawItem = {
  position: Vec3;
  size: number;
  color: Color;
};

const MAX_PARTICLES = 100_000;
const MAX_STEP_SECONDS = 1 / 30;

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vector(value: unknown, length: 2 | 3, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback.slice(0, length);
  return Array.from({ length }, (_, index) => finite(value[index], fallback[index] ?? 0));
}

function color(value: unknown, fallback: Color): Color {
  return vector(value, 3, fallback).concat(finite((value as unknown[])?.[3], fallback[3])) as Color;
}

function normalize3(value: number[]): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-6
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 1, 0];
}

function nextRandom(state: ParticleEmitterState): number {
  let x = state.randomState | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.randomState = x || 0x6d2b79f5;
  return (state.randomState >>> 0) / 0x1_0000_0000;
}

function randomRange(state: ParticleEmitterState, min: number, max: number): number {
  return min + (max - min) * nextRandom(state);
}

export function createParticleEmitterState(seed = 1): ParticleEmitterState {
  const normalized = (seed | 0) || 1;
  return {
    particles: [],
    elapsed: 0,
    emissionRemainder: 0,
    randomState: normalized,
    configuredSeed: normalized,
  };
}

export function resetParticleEmitterState(state: ParticleEmitterState, seed = 1): void {
  const normalized = (seed | 0) || 1;
  state.particles.length = 0;
  state.elapsed = 0;
  state.emissionRemainder = 0;
  state.randomState = normalized;
  state.configuredSeed = normalized;
}

function spawn2D(component: Record<string, unknown>, state: ParticleEmitterState): Particle {
  const shape = String(component.shape ?? 'circle').toLowerCase();
  const radius = Math.max(0, finite(component.shape_radius, 0.2));
  const shapeSize = vector(component.shape_size, 2, [1, 1]);
  let x = 0;
  let y = 0;
  if (shape === 'circle') {
    const angle = nextRandom(state) * Math.PI * 2;
    const distance = Math.sqrt(nextRandom(state)) * radius;
    x = Math.cos(angle) * distance;
    y = Math.sin(angle) * distance;
  } else if (shape === 'box') {
    x = (nextRandom(state) - 0.5) * shapeSize[0];
    y = (nextRandom(state) - 0.5) * shapeSize[1];
  }

  const direction = vector(component.direction, 2, [0, 1]);
  const baseAngle = Math.atan2(direction[1], direction[0]);
  const spread = finite(component.spread_degrees, 35) * Math.PI / 180;
  const angle = baseAngle + (nextRandom(state) - 0.5) * spread;
  const speed = randomRange(
    state,
    Math.max(0, finite(component.speed_min, 0.5)),
    Math.max(0, finite(component.speed_max, 2)),
  );
  return createParticle(component, [x, y, 0], [Math.cos(angle) * speed, Math.sin(angle) * speed, 0], state);
}

function spawn3D(component: Record<string, unknown>, state: ParticleEmitterState): Particle {
  const shape = String(component.shape ?? 'cone').toLowerCase();
  const radius = Math.max(0, finite(component.shape_radius, 0.25));
  const shapeSize = vector(component.shape_size, 3, [1, 1, 1]);
  let position: Vec3 = [0, 0, 0];
  if (shape === 'sphere') {
    const direction = randomUnitVector(state);
    const distance = Math.cbrt(nextRandom(state)) * radius;
    position = [direction[0] * distance, direction[1] * distance, direction[2] * distance];
  } else if (shape === 'box') {
    position = [
      (nextRandom(state) - 0.5) * shapeSize[0],
      (nextRandom(state) - 0.5) * shapeSize[1],
      (nextRandom(state) - 0.5) * shapeSize[2],
    ];
  } else if (shape === 'cone') {
    const angle = nextRandom(state) * Math.PI * 2;
    const distance = Math.sqrt(nextRandom(state)) * radius;
    position = [Math.cos(angle) * distance, 0, Math.sin(angle) * distance];
  }

  const direction = normalize3(vector(component.direction, 3, [0, 1, 0]));
  const spread = Math.tan(Math.max(0, finite(component.spread_degrees, 25)) * Math.PI / 180);
  const random = randomUnitVector(state);
  const velocityDirection = normalize3([
    direction[0] + random[0] * spread,
    direction[1] + random[1] * spread,
    direction[2] + random[2] * spread,
  ]);
  const speed = randomRange(
    state,
    Math.max(0, finite(component.speed_min, 0.8)),
    Math.max(0, finite(component.speed_max, 3)),
  );
  return createParticle(
    component,
    position,
    [velocityDirection[0] * speed, velocityDirection[1] * speed, velocityDirection[2] * speed],
    state,
  );
}

function randomUnitVector(state: ParticleEmitterState): Vec3 {
  const z = nextRandom(state) * 2 - 1;
  const angle = nextRandom(state) * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return [radius * Math.cos(angle), z, radius * Math.sin(angle)];
}

function createParticle(
  component: Record<string, unknown>,
  position: Vec3,
  velocity: Vec3,
  state: ParticleEmitterState,
): Particle {
  const lifetimeMin = Math.max(0.01, finite(component.lifetime_min, 1));
  const lifetimeMax = Math.max(lifetimeMin, finite(component.lifetime_max, lifetimeMin));
  return {
    position,
    velocity,
    age: 0,
    lifetime: randomRange(state, lifetimeMin, lifetimeMax),
    sizeStart: Math.max(0, finite(component.size_start, 0.16)),
    sizeEnd: Math.max(0, finite(component.size_end, 0)),
    colorStart: color(component.color_start, [1, 1, 1, 1]),
    colorEnd: color(component.color_end, [1, 1, 1, 0]),
  };
}

export function stepParticleEmitter(
  dimension: 2 | 3,
  component: Record<string, unknown>,
  state: ParticleEmitterState,
  deltaSeconds: number,
  emitterPosition: Vec3 = [0, 0, 0],
): void {
  const seed = (finite(component.seed, 1) | 0) || 1;
  if (seed !== state.configuredSeed) resetParticleEmitterState(state, seed);
  if (component.playing === false) return;

  let remaining = Math.min(Math.max(0, deltaSeconds), 0.25);
  while (remaining > 0) {
    const dt = Math.min(MAX_STEP_SECONDS, remaining);
    stepSubframe(dimension, component, state, dt, emitterPosition);
    remaining -= dt;
  }
}

function stepSubframe(
  dimension: 2 | 3,
  component: Record<string, unknown>,
  state: ParticleEmitterState,
  dt: number,
  emitterPosition: Vec3,
): void {
  const gravity = vector(component.gravity, dimension, dimension === 2 ? [0, -0.8] : [0, -0.6, 0]);
  for (const particle of state.particles) {
    particle.age += dt;
    particle.velocity[0] += gravity[0] * dt;
    particle.velocity[1] += gravity[1] * dt;
    particle.velocity[2] += (gravity[2] ?? 0) * dt;
    particle.position[0] += particle.velocity[0] * dt;
    particle.position[1] += particle.velocity[1] * dt;
    particle.position[2] += particle.velocity[2] * dt;
  }
  state.particles = state.particles.filter((particle) => particle.age < particle.lifetime);
  state.elapsed += dt;

  const delay = Math.max(0, finite(component.start_delay, 0));
  const duration = Math.max(0.01, finite(component.duration, 5));
  const looping = component.looping !== false;
  const activeTime = state.elapsed - delay;
  if (activeTime < 0 || (!looping && activeTime > duration)) return;

  const maxParticles = Math.min(MAX_PARTICLES, Math.max(0, finite(component.max_particles, 1000) | 0));
  const rate = Math.max(0, finite(component.rate_over_time, 20));
  state.emissionRemainder += rate * dt;
  const requested = Math.floor(state.emissionRemainder);
  state.emissionRemainder -= requested;
  const count = Math.min(requested, Math.max(0, maxParticles - state.particles.length));
  for (let index = 0; index < count; index += 1) {
    const particle = dimension === 2 ? spawn2D(component, state) : spawn3D(component, state);
    if (String(component.simulation_space ?? 'world').toLowerCase() !== 'local') {
      particle.position[0] += emitterPosition[0];
      particle.position[1] += emitterPosition[1];
      particle.position[2] += emitterPosition[2];
    }
    state.particles.push(particle);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function collectParticleDrawItems(
  state: ParticleEmitterState,
  emitterPosition: Vec3,
  simulationSpace: unknown,
): ParticleDrawItem[] {
  const local = String(simulationSpace ?? 'world').toLowerCase() === 'local';
  return state.particles.map((particle) => {
    const progress = Math.min(1, particle.age / particle.lifetime);
    return {
      position: local
        ? [
            emitterPosition[0] + particle.position[0],
            emitterPosition[1] + particle.position[1],
            emitterPosition[2] + particle.position[2],
          ]
        : particle.position,
      size: lerp(particle.sizeStart, particle.sizeEnd, progress),
      color: [
        lerp(particle.colorStart[0], particle.colorEnd[0], progress),
        lerp(particle.colorStart[1], particle.colorEnd[1], progress),
        lerp(particle.colorStart[2], particle.colorEnd[2], progress),
        lerp(particle.colorStart[3], particle.colorEnd[3], progress),
      ],
    };
  });
}
