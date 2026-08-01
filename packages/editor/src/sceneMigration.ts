import { migrateLegacyRectMaskPadding } from './rectMaskMigration.ts';

export const LEGACY_SCENE_VERSION = 1 as const;
export const PREVIOUS_SCENE_VERSION = 2 as const;
export const CURRENT_SCENE_VERSION = 3 as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/**
 * Upgrade editor-side scene documents before they enter the authoring store.
 * Version 1 predates explicit GraphicRaycaster components, so every legacy
 * Canvas receives the behaviour it previously had implicitly. Versions 1 and 2
 * stored RectMask2D padding as L,T,R,B; version 3 adopts Unity's L,B,R,T order.
 */
export function migrateSceneDocument(document: unknown): JsonRecord {
  const scene = record(document);
  if (!scene) throw new Error('Scene JSON root must be an object');
  const version = scene.version == null ? LEGACY_SCENE_VERSION : Number(scene.version);
  if (
    version !== LEGACY_SCENE_VERSION
    && version !== PREVIOUS_SCENE_VERSION
    && version !== CURRENT_SCENE_VERSION
  ) {
    throw new Error(`Unsupported scene version ${String(scene.version)}`);
  }
  if (version === CURRENT_SCENE_VERSION) return scene;

  const world = record(scene.world);
  const entities = Array.isArray(world?.entities)
    ? world.entities
    : Array.isArray(scene.entities)
      ? scene.entities
      : [];
  for (const candidate of entities) {
    const entity = record(candidate);
    const components = record(entity?.components);
    if (!components) continue;
    if (
      version === LEGACY_SCENE_VERSION
      && components.Canvas != null
      && components.GraphicRaycaster == null
    ) {
      components.GraphicRaycaster = {
        enabled: true,
        ignore_reversed_graphics: true,
        blocking_objects: 'None',
        blocking_mask: -1,
      };
    }
    migrateLegacyRectMaskPadding(components);
  }
  scene.version = CURRENT_SCENE_VERSION;
  return scene;
}
