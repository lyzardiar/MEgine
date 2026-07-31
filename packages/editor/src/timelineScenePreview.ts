import {
  sampleAnimationClip,
  type AnimationClip,
} from './animationClip.ts';
import {
  applyAnimationPreviews,
  blendAnimationPreviewSamples,
  type AnimationPreviewEntity,
  type AnimationPreviewLayer,
} from './animationPreview.ts';
import {
  timelineBindingTargets,
  timelineControlSampleTime,
  timelineControlSourceWindowIsValid,
  timelineHasSolo,
  timelineTrackIsMuted,
  type TimelineAsset,
} from './timelineAsset.ts';
import {
  parseTimelineBindingTable,
  type TimelineBindingTable,
} from './timelineBindings.ts';
import {
  timelineAudioFadeFactor,
  type TimelineAudioPreviewItem,
} from './timelineAudioPreview.ts';

const F32_EPSILON = 1.1920928955078125e-7;

function blendCurveFactor(curve: 'linear' | 'ease_in_out', value: number): number {
  const linear = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return curve === 'linear' ? linear : linear * linear * (3 - 2 * linear);
}

function outgoingAnimationSampleTime(clip: { clip_in: number; duration: number; speed: number }): number {
  const epsilon = Math.min(clip.duration, Math.max(F32_EPSILON, clip.duration * F32_EPSILON));
  return Math.max(0, clip.clip_in + Math.max(0, clip.duration - epsilon) * clip.speed);
}

export type TimelineActivationPreview = {
  entity: number;
  active: boolean;
};

export type TimelineScenePreview = {
  activations: TimelineActivationPreview[];
  animations: AnimationPreviewLayer[];
  camera: TimelineCameraPreview | null;
  particles: TimelineParticlePreview[];
};

export type TimelineCameraPreview = {
  source: number | null;
  target: number;
  weight: number;
};

export type TimelineParticlePreview = {
  key: string;
  label: string;
  target: number;
  targetPath: string;
  clipStart: number;
  clipIn: number;
  time: number;
  dimension: 2 | 3;
};

export type TimelineScenePreviewBuild = {
  preview: TimelineScenePreview;
  audio: TimelineAudioPreviewItem[];
  diagnostics: string[];
};

export type TimelineScenePreviewEntity = AnimationPreviewEntity & {
  active?: boolean;
};

type TimelineSceneEntityIndex = {
  source: readonly TimelineScenePreviewEntity[];
  stateKey: string | null;
  byId: ReadonlyMap<number, TimelineScenePreviewEntity>;
  childByParentAndName: ReadonlyMap<string, number>;
};

export type TimelineScenePreviewCache = {
  entityIndex: TimelineSceneEntityIndex | null;
  bindingTargets: WeakMap<TimelineAsset, readonly string[]>;
  bindingTables: Map<string, TimelineBindingTable>;
};

export type TimelineScenePreviewMetrics = {
  assetsEvaluated: number;
  tracksEvaluated: number;
  activeItems: number;
  targetResolutions: number;
  unresolvedTargets: number;
  maximumDepth: number;
  entityIndexCacheHits: number;
  entityIndexCacheMisses: number;
  bindingTargetCacheHits: number;
  bindingTargetCacheMisses: number;
  bindingTableCacheHits: number;
  bindingTableCacheMisses: number;
};

export type TimelineScenePreviewRuntime = {
  cache: TimelineScenePreviewCache;
  entityStateKey: string | null;
  metrics: TimelineScenePreviewMetrics;
  evaluatedAssets: WeakSet<TimelineAsset>;
};

export function createTimelineScenePreviewCache(): TimelineScenePreviewCache {
  return {
    entityIndex: null,
    bindingTargets: new WeakMap(),
    bindingTables: new Map(),
  };
}

export function createTimelineScenePreviewRuntime(
  cache = createTimelineScenePreviewCache(),
  entityStateKey: string | null = null,
): TimelineScenePreviewRuntime {
  return {
    cache,
    entityStateKey,
    metrics: {
      assetsEvaluated: 0,
      tracksEvaluated: 0,
      activeItems: 0,
      targetResolutions: 0,
      unresolvedTargets: 0,
      maximumDepth: 0,
      entityIndexCacheHits: 0,
      entityIndexCacheMisses: 0,
      bindingTargetCacheHits: 0,
      bindingTargetCacheMisses: 0,
      bindingTableCacheHits: 0,
      bindingTableCacheMisses: 0,
    },
    evaluatedAssets: new WeakSet(),
  };
}

type TimelineScenePreviewContext = {
  depth: number;
  stack: readonly string[];
  prefix: string;
  deferHierarchyFilter: boolean;
};

const MAX_CONTROL_TIMELINE_DEPTH = 8;
const EMPTY_TIMELINE_ASSETS: ReadonlyMap<string, TimelineAsset> = new Map();

function resolveDescendant(
  index: TimelineSceneEntityIndex,
  root: number,
  target: string,
): number | null {
  let current = root;
  for (const segment of target.trim().replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.' || segment === '..') return null;
    const child = index.childByParentAndName.get(`${current}\0${segment}`);
    if (child == null) return null;
    current = child;
  }
  return current;
}

function sceneEntityIndex(
  entities: readonly TimelineScenePreviewEntity[],
  runtime: TimelineScenePreviewRuntime,
): TimelineSceneEntityIndex {
  const cached = runtime.cache.entityIndex;
  if (cached && (
    cached.source === entities
    || (runtime.entityStateKey != null && cached.stateKey === runtime.entityStateKey)
  )) {
    runtime.metrics.entityIndexCacheHits += 1;
    return cached;
  }
  runtime.metrics.entityIndexCacheMisses += 1;
  const byId = new Map<number, TimelineScenePreviewEntity>();
  const childByParentAndName = new Map<string, number>();
  for (const entity of entities) {
    byId.set(entity.entity, entity);
    const parent = entity.parent ?? null;
    const key = `${parent}\0${entity.name ?? ''}`;
    if (!childByParentAndName.has(key)) childByParentAndName.set(key, entity.entity);
  }
  const index = {
    source: entities,
    stateKey: runtime.entityStateKey,
    byId,
    childByParentAndName,
  };
  runtime.cache.entityIndex = index;
  return index;
}

function parsedBindingTable(
  bindingsJson: unknown,
  runtime: TimelineScenePreviewRuntime,
): TimelineBindingTable {
  if (typeof bindingsJson !== 'string') return parseTimelineBindingTable(bindingsJson);
  const cached = runtime.cache.bindingTables.get(bindingsJson);
  if (cached) {
    runtime.metrics.bindingTableCacheHits += 1;
    return cached;
  }
  runtime.metrics.bindingTableCacheMisses += 1;
  const parsed = parseTimelineBindingTable(bindingsJson);
  runtime.cache.bindingTables.set(bindingsJson, parsed);
  if (runtime.cache.bindingTables.size > 32) {
    const oldest = runtime.cache.bindingTables.keys().next().value;
    if (typeof oldest === 'string') runtime.cache.bindingTables.delete(oldest);
  }
  return parsed;
}

function cachedBindingTargets(
  asset: TimelineAsset,
  runtime: TimelineScenePreviewRuntime,
): readonly string[] {
  const cached = runtime.cache.bindingTargets.get(asset);
  if (cached) {
    runtime.metrics.bindingTargetCacheHits += 1;
    return cached;
  }
  runtime.metrics.bindingTargetCacheMisses += 1;
  const targets = timelineBindingTargets(asset);
  runtime.cache.bindingTargets.set(asset, targets);
  return targets;
}

function clipKey(path: string): string {
  return path.trim().replaceAll('\\', '/').toLowerCase();
}

export function buildTimelineScenePreview(
  asset: TimelineAsset,
  entities: readonly TimelineScenePreviewEntity[],
  director: number,
  bindingsJson: unknown,
  time: number,
  animationClips: ReadonlyMap<string, AnimationClip>,
  controlAssets: ReadonlyMap<string, TimelineAsset> = EMPTY_TIMELINE_ASSETS,
  assetPath = '',
  runtime = createTimelineScenePreviewRuntime(),
  context?: TimelineScenePreviewContext,
): TimelineScenePreviewBuild {
  const preview: TimelineScenePreview = {
    activations: [],
    animations: [],
    camera: null,
    particles: [],
  };
  let audio: TimelineAudioPreviewItem[] = [];
  const diagnostics: string[] = [];
  if (!runtime.evaluatedAssets.has(asset)) {
    runtime.evaluatedAssets.add(asset);
    runtime.metrics.assetsEvaluated += 1;
  }
  runtime.metrics.maximumDepth = Math.max(runtime.metrics.maximumDepth, context?.depth ?? 0);
  const entityIndex = sceneEntityIndex(entities, runtime);
  let bindings: TimelineBindingTable;
  try {
    bindings = parsedBindingTable(bindingsJson, runtime);
  } catch (reason) {
    diagnostics.push(`Timeline bindings are invalid: ${reason instanceof Error ? reason.message : String(reason)}`);
    return { preview, audio, diagnostics };
  }
  const sampleTime = Math.max(0, Math.min(asset.duration, Number.isFinite(time) ? time : 0));
  const hasSolo = timelineHasSolo(asset);
  const evaluation = context ?? {
    depth: 0,
    stack: assetPath ? [clipKey(assetPath)] : [],
    prefix: '',
    deferHierarchyFilter: false,
  };
  const resolveTrackTarget = (target: string): number | null => {
    runtime.metrics.targetResolutions += 1;
    const binding = bindings.bindings[target];
    if (binding) {
      const resolved = binding.missing
        ? null
        : entityIndex.byId.get(Number(binding.entity))?.entity ?? null;
      if (resolved == null) runtime.metrics.unresolvedTargets += 1;
      return resolved;
    }
    const resolved = resolveDescendant(entityIndex, director, target);
    if (resolved == null) runtime.metrics.unresolvedTargets += 1;
    return resolved;
  };

  for (const track of asset.tracks) {
    runtime.metrics.tracksEvaluated += 1;
    if (timelineTrackIsMuted(asset, track, hasSolo)) continue;
    if (track.type === 'control') {
      const clipIndex = track.clips.findIndex((candidate) => sampleTime >= candidate.start
        && sampleTime < candidate.start + candidate.duration);
      const controlsSourceActivation = track.clips.some((candidate) => (
        candidate.control_activation && !candidate.prefab
      ));
      if (clipIndex < 0 && !controlsSourceActivation) continue;
      const target = resolveTrackTarget(track.target);
      if (target == null) {
        diagnostics.push(`Control track '${track.name}' source '${track.target}' is not resolved.`);
        continue;
      }
      if (controlsSourceActivation) {
        const sourceActive = clipIndex >= 0
          && track.clips[clipIndex].control_activation
          && !track.clips[clipIndex].prefab;
        preview.activations.push({ entity: target, active: sourceActive });
      }
      if (clipIndex < 0) continue;
      runtime.metrics.activeItems += 1;
      const clip = track.clips[clipIndex];
      if (clip.prefab) {
        diagnostics.push(`Control track '${track.name}' Prefab '${clip.prefab}' is instantiated in Play mode; static scene preview does not create transient entities.`);
        continue;
      }
      if (!clip.timeline) continue;
      const key = clipKey(clip.timeline);
      const child = controlAssets.get(key);
      if (!child) {
        diagnostics.push(`Control track '${track.name}' Timeline '${clip.timeline}' is not loaded.`);
        continue;
      }
      const childTargets = new Set(cachedBindingTargets(child, runtime));
      const bindingOverrides = clip.binding_overrides ?? {};
      const unknownOverride = Object.keys(bindingOverrides)
        .find((childTarget) => !childTargets.has(childTarget));
      if (unknownOverride) {
        diagnostics.push(`Control track '${track.name}' overrides unknown child binding '${unknownOverride}' in '${clip.timeline}'.`);
        continue;
      }
      if (!timelineControlSourceWindowIsValid(clip, child.duration, F32_EPSILON)) {
        diagnostics.push(`Control track '${track.name}' clip source window is outside '${clip.timeline}' duration ${child.duration.toFixed(3)}s.`);
        continue;
      }
      if (evaluation.depth >= MAX_CONTROL_TIMELINE_DEPTH) {
        diagnostics.push(`Control track '${track.name}' exceeds the ${MAX_CONTROL_TIMELINE_DEPTH}-level nesting limit.`);
        continue;
      }
      if (evaluation.stack.includes(key)) {
        diagnostics.push(`Control track '${track.name}' introduces a Timeline dependency cycle through '${clip.timeline}'.`);
        continue;
      }
      const childBindings: TimelineBindingTable = { version: 1, bindings: Object.create(null) };
      for (const [childTarget, parentTarget] of Object.entries(bindingOverrides)) {
        const stable = bindings.bindings[parentTarget];
        if (stable) {
          childBindings.bindings[childTarget] = { ...stable };
          continue;
        }
        const entity = resolveDescendant(entityIndex, director, parentTarget);
        if (entity != null) {
          const candidate = entityIndex.byId.get(entity);
          childBindings.bindings[childTarget] = {
            entity: String(entity),
            name: candidate?.name ?? '',
          };
        } else {
          childBindings.bindings[childTarget] = {
            entity: String(director),
            name: parentTarget,
            missing: true,
          };
          diagnostics.push(`Control track '${track.name}' binding '${childTarget}' cannot resolve parent target '${parentTarget}'.`);
        }
      }
      const nested = buildTimelineScenePreview(
        child,
        entities,
        target,
        childBindings,
        timelineControlSampleTime(clip, child.duration, sampleTime),
        animationClips,
        controlAssets,
        clip.timeline,
        runtime,
        {
          depth: evaluation.depth + 1,
          stack: [...evaluation.stack, key],
          prefix: `${evaluation.prefix}${track.id}:${clipIndex}/`,
          deferHierarchyFilter: true,
        },
      );
      preview.activations.push(...nested.preview.activations);
      for (const layer of nested.preview.animations) {
        const previous = preview.animations.findIndex((candidate) => candidate.root === layer.root);
        if (previous >= 0) preview.animations[previous] = layer;
        else preview.animations.push(layer);
      }
      if (nested.preview.camera) preview.camera = nested.preview.camera;
      preview.particles.push(...nested.preview.particles);
      audio.push(...nested.audio);
      diagnostics.push(...nested.diagnostics.map((message) => `${track.name} > ${message}`));
      continue;
    }
    if (track.type === 'activation') {
      const clip = track.clips.find((candidate) => sampleTime >= candidate.start
        && sampleTime < candidate.start + candidate.duration);
      if (!clip) continue;
      runtime.metrics.activeItems += 1;
      const target = resolveTrackTarget(track.target);
      if (target == null) {
        diagnostics.push(`Activation track '${track.name}' target '${track.target}' is not resolved.`);
        continue;
      }
      preview.activations.push({ entity: target, active: clip.active });
      continue;
    }
    if (track.type === 'camera') {
      const entry = track.clips.findIndex((candidate) => sampleTime >= candidate.start
        && sampleTime < candidate.start + candidate.duration);
      if (entry < 0) continue;
      runtime.metrics.activeItems += 1;
      const clip = track.clips[entry];
      const target = resolveTrackTarget(clip.target);
      const targetEntity = target == null
        ? null
        : entityIndex.byId.get(target);
      const targetCameraCount = Number(Boolean(targetEntity?.components.Camera2D))
        + Number(Boolean(targetEntity?.components.Camera3D));
      if (target == null) {
        diagnostics.push(`Camera track '${track.name}' target '${clip.target}' is not resolved.`);
        continue;
      }
      if (targetCameraCount !== 1) {
        diagnostics.push(`Camera track '${track.name}' target '${clip.target}' must have exactly one Camera2D or Camera3D component.`);
        continue;
      }
      const localTime = Math.max(0, sampleTime - clip.start);
      const linearWeight = clip.blend_in <= F32_EPSILON
        ? 1
        : Math.max(0, Math.min(1, localTime / clip.blend_in));
      const weight = blendCurveFactor(clip.blend_curve, linearWeight);
      let source: number | null = null;
      if (weight < 1 && entry > 0) {
        const previous = track.clips[entry - 1];
        const adjacent = Math.abs(previous.start + previous.duration - clip.start) <= 0.001;
        if (adjacent) {
          source = resolveTrackTarget(previous.target);
          const sourceEntity = source == null
            ? null
            : entityIndex.byId.get(source);
          const sourceCameraCount = Number(Boolean(sourceEntity?.components.Camera2D))
            + Number(Boolean(sourceEntity?.components.Camera3D));
          if (source == null) {
            diagnostics.push(`Camera track '${track.name}' previous blend source '${previous.target}' is not resolved.`);
            continue;
          }
          if (sourceCameraCount !== 1) {
            diagnostics.push(`Camera track '${track.name}' previous blend source '${previous.target}' must have exactly one Camera2D or Camera3D component.`);
            continue;
          }
        }
      }
      preview.camera = { source, target, weight };
      continue;
    }
    if (track.type === 'audio') {
      const clip = track.clips.find((candidate) => sampleTime >= candidate.start
        && sampleTime < candidate.start + candidate.duration);
      if (!clip) continue;
      runtime.metrics.activeItems += 1;
      const target = resolveTrackTarget(track.target);
      if (target == null) {
        diagnostics.push(`Audio track '${track.name}' target '${track.target}' is not resolved.`);
        continue;
      }
      const targetEntity = entityIndex.byId.get(target);
      const source = targetEntity?.components.AudioSource;
      if (!source || typeof source !== 'object') {
        diagnostics.push(`Audio track '${track.name}' target '${track.target}' does not have an AudioSource component.`);
        continue;
      }
      const audioSource = source as { mute?: unknown; pan?: unknown };
      const elapsed = Math.max(0, sampleTime - clip.start);
      audio.push({
        key: `${evaluation.prefix}${track.id}`,
        label: track.name,
        target,
        clip: clip.clip,
        clipStart: clip.start,
        clipIn: clip.clip_in,
        sourceTime: clip.clip_in + elapsed * clip.pitch,
        volume: clip.volume * timelineAudioFadeFactor(
          elapsed,
          clip.duration,
          clip.fade_in,
          clip.fade_out,
          clip.fade_curve,
        ),
        pitch: clip.pitch,
        looped: clip.looped,
        muted: Boolean(audioSource.mute),
        pan: Math.max(-1, Math.min(1, Number(audioSource.pan) || 0)),
      });
      continue;
    }
    if (track.type === 'particle') {
      const clip = track.clips.find((candidate) => sampleTime >= candidate.start
        && sampleTime < candidate.start + candidate.duration);
      if (!clip) continue;
      runtime.metrics.activeItems += 1;
      const target = resolveTrackTarget(track.target);
      if (target == null) {
        diagnostics.push(`Particle track '${track.name}' target '${track.target}' is not resolved.`);
        continue;
      }
      const targetEntity = entityIndex.byId.get(target);
      const has2D = Boolean(targetEntity?.components.ParticleEmitter2D);
      const has3D = Boolean(targetEntity?.components.ParticleEmitter3D);
      if (!has2D && !has3D) {
        diagnostics.push(`Particle track '${track.name}' target '${track.target}' does not have a ParticleEmitter2D or ParticleEmitter3D component.`);
        continue;
      }
      if (has2D && has3D) {
        diagnostics.push(`Particle track '${track.name}' target '${track.target}' has both 2D and 3D emitters; bind a dedicated emitter.`);
        continue;
      }
      preview.particles.push({
        key: `${evaluation.prefix}${track.id}`,
        label: track.name,
        target,
        targetPath: track.target,
        clipStart: clip.start,
        clipIn: clip.clip_in,
        time: clip.clip_in + Math.max(0, sampleTime - clip.start),
        dimension: has2D ? 2 : 3,
      });
      continue;
    }
    if (track.type !== 'animation') continue;
    let clipIndex = -1;
    for (let index = track.clips.length - 1; index >= 0; index -= 1) {
      const candidate = track.clips[index];
      if (sampleTime >= candidate.start && sampleTime < candidate.start + candidate.duration) {
        clipIndex = index;
        break;
      }
    }
    if (clipIndex < 0) continue;
    runtime.metrics.activeItems += 1;
    const timelineClip = track.clips[clipIndex];
    const target = resolveTrackTarget(track.target);
    if (target == null) {
      diagnostics.push(`Animation track '${track.name}' target '${track.target}' is not resolved.`);
      continue;
    }
    const targetEntity = entityIndex.byId.get(target);
    if (!targetEntity?.components.AnimationPlayer) {
      diagnostics.push(`Animation track '${track.name}' target '${track.target}' does not have an AnimationPlayer component.`);
      continue;
    }
    if (targetEntity.components.Animator) {
      diagnostics.push(`Animation track '${track.name}' target '${track.target}' also has an Animator component.`);
      continue;
    }
    const clip = animationClips.get(clipKey(timelineClip.clip));
    if (!clip) {
      diagnostics.push(`Animation track '${track.name}' clip '${timelineClip.clip}' is not loaded.`);
      continue;
    }
    if (timelineClip.clip_in > clip.duration) {
      diagnostics.push(`Animation track '${track.name}' clip-in exceeds '${timelineClip.clip}' duration.`);
      continue;
    }
    const localTime = Math.max(0, timelineClip.clip_in
      + (sampleTime - timelineClip.start) * timelineClip.speed);
    let samples = sampleAnimationClip(clip, localTime);
    const linearWeight = timelineClip.blend_in <= F32_EPSILON
      ? 1
      : Math.max(0, Math.min(1, (sampleTime - timelineClip.start) / timelineClip.blend_in));
    const weight = blendCurveFactor(timelineClip.blend_curve, linearWeight);
    if (timelineClip.blend_in > F32_EPSILON && clipIndex > 0) {
      const previousTimelineClip = track.clips[clipIndex - 1];
      const previousEnd = previousTimelineClip.start + previousTimelineClip.duration;
      if (previousEnd + 0.0001 >= timelineClip.start) {
        const previousClip = animationClips.get(clipKey(previousTimelineClip.clip));
        if (!previousClip) {
          diagnostics.push(`Animation track '${track.name}' previous blend clip '${previousTimelineClip.clip}' is not loaded.`);
        } else if (previousTimelineClip.clip_in > previousClip.duration) {
          diagnostics.push(`Animation track '${track.name}' previous blend clip-in exceeds '${previousTimelineClip.clip}' duration.`);
        } else {
          samples = blendAnimationPreviewSamples(
            sampleAnimationClip(
              previousClip,
              sampleTime < previousEnd
                ? Math.max(0, previousTimelineClip.clip_in
                  + (sampleTime - previousTimelineClip.start) * previousTimelineClip.speed)
                : outgoingAnimationSampleTime(previousTimelineClip),
            ),
            samples,
            weight,
          );
        }
      }
    }
    const layer = { root: target, samples };
    const previous = preview.animations.findIndex((candidate) => candidate.root === target);
    if (previous >= 0) preview.animations[previous] = layer;
    else preview.animations.push(layer);
  }
  if (!evaluation.deferHierarchyFilter && (audio.length || preview.particles.length)) {
    const byId = entityIndex.byId;
    const activation = new Map(preview.activations.map((entry) => [entry.entity, entry.active]));
    const activeInHierarchy = (target: number) => {
      let current: number | null = target;
      const visited = new Set<number>();
      while (current != null) {
        if (visited.has(current)) return false;
        visited.add(current);
        const entity = byId.get(current);
        if (!entity) return false;
        if (!(activation.get(current) ?? entity.active ?? true)) return false;
        current = entity.parent ?? null;
      }
      return true;
    };
    audio = audio.filter((item) => activeInHierarchy(item.target));
    preview.particles = preview.particles.filter((item) => {
      if (activeInHierarchy(item.target)) return true;
      diagnostics.push(`Particle track '${item.label}' target '${item.targetPath}' is inactive in the preview hierarchy.`);
      return false;
    });
  }
  return { preview, audio, diagnostics };
}

/** Apply edit-mode Timeline state to one cloned snapshot, never to the authored world. */
export function applyTimelineScenePreview<T extends TimelineScenePreviewEntity>(
  source: readonly T[],
  preview: TimelineScenePreview,
): T[] {
  const entities = applyAnimationPreviews(source, preview.animations);
  for (const activation of preview.activations) {
    const entity = entities.find((candidate) => candidate.entity === activation.entity);
    if (entity) entity.active = activation.active;
  }
  return entities;
}
