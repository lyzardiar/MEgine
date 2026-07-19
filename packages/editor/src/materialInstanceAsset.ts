import {
  normalizeMaterialAsset,
  normalizeMaterialCustomKeywords,
  normalizeMaterialCustomParameters,
  normalizeMaterialCustomTextures,
  parseMaterialAsset,
  type MaterialAsset,
  type MaterialCustomParameters,
  type MaterialCustomKeywords,
  type MaterialCustomTextures,
} from './materialAsset.ts';
import { normalizeProjectAssetPath, readProjectAssetText } from './projectAssets.ts';

export const MATERIAL_INSTANCE_OVERRIDE_FIELDS = [
  'base_color',
  'metallic',
  'roughness',
  'ior',
  'clearcoat',
  'clearcoat_roughness',
  'emissive',
  'emissive_strength',
  'custom_parameters',
  'custom_keywords',
  'custom_textures',
] as const;

export type MaterialInstanceOverrideField = typeof MATERIAL_INSTANCE_OVERRIDE_FIELDS[number];
export type MaterialInstanceOverrides = Partial<
  Pick<MaterialAsset, Exclude<MaterialInstanceOverrideField, 'custom_parameters' | 'custom_keywords' | 'custom_textures'>>
> & {
  custom_parameters?: MaterialCustomParameters;
  custom_keywords?: MaterialCustomKeywords;
  custom_textures?: MaterialCustomTextures;
};

export type MaterialInstanceAsset = {
  version: 4;
  name: string;
  parent: string;
  overrides: MaterialInstanceOverrides;
};

export function createMaterialInstanceAsset(
  name = 'New Material Instance',
  parent = '',
): MaterialInstanceAsset {
  return { version: 4, name, parent, overrides: {} };
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function vector(
  value: unknown,
  length: number,
  fallback: number[],
  minimum: number,
  maximum: number,
): number[] {
  if (!Array.isArray(value) || value.length !== length) return [...fallback];
  return value.map((part, index) => finite(part, fallback[index], minimum, maximum));
}

export function normalizeMaterialInstanceAsset(value: unknown): MaterialInstanceAsset {
  const source = value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const input = source.overrides != null && typeof source.overrides === 'object'
    && !Array.isArray(source.overrides)
    ? source.overrides as Record<string, unknown>
    : {};
  const overrides: MaterialInstanceOverrides = {};
  if (input.base_color != null) {
    overrides.base_color = vector(input.base_color, 4, [1, 1, 1, 1], 0, 1) as [number, number, number, number];
  }
  if (input.metallic != null) overrides.metallic = finite(input.metallic, 0, 0, 1);
  if (input.roughness != null) overrides.roughness = finite(input.roughness, 0.5, 0.04, 1);
  if (input.ior != null) overrides.ior = finite(input.ior, 1.5, 1, 2.5);
  if (input.clearcoat != null) overrides.clearcoat = finite(input.clearcoat, 0, 0, 1);
  if (input.clearcoat_roughness != null) {
    overrides.clearcoat_roughness = finite(input.clearcoat_roughness, 0.1, 0.04, 1);
  }
  if (input.emissive != null) {
    overrides.emissive = vector(input.emissive, 3, [0, 0, 0], 0, 65_504) as [number, number, number];
  }
  if (input.emissive_strength != null) {
    overrides.emissive_strength = finite(input.emissive_strength, 1, 0, 65_504);
  }
  if (input.custom_parameters != null) {
    const values = normalizeMaterialCustomParameters(input.custom_parameters);
    if (Object.keys(values).length > 0) overrides.custom_parameters = values;
  }
  if (input.custom_keywords != null) {
    const values = normalizeMaterialCustomKeywords(input.custom_keywords);
    if (Object.keys(values).length > 0) overrides.custom_keywords = values;
  }
  if (input.custom_textures != null) {
    const values = normalizeMaterialCustomTextures(input.custom_textures);
    if (Object.keys(values).length > 0) overrides.custom_textures = values;
  }
  let parent = String(source.parent ?? '').trim().replace(/\\/g, '/');
  if (parent) parent = normalizeProjectAssetPath(parent);
  return { version: 4, name: String(source.name ?? ''), parent, overrides };
}

export function parseMaterialInstanceAsset(text: string): MaterialInstanceAsset {
  const parsed = JSON.parse(text) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Material Instance root must be an object');
  }
  const source = parsed as Record<string, unknown>;
  if (source.version != null && source.version !== 1 && source.version !== 2
    && source.version !== 3 && source.version !== 4) {
    throw new Error(`Unsupported material instance version: ${String(source.version)}`);
  }
  if (typeof source.parent !== 'string' || !source.parent.trim()) {
    throw new Error('Material Instance parent is required');
  }
  if (!/\.(?:mmat|mat|minst)$/i.test(source.parent.trim())) {
    throw new Error('Material Instance parent must be a .mmat, .mat, or .minst asset');
  }
  if (source.overrides != null
    && (typeof source.overrides !== 'object' || Array.isArray(source.overrides))) {
    throw new Error('Material Instance overrides must be an object');
  }
  const overrides = source.overrides as Record<string, unknown> | undefined;
  const unknown = Object.keys(overrides ?? {})
    .find((field) => !MATERIAL_INSTANCE_OVERRIDE_FIELDS.includes(field as MaterialInstanceOverrideField));
  if (unknown) throw new Error(`Unsupported Material Instance override: ${unknown}`);
  return normalizeMaterialInstanceAsset(source);
}

export function serializeMaterialInstanceAsset(instance: MaterialInstanceAsset): string {
  if (instance.version !== 4) {
    throw new Error(`Unsupported material instance version: ${instance.version}`);
  }
  const normalized = normalizeMaterialInstanceAsset(instance);
  if (!normalized.parent) throw new Error('Material Instance parent is required');
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function applyMaterialInstance(
  parent: MaterialAsset,
  instance: MaterialInstanceAsset,
): MaterialAsset {
  const customParameters = instance.overrides.custom_parameters == null
    ? parent.custom_parameters
    : { ...parent.custom_parameters, ...instance.overrides.custom_parameters };
  const customKeywords = instance.overrides.custom_keywords == null
    ? parent.custom_keywords
    : { ...parent.custom_keywords, ...instance.overrides.custom_keywords };
  const customTextures = instance.overrides.custom_textures == null
    ? parent.custom_textures
    : { ...parent.custom_textures, ...instance.overrides.custom_textures };
  const overrides = structuredClone(instance.overrides);
  delete overrides.custom_parameters;
  delete overrides.custom_keywords;
  delete overrides.custom_textures;
  return normalizeMaterialAsset({
    ...structuredClone(parent),
    ...structuredClone(overrides),
    custom_parameters: customParameters,
    custom_keywords: customKeywords,
    custom_textures: customTextures,
    name: instance.name,
  });
}

export type MaterialAssetTextReader = (path: string) => Promise<string>;

export async function resolveMaterialAssetWithReader(
  path: string,
  reader: MaterialAssetTextReader,
  chain: string[] = [],
): Promise<MaterialAsset> {
  const normalized = normalizeProjectAssetPath(path);
  const key = normalized.toLowerCase();
  const cycleIndex = chain.findIndex((entry) => entry.toLowerCase() === key);
  if (cycleIndex >= 0) {
    throw new Error(`Material Instance cycle: ${[...chain.slice(cycleIndex), normalized].join(' -> ')}`);
  }
  if (chain.length >= 32) throw new Error('Material Instance inheritance exceeds 32 levels');
  const text = await reader(normalized);
  if (!normalized.toLowerCase().endsWith('.minst')) return parseMaterialAsset(text);
  const instance = parseMaterialInstanceAsset(text);
  const parent = await resolveMaterialAssetWithReader(
    instance.parent,
    reader,
    [...chain, normalized],
  );
  return applyMaterialInstance(parent, instance);
}

export async function loadResolvedMaterialAsset(
  path: string,
  chain: string[] = [],
): Promise<MaterialAsset> {
  return resolveMaterialAssetWithReader(path, readProjectAssetText, chain);
}
