import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAnimationClip } from '../src/animationClip.ts';
import { parseTimelineAsset } from '../src/timelineAsset.ts';
import {
  applyTimelineScenePreview,
  buildTimelineScenePreview,
} from '../src/timelineScenePreview.ts';

const entities = [
  {
    entity: 1,
    name: 'Director',
    parent: null,
    components: { TimelineDirector: {} },
  },
  {
    entity: 2,
    name: 'Panel',
    parent: 1,
    active: true,
    components: {},
  },
  {
    entity: 3,
    name: 'Actor',
    parent: 1,
    active: true,
    components: { AnimationPlayer: {}, Transform: { position: [0, 1, 2] } },
  },
  {
    entity: 4,
    name: 'BoundActor',
    parent: null,
    active: true,
    components: { AnimationPlayer: {}, Transform: { position: [20, 1, 2] } },
  },
];

const animation = parseAnimationClip(JSON.stringify({
  version: 1,
  name: 'Move',
  duration: 1,
  frame_rate: 30,
  wrap_mode: 'once',
  tracks: [{
    target: '.',
    component: 'Transform',
    property: 'position.x',
    interpolation: 'linear',
    keyframes: [{ time: 0, value: 0 }, { time: 1, value: 10 }],
  }],
}));

const asset = parseTimelineAsset(JSON.stringify({
  version: 1,
  name: 'Preview',
  duration: 2,
  frame_rate: 30,
  tracks: [
    {
      type: 'activation', id: 'panel', name: 'Panel Visibility', target: 'Panel',
      clips: [{ start: 0, duration: 1, active: false }],
    },
    {
      type: 'animation', id: 'actor', name: 'Actor Motion', target: 'Actor',
      clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/Move.manim', clip_in: 0.25, speed: 0.5 }],
    },
  ],
}));

const clips = new Map([['assets/animations/move.manim', animation]]);

test('builds activation and sampled animation state without mutating authored entities', () => {
  const build = buildTimelineScenePreview(asset, entities, 1, '{}', 0.5, clips);
  assert.deepEqual(build.diagnostics, []);
  assert.deepEqual(build.preview.activations, [{ entity: 2, active: false }]);
  assert.equal(build.preview.animations.length, 1);

  const preview = applyTimelineScenePreview(entities, build.preview);
  assert.equal(preview[1].active, false);
  assert.equal(preview[2].components.Transform.position[0], 5);
  assert.equal(entities[1].active, true);
  assert.deepEqual(entities[2].components.Transform.position, [0, 1, 2]);
});

test('uses stable director bindings and restores authored state outside clips', () => {
  const bindings = JSON.stringify({
    version: 1,
    bindings: { Actor: { entity: '4', name: 'BoundActor' } },
  });
  const bound = applyTimelineScenePreview(
    entities,
    buildTimelineScenePreview(asset, entities, 1, bindings, 0.5, clips).preview,
  );
  assert.equal(bound[2].components.Transform.position[0], 0);
  assert.equal(bound[3].components.Transform.position[0], 5);

  const outside = buildTimelineScenePreview(asset, entities, 1, bindings, 1.5, clips);
  assert.deepEqual(outside.preview, { activations: [], animations: [], camera: null, particles: [] });
  assert.deepEqual(applyTimelineScenePreview(entities, outside.preview), entities);
});

test('honors mute and Solo filtering and reports invalid preview dependencies', () => {
  const soloAsset = parseTimelineAsset(JSON.stringify({
    version: 1,
    duration: 1,
    tracks: [
      {
        type: 'activation', id: 'panel', name: 'Filtered', target: 'Panel',
        clips: [{ start: 0, duration: 1, active: false }],
      },
      {
        type: 'animation', id: 'actor', name: 'Solo Motion', target: 'Actor', solo: true,
        clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/Missing.manim' }],
      },
    ],
  }));
  const missing = buildTimelineScenePreview(soloAsset, entities, 1, '{}', 0.25, new Map());
  assert.deepEqual(missing.preview.activations, []);
  assert.match(missing.diagnostics[0], /Missing\.manim.*not loaded/);

  const invalid = buildTimelineScenePreview(asset, entities, 1, '{', 0.25, clips);
  assert.deepEqual(invalid.preview, { activations: [], animations: [], camera: null, particles: [] });
  assert.match(invalid.diagnostics[0], /bindings are invalid/i);
});

test('matches runtime animation ownership and component requirements', () => {
  assert.throws(() => parseTimelineAsset(JSON.stringify({
    version: 1,
    duration: 1,
    tracks: [
      {
        type: 'animation', id: 'first', name: 'First', target: 'Actor',
        clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/Move.manim', clip_in: 0, speed: 1 }],
      },
      {
        type: 'animation', id: 'last', name: 'Last', target: 'Actor',
        clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/Move.manim', clip_in: 0.25, speed: 1 }],
      },
    ],
  })), /controlled by more than one track/);

  const missingPlayer = structuredClone(entities);
  delete missingPlayer[2].components.AnimationPlayer;
  const unsupported = buildTimelineScenePreview(asset, missingPlayer, 1, '{}', 0.5, clips);
  assert.deepEqual(unsupported.preview.animations, []);
  assert.match(unsupported.diagnostics.join(' '), /does not have an AnimationPlayer/);

  const animatorConflict = structuredClone(entities);
  animatorConflict[2].components.Animator = {};
  const conflict = buildTimelineScenePreview(asset, animatorConflict, 1, '{}', 0.5, clips);
  assert.deepEqual(conflict.preview.animations, []);
  assert.match(conflict.diagnostics.join(' '), /also has an Animator/);
});

test('builds adjacent Camera shot blends with runtime-compatible weighting', () => {
  const cameraEntities = [
    ...entities,
    {
      entity: 5,
      name: 'CameraA',
      parent: 1,
      active: true,
      components: { Transform: { position: [0, 0, 5] }, Camera3D: { primary: true } },
    },
    {
      entity: 6,
      name: 'CameraB',
      parent: 1,
      active: true,
      components: { Transform: { position: [10, 0, 5] }, Camera3D: { primary: false } },
    },
  ];
  const cameraAsset = parseTimelineAsset(JSON.stringify({
    version: 1,
    duration: 2,
    tracks: [{
      type: 'camera', id: 'shots', name: 'Shots',
      clips: [
        { start: 0, duration: 1, target: 'CameraA', blend_in: 0 },
        { start: 1, duration: 1, target: 'CameraB', blend_in: 1, blend_curve: 'ease_in_out' },
      ],
    }],
  }));
  const first = buildTimelineScenePreview(cameraAsset, cameraEntities, 1, '{}', 0.5, new Map());
  assert.deepEqual(first.preview.camera, { source: null, target: 5, weight: 1 });
  const blend = buildTimelineScenePreview(cameraAsset, cameraEntities, 1, '{}', 1.5, new Map());
  assert.deepEqual(blend.preview.camera, { source: 5, target: 6, weight: 0.5 });
  const eased = buildTimelineScenePreview(cameraAsset, cameraEntities, 1, '{}', 1.25, new Map());
  assert.deepEqual(eased.preview.camera, { source: 5, target: 6, weight: 0.15625 });

  const invalidCameras = structuredClone(cameraEntities);
  invalidCameras[5].components.Camera2D = { primary: false };
  const invalid = buildTimelineScenePreview(cameraAsset, invalidCameras, 1, '{}', 1.5, new Map());
  assert.equal(invalid.preview.camera, null);
  assert.match(invalid.diagnostics.join(' '), /exactly one Camera2D or Camera3D/);

  const tinyBlend = structuredClone(cameraAsset);
  tinyBlend.tracks[0].clips[0].blend_in = 1e-8;
  assert.equal(buildTimelineScenePreview(tinyBlend, cameraEntities, 1, '{}', 0, new Map()).preview.camera.weight, 1);
});

test('builds Runtime-compatible audio preview commands and respects activation hierarchy', () => {
  const audioEntities = [
    ...entities,
    {
      entity: 5,
      name: 'Audio',
      parent: 2,
      active: true,
      components: { AudioSource: { mute: false, pan: 2 } },
    },
  ];
  const audioAsset = parseTimelineAsset(JSON.stringify({
    version: 1,
    duration: 2,
    tracks: [
      {
        type: 'audio', id: 'music', name: 'Music', target: 'Panel/Audio',
        clips: [{
          start: 0, duration: 2, clip: 'Assets/Audio/Music.wav', clip_in: 0.5,
          volume: 0.8, pitch: 2, looped: true, fade_in: 1, fade_out: 0.5,
          fade_curve: 'ease_in_out',
        }],
      },
      {
        type: 'activation', id: 'panel', name: 'Panel', target: 'Panel',
        clips: [{ start: 0, duration: 0.5, active: false }],
      },
    ],
  }));

  const hidden = buildTimelineScenePreview(audioAsset, audioEntities, 1, '{}', 0.25, new Map());
  assert.deepEqual(hidden.audio, []);

  const audible = buildTimelineScenePreview(audioAsset, audioEntities, 1, '{}', 0.75, new Map());
  assert.equal(audible.diagnostics.length, 0);
  assert.equal(audible.audio.length, 1);
  assert.deepEqual(audible.audio[0], {
    key: 'music',
    label: 'Music',
    target: 5,
    clip: 'Assets/Audio/Music.wav',
    clipStart: 0,
    clipIn: 0.5,
    sourceTime: 2,
    volume: 0.675,
    pitch: 2,
    looped: true,
    muted: false,
    pan: 1,
  });

  const fadingOut = buildTimelineScenePreview(audioAsset, audioEntities, 1, '{}', 1.75, new Map());
  assert.equal(fadingOut.audio[0].volume, 0.4);

  const missingSource = structuredClone(audioEntities);
  delete missingSource[4].components.AudioSource;
  const invalid = buildTimelineScenePreview(audioAsset, missingSource, 1, '{}', 0.75, new Map());
  assert.deepEqual(invalid.audio, []);
  assert.match(invalid.diagnostics.join(' '), /does not have an AudioSource/);
});

test('builds deterministic particle seek commands and rejects ambiguous emitters', () => {
  const particleEntities = [
    ...entities,
    {
      entity: 5,
      name: 'Fx',
      parent: 2,
      active: true,
      components: { ParticleEmitter2D: { playing: false, seed: 7 } },
    },
  ];
  const particleAsset = parseTimelineAsset(JSON.stringify({
    version: 1,
    duration: 2,
    tracks: [
      {
        type: 'particle', id: 'fx', name: 'FX', target: 'Panel/Fx',
        clips: [{ start: 0, duration: 2, clip_in: 2 }],
      },
      {
        type: 'activation', id: 'panel', name: 'Panel', target: 'Panel',
        clips: [{ start: 0, duration: 0.5, active: false }],
      },
    ],
  }));

  const hidden = buildTimelineScenePreview(particleAsset, particleEntities, 1, '{}', 0.25, new Map());
  assert.deepEqual(hidden.preview.particles, []);
  assert.match(hidden.diagnostics.join(' '), /inactive in the preview hierarchy/);

  const visible = buildTimelineScenePreview(particleAsset, particleEntities, 1, '{}', 0.75, new Map());
  assert.deepEqual(visible.preview.particles, [{
    key: 'fx',
    label: 'FX',
    target: 5,
    targetPath: 'Panel/Fx',
    clipStart: 0,
    clipIn: 2,
    time: 2.75,
    dimension: 2,
  }]);

  const ambiguous = structuredClone(particleEntities);
  ambiguous[4].components.ParticleEmitter3D = {};
  const invalid = buildTimelineScenePreview(particleAsset, ambiguous, 1, '{}', 0.75, new Map());
  assert.deepEqual(invalid.preview.particles, []);
  assert.match(invalid.diagnostics.join(' '), /both 2D and 3D emitters/);
});
