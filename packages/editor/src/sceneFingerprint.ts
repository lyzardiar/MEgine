function canonicalSceneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSceneValue);
  if (value == null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, canonicalSceneValue(source[key])]),
  );
}

/** Authoring data only: editor selection, camera, frame and view preferences stay out of Dirty state. */
export function sceneContentFingerprint(
  entities: unknown[],
  clearColor: readonly number[],
): string {
  return JSON.stringify(canonicalSceneValue({ entities, clearColor }));
}
