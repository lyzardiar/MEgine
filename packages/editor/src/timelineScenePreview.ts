import {
  sampleAnimationClip,
  type AnimationClip,
} from './animationClip.ts';
import {
  applyAnimationPreviews,
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

const F32_EPSILON = 1.1920928955078125e-7;

export type TimelineActivationPreview = {
  entity: number;
  active: boolean;
};

export type TimelineScenePreview = {
  activations: TimelineActivationPreview[];
  animations: AnimationPreviewLayer[];
  camera: TimelineCameraPreview | null;
};

export type TimelineCameraPreview = {
  source: number | null;
  target: number;
  weight: number;
};

export type TimelineScenePreviewBuild = {
  preview: TimelineScenePreview;
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
  const preview: TimelineScenePreview = { activations: [], animations: [], camera: null };
  const diagnostics: string[] = [];
  let bindings: TimelineBindingTable;
  try {
    bindings = parseTimelineBindingTable(bindingsJson);
  } catch (reason) {
    diagnostics.push(`Timeline bindings are invalid: ${reason instanceof Error ? reason.message : String(reason)}`);
    return { preview, diagnostics };
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
      const weight = clip.blend_curve === 'linear'
        ? linearWeight
        : linearWeight * linearWeight * (3 - 2 * linearWeight);
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
    if (track.type !== 'animation') continue;
    const timelineClip = track.clips.find((candidate) => sampleTime >= candidate.start
      && sampleTime < candidate.start + candidate.duration);
    if (!timelineClip) continue;
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
    const layer = { root: target, samples: sampleAnimationClip(clip, localTime) };
    const previous = preview.animations.findIndex((candidate) => candidate.root === target);
    if (previous >= 0) preview.animations[previous] = layer;
    else preview.animations.push(layer);
  }
  return { preview, diagnostics };
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
