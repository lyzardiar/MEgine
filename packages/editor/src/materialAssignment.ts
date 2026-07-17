export interface MaterialAssignmentResult {
  components: Record<string, unknown>;
  changed: boolean;
  removedOverride: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Assigns a material asset as the renderer's complete material source.
 * PbrMaterial is a per-renderer override, so keeping it would make the asset
 * assignment appear to succeed while the runtime continues to ignore it.
 */
export function assignMaterialToComponents(
  components: Record<string, unknown>,
  materialPath: string,
  meshRendererValue?: Record<string, unknown>,
): MaterialAssignmentResult | null {
  const currentRenderer = components.MeshRenderer;
  if (!isRecord(currentRenderer)) return null;

  const renderer = meshRendererValue ?? currentRenderer;
  const removedOverride = Object.prototype.hasOwnProperty.call(components, 'PbrMaterial');
  const changed = renderer.material !== materialPath
    || removedOverride
    || renderer !== currentRenderer;
  if (!changed) {
    return { components, changed: false, removedOverride: false };
  }

  const nextComponents: Record<string, unknown> = {
    ...components,
    MeshRenderer: { ...renderer, material: materialPath },
  };
  if (removedOverride) delete nextComponents.PbrMaterial;
  return { components: nextComponents, changed: true, removedOverride };
}
