import type { MaterialAsset } from './materialAsset.ts';
import { loadResolvedMaterialAsset } from './materialInstanceAsset.ts';
import { readProjectAssetText } from './projectAssets.ts';
import {
  parseSurfaceShaderKeywords,
  parseSurfaceShaderParameters,
  parseSurfaceShaderTextures,
  validateSurfaceShaderKeywordValues,
  validateSurfaceShaderParameterValues,
  validateSurfaceShaderSource,
  validateSurfaceShaderTextureValues,
} from './surfaceShader.ts';
import { isDesktopEditor, validateSurfaceShaderWithRuntime } from './transport/editorTransport.ts';

export type MaterialPreviewAppearance = {
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  emissive: [number, number, number];
  emissiveStrength: number;
  unlit: boolean;
};

export type MaterialAssetPreviewState = {
  material: MaterialAsset | null;
  loading: boolean;
  error: string | null;
};

const cache = new Map<string, MaterialAssetPreviewState>();

/** Returns a cached material immediately and starts an asynchronous load on first use. */
export function materialAssetPreview(path: string): MaterialAsset | null {
  return materialAssetPreviewState(path).material;
}

/** Returns cached material preview state, including a durable load/validation diagnostic. */
export function materialAssetPreviewState(path: string): MaterialAssetPreviewState {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!/\.(?:mmat|mat|minst)$/i.test(normalized)) {
    return { material: null, loading: false, error: null };
  }
  const existing = cache.get(normalized);
  if (existing) return existing;
  const state: MaterialAssetPreviewState = { material: null, loading: true, error: null };
  cache.set(normalized, state);
  void loadValidatedPreviewMaterial(normalized)
    .then((material) => {
      state.material = material;
      state.loading = false;
    })
    .catch((reason: unknown) => {
      state.loading = false;
      state.error = reason instanceof Error ? reason.message : String(reason);
      console.warn(`Material preview failed for ${normalized}: ${state.error}`);
    });
  return state;
}

async function loadValidatedPreviewMaterial(path: string): Promise<MaterialAsset> {
  const material = await loadResolvedMaterialAsset(path);
  if (material.shader !== 'custom') return material;
  const shaderPath = material.custom_shader.trim().replace(/\\/g, '/');
  if (!shaderPath) throw new Error('Custom material requires a .mshader asset.');
  const source = await readProjectAssetText(shaderPath);
  validateSurfaceShaderSource(source);
  const parameters = parseSurfaceShaderParameters(source);
  const keywords = parseSurfaceShaderKeywords(source);
  const textures = parseSurfaceShaderTextures(source);
  validateSurfaceShaderParameterValues(parameters, material.custom_parameters);
  validateSurfaceShaderKeywordValues(keywords, material.custom_keywords);
  validateSurfaceShaderTextureValues(textures, material.custom_textures);
  if (isDesktopEditor()) await validateSurfaceShaderWithRuntime(source);
  return material;
}

export function clearMaterialPreviews(path?: string): void {
  if (path) cache.delete(path.trim().replace(/\\/g, '/'));
  else cache.clear();
}

export function resolveMaterialPreviewAppearance(
  materialPath: string,
  asset: MaterialAsset | null,
  legacyOverride: unknown,
  propertyBlock?: unknown,
  loadError: string | null = null,
): MaterialPreviewAppearance {
  const component = record(legacyOverride);
  if (!component && loadError) return errorAppearance();
  const resolved = component
    ? appearance({
      baseColor: component.base_color,
      metallic: component.metallic,
      roughness: component.roughness,
      ior: component.ior,
      clearcoat: 0,
      clearcoatRoughness: 0.1,
      emissive: component.emissive,
      emissiveStrength: component.emissive_strength,
      unlit: component.unlit === true,
    })
    : asset
      ? appearance({
      baseColor: asset.base_color,
      metallic: asset.metallic,
      roughness: asset.roughness,
      ior: asset.ior,
      clearcoat: asset.clearcoat,
      clearcoatRoughness: asset.clearcoat_roughness,
      emissive: asset.emissive,
      emissiveStrength: asset.emissive_strength,
      unlit: asset.shader === 'unlit',
      })
      : presetAppearance(materialPath);
  const block = record(propertyBlock);
  if (!block) return resolved;
  return appearance({
    baseColor: block.override_base_color === true ? block.base_color : resolved.baseColor,
    metallic: block.override_metallic === true ? block.metallic : resolved.metallic,
    roughness: block.override_roughness === true ? block.roughness : resolved.roughness,
    ior: block.override_ior === true ? block.ior : resolved.ior,
    clearcoat: block.override_clearcoat === true ? block.clearcoat : resolved.clearcoat,
    clearcoatRoughness: block.override_clearcoat_roughness === true
      ? block.clearcoat_roughness
      : resolved.clearcoatRoughness,
    emissive: block.override_emissive === true ? block.emissive : resolved.emissive,
    emissiveStrength: block.override_emissive_strength === true
      ? block.emissive_strength
      : resolved.emissiveStrength,
    unlit: resolved.unlit,
  });
}

function errorAppearance(): MaterialPreviewAppearance {
  return appearance({
    baseColor: [1, 0, 1, 1],
    metallic: 0,
    roughness: 1,
    emissive: [2, 0, 2],
    emissiveStrength: 1,
    unlit: true,
  });
}

function presetAppearance(name: string): MaterialPreviewAppearance {
  switch (name.trim().toLowerCase()) {
    case 'gold':
      return appearance({ baseColor: [1, 0.55, 0.08, 1], metallic: 0.9, roughness: 0.22 });
    case 'chrome':
    case 'metal':
      return appearance({ baseColor: [0.62, 0.7, 0.82, 1], metallic: 1, roughness: 0.1 });
    case 'unlit':
      return appearance({ baseColor: [0.25, 0.7, 1, 1], unlit: true });
    default:
      return appearance({});
  }
}

function appearance(source: {
  baseColor?: unknown;
  metallic?: unknown;
  roughness?: unknown;
  ior?: unknown;
  clearcoat?: unknown;
  clearcoatRoughness?: unknown;
  emissive?: unknown;
  emissiveStrength?: unknown;
  unlit?: boolean;
}): MaterialPreviewAppearance {
  return {
    baseColor: color4(source.baseColor, [0.8, 0.8, 0.8, 1]),
    metallic: finite(source.metallic, 0, 0, 1),
    roughness: finite(source.roughness, 0.5, 0.04, 1),
    ior: finite(source.ior, 1.5, 1, 2.5),
    clearcoat: finite(source.clearcoat, 0, 0, 1),
    clearcoatRoughness: finite(source.clearcoatRoughness, 0.1, 0.04, 1),
    emissive: color3(source.emissive, [0, 0, 0]),
    emissiveStrength: finite(source.emissiveStrength, 1, 0, 65_504),
    unlit: source.unlit === true,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function color4(value: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((channel, index) => finite(value[index], channel, 0, 1)) as [number, number, number, number];
}

function color3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((channel, index) => finite(value[index], channel, 0, 65_504)) as [number, number, number];
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}
