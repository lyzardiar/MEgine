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

function resolveDescendant(
  entities: readonly TimelineScenePreviewEntity[],
  root: number,
  target: string,
): number | null {
  let current = root;
  for (const segment of target.trim().replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.' || segment === '..') return null;
    const child = entities.find((candidate) => (candidate.parent ?? null) === current
      && candidate.name === segment);
    if (!child) return null;
    current = child.entity;
  }
  return current;
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
): TimelineScenePreviewBuild {
  const preview: TimelineScenePreview = {
    activations: [],
    animations: [],
    camera: null,
    particles: [],
  };
  let audio: TimelineAudioPreviewItem[] = [];
  const diagnostics: string[] = [];
  let bindings: TimelineBindingTable;
  try {
    bindings = parseTimelineBindingTable(bindingsJson);
  } catch (reason) {
    diagnostics.push(`Timeline bindings are invalid: ${reason instanceof Error ? reason.message : String(reason)}`);
    return { preview, audio, diagnostics };
  }
  const sampleTime = Math.max(0, Math.min(asset.duration, Number.isFinite(time) ? time : 0));
  const hasSolo = timelineHasSolo(asset);
  const resolveTrackTarget = (target: string): number | null => {
    const binding = bindings.bindings[target];
    if (binding) {
      if (binding.missing) return null;
      return entities.find((candidate) => String(candidate.entity) === binding.entity)?.entity ?? null;
    }
    return resolveDescendant(entities, director, target);
  };

  for (const track of asset.tracks) {
    if (timelineTrackIsMuted(asset, track, hasSolo)) continue;
    if (track.type === 'activation') {
      const clip = track.clips.find((candidate) => sampleTime >= candidate.start
        && sampleTime < candidate.start + candidate.duration);
      if (!clip) continue;
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
      const clip = track.clips[entry];
      const target = resolveTrackTarget(clip.target);
      const targetEntity = target == null
        ? null
        : entities.find((candidate) => candidate.entity === target);
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
            : entities.find((candidate) => candidate.entity === source);
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
      const target = resolveTrackTarget(track.target);
      if (target == null) {
        diagnostics.push(`Audio track '${track.name}' target '${track.target}' is not resolved.`);
        continue;
      }
      const targetEntity = entities.find((candidate) => candidate.entity === target);
      const source = targetEntity?.components.AudioSource;
      if (!source || typeof source !== 'object') {
        diagnostics.push(`Audio track '${track.name}' target '${track.target}' does not have an AudioSource component.`);
        continue;
      }
      const audioSource = source as { mute?: unknown; pan?: unknown };
      const elapsed = Math.max(0, sampleTime - clip.start);
      audio.push({
        key: track.id,
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
      const target = resolveTrackTarget(track.target);
      if (target == null) {
        diagnostics.push(`Particle track '${track.name}' target '${track.target}' is not resolved.`);
        continue;
      }
      const targetEntity = entities.find((candidate) => candidate.entity === target);
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
        key: track.id,
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
    const clipIndex = track.clips.findIndex((candidate) => sampleTime >= candidate.start
      && sampleTime < candidate.start + candidate.duration);
    if (clipIndex < 0) continue;
    const timelineClip = track.clips[clipIndex];
    const target = resolveTrackTarget(track.target);
    if (target == null) {
      diagnostics.push(`Animation track '${track.name}' target '${track.target}' is not resolved.`);
      continue;
    }
    const targetEntity = entities.find((candidate) => candidate.entity === target);
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
      const adjacent = Math.abs(
        previousTimelineClip.start + previousTimelineClip.duration - timelineClip.start,
      ) <= 0.001;
      if (adjacent) {
        const previousClip = animationClips.get(clipKey(previousTimelineClip.clip));
        if (!previousClip) {
          diagnostics.push(`Animation track '${track.name}' previous blend clip '${previousTimelineClip.clip}' is not loaded.`);
        } else if (previousTimelineClip.clip_in > previousClip.duration) {
          diagnostics.push(`Animation track '${track.name}' previous blend clip-in exceeds '${previousTimelineClip.clip}' duration.`);
        } else {
          samples = blendAnimationPreviewSamples(
            sampleAnimationClip(previousClip, outgoingAnimationSampleTime(previousTimelineClip)),
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
  if (audio.length || preview.particles.length) {
    const byId = new Map(entities.map((entity) => [entity.entity, entity]));
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
