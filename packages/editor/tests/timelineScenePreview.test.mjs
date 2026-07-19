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
  assert.deepEqual(outside.preview, { activations: [], animations: [] });
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
  assert.deepEqual(invalid.preview, { activations: [], animations: [] });
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
