export const CURRENT_SCENE_VERSION = 2 as const;
export const LEGACY_SCENE_VERSION = 1 as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/**
 * Upgrade editor-side scene documents before they enter the authoring store.
 * Version 1 predates explicit GraphicRaycaster components, so every legacy
 * Canvas receives the behaviour it previously had implicitly. Version 2 keeps
 * component absence meaningful, allowing authors to disable UI input by removal.
 */
export function migrateSceneDocument(document: unknown): JsonRecord {
  const scene = record(document);
  if (!scene) throw new Error('Scene JSON root must be an object');
  const version = scene.version == null ? LEGACY_SCENE_VERSION : Number(scene.version);
  if (version !== LEGACY_SCENE_VERSION && version !== CURRENT_SCENE_VERSION) {
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
    if (!components || components.Canvas == null || components.GraphicRaycaster != null) continue;
    components.GraphicRaycaster = { enabled: true };
  }
  scene.version = CURRENT_SCENE_VERSION;
  return scene;
}
