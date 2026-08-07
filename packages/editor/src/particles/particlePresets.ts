import { createParticleEmitter2D } from '../componentCatalog.ts';

export const PARTICLE_2D_PRESET_KINDS = [
  'fire',
  'smoke',
  'spark_burst',
  'magic_aura',
  'snow',
] as const;

export type Particle2DPresetKind = (typeof PARTICLE_2D_PRESET_KINDS)[number];

export interface Particle2DPreset {
  name: string;
  component: Record<string, unknown>;
}

const PRESETS: Record<Particle2DPresetKind, Particle2DPreset> = {
  fire: {
    name: 'Fire',
    component: {
      rate_over_time: 45,
      lifetime_min: 0.5,
      lifetime_max: 1.1,
      speed_min: 0.5,
      speed_max: 1.4,
      size_start: 0.22,
      size_end: 0.02,
      color_start: [1, 0.9, 0.25, 1],
      color_end: [1, 0.05, 0.01, 0],
      gravity: [0, 0.6],
      drag: 0.3,
      shape: 'circle',
      shape_radius: 0.18,
      direction: [0, 1],
      spread_degrees: 50,
      blend_mode: 'additive',
    },
  },
  smoke: {
    name: 'Smoke',
    component: {
      rate_over_time: 18,
      lifetime_min: 1.8,
      lifetime_max: 3.5,
      speed_min: 0.15,
      speed_max: 0.55,
      size_start: 0.18,
      size_end: 0.7,
      color_start: [0.42, 0.46, 0.5, 0.58],
      color_end: [0.15, 0.17, 0.2, 0],
      gravity: [0, 0.18],
      drag: 0.15,
      shape: 'circle',
      shape_radius: 0.16,
      direction: [0, 1],
      spread_degrees: 70,
      blend_mode: 'alpha',
    },
  },
  spark_burst: {
    name: 'Spark Burst',
    component: {
      looping: false,
      duration: 0.15,
      rate_over_time: 0,
      burst_count: 32,
      burst_interval: 0,
      lifetime_min: 0.35,
      lifetime_max: 0.85,
      speed_min: 2.5,
      speed_max: 5.5,
      size_start: 0.08,
      size_end: 0,
      color_start: [1, 0.94, 0.5, 1],
      color_end: [1, 0.18, 0.01, 0],
      gravity: [0, -2.8],
      drag: 0.4,
      shape: 'point',
      direction: [0, 1],
      spread_degrees: 360,
      blend_mode: 'additive',
    },
  },
  magic_aura: {
    name: 'Magic Aura',
    component: {
      rate_over_time: 30,
      lifetime_min: 1.2,
      lifetime_max: 2,
      speed_min: 0.08,
      speed_max: 0.35,
      size_start: 0.16,
      size_end: 0.04,
      color_start: [0.25, 0.95, 1, 0.9],
      color_end: [0.62, 0.18, 1, 0],
      gravity: [0, 0.08],
      drag: 0.7,
      shape: 'circle',
      shape_radius: 0.75,
      direction: [0, 1],
      spread_degrees: 360,
      simulation_space: 'local',
      blend_mode: 'additive',
    },
  },
  snow: {
    name: 'Snow',
    component: {
      rate_over_time: 25,
      lifetime_min: 4,
      lifetime_max: 7,
      speed_min: 0.2,
      speed_max: 0.55,
      size_start: 0.08,
      size_end: 0.04,
      color_start: [1, 1, 1, 0.95],
      color_end: [0.72, 0.86, 1, 0],
      gravity: [0.15, -0.12],
      drag: 0.08,
      shape: 'box',
      shape_size: [8, 1],
      direction: [0, -1],
      spread_degrees: 30,
      blend_mode: 'alpha',
    },
  },
};

export function createParticleEmitter2DPreset(kind: Particle2DPresetKind): Particle2DPreset {
  const preset = PRESETS[kind];
  return {
    name: preset.name,
    component: { ...createParticleEmitter2D(), ...structuredClone(preset.component) },
  };
}
